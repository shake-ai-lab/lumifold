// 描画確認用: vite dev(http://localhost:1420)を Edge で開き、各スライドを PNG に撮る。
// 使い方: node tools/shot.mjs [出力ディレクトリ] [deck パス(URL)]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] ?? "tools/shots";
// Git Bash は "/decks/..." を Windows パスに変換してしまうので、先頭スラッシュ無しで渡す("decks/xxx/deck.json")
const deck = "/" + (process.argv[3] ?? "tools/fixtures/demo/deck.json").replace(/^\/+/, "");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errors.push(m.text()); });

await page.goto(`http://localhost:1420/?deck=${encodeURIComponent(deck)}`, { waitUntil: "load" });
await page.waitForSelector(".thumb", { state: "attached", timeout: 30000 });
await page.waitForTimeout(500);
const n = await page.locator(".thumb").count();
console.log(`slides: ${n}`);

for (let i = 0; i < n; i++) {
  await page.locator(".thumb").nth(i).click();
  await page.waitForTimeout(900); // Chart.js のアニメーションとウィジェットの初期化待ち
  const stage = page.locator(".fit-inner .slide-outer");
  const file = path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`);
  await stage.screenshot({ path: file });
  console.log(file);
}
if (errors.length) {
  console.log("--- page errors ---");
  for (const e of errors) console.log(e);
}
await browser.close();
