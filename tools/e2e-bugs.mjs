// 洗い出したバグの再現テスト。修正前は FAIL、修正後は ok になることを確認する。
import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:1420/?deck=/tools/fixtures/demo/deck.json", { waitUntil: "networkidle" });
await page.waitForSelector(".thumb");

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!cond) failures++;
};
const st = () => page.evaluate(() => {
  const s = window.__deckStore.getState();
  return { current: s.current, selection: s.selection, editingId: s.editingId, saveState: s.saveState };
});
const getEl = (id) => page.evaluate((id) => {
  const s = window.__deckStore.getState();
  return s.deck.slides[s.current].elements.find((e) => e.id === id) ?? null;
}, id);
const patch = (id, p) => page.evaluate(([id, p]) => window.__deckStore.getState().patchElement(id, p), [id, p]);

await page.locator(".thumb").nth(2).click();
await page.waitForTimeout(200);

// --- 2. 未選択のテキストをダブルクリック ---
await page.mouse.click(1000, 900); // 空白をクリックして選択解除
await page.waitForTimeout(100);
check("前提: 何も選択していない", (await st()).selection.length === 0);
await page.locator('.fit-inner [data-id="s3-card2-head"]').dblclick();
await page.waitForTimeout(150);
check("未選択テキストのダブルクリックで編集に入る", (await st()).editingId === "s3-card2-head", `editingId=${(await st()).editingId}`);
await page.keyboard.press("Escape");
await page.waitForTimeout(100);

// --- 7. 編集中にスライドを切り替えても、古い内容で確定しない ---
await page.locator('.fit-inner [data-id="s3-card2-head"]').dblclick();
await page.waitForTimeout(150);
await page.keyboard.press("Control+a");
await page.keyboard.type("途中の文");
await page.locator(".thumb").nth(3).click();
await page.waitForTimeout(150);
await page.locator(".thumb").nth(2).click();
await page.waitForTimeout(150);
const head2 = await getEl("s3-card2-head");
// PowerPoint と同じく、外をクリックした時点(blur)で確定される
check("編集中に外(サムネイル)をクリックすると、その時点の内容で確定される", head2.paragraphs[0].runs[0].text === "途中の文", head2.paragraphs[0].runs[0].text);
await patch("s3-card2-head", { paragraphs: [{ runs: [{ text: "配置を動かせない" }] }] });

// --- 3. 固定した要素はドラッグできない ---
await page.locator('.fit-inner [data-id="s3-card3-head"]').click();
await page.waitForTimeout(100);
await patch("s3-card3-head", { locked: true });
await page.waitForTimeout(100);
const lockedBefore = await getEl("s3-card3-head");
const lb = await page.locator('.fit-inner [data-id="s3-card3-head"]').boundingBox();
await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
await page.mouse.down();
await page.mouse.move(lb.x + lb.width / 2 + 60, lb.y + lb.height / 2 + 60, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(150);
const lockedAfter = await getEl("s3-card3-head");
check("固定した要素はドラッグで動かない", lockedAfter.x === lockedBefore.x && lockedAfter.y === lockedBefore.y, `x ${lockedBefore.x}→${lockedAfter.x}`);
await patch("s3-card3-head", { locked: undefined });

// --- 1. すべて undo で初期状態に戻しても保存される ---
await page.mouse.click(1000, 900);
await page.locator('.fit-inner [data-id="s3-card1-head"]').click();
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(600);
check("前提: 編集後に保存済み", (await st()).saveState === "saved", (await st()).saveState);
// 履歴を全部戻す
for (let i = 0; i < 20; i++) await page.keyboard.press("Control+z");
await page.waitForTimeout(100);
const s1 = await st();
check("全部 undo した直後は未保存か保存中になる", s1.saveState === "dirty" || s1.saveState === "saving", s1.saveState);
await page.waitForTimeout(700);
check("全部 undo した状態も保存される", (await st()).saveState === "saved", (await st()).saveState);

// --- 5. hex 色の要素で色セレクトを触っても壊れない ---
await patch("s3-card1-head", { style: { fontSize: 18, bold: true, color: "123456", valign: "middle" } });
await page.locator('.fit-inner [data-id="s3-card1-head"]').click();
await page.waitForTimeout(100);
const colorSelect = page.locator(".props .row").filter({ hasText: /^色/ }).locator(".color-select select");
await colorSelect.selectOption("__hex").catch(() => {});
await page.waitForTimeout(100);
const hexEl = await getEl("s3-card1-head");
check("hex 色の要素で #色 を選び直しても色が壊れない", hexEl.style.color === "123456", hexEl.style.color);

// --- 4. 右パネルの数値入力で位置が変わる ---
await page.locator(".position-details summary").click();
const xInput = page.locator(".props input[type=number]").first();
await xInput.fill("300");
await xInput.press("Enter");
await page.waitForTimeout(100);
check("右パネルの X 入力で位置が変わる", (await getEl("s3-card1-head")).x === 300, String((await getEl("s3-card1-head")).x));

// --- 範囲選択の開始がプロパティパネル上では起きない ---
await page.mouse.click(1000, 900);
await page.waitForTimeout(100);
check("前提: 空白クリックで選択解除", (await st()).selection.length === 0, JSON.stringify((await st()).selection));
const propsBox = await page.locator(".props").boundingBox();
await page.mouse.move(propsBox.x + 20, propsBox.y + 600);
await page.mouse.down();
await page.mouse.move(propsBox.x + 200, propsBox.y + 900, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(100);
check("パネル上でドラッグしても範囲選択にならない", (await st()).selection.length === 0, JSON.stringify((await st()).selection));

if (errors.length) {
  console.log("--- page errors ---");
  for (const e of errors) console.log(e);
  failures++;
}
console.log(failures ? `\n${failures} 件失敗` : "\n全部 OK");
await browser.close();
process.exit(failures ? 1 : 0);
