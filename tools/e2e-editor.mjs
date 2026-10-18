// エディタの動作確認: vite dev(http://localhost:1420)を Edge で開き、ドラッグ・リサイズ・文字編集・undo を実際に操作して
// ストア上の値が期待どおりに変わるかを検証する。
// 使い方: node tools/e2e-editor.mjs [スクリーンショット出力先]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] ?? "tools/shots-editor";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errors.push(m.text()); });

await page.goto("http://localhost:1420/?deck=/tools/fixtures/demo/deck.json", { waitUntil: "networkidle" });
await page.waitForSelector(".thumb");

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!cond) failures++;
};
const getEl = (id) =>
  page.evaluate((id) => {
    const s = window.__deckStore.getState();
    return s.deck.slides[s.current].elements.find((e) => e.id === id) ?? null;
  }, id);
const getState = () => page.evaluate(() => {
  const s = window.__deckStore.getState();
  return { current: s.current, selection: s.selection, editingId: s.editingId, saveState: s.saveState };
});
const scale = await page.evaluate(() => {
  const el = document.querySelector(".fit-inner .slide");
  return new DOMMatrix(getComputedStyle(el).transform).a;
});
console.log(`scale = ${scale.toFixed(3)}`);

// スライド 3(カード 3 枚)へ
await page.locator(".thumb").nth(2).click();
await page.waitForTimeout(200);

// ---- 1. クリック選択 ----
const card = page.locator('.fit-inner [data-id="s3-card1-head"]');
await card.click();
await page.waitForTimeout(100);
let st = await getState();
check("クリックで選択される", st.selection.length === 1 && st.selection[0] === "s3-card1-head", JSON.stringify(st.selection));
await page.screenshot({ path: path.join(outDir, "01-selected.png") });

// ---- 2. ドラッグ移動: 画面上 120px 右、60px 下 → 論理座標では /scale ----
const before = await getEl("s3-card1-head");
const box = await card.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 5 });
await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(150);
const after = await getEl("s3-card1-head");
const dx = after.x - before.x, dy = after.y - before.y;
const expX = 120 / scale, expY = 60 / scale;
check("ドラッグで x が増える(スナップ誤差 ±8)", Math.abs(dx - expX) <= 8, `dx=${dx.toFixed(1)} 期待≈${expX.toFixed(1)}`);
check("ドラッグで y が増える(スナップ誤差 ±8)", Math.abs(dy - expY) <= 8, `dy=${dy.toFixed(1)} 期待≈${expY.toFixed(1)}`);
await page.screenshot({ path: path.join(outDir, "02-dragged.png") });

// ---- 3. undo で戻る ----
await page.keyboard.press("Control+z");
await page.waitForTimeout(100);
const undone = await getEl("s3-card1-head");
check("Ctrl+Z で位置が戻る", undone.x === before.x && undone.y === before.y, `x=${undone.x} y=${undone.y}`);
await page.keyboard.press("Control+y");
await page.waitForTimeout(100);
const redone = await getEl("s3-card1-head");
check("Ctrl+Y でやり直す", redone.x === after.x && redone.y === after.y);

// ---- 4. 矢印キーで微調整 ----
await page.keyboard.press("ArrowRight");
await page.keyboard.press("Shift+ArrowDown");
await page.waitForTimeout(100);
const nudged = await getEl("s3-card1-head");
check("矢印キーで +1 / Shift で +10", nudged.x === redone.x + 1 && nudged.y === redone.y + 10, `x=${nudged.x} y=${nudged.y}`);

