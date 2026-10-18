// decks/lumifold-codex のさわれる図の単体テスト(vite 不要、file:// で開く)。
// 操作で表示が変わること、はみ出しと console error が無いことを確かめ、--shots <dir> で各ウィジェットを PNG に撮る。
// 使い方: node tools/e2e-codex-widgets.mjs [--shots <dir>] [--reader]
// --reader は vite dev 起動中に、読む画面でウィジェットを操作してもページがめくれないことも確かめる
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const dir = path.resolve("decks/lumifold-codex/widgets");
const si = process.argv.indexOf("--shots"), shots = si > 0 ? process.argv[si + 1] : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
// 資料での大きさ(tools/create-codex-deck.py と合わせる)
const SIZES = { library3d: [640, 600], courier: [640, 600], anatomy3d: [640, 600], desk: [640, 606], fold: [640, 600], sound: [640, 560] };
const browser = await chromium.launch({ channel: "msedge", headless: true });
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failed++; };

async function open(name) {
  const [w, h] = SIZES[name];
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // 鳴らした音の数を数える(AudioBufferSourceNode.start の呼び出し)
  await page.addInitScript(() => {
    window.__starts = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) { window.__starts++; return start.apply(this, a); };
  });
  await page.goto(pathToFileURL(path.join(dir, `${name}.html`)).href);
  await page.waitForTimeout(500);
  return { page, errors };
}
const text = (page, sel) => page.locator(sel).first().textContent();
const data = (page) => page.evaluate(() => ({ ...document.body.dataset }));
async function overflow(page) {
  return page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll(".frame *")) {
      if (el.closest("svg") && el.tagName !== "svg") continue;
      if (el.closest(".card, .layers")) continue; // 3D の上の札は中でスクロールできる
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > innerWidth + 1 || r.bottom > innerHeight + 1)) bad.push(`${el.tagName}.${el.className?.baseVal ?? el.className}#${el.id}`);
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== "visible" && !["CANVAS", "PRE"].includes(el.tagName) && !el.classList.contains("log") && !el.classList.contains("mat") && !el.classList.contains("code")) bad.push(`clip:${el.id || el.className}`);
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
const webgl = (page) => page.evaluate(() => { const c = document.getElementById("gl"); return !!(c.getContext("webgl2") || c.getContext("webgl")); });

