// バグ洗い出し 2 巡目: 回転した要素の操作、グラフ種類の切替、スライド操作、要素追加、複数段落の編集、画像表示。
import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errors.push(m.text()); });
page.on("requestfailed", (r) => errors.push("REQFAIL " + r.url()));
await page.goto("http://localhost:1420/?deck=/tools/fixtures/demo/deck.json", { waitUntil: "networkidle" });
await page.waitForSelector(".thumb");

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!cond) failures++;
};
const st = () => page.evaluate(() => {
  const s = window.__deckStore.getState();
  return { current: s.current, selection: s.selection, editingId: s.editingId, saveState: s.saveState, n: s.deck.slides.length, error: s.error };
});
const getEl = (id) => page.evaluate((id) => {
  const s = window.__deckStore.getState();
  return s.deck.slides[s.current].elements.find((e) => e.id === id) ?? null;
}, id);
const patch = (id, p) => page.evaluate(([id, p]) => window.__deckStore.getState().patchElement(id, p), [id, p]);
const scale = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector(".fit-inner .slide")).transform).a);

// --- 画像が表示される ---
await page.waitForTimeout(300);
const img = page.locator('.fit-inner [data-id="s1-logo"] img');
check("画像要素が描画される", (await img.count()) === 1 && (await img.evaluate((i) => i.naturalWidth)) > 0);