// ---- 5. リサイズ: 右下ハンドルを画面上で +80, +40 ----
const handle = page.locator(".moveable-control.moveable-direction.moveable-se");
await handle.waitFor({ state: "visible" });
const hb = await handle.boundingBox();
const sizeBefore = await getEl("s3-card1-head");
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.mouse.down();
await page.mouse.move(hb.x + hb.width / 2 + 30, hb.y + hb.height / 2 + 15, { steps: 5 });
await page.mouse.move(hb.x + hb.width / 2 + 80, hb.y + hb.height / 2 + 40, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(150);
const sizeAfter = await getEl("s3-card1-head");
const dw = sizeAfter.w - sizeBefore.w, dh = sizeAfter.h - sizeBefore.h;
check("リサイズで幅が増える(±8)", Math.abs(dw - 80 / scale) <= 8, `dw=${dw.toFixed(1)} 期待≈${(80 / scale).toFixed(1)}`);
check("リサイズで高さが増える(±8)", Math.abs(dh - 40 / scale) <= 8, `dh=${dh.toFixed(1)} 期待≈${(40 / scale).toFixed(1)}`);
check("リサイズで位置は変わらない", sizeAfter.x === sizeBefore.x && sizeAfter.y === sizeBefore.y, `x=${sizeAfter.x} y=${sizeAfter.y}`);
await page.screenshot({ path: path.join(outDir, "03-resized.png") });

// ---- 6. ダブルクリックで文字編集 ----
await card.dblclick();
await page.waitForTimeout(150);
st = await getState();
check("ダブルクリックで編集モード", st.editingId === "s3-card1-head", `editingId=${st.editingId}`);
await page.keyboard.press("Control+a");
await page.keyboard.type("文言を直せる");
await page.keyboard.press("Control+Enter");
await page.waitForTimeout(150);
const edited = await getEl("s3-card1-head");
check("文字が書き換わる", edited.paragraphs[0].runs[0].text === "文言を直せる", JSON.stringify(edited.paragraphs[0]));
st = await getState();
check("編集モードが終わる", st.editingId === null);
await page.screenshot({ path: path.join(outDir, "04-text-edited.png") });

// ---- 7. 範囲選択(マーキー)で複数選択 → まとめて移動 ----
const slideBox = await page.locator(".fit-inner .slide-outer").boundingBox();
// カード 2 と 3 の見出しあたりを囲む(論理座標 440..1240 x 170..240)
const sx = slideBox.x + 440 * scale, sy = slideBox.y + 150 * scale;
const ex = slideBox.x + 1240 * scale, ey = slideBox.y + 240 * scale;
await page.mouse.move(sx, sy);
await page.mouse.down();
await page.mouse.move(ex, ey, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(150);
st = await getState();
check("マーキーで複数選択", st.selection.includes("s3-card2-head") && st.selection.includes("s3-card3-head"), JSON.stringify(st.selection));
const g2 = await getEl("s3-card2-head");
const g3 = await getEl("s3-card3-head");
const c2 = await page.locator('.fit-inner [data-id="s3-card2-head"]').boundingBox();
await page.mouse.move(c2.x + c2.width / 2, c2.y + c2.height / 2);
await page.mouse.down();
await page.mouse.move(c2.x + c2.width / 2 + 20, c2.y + c2.height / 2 + 60, { steps: 5 });
await page.mouse.move(c2.x + c2.width / 2 + 40, c2.y + c2.height / 2 + 120, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(150);
const g2b = await getEl("s3-card2-head");
const g3b = await getEl("s3-card3-head");
check("グループ移動で両方動く", g2b.y - g2.y > 50 && g3b.y - g3.y > 50, `dy2=${g2b.y - g2.y} dy3=${g3b.y - g3.y}`);
check("グループ移動の移動量が一致", g2b.y - g2.y === g3b.y - g3.y && g2b.x - g2.x === g3b.x - g3.x);
await page.screenshot({ path: path.join(outDir, "05-group-moved.png") });

// ---- 8. Delete で削除、Ctrl+D 複製 ----
const count = () => page.evaluate(() => { const s = window.__deckStore.getState(); return s.deck.slides[s.current].elements.length; });
const nSel = st.selection.length;
const n0 = await count();
await page.keyboard.press("Delete");
await page.waitForTimeout(100);
check("Delete で削除", (await getEl("s3-card2-head")) === null && (await count()) === n0 - nSel, `${n0} → ${await count()}`);
await card.click();
await page.keyboard.press("Control+d");
await page.waitForTimeout(100);
const n1 = await count();
check("Ctrl+D で複製", n1 === n0 - nSel + 1, `elements=${n1}`);

// ---- 9. 保存状態(ブラウザモードでは書き込みはスキップされるが状態遷移は同じ) ----
await page.waitForTimeout(700);
st = await getState();
check("自動保存が走る", st.saveState === "saved", st.saveState);

if (errors.length) {
  console.log("--- page errors ---");
  for (const e of errors) console.log(e);
  failures++;
}
console.log(failures ? `\n${failures} 件失敗` : "\n全部 OK");
await browser.close();
process.exit(failures ? 1 : 0);