{ // 書庫の地図: 本を順に取り出す、札で絞る、本をクリックで取り出す
  const { page, errors } = await open("library3d");
  check(await webgl(page), "library3d: WebGL が使える");
  check((await data(page)).books === "30", "library3d: 名前のある本は 30 冊");
  await page.click("#next");
  check((await data(page)).selected === "deck", "library3d: 最初の本は中央の書見台(資料の本文)");
  check((await text(page, "#card")).includes("唯一の正"), "library3d: 本文の説明が出る");
  await page.click('#filter button[data-v="rust"]');
  check((await data(page)).visible === "6", "library3d: Rust で絞ると 6 冊");
  await page.click("#next");
  check((await data(page)).selected === "tauri" && (await text(page, "#card")).includes("src-tauri/src/lib.rs"), "library3d: Rust の 1 冊目は tauri、在りかが出る");
  await page.keyboard.press("ArrowRight");
  check((await data(page)).selected === "dialog", "library3d: → キーで次の本");
  await page.click('#filter button[data-v="all"]'); await page.click("#home"); await page.waitForTimeout(2500);
  check((await data(page)).mode === "overview", "library3d: 「全体を見る」で全体に戻る");
  const p = await page.evaluate(() => window.__lib.project("zustand"));
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(300);
  const d = await data(page);
  check(d.mode === "focus" && d.selected !== "", `library3d: 本をクリックすると取り出す(${d.selected})`);
  await page.waitForTimeout(1500);
  if (shots) await page.screenshot({ path: path.join(shots, "library3d-focus.png") });
  await page.click("#home"); await page.waitForTimeout(1500);
  await finish("library3d", page, errors);
}
{ // 伝令の道: 続けて動かすと保存は 1 回、自分の書き込みは読み直さない、外の書き換えは控え → 帯 → 元に戻す
  const { page, errors } = await open("courier");
  await page.click('#speed button[data-v="real"]');
  for (let i = 0; i < 3; i++) { await page.click("#human"); await page.waitForTimeout(120); }
  await page.waitForTimeout(1800);
  let d = await data(page);
  check(d.saves === "1" && d.merged === "2", `courier: 3 回動かしても書き込みは 1 回(saves ${d.saves}, merged ${d.merged})`);
  check(d.ignored === "1", "courier: 自分の書き込みは読み直さない");
  await page.click("#ai"); await page.waitForTimeout(1500);
  d = await data(page);
  check(d.backups === "1" && d.banner === "on", "courier: 外の書き換えは控えを残し、帯を出す");
  if (shots) await page.screenshot({ path: path.join(shots, "courier-banner.png") });
  await page.click("#revert"); await page.waitForTimeout(1800);
  d = await data(page);
  check(d.banner === "off" && d.saves === "2" && d.ignored === "2", `courier: 元に戻すと帯が消え、その本文も保存される(saves ${d.saves})`);
  await finish("courier", page, errors);
}
{ // 紙面の解剖: 層を選ぶ、並び順を入れ替える、分解をやめる、層をクリック
  const { page, errors } = await open("anatomy3d");
  check(await webgl(page), "anatomy3d: WebGL が使える");
  await page.click('#layers button[data-id="p29-chart"]');
  check((await data(page)).selected === "p29-chart" && (await text(page, "#card")).includes('"kind":"bar"'), "anatomy3d: 一覧で選ぶと JSON が出る");
  const before = (await data(page)).order.split(",");
  await page.click("#front");
  const after = (await data(page)).order.split(",");
  check(after.indexOf("p29-chart") === before.indexOf("p29-chart") + 1, "anatomy3d: 前面へで並び順が 1 つ後ろへ");
  await page.click("#back");
  check((await data(page)).order === before.join(","), "anatomy3d: 背面へで元に戻る");
  await page.click("#view"); await page.waitForTimeout(1200);
  check((await data(page)).explode === "0.00", "anatomy3d: 正面からで分解が 0 に");
  const p = await page.evaluate(() => window.__lib.project("p29-table"));
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(200);
  check((await data(page)).selected === "p29-table", `anatomy3d: 表の層をクリックで選べる(${(await data(page)).selected})`);
  await page.click('#layers button[data-id="p29-title"]');
  await page.fill("#explode", "0.6"); await page.dispatchEvent("#explode", "input");
  await page.waitForTimeout(1200);
  await finish("anatomy3d", page, errors);
}
{ // 編集の机: スナップ、Ctrl+Z / Ctrl+Y、画像の角は縦横比を保つ(Shift で外す)、続けて変えても保存は 1 回
  const { page, errors } = await open("desk");
  const box = (id) => page.evaluate((id) => { const r = document.querySelector(`[data-id=${id}] rect, [data-id=${id}] svg`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, id);
  const json = async () => JSON.parse(await text(page, "#json"));
  const a = await box("cardA"), b = await box("cardB");
  await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.w / 2 - 40, b.y + b.h / 2 - 10, { steps: 5 });
  await page.mouse.move(b.x + b.w / 2 - 40, b.y + b.h / 2 - (b.y - a.y) - 1, { steps: 6 }); // A の上の辺(y=190)の少し上。画像の上の辺(196)より A に近い
  check((await data(page)).snapped.includes("y190"), `desk: カード A の上の辺に吸い付く(${(await data(page)).snapped})`);
  if (shots) await page.screenshot({ path: path.join(shots, "desk-snap.png") });
  await page.mouse.up(); await page.waitForTimeout(80);
  check((await json()).y === 190 && (await data(page)).history === "2", "desk: 離すと本文が 1 回変わり、履歴が 1 歩増える");
  await page.keyboard.press("Control+z");
  check((await json()).y === 236, "desk: Ctrl+Z で戻る");
  await page.keyboard.press("Control+y");
  check((await json()).y === 190, "desk: Ctrl+Y でやり直す");
  const img = await box("img");
  await page.mouse.click(img.x + img.w / 2, img.y + img.h / 2);
  const se = await page.evaluate(() => { const r = document.querySelector('[data-corner="se"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(se.x, se.y); await page.mouse.down(); await page.mouse.move(se.x + 40, se.y + 5, { steps: 6 }); await page.mouse.up();
  let j = await json();
  check(Math.abs(j.w / j.h - 4 / 3) < 0.02, `desk: 画像の角は縦横比を保つ(${j.w}×${j.h})`);
  const se2 = await page.evaluate(() => { const r = document.querySelector('[data-corner="se"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.keyboard.down("Shift");
  await page.mouse.move(se2.x, se2.y); await page.mouse.down(); await page.mouse.move(se2.x + 30, se2.y - 25, { steps: 6 }); await page.mouse.up();
  await page.keyboard.up("Shift");
  j = await json();
  check(Math.abs(j.w / j.h - 4 / 3) > 0.1, `desk: Shift で縦横比を外せる(${j.w}×${j.h})`);
  await page.waitForTimeout(600);
  const s0 = +(await data(page)).saves;
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(700);
  const d = await data(page);
  check(+d.saves === s0 + 1, `desk: 続けて 5 回動かしても書き込みは 1 回(${s0} → ${d.saves})`);
  await finish("desk", page, errors);
}
{ // 折り目の幾何: 少し引いて離すと戻る、3 割を超えて離すとめくれる、ボタンでめくる
  const { page, errors } = await open("fold");
  const corner = await page.evaluate(() => { const s = document.getElementById("svg"), m = s.getScreenCTM(); const p = s.createSVGPoint(); p.x = 300 + 222 - 3; p.y = 52 + 296 - 3; const q = p.matrixTransform(m); return { x: q.x, y: q.y }; });
  await page.mouse.move(corner.x, corner.y); await page.mouse.down(); await page.mouse.move(corner.x - 40, corner.y - 20, { steps: 5 });
  const pr = +(await data(page)).progress;
  check(pr > 0.03 && pr < 0.3, `fold: 少し引くと少しめくれる(${pr})`);
  await page.mouse.up(); await page.waitForTimeout(700);
  check((await data(page)).spread === "0" && (await data(page)).progress === "0.000", "fold: 3 割に足りなければ戻る");
  await page.mouse.move(corner.x, corner.y); await page.mouse.down(); await page.mouse.move(corner.x - 260, corner.y - 60, { steps: 10 });
  check(+(await data(page)).back >= 3, "fold: 裏の面が見える(頂点 3 つ以上)");
  if (shots) await page.screenshot({ path: path.join(shots, "fold-drag.png") });
  await page.mouse.up(); await page.waitForTimeout(900);
  check((await data(page)).spread === "1", "fold: 3 割を超えて離すとめくれる");
  await page.click("#turn"); await page.waitForTimeout(1200);
  check((await data(page)).spread === "2", "fold: 「めくる」で 1 枚めくる");
  await page.click("#reset");
  check((await data(page)).spread === "0", "fold: 最初の見開きへ戻る");
  await finish("fold", page, errors);
}
{ // 紙の音: 通しで鳴らすと 6 つの音(つまむ 3・めくる 1・着地 2)、グラフの長さはめくりの長さに合う
  const { page, errors } = await open("sound");
  await page.click("#whole"); await page.waitForTimeout(300);
  check((await page.evaluate(() => window.__starts)) === 6, `sound: 通しで 6 つの音を鳴らす(${await page.evaluate(() => window.__starts)})`);
  check((await data(page)).ctx === "running", `sound: AudioContext が動いている(${(await data(page)).ctx})`);
  await page.fill("#ms", "1200"); await page.dispatchEvent("#ms", "input");
  await page.click("#swish"); await page.waitForTimeout(200);
  check((await text(page, "#ptitle")).includes("1154 ms"), `sound: めくりの長さに合わせて音が伸びる(${await text(page, "#ptitle")})`);
  await page.click("#vary");
  check((await page.locator("#vary").getAttribute("aria-pressed")) === "false", "sound: ゆらぎを切れる");
  await page.click("#lift"); await page.waitForTimeout(1300);
  await finish("sound", page, errors);
}
if (process.argv.includes("--reader")) {
  // 読む画面(vite dev が要る)で、ウィジェットをドラッグ・クリックしてもページがめくれないこと。
  // ページは拡大縮小されているので、iframe の中の位置に拡大率を掛けて押す(frameLocator の位置は親の transform を考えない)
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://localhost:1420/?deck=${encodeURIComponent("/decks/lumifold-codex/lumifold-codex.deck")}`, { waitUntil: "load" });
  await page.waitForSelector(".thumb", { state: "attached", timeout: 30000 });
  const ids = await page.evaluate(() => window.__deckStore.getState().deck.slides.map((s) => s.id));
  const faces = () => page.$$eval(".reader-face", (els) => els.map((e) => e.dataset.page).join(","));
  const inFrame = (i) => page.frameLocator(`.reader-face[data-page="${i}"] iframe`);
  const toPage = async (i, x, y) => {
    const r = await page.locator(`.reader-face[data-page="${i}"] iframe`).evaluate((f) => { const b = f.getBoundingClientRect(); return { x: b.x, y: b.y, s: b.width / f.clientWidth }; });
    return { x: r.x + x * r.s, y: r.y + y * r.s };
  };
  const at = async (i, sel, fx = 0.5, fy = 0.5) => {
    const e = await inFrame(i).locator(sel).first().evaluate((el, [fx, fy]) => { const b = el.getBoundingClientRect(); return { x: b.x + b.width * fx, y: b.y + b.height * fy }; }, [fx, fy]);
    return toPage(i, e.x, e.y);
  };
  const read = async (i) => {
    if (await page.locator(".reader").count()) { await page.keyboard.press("Escape"); await page.locator(".reader").waitFor({ state: "detached" }); }
    await page.locator(".thumb").nth(i).click();
    await page.getByRole("button", { name: "読む", exact: true }).click();
    await page.locator(".reader").waitFor(); await page.waitForTimeout(1500);
  };
  const spreadOf = (i) => (i % 2 ? `${i},${i + 1}` : `${i - 1},${i}`);
  // 折り目: iframe の中の角をドラッグしても、本のページはめくれない(図の中の見開きだけがめくれる)
  const fi = ids.indexOf("w-fold");
  await read(fi);
  const c = await inFrame(fi).locator("#svg").evaluate((s) => { const p = s.createSVGPoint(); p.x = 519; p.y = 345; const q = p.matrixTransform(s.getScreenCTM()); return { x: q.x, y: q.y }; });
  const a = await toPage(fi, c.x, c.y), b = await toPage(fi, c.x - 260, c.y - 60);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(1200);
  check((await faces()) === spreadOf(fi) && (await inFrame(fi).locator("body").getAttribute("data-spread")) === "1", `reader: 折り目の図の角を引いても本はめくれず、図の中だけめくれる(${await faces()})`);
  // 編集の机: カードをドラッグしても本はめくれない
  const di = ids.indexOf("w-desk");
  await read(di);
  const p0 = await at(di, '[data-id="cardB"] rect'), p1 = { x: p0.x - 120, y: p0.y + 40 };
  await page.mouse.move(p0.x, p0.y); await page.mouse.down(); await page.mouse.move(p1.x, p1.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(600);
  check((await faces()) === spreadOf(di) && (await inFrame(di).locator("body").getAttribute("data-history")) === "2", "reader: 編集の机でカードを動かしても本はめくれない");
  // 書庫: 「次の本」を押すと本を取り出し、本はめくれない
  const li = ids.indexOf("w-library");
  await read(li);
  const n = await at(li, "#next");
  await page.mouse.click(n.x, n.y); await page.waitForTimeout(800);
  check((await faces()) === spreadOf(li) && (await inFrame(li).locator("body").getAttribute("data-selected")) === "deck", "reader: 書庫の「次の本」を押しても本はめくれない");
  check(errors.length === 0, `reader: エラー無し ${errors.join(" | ")}`);
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} 件失敗` : "すべて成功");
process.exit(failed ? 1 : 0);