// --- 回転した要素のドラッグ: 親座標で動く ---
await page.locator(".thumb").nth(2).click();
await page.waitForTimeout(200);
await patch("s3-card1-head", { rotation: 45 });
await page.waitForTimeout(100);
const el = page.locator('.fit-inner [data-id="s3-card1-head"]');
await el.click({ position: { x: 5, y: 5 } }).catch(() => el.click({ force: true }));
await page.waitForTimeout(100);
check("回転した要素を選択できる", (await st()).selection[0] === "s3-card1-head", JSON.stringify((await st()).selection));
const rb = await getEl("s3-card1-head");
const bb = await el.boundingBox();
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
await page.mouse.down();
await page.mouse.move(bb.x + bb.width / 2 + 50, bb.y + bb.height / 2, { steps: 5 });
await page.mouse.move(bb.x + bb.width / 2 + 100, bb.y + bb.height / 2, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(150);
const ra = await getEl("s3-card1-head");
check("回転していても x 方向にそのまま動く(±8)", Math.abs(ra.x - rb.x - 100 / scale) <= 8 && Math.abs(ra.y - rb.y) <= 8, `dx=${ra.x - rb.x} dy=${ra.y - rb.y} 期待≈${(100 / scale).toFixed(0)},0`);
check("回転が保たれる", ra.rotation === 45, String(ra.rotation));

// --- 回転した要素のリサイズでサイズが増え、回転が変わらない ---
const seHandle = page.locator(".moveable-control.moveable-direction.moveable-se");
await seHandle.waitFor({ state: "visible" });
const hb = await seHandle.boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.mouse.down();
await page.mouse.move(hb.x + hb.width / 2 + 40, hb.y + hb.height / 2 + 40, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(150);
const rr = await getEl("s3-card1-head");
// 45° 回転では画面の斜め (+40,+40) は要素のローカル x 軸方向なので、幅だけ増えるのが正しい
check("回転した要素もリサイズできる(幅が増え、高さは変わらない)", rr.w > ra.w && rr.h === ra.h && Number.isFinite(rr.x) && Number.isFinite(rr.y), `w ${ra.w}→${rr.w}, h ${ra.h}→${rr.h}`);
check("リサイズ後も回転が保たれる", rr.rotation === 45, String(rr.rotation));
await page.screenshot({ path: "tools/shots-editor/10-rotated-resized.png" });
await patch("s3-card1-head", { rotation: undefined });

// --- グラフ種類の切替でエラーが出ない ---
await page.locator(".thumb").nth(5).click();
await page.waitForTimeout(200);
for (const kind of ["hbar", "line", "area", "pie", "doughnut", "bar"]) {
  await patch("s6-chart", { chart: { ...(await getEl("s6-chart")).chart, kind } });
  await page.waitForTimeout(250);
}
const canvasOk = await page.locator('.fit-inner [data-id="s6-chart"] canvas').count();
check("グラフ種類を一周切り替えてもグラフが残る", canvasOk === 1);
await page.screenshot({ path: "tools/shots-editor/11-chart-kinds.png" });

// --- スライド操作 ---
const n0 = (await st()).n;
await page.getByRole("button", { name: "追加", exact: true }).click(); // 型の一覧から「空白」
await page.locator(".layout-gallery").getByRole("button", { name: "空白", exact: true }).click();
await page.waitForTimeout(100);
let s = await st();
check("+枚 で追加され、そこへ移動する", s.n === n0 + 1 && s.current === 6, `n=${s.n} current=${s.current}`);
await page.locator(".toolbar button[title='前へ']").click();
await page.waitForTimeout(100);
s = await st();
check("↑ で前へ移動する", s.current === 5);
await page.locator(".toolbar button[title='このスライドを削除']").click();
await page.waitForTimeout(100);
s = await st();
check("−枚 で削除される", s.n === n0, `n=${s.n}`);
check("削除後のスライドは別のもの(元の 6 枚目が残る)", (await getEl("s6-chart")) !== null);

// --- 要素追加 → 選択済み → ドラッグできる ---
await page.locator(".toolbar button[title='テキストボックスを追加']").click();
await page.waitForTimeout(150);
s = await st();
check("追加した要素が選択される", s.selection.length === 1 && s.selection[0].startsWith("text-"), JSON.stringify(s.selection));
const newId = s.selection[0];
check("追加したテキストはすぐ入力できる", s.editingId === newId);
await page.keyboard.press("Control+Enter");
const nb = await page.locator(`.fit-inner [data-id="${newId}"]`).boundingBox();
const before = await getEl(newId);
await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
await page.mouse.down();
await page.mouse.move(nb.x + nb.width / 2 + 80, nb.y + nb.height / 2 + 80, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(150);
const after = await getEl(newId);
check("入力確定後の要素をドラッグできる", after.x > before.x && after.y > before.y, `x ${before.x}→${after.x}`);

// --- 複数段落の編集と undo ---
await page.locator(`.fit-inner [data-id="${newId}"]`).dblclick();
await page.waitForTimeout(150);
await page.keyboard.press("Control+a");
await page.keyboard.type("1 行目");
await page.keyboard.press("Enter");
await page.keyboard.type("2 行目");
await page.keyboard.press("Control+Enter");
await page.waitForTimeout(150);
const multi = await getEl(newId);
check("Enter で段落が増える", multi.paragraphs.length === 2 && multi.paragraphs[1].runs[0].text === "2 行目", JSON.stringify(multi.paragraphs));
await page.keyboard.press("Control+z");
await page.waitForTimeout(100);
const undone = await getEl(newId);
check("文字編集を undo できる", JSON.stringify(undone.paragraphs) === JSON.stringify(before.paragraphs), JSON.stringify(undone.paragraphs));

// --- 最後のスライドで → を押しても落ちない / 1 枚しかないとき −枚 は無効 ---
await page.mouse.click(1000, 950);
await page.keyboard.press("End");
for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
s = await st();
check("末尾を超えて移動しない", s.current === s.n - 1, `current=${s.current}`);

// --- 表の地の行が透けない(他の要素に重ねると 1 行おきに下が見えていた) ---
await page.evaluate(() => { const s = window.__deckStore.getState(); s.setCurrent(s.deck.slides.findIndex((sl) => sl.elements.some((e) => e.id === "s5-table"))); });
await page.waitForTimeout(200);
const baseCell = page.locator('.fit-inner [data-id="s5-table"] td').nth(3); // 見出しの次の行(縞なし)
const slideBg = await page.locator(".fit-inner .slide").evaluate((n) => getComputedStyle(n).backgroundColor);
const rowBg = await baseCell.evaluate((n) => getComputedStyle(n).backgroundColor);
check("表の地の行はスライドの背景色で塗る", rowBg === slideBg && rowBg !== "rgba(0, 0, 0, 0)", `${rowBg} / ${slideBg}`);
await patch("s5-table", { background: "accent3" });
await page.waitForTimeout(100);
const ownBg = await page.locator('.fit-inner [data-id="s5-table"]').evaluate((n) => getComputedStyle(n).backgroundColor);
check("背景色のある表は地の行にその色を見せる", (await baseCell.evaluate((n) => getComputedStyle(n).backgroundColor)) === "rgba(0, 0, 0, 0)" && ownBg !== "rgba(0, 0, 0, 0)", ownBg);
await patch("s5-table", { background: null });

if (errors.length) {
  console.log("--- page errors ---");
  for (const e of errors) console.log(e);
  failures++;
}
console.log(failures ? `\n${failures} 件失敗` : "\n全部 OK");
await browser.close();
process.exit(failures ? 1 : 0);
