// decks/sd-lora のウィジェット単体テスト（vite 不要、file:// で開く）。
// 操作で表示の値が変わること、console error が無いことを確かめ、--shots <dir> で各ウィジェットを PNG に撮る。
// 使い方: node tools/e2e-sd-lora-widgets.mjs [--shots <dir>]
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const dir = path.resolve("decks/sd-lora/widgets");
const si = process.argv.indexOf("--shots"), shots = si > 0 ? process.argv[si + 1] : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
// デッキでの大きさ（tools/create-sd-lora-deck.py と合わせる）
const SIZES = { noise: [560, 400], cfg: [580, 400], lora: [690, 318], planner: [560, 298] };
const browser = await chromium.launch({ channel: "msedge", headless: true });
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failed++; };

async function open(name) {
  const [w, h] = SIZES[name];
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(pathToFileURL(path.join(dir, `${name}.html`)).href);
  await page.waitForTimeout(400);
  return { page, errors };
}
const text = (page, sel) => page.locator(sel).textContent();
const setRange = (page, sel, v) => page.locator(sel).evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }, v);
async function overflow(page) {
  return page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll(".frame *")) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > innerWidth + 1 || r.bottom > innerHeight + 1)) bad.push(`${el.tagName}.${el.className || el.id}`);
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== "visible" && el.tagName !== "CANVAS") bad.push(`clip:${el.id || el.className}`);
    }
    return bad.slice(0, 5);
  });
}
async function finish(name, page, errors) {
  check((await overflow(page)).length === 0, `${name}: はみ出し無し ${JSON.stringify(await overflow(page))}`);
  check(errors.length === 0, `${name}: console error 無し ${errors.join(" | ")}`);
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) });
  await page.close();
}

{ // ノイズ: t を上げると信号の係数が下がる
  const { page, errors } = await open("noise");
  await setRange(page, "#t", 0); const s0 = +(await text(page, "#vs"));
  await setRange(page, "#t", 999); const s1 = +(await text(page, "#vs"));
  check(s0 > 0.99 && Math.abs(s1 - 0.068) < 0.002, `noise: √ᾱ t=0 → ${s0}, t=999 → ${s1}（SD 1.5 は 0.068）`);
  await page.locator('#sched button[data-v="cos"]').click(); const c1 = +(await text(page, "#vs"));
  check(c1 < 0.01, `noise: cosine の t=999 は ${c1}`);
  await page.locator('#sched button[data-v="sd"]').click(); await setRange(page, "#t", 400);
  await finish("noise", page, errors);
}
{ // CFG: w を上げると覆う区画が減る、手数を減らすとデータ外が増える
  const { page, errors } = await open("cfg");
  await setRange(page, "#w", 1); const cover1 = await text(page, "#m2");
  await setRange(page, "#w", 7.5); const cover7 = await text(page, "#m2");
  check(parseInt(cover1) > parseInt(cover7), `cfg: 覆った区画 w=1 → ${cover1}, w=7.5 → ${cover7}`);
  await setRange(page, "#n", 2); const off2 = parseInt(await text(page, "#m3"));
  await setRange(page, "#n", 20); const off20 = parseInt(await text(page, "#m3"));
  check(off2 > off20, `cfg: データ外 N=2 → ${off2}%, N=20 → ${off20}%`);
  await page.locator('#cond button[data-v="u"]').click();
  check((await text(page, "#k1")).includes("猫 : 犬"), `cfg: 無条件は猫 : 犬 = ${await text(page, "#m1")}`);
  await page.locator('#cond button[data-v="0"]').click();
  await page.locator("#play").click(); await page.waitForTimeout(400);
  check((await text(page, "#m1")) === "…", "cfg: 生成の途中は指標を出さない");
  await page.waitForTimeout(3200);
  check((await text(page, "#st")) === "20 / 20", `cfg: 再生が最後まで進む ${await text(page, "#st")}`);
  await finish("cfg", page, errors);
}
{ // LoRA: 学習で再現度が上限に近づく、rank を上げると上限が上がる
  const { page, errors } = await open("lora");
  await page.waitForTimeout(3500);
  const rep = parseFloat(await text(page, "#rep")), best = parseFloat(await text(page, "#best"));
  check(Math.abs(rep - best) < 1.5, `lora: r=4 の再現度 ${rep}% / 上限 ${best}%`);
  await setRange(page, "#r", 8); const best8 = parseFloat(await text(page, "#best"));
  check(best8 > best, `lora: r=8 の上限 ${best8}% > r=4 の ${best}%`);
  await page.locator("#reset").click();
  check((await text(page, "#rep")) === "0.0%", `lora: 最初から（B=0）で再現度 ${await text(page, "#rep")}`);
  check((await text(page, "#sd")).includes("1,594,368"), "lora: SD 1.5 の r=8 は 1,594,368 個");
  await setRange(page, "#r", 4); await page.waitForTimeout(3000);
  await finish("lora", page, errors);
}
{ // 計画: 総ステップ = ⌈枚数×繰り返し÷バッチ⌉×エポック
  const { page, errors } = await open("planner");
  await setRange(page, "#n", 25); await setRange(page, "#rep", 10); await setRange(page, "#bs", 3); await setRange(page, "#ep", 8);
  check((await text(page, "#o1")).startsWith("672"), `planner: ⌈25×10÷3⌉×8 = 672 → ${await text(page, "#o1")}`);
  await page.locator('#base button[data-v="sdxl"]').click(); await setRange(page, "#rk", 2);
  check((await text(page, "#o3")).startsWith("46.4 MB"), `planner: SDXL r=16 = ${await text(page, "#o3")}`);
  await page.locator('#base button[data-v="sd15"]').click();
  for (const [id, v] of [["n", 20], ["rep", 10], ["bs", 2], ["ep", 10]]) await setRange(page, `#${id}`, v);
  await finish("planner", page, errors);
}
await browser.close();
console.log(failed ? `${failed} 件失敗` : "すべて成功");
process.exit(failed ? 1 : 0);
