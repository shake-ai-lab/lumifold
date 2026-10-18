// 全スライドを開き、文字が枠からはみ出している要素（アプリの「⚠ 文字がはみ出しています」）を一覧にする。
// 使い方: vite dev 起動中に node tools/check-text-overflow.mjs decks/<name>/deck.json
import { chromium } from "playwright";

const deck = "/" + (process.argv[2] ?? "tools/fixtures/demo/deck.json").replace(/^\/+/, "");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:1420/?deck=${encodeURIComponent(deck)}`, { waitUntil: "load" });
await page.waitForSelector(".thumb", { state: "attached", timeout: 30000 });
const n = await page.locator(".thumb").count();
let total = 0;
for (let i = 0; i < n; i++) {
  await page.locator(".thumb").nth(i).click();
  await page.waitForTimeout(350);
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll(".fit-inner .text-overflow-badge")].map((b) => b.closest("[data-id]")?.getAttribute("data-id") ?? "?"));
  if (ids.length) console.log(`slide ${String(i + 1).padStart(2, "0")}: ${ids.join(", ")}`);
  total += ids.length;
}
console.log(`${n} slides, ${total} overflowing text elements${errors.length ? "\nerrors: " + errors.join(" | ") : ""}`);
await browser.close();
process.exit(total || errors.length ? 1 : 0);
