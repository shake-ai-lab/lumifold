// 資料フォルダの画像・ウィジェットを外から書き換えたとき、本物の Tauri ウィンドウが読み直すことを確かめる
// (読み込み済みの画像を使い続けない。本文だけ書き換えて画像は後から差し替える、という順でも新しい画像になる)。
// 前提: 次の環境変数を付けてアプリ(tauri dev か target/debug/lumifold.exe)を起動しておく
//   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
//   (別のアプリ本体が動いているときは WEBVIEW2_USER_DATA_FOLDER も別の場所にする。同じだとそちらに相乗りしてポートが開かない)
// 使い方: node tools/e2e-tauri-assets.mjs   (ポートを変えたときは CDP_URL=http://localhost:9333)
// 試験用の資料は一時フォルダに毎回作る。全部通れば消し、失敗したら調べられるように残す。
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "deck-studio-assets-"));
const work = path.join(root, "試験資料");
fs.mkdirSync(path.join(work, "assets"), { recursive: true });
fs.mkdirSync(path.join(work, "widgets"), { recursive: true });
const svg = (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${color}"/></svg>`;
const widget = (label) => `<!doctype html><html><body style="margin:0"><p id="v">${label}</p><script>parent.postMessage({ type: "deck-studio:widget-ready" }, "*");</script></body></html>`;
fs.writeFileSync(path.join(work, "assets/bg.svg"), svg("#ff0000"));
fs.writeFileSync(path.join(work, "widgets/w.html"), widget("版 1"));
const deck = {
  version: 1, meta: { title: "試験資料" },
  theme: { fonts: { head: "Yu Gothic", body: "Yu Gothic" }, colors: { dk1: "1B1F27", lt1: "FFFFFF", dk2: "5B6472", lt2: "F7F6F2", accent1: "2A9D8F", accent2: "FF6B4A", accent3: "E9A23B", accent4: "4C6FFF", accent5: "D3D0C8", accent6: "8B5CF6" } },
  slides: [{ id: "s1", elements: [
    { id: "bg", type: "image", x: 0, y: 0, w: 1280, h: 720, src: "assets/bg.svg", fit: "fill", locked: true },
    { id: "w", type: "embed", x: 700, y: 100, w: 400, h: 240, src: "widgets/w.html", title: "版の表示" },
  ] }],
};
const deckPath = path.join(work, "試験資料.deck");
fs.writeFileSync(deckPath, JSON.stringify(deck, null, 2) + "\n");

const browser = await chromium.connectOverCDP(process.env.CDP_URL ?? "http://localhost:9222");
const page = browser.contexts()[0].pages().find((p) => p.url().includes("localhost:1420")) ?? browser.contexts()[0].pages()[0];
await page.bringToFront();
await page.waitForFunction(() => !!window.__deckStore, null, { timeout: 15000 });

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!cond) failures++;
};
/** 表示中の背景画像の左上の色(data URL を canvas に描いて読む) */
const bgColor = () => page.evaluate(async () => {
  const img = document.querySelector('.fit-inner [data-id="bg"] img');
  if (!img) return null;
  await img.decode().catch(() => {});
  const c = document.createElement("canvas"); c.width = c.height = 4;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0, 4, 4);
  const [r, gr, b] = g.getImageData(1, 1, 1, 1).data;
  return `${r},${gr},${b}`;
});
const widgetText = () => page.evaluate(() => {
  const f = document.querySelector('.fit-inner [data-id="w"] iframe');
  return f?.srcdoc.match(/<p id="v">([^<]*)<\/p>/)?.[1] ?? null;
});
const waitFor = async (fn, want, ms = 5000) => {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) { v = await fn(); if (v === want) return v; await page.waitForTimeout(100); }
  return v;
};

try {
  await page.evaluate((p) => window.__deckStore.getState().openDeck(p), deckPath);
  await page.waitForFunction((p) => window.__deckStore.getState().deckPath === p, deckPath, { timeout: 10000 });
  check("資料を開いた", true);
  check("最初の背景は赤", (await waitFor(bgColor, "255,0,0")) === "255,0,0");
  check("最初のウィジェットは版 1", (await waitFor(widgetText, "版 1")) === "版 1");

  // 画像だけを書き換える
  fs.writeFileSync(path.join(work, "assets/bg.svg"), svg("#0000ff"));
  const blue = await waitFor(bgColor, "0,0,255");
  check("画像を書き換えると読み直す(青)", blue === "0,0,255", blue);

  // 本文を先に書き換えてから画像を差し替える(今回の不具合の順番)
  deck.theme.colors.lt1 = "0E131D";
  fs.writeFileSync(deckPath, JSON.stringify(deck, null, 2) + "\n");
  await page.waitForTimeout(800);
  fs.writeFileSync(path.join(work, "assets/bg.svg"), svg("#00ff00"));
  const green = await waitFor(bgColor, "0,255,0");
  check("本文の後に差し替えた画像も読み直す(緑)", green === "0,255,0", green);

  // ウィジェットの HTML を書き換える
  fs.writeFileSync(path.join(work, "widgets/w.html"), widget("版 2"));
  const v2 = await waitFor(widgetText, "版 2");
  check("ウィジェットの HTML を書き換えると読み直す", v2 === "版 2", v2);

  // 控え(.history)の書き込みでは読み直さない
  const before = await page.evaluate(() => document.querySelector('.fit-inner [data-id="bg"] img')?.src.length);
  fs.mkdirSync(path.join(work, ".history"), { recursive: true });
  fs.writeFileSync(path.join(work, ".history/x.json"), "{}");
  await page.waitForTimeout(600);
  check("控えの書き込みでは表示が変わらない", (await bgColor()) === "0,255,0" && (await page.evaluate(() => document.querySelector('.fit-inner [data-id="bg"] img')?.src.length)) === before);
} finally {
  await browser.close();
}
if (failures) {
  console.log(`\n失敗 ${failures} 件。試験用の資料: ${root}`);
  process.exitCode = 1;
} else {
  fs.rmSync(root, { recursive: true, force: true });
  console.log("\nすべて成功");
}
