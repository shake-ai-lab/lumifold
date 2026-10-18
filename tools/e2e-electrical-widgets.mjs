// decks/electrical-drawings のウィジェット単体テスト(vite 不要、file:// で開く)。
// 操作で表示が変わること、はみ出しと console error が無いことを確かめ、--shots <dir> で各ウィジェットを PNG に撮る。
// 使い方: node tools/e2e-electrical-widgets.mjs [--shots <dir>] [--reader]
// --reader は vite dev 起動中に、読む画面でウィジェットを操作してもページがめくれないことも確かめる
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const dir = path.resolve("decks/electrical-drawings/widgets");
const si = process.argv.indexOf("--shots"), shots = si > 0 ? process.argv[si + 1] : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
// 資料での大きさ(tools/create-electrical-deck.py と合わせる)
const SIZES = { flashlight: [640, 560], nets: [640, 600], symbols: [640, 560], led: [640, 600], sequence: [640, 640] };
const browser = await chromium.launch({ channel: "msedge", headless: true });
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failed++; };

async function open(name) {
  const [w, h] = SIZES[name];
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(pathToFileURL(path.join(dir, `${name}.html`)).href);
  await page.waitForTimeout(300);
  return { page, errors };
}
const text = (page, sel) => page.locator(sel).first().textContent();
const attr = (page, name) => page.evaluate((n) => document.body.dataset[n], name);
async function overflow(page) {
  return page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll(".frame *")) {
      if (el.closest("svg") && el.tagName !== "svg") continue;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > innerWidth + 1 || r.bottom > innerHeight + 1)) bad.push(`${el.tagName}.${el.className?.baseVal ?? el.className}#${el.id}`);
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== "visible" && el.tagName !== "CANVAS") bad.push(`clip:${el.id || el.className}`);
    }
    return bad.slice(0, 5);
  });
}
async function finish(name, page, errors, shot = name) {
  const bad = await overflow(page);
  check(bad.length === 0, `${name}: はみ出し無し ${JSON.stringify(bad)}`);
  check(errors.length === 0, `${name}: console error 無し ${errors.join(" | ")}`);
  if (shots) await page.screenshot({ path: path.join(shots, `${shot}.png`) });
  await page.close();
}
const press = (page, sel) => page.locator(sel).dispatchEvent("pointerdown", { pointerId: 1 });
const release = (page, sel) => page.locator(sel).dispatchEvent("pointerup", { pointerId: 1 });

