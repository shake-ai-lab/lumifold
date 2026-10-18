// 「1ファイルにまとめる」と、まとめたファイルを開いたときの展開を、本物の Tauri ウィンドウで確かめる。
// WebView2 のリモートデバッグ(CDP)で接続し、保存先ダイアログは通さずにストアの packTo / openDeck を直接呼ぶ。
// 前提: 次の環境変数を付けてアプリ(tauri dev か target/debug/lumifold.exe)を起動しておく
//   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
//   (別のアプリ本体が動いているときは WEBVIEW2_USER_DATA_FOLDER も別の場所にする。同じだとそちらに相乗りしてポートが開かない)
// 使い方: node tools/e2e-package.mjs   (ポートを変えたときは CDP_URL=http://localhost:9333)
// 試験用の資料は一時フォルダに毎回作る。全部通れば消し、失敗したら調べられるように残す。
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "deck-studio-package-"));
const work = path.join(root, "試験資料");
fs.mkdirSync(path.join(work, "assets"), { recursive: true });
fs.mkdirSync(path.join(work, "widgets"), { recursive: true });
fs.copyFileSync("tools/fixtures/demo/assets/logo.png", path.join(work, "assets/logo.png"));
fs.copyFileSync("tools/fixtures/coffee-extraction/widgets/plot.html", path.join(work, "widgets/plot.html"));
fs.copyFileSync("tools/fixtures/demo/assets/logo.png", path.join(root, "outside.png")); // 資料フォルダの外にある画像
const deck = JSON.parse(fs.readFileSync("tools/fixtures/demo/deck.json", "utf8"));
deck.slides[0].elements.push(
  { id: "pk-outside", type: "image", x: 60, y: 560, w: 96, h: 96, src: "../outside.png", fit: "contain" },
  { id: "pk-widget", type: "embed", x: 200, y: 400, w: 480, h: 280, src: "widgets/plot.html", title: "抽出チャート計算機" },
);
deck.slides[0].elements.find((e) => e.id === "s1-logo").comments = [
  { id: "c1", text: "ロゴの参考", images: [{ src: "assets/logo.png", name: "logo.png" }], createdAt: "2026-10-17T00:00:00Z" },
];
const workDeck = path.join(work, "試験資料.deck");
fs.writeFileSync(workDeck, JSON.stringify(deck, null, 2) + "\n");

const browser = await chromium.connectOverCDP(process.env.CDP_URL ?? "http://localhost:9222");
const page = browser.contexts()[0].pages().find((p) => p.url().includes("localhost:1420")) ?? browser.contexts()[0].pages()[0];
await page.bringToFront();
await page.waitForFunction(() => !!window.__deckStore, null, { timeout: 15000 });

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!cond) failures++;
};
const state = () => page.evaluate(() => {
  const s = window.__deckStore.getState();
  return { deckPath: s.deckPath, slides: s.deck?.slides.length ?? 0, saveState: s.saveState, error: s.error, toast: s.toast };
});
const open = (p) => page.evaluate((p) => window.__deckStore.getState().openDeck(p), p);
const pack = (p) => page.evaluate(async (p) => {
  try { return { missing: await window.__deckStore.getState().packTo(p) }; } catch (e) { return { error: String(e) }; }
}, p);
const imagesLoaded = () => page.evaluate(async () => {
  const imgs = [...document.querySelectorAll(".fit-inner img")];
  await Promise.all(imgs.map((i) => i.decode().catch(() => null)));
  return imgs.map((i) => i.naturalWidth);
});
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// 1. テキストの .deck を開ける
await open(workDeck);
let st = await state();
check("テキストの .deck を開ける", same(st.deckPath, workDeck) && st.slides === 8 && !st.error, `${st.deckPath} ${st.error ?? ""}`);

// 2. まとめる。作業中のファイルは変わらない
const workBefore = fs.readFileSync(workDeck);
const out = path.join(root, "渡す用.deck");
const packed = await pack(out);
check("まとめられる(見つからないファイルなし)", packed.missing?.length === 0, JSON.stringify(packed));
check("まとめたファイルの中身は zip", fs.existsSync(out) && fs.readFileSync(out).subarray(0, 4).toString("latin1") === "PK\x03\x04");
check("一時ファイルが残らない", !fs.existsSync(out + ".tmp"));
check("作業中の資料は書き換わらない", fs.readFileSync(workDeck).equals(workBefore));
st = await state();
check("作業中の資料を開いたまま", same(st.deckPath, workDeck));

// 3. 同じ名前ではまとめられない(作業中の本文を zip で上書きしない)
const refused = await pack(workDeck);
check("作業中の資料と同じ名前は断る", !!refused.error && fs.readFileSync(workDeck).equals(workBefore), refused.error ?? "");

