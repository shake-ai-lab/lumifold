// 本物の Tauri ウィンドウに対する確認。WebView2 のリモートデバッグ(CDP)経由で操作し、
// ドラッグした結果が資料に書き戻されること、自分の書き込みを再読込しないこと、外部の書き換えを取り込むことを検証する。
// 試験用の資料(tools/fixtures/_e2e)を一時フォルダに写して開くので、元の資料は書き換わらない。
// 前提: 次の環境変数を付けてアプリ(`npx tauri dev` か target/debug/lumifold.exe)を起動しておく(開いている資料は問わない)
//   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
// 使い方: node tools/e2e-tauri.mjs   (ポートを変えたときは CDP_URL=http://localhost:9333)
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const work = fs.mkdtempSync(path.join(os.tmpdir(), "lumifold-tauri-"));
const deckPath = path.join(work, "deck.json");
fs.copyFileSync("tools/fixtures/_e2e/deck.json", deckPath);

const browser = await chromium.connectOverCDP(process.env.CDP_URL ?? "http://localhost:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("localhost:1420")) ?? ctx.pages()[0];
console.log("page:", page.url());
await page.bringToFront();
await page.waitForFunction(() => !!window.__deckStore, null, { timeout: 15000 });
await page.evaluate((p) => window.__deckStore.getState().openDeck(p), deckPath);
await page.waitForSelector(".thumb", { timeout: 15000 });

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!cond) failures++;
};
const state = () => page.evaluate(() => {
  const s = window.__deckStore.getState();
  return { deckPath: s.deckPath, current: s.current, reloads: s.reloads, saveState: s.saveState, error: s.error };
});
const readFileEl = (id) => {
  const d = JSON.parse(fs.readFileSync(deckPath, "utf8"));
  for (const s of d.slides) for (const e of s.elements) if (e.id === id) return e;
  return null;
};

let st = await state();
check("アプリが試験用の資料を開いている", st.deckPath === deckPath, st.deckPath);
const reloadsAtStart = st.reloads; // 前に開いていた資料で取り込んだ回数は数えない

await page.locator(".thumb").nth(2).click();
await page.waitForTimeout(300);
const target = page.locator('.fit-inner [data-id="s3-card1-head"]');
const fileBefore = readFileEl("s3-card1-head");
const box = await target.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 30, { steps: 5 });
await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 60, { steps: 10 });
await page.mouse.up();

// 自動保存(400ms)→ 監視イベント → エコー判定、を待つ
await page.waitForTimeout(1500);
st = await state();
check("保存済みになる", st.saveState === "saved", `${st.saveState} ${st.error ?? ""}`);
const fileAfter = readFileEl("s3-card1-head");
check("deck.json に位置が書き戻されている", fileAfter.x > fileBefore.x && fileAfter.y > fileBefore.y, `x ${fileBefore.x}→${fileAfter.x}, y ${fileBefore.y}→${fileAfter.y}`);
check("自分の書き込みを外部変更として再読込していない", st.reloads === reloadsAtStart, `reloads=${st.reloads - reloadsAtStart}`);

// 外部変更(Claude Code が書く想定)は取り込まれる
const d = JSON.parse(fs.readFileSync(deckPath, "utf8"));
const t = d.slides[2].elements.find((e) => e.id === "s3-title");
t.paragraphs[0].runs[0].text = "外部から書き換えた見出し";
fs.writeFileSync(deckPath + ".tmp", JSON.stringify(d, null, 2) + "\n");
fs.renameSync(deckPath + ".tmp", deckPath);
await page.waitForTimeout(1200);
st = await state();
const shown = await page.locator('.fit-inner [data-id="s3-title"]').innerText();
check("外部変更を再読込する", st.reloads === reloadsAtStart + 1, `reloads=${st.reloads - reloadsAtStart}`);
check("外部変更が画面に出る", shown.includes("外部から書き換えた見出し"), shown);

// 再読込後も、ドラッグした位置は失われていない(外部側がそれを含んだファイルを書いたので)
check("再読込後もドラッグ結果が残る", readFileEl("s3-card1-head").x === fileAfter.x);

console.log(failures ? `\n${failures} 件失敗` : "\n全部 OK");
await browser.close();
process.exit(failures ? 1 : 0);
