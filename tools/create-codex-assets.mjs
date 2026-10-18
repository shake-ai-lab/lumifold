// decks/lumifold-codex/assets/ の絵(羊皮紙・革・表紙の絵・章の紋章・飾り罫)を作る。
// 絵の中身は tools/codex-art.js。Edge で SVG を描いて PNG(地の質感は JPEG)に撮る。
// 使い方: node tools/create-codex-assets.mjs [名前の一部…]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("decks/lumifold-codex/assets");
const only = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>`);
await page.addScriptTag({ path: path.resolve("tools/codex-art.js") });
await page.addScriptTag({ content: "window.ART = ART;" });
const arts = await page.evaluate(() => Object.entries(window.ART).map(([name, a]) => ({ name, w: a.w, h: a.h, scale: a.scale || 2, type: a.type || "png" })));
let n = 0;
for (const a of arts) {
  if (only.length && !only.some((o) => a.name.includes(o))) continue;
  const p = await browser.newPage({ viewport: { width: a.w, height: a.h }, deviceScaleFactor: a.scale });
  p.on("pageerror", (e) => errors.push(`${a.name}: ${e}`));
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${await page.evaluate((name) => window.ART[name].svg(), a.name)}</body></html>`);
  await p.evaluate(() => document.fonts.ready);
  const file = path.join(OUT, `${a.name}.${a.type === "jpeg" ? "jpg" : "png"}`);
  if (a.type === "jpeg") await p.locator("svg").screenshot({ path: file, type: "jpeg", quality: 86 });
  else await p.locator("svg").screenshot({ path: file, omitBackground: true });
  await p.close();
  n++;
}
await browser.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`${n} 枚 → ${OUT}`);