// 4. まとめたファイルを開くと隣のフォルダに展開して開く
await open(out);
await page.waitForTimeout(500);
st = await state();
const unpacked = path.join(root, "渡す用", "渡す用.deck");
check("展開した本文を開いている", same(st.deckPath, unpacked) && !st.error, `${st.deckPath} ${st.error ?? ""}`);
check("展開したことを知らせる", (st.toast ?? "").includes("展開して開きました"), st.toast ?? "");
for (const f of ["assets/logo.png", "widgets/plot.html", "assets/outside.png"])
  check(`展開先に ${f} がある`, fs.existsSync(path.join(root, "渡す用", f)));
const opened = JSON.parse(fs.readFileSync(unpacked, "utf8"));
const outside = opened.slides[0].elements.find((e) => e.id === "pk-outside");
check("フォルダの外の画像は assets/ に入れ直して参照を書き換える", outside?.src === "assets/outside.png", outside?.src);
const ids = (d) => d.slides.map((s) => s.elements.map((e) => e.id).join(",")).join("|");
check("スライドと要素はそのまま", ids(opened) === ids(deck));
check("コメントの画像も残る", opened.slides[0].elements.find((e) => e.id === "s1-logo")?.comments?.[0]?.images?.[0]?.src === "assets/logo.png");
await page.evaluate(() => window.__deckStore.getState().setCurrent(0));
await page.waitForTimeout(800);
const widths = await imagesLoaded();
check("画像が表示される", widths.length >= 2 && widths.every((w) => w > 0), JSON.stringify(widths));
check("ウィジェットが置かれる", await page.locator('.fit-inner [data-id="pk-widget"] iframe').count() === 1);

// 5. 展開した資料を編集すると、展開先に保存され、まとめたファイルは変わらない
const zipBefore = fs.readFileSync(out);
await page.evaluate(() => window.__deckStore.getState().patchElement("s1-title", { x: 77 }));
await page.waitForTimeout(1200);
st = await state();
const saved = JSON.parse(fs.readFileSync(unpacked, "utf8")).slides[0].elements.find((e) => e.id === "s1-title");
check("展開先の本文に保存される", st.saveState === "saved" && saved.x === 77, `${st.saveState} x=${saved.x}`);
check("まとめたファイルは変わらない", fs.readFileSync(out).equals(zipBefore));

// 6. 同じファイルをもう一度開くと、展開し直さずに編集済みのフォルダを開く
const titleX = () => JSON.parse(fs.readFileSync(unpacked, "utf8")).slides[0].elements.find((e) => e.id === "s1-title").x;
await open(workDeck);
await open(out);
st = await state();
check("同じファイルは展開済みのフォルダで開く", same(st.deckPath, unpacked) && !fs.existsSync(path.join(root, "渡す用 (2)")), st.deckPath);
check("展開先の編集は残る", titleX() === 77);
// 展開したフォルダから元のファイルへまとめ直しても、つながりは保つ
const repacked = await pack(out);
await open(workDeck);
await open(out);
st = await state();
check("まとめ直した元のファイルも展開済みのフォルダで開く", !repacked.error && same(st.deckPath, unpacked), `${st.deckPath} ${repacked.error ?? ""}`);
// 中身の違うファイルが同じ場所に届いたら、既存のフォルダは上書きせず別のフォルダに展開する
await open(workDeck);
await pack(out);
await open(out);
st = await state();
check("中身が変わったファイルは「渡す用 (2)」に展開する", same(st.deckPath, path.join(root, "渡す用 (2)", "渡す用.deck")), st.deckPath);
check("1 回目の展開先の編集は残る", titleX() === 77);

// 7. 作業中のフォルダの隣にまとめたファイルを開くと、展開せずに作業中の資料を開く
await open(workDeck);
const sibling = path.join(root, "試験資料.deck");
const siblingPacked = await pack(sibling);
await open(sibling);
st = await state();
check("隣にまとめたファイルは作業中の資料で開く", !siblingPacked.error && same(st.deckPath, workDeck) && !fs.existsSync(path.join(root, "試験資料 (2)")), st.deckPath);

// 8. 見つからない画像は飛ばして知らせる
await page.evaluate(() => window.__deckStore.getState().addElement({ id: "pk-missing", type: "image", x: 0, y: 0, w: 10, h: 10, src: "assets/nothing.png" }));
const partial = await pack(path.join(root, "欠けあり.deck"));
check("見つからないファイルを知らせる", JSON.stringify(partial.missing) === '["assets/nothing.png"]', JSON.stringify(partial));

const leftovers = fs.readdirSync(root).filter((n) => n.includes("unpacking") || n.endsWith(".tmp"));
check("一時フォルダ・一時ファイルが残らない", leftovers.length === 0, leftovers.join(", "));

await browser.close();
if (failures) console.log(`\n${failures} 件失敗。試験用の資料: ${root}`);
else { fs.rmSync(root, { recursive: true, force: true }); console.log("\n全部 OK"); }
process.exit(failures ? 1 : 0);
