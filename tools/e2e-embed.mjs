// embed 要素(ウィジェット)の編集操作: クリックで選択できる、バーを掴んで動かせる、中身の操作で選択が外れない。
import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:1420/?deck=" + encodeURIComponent("/decks/neural-network/deck.json"), { waitUntil: "load" });
await page.waitForSelector(".thumb", { state: "attached" });
await page.waitForTimeout(500);

let failures = 0;
const check = (name, cond, detail = "") => { console.log(`${cond ? "ok  " : "FAIL"} ${name}${detail ? "  (" + detail + ")" : ""}`); if (!cond) failures++; };
const st = () => page.evaluate(() => { const s = window.__deckStore.getState(); return { selection: s.selection, current: s.current }; });
const getEl = (id) => page.evaluate((id) => { const s = window.__deckStore.getState(); return s.deck.slides[s.current].elements.find((e) => e.id === id) ?? null; }, id);

await page.locator(".thumb").nth(3).click();
await page.evaluate(() => window.__deckStore.getState().patchElement('s4-widget', { locked: undefined }));
await page.waitForTimeout(800);
const widget = page.locator('.fit-inner [data-id="s4-widget"]');
await widget.locator('iframe').waitFor();
check("ウィジェットの iframe が描画される", (await widget.locator("iframe").count()) === 1);
check("未選択時はカバーがある", (await widget.locator(".embed-cover").count()) === 1);
await widget.click({ position: { x: 300, y: 200 } });
await page.waitForTimeout(150);
check("クリックで選択される", (await st()).selection[0] === "s4-widget", JSON.stringify((await st()).selection));
check("編集モードではカバーと小さな操作アイコンがある", (await widget.locator(".embed-cover").count()) === 1 && (await widget.locator(".widget-controls").count()) === 1);

// 中身(iframe)のスライダーを操作しても選択は外れず、値が変わる
await page.getByRole("button", { name: "プレゼン開始", exact: true }).click();
const frame = page.frameLocator('.presentation [data-id="s4-widget"] iframe');
const y0 = await frame.locator("#y").innerText();
await frame.locator("#w1").fill("-3");
await page.waitForTimeout(150);
const y1 = await frame.locator("#y").innerText();
check("プレゼン中にウィジェットを操作できる", y0 !== y1, `${y0} → ${y1}`);
check("プレゼン中は編集対象を選択しない", (await st()).selection.length === 0);
await page.getByRole("button", { name: "編集に戻る Esc" }).click();
await widget.click({ position: { x: 300, y: 200 } });

// 配置モードでは本体を掴んで移動
const before = await getEl("s4-widget");
const bar = widget.locator(".embed-cover");
const bb = await bar.boundingBox();
await page.mouse.move(bb.x + 200, bb.y + bb.height / 2);
await page.mouse.down();
await page.mouse.move(bb.x + 240, bb.y + bb.height / 2 + 30, { steps: 5 });
await page.mouse.move(bb.x + 280, bb.y + bb.height / 2 + 60, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(150);
const after = await getEl("s4-widget");
check("配置モードで本体をドラッグすると動く", after.x > before.x && after.y > before.y, `x ${before.x}→${after.x}, y ${before.y}→${after.y}`);
await page.keyboard.press("Control+z");
await page.waitForTimeout(100);
check("undo で戻る", (await getEl("s4-widget")).x === before.x);

// 空白クリックで選択解除 → カバーが戻る
await page.mouse.click(1000, 950);
await page.waitForTimeout(150);
check("選択解除でカバーが戻る", (await widget.locator(".embed-cover").count()) === 1);

if (errors.length) { console.log("--- page errors ---"); for (const e of errors) console.log(e); failures++; }
console.log(failures ? `\n${failures} 件失敗` : "\n全部 OK");
await browser.close();
process.exit(failures ? 1 : 0);