{ // 懐中電灯: スイッチで光る、線を切ると消える、LED は電池を逆にすると消える、ランプは逆でも光る
  const { page, errors } = await open("flashlight");
  check((await attr(page, "lit")) === "false", "flashlight: 最初は消えている");
  await page.click("#sw");
  check((await attr(page, "lit")) === "true", "flashlight: スイッチで光る");
  await page.click("#cut");
  check((await attr(page, "lit")) === "false", "flashlight: 線を切ると消える");
  await page.click("#cut"); await page.click("#rev");
  check((await attr(page, "lit")) === "true", "flashlight: ランプは電池を逆にしても光る");
  await page.click('#mode button[data-v="led"]');
  check((await attr(page, "lit")) === "false", "flashlight: LED は電池が逆だと光らない");
  check((await text(page, "#found")).includes("4 / 4"), `flashlight: 発見が 4 つそろう ${await text(page, "#found")}`);
  await page.click("#rev");
  check((await attr(page, "lit")) === "true", "flashlight: LED も向きを直せば光る");
  await page.hover('#real [data-part="batt"] .halo', { force: true });
  check((await page.locator('#sch [data-part="batt"].hi').count()) === 1, "flashlight: 実物の電池を指すと回路図の電池が光る");
  check((await text(page, "#hint")).includes("電池 BT1"), "flashlight: 部品の説明が出る");
  await finish("flashlight", page, errors);
}
{ // つながり: 線をクリックするとネットが選ばれ、問題に答えられる
  const { page, errors } = await open("nets");
  await page.locator('#sch .net[data-net="GND"] polyline.hit').first().dispatchEvent("click");
  check((await page.locator("#sch .net.sel").getAttribute("data-net")) === "GND", "nets: GND の線をクリックすると GND が光る");
  check((await text(page, "#info")).includes("4 か所"), "nets: GND の説明が出る");
  await page.locator('#sch .net[data-net="BTN"] polyline.hit').first().dispatchEvent("click");
  check((await text(page, "#info")).includes("U1 の 2 番"), "nets: BTN はラベルで U1 の 2 番とつながる");
  await page.click('#mode button[data-v="quiz"]');
  for (let i = 0; i < 5; i++) {
    await page.click("#choices button[data-ok]");
    check((await page.locator("#choices button.right").count()) === 1, `nets: Q${i + 1} 正解の表示`);
    await page.click("#next");
  }
  check((await text(page, "#info")).includes("5 問中 5 問正解"), `nets: 全問正解 ${await text(page, "#info")}`);
  await finish("nets", page, errors);
}
{ // 記号: 図鑑で選ぶと説明が変わる、クイズを最後まで解ける
  const { page, errors } = await open("symbols");
  await page.click('#cat button[data-v="semi"]'); await page.click('.card[data-id="npn"]');
  check((await text(page, "#detail")).includes("NPN"), "symbols: 図鑑で NPN を選ぶ");
  if (shots) await page.screenshot({ path: path.join(shots, "symbols-book.png") });
  await page.click('#mode button[data-v="quiz"]');
  for (let i = 0; i < 10; i++) {
    const right = i !== 3;
    await page.click(right ? ".choices button[data-ok]" : ".choices button:not([data-ok])");
    await page.click("#next");
  }
  check((await text(page, "#right")) === "9", `symbols: 10 問中 9 問正解 → ${await text(page, "#right")}`);
  check((await text(page, "#rank")) === "ベテラン", `symbols: 9 問は「ベテラン」 → ${await text(page, "#rank")}`);
  await finish("symbols", page, errors);
}
{ // LED: 5 V・330 Ω・赤で 9.1 mA、抵抗なしで焼ける、交換すると直る、おすすめの抵抗
  const { page, errors } = await open("led");
  check((await text(page, "#vi")) === "9.1 mA", `led: 5 V / 330 Ω / 赤 = ${await text(page, "#vi")}`);
  await page.locator("#r").evaluate((el) => { el.value = 0; el.dispatchEvent(new Event("input", { bubbles: true })); });
  check((await attr(page, "state")) === "burnt", "led: 抵抗なしで焼ける");
  check((await text(page, "#burnt")).includes("1 個"), "led: 焼いた数を数える");
  await page.click("#swap");
  check((await attr(page, "state")) !== "burnt", "led: 交換すると直る(おすすめの抵抗になる)");
  await page.click('#color button[data-v="blue"]');
  await page.locator("#v").evaluate((el) => { el.value = 24; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.click("#rec");
  check((await text(page, "#rv")).trim() === "1 kΩ", `led: 12 V・青のおすすめは (12-3.2)/0.01 = 880 → 1 kΩ → ${await text(page, "#rv")}`);
  await page.locator("#v").evaluate((el) => { el.value = 5; el.dispatchEvent(new Event("input", { bubbles: true })); });
  check((await attr(page, "state")) === "光らない", "led: 2.5 V では青は光らない");
  await page.locator("#v").evaluate((el) => { el.value = 10; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.click('#color button[data-v="red"]');
  await page.locator("#r").evaluate((el) => { el.value = 8; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await finish("led", page, errors);
}
{ // シーケンス: 自己保持、保持の線なし、インターロック、短絡
  const { page, errors } = await open("sequence");
  await press(page, "#b-PB2");
  check((await attr(page, "coils")) === "MC:1", "sequence: 起動を押すと MC が入る");
  await release(page, "#b-PB2");
  check((await attr(page, "coils")) === "MC:1", "sequence: 離しても MC は入ったまま(自己保持)");
  if (shots) await page.screenshot({ path: path.join(shots, "sequence-hold.png") });
  await press(page, "#b-PB1");
  check((await attr(page, "coils")) === "MC:0", "sequence: 停止で MC が切れる");
  await release(page, "#b-PB1");
  await page.click("#opt");
  await press(page, "#b-PB2"); await release(page, "#b-PB2");
  check((await attr(page, "coils")) === "MC:0", "sequence: 保持の線がないと離すと切れる");
  check((await text(page, "#found")).includes("3 / 3"), `sequence: やってみよう 3 / 3 ${await text(page, "#found")}`);
  await page.click('#mode button[data-v="lock"]');
  await press(page, "#b-PB1"); await release(page, "#b-PB1");
  check((await attr(page, "coils")) === "MC1:1,MC2:0", "sequence: 正転");
  await press(page, "#b-PB2");
  check((await attr(page, "coils")) === "MC1:1,MC2:0", "sequence: 正転中に逆転を押しても MC2 は入らない");
  await release(page, "#b-PB2");
  await press(page, "#b-PB0"); await release(page, "#b-PB0");
  await press(page, "#b-BOTH");
  check((await attr(page, "coils")) === "MC1:1,MC2:0", "sequence: インターロックありで同時押しは片方だけ");
  await release(page, "#b-BOTH");
  await press(page, "#b-PB0"); await release(page, "#b-PB0");
  await page.click("#opt");
  await press(page, "#b-BOTH");
  check(await page.evaluate(() => document.body.classList.contains("tripped")), "sequence: インターロックなしの同時押しで短絡");
  await release(page, "#b-BOTH");
  if (shots) await page.screenshot({ path: path.join(shots, "sequence-trip.png") });
  await page.click("#reset");
  check(!(await page.evaluate(() => document.body.classList.contains("tripped"))), "sequence: ブレーカを戻せる");
  await page.click('#mode button[data-v="hold"]');
  await finish("sequence", page, errors);
}
if (process.argv.includes("--reader")) {
  // 読む画面(vite dev が要る)で、ウィジェットを押す・押し続ける・スライダーを動かしてもページがめくれないこと。
  // ページは拡大縮小されているので、iframe の中の位置に拡大率を掛けて押す(frameLocator の位置は親の transform を考えない)
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://localhost:1420/?deck=${encodeURIComponent("/decks/electrical-drawings/electrical-drawings.deck")}`, { waitUntil: "load" });
  await page.waitForSelector(".thumb", { state: "attached", timeout: 30000 });
  const faces = () => page.$$eval(".reader-face", (els) => els.map((e) => e.dataset.page).join(","));
  const inFrame = (i) => page.frameLocator(`.reader-face[data-page="${i}"] iframe`);
  const at = async (i, sel, fx = 0.5) => {
    const r = await page.locator(`.reader-face[data-page="${i}"] iframe`).evaluate((f) => { const b = f.getBoundingClientRect(); return { x: b.x, y: b.y, s: b.width / f.clientWidth }; });
    const e = await inFrame(i).locator(sel).first().evaluate((el, fx) => { const b = el.getBoundingClientRect(); return { x: b.x + b.width * fx, y: b.y + b.height / 2 }; }, fx);
    return { x: r.x + e.x * r.s, y: r.y + e.y * r.s };
  };
  const read = async (i) => {
    if (await page.locator(".reader").count()) { await page.keyboard.press("Escape"); await page.locator(".reader").waitFor({ state: "detached" }); }
    await page.locator(".thumb").nth(i).click();
    await page.getByRole("button", { name: "読む", exact: true }).click();
    await page.locator(".reader").waitFor(); await page.waitForTimeout(1200);
  };
  await read(6);
  let p = await at(6, "#sw");
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(600);
  check((await faces()) === "5,6" && (await inFrame(6).locator("body").getAttribute("data-lit")) === "true", "reader: 懐中電灯のスイッチを押してもめくれない");
  await read(32);
  p = await at(32, "#b-PB2");
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up(); await page.waitForTimeout(500);
  check((await faces()) === "31,32" && (await inFrame(32).locator("body").getAttribute("data-coils")) === "MC:1", "reader: 起動ボタンを押して離すと自己保持、めくれない");
  await read(25);
  const a = await at(25, "#r", 0.5), b = await at(25, "#r", 0.75);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(500);
  check((await faces()) === "25,26" && (await inFrame(25).locator("#rv").textContent()) !== "330 Ω", `reader: LED の抵抗のスライダーを動かせる(${await inFrame(25).locator("#rv").textContent()})、めくれない`);
  check(errors.length === 0, `reader: エラー無し ${errors.join(" | ")}`);
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} 件失敗` : "すべて成功");
process.exit(failed ? 1 : 0);
