// decks/electrical-drawings/assets/ の画像(記号カード・図・扉の絵・表紙の地)を作る。
// 図の中身は tools/electrical-figures.js(記号は widgets/_sym.js と共有)。Edge で SVG を描いて PNG に撮る。
// 使い方: node tools/create-electrical-assets.mjs [名前の一部…]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("decks/electrical-drawings/assets");
const only = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}#c{display:inline-block}</style></head><body><div id="c"></div></body></html>`);
await page.addScriptTag({ path: path.resolve("decks/electrical-drawings/widgets/_sym.js") });
await page.addScriptTag({ path: path.resolve("tools/electrical-figures.js") });
await page.addScriptTag({ content: "window.FIGS = FIGS;" });
const figs = await page.evaluate(() => Object.entries(window.FIGS).map(([name, f]) => ({ name, w: f.w, h: f.h, scale: f.scale || 2 })));
let n = 0;
for (const f of figs) {
  if (only.length && !only.some((o) => f.name.includes(o))) continue;
  const p = await browser.newPage({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: f.scale });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${await page.evaluate((name) => window.FIGS[name].svg(), f.name)}</body></html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.locator("svg").screenshot({ path: path.join(OUT, `${f.name}.png`), omitBackground: true });
  await p.close();
  n++;
}
await browser.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`${n} 枚 → ${OUT}`);
