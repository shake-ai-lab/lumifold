// 数式の編集パネル: 置き場所(右パネル・数式に重ならない、画面内)、挿入ボタン、エラー表示、確定と取消。
// vite dev 起動中に: node tools/e2e-math-edit.mjs   (ブラウザモードなので deck.json には書き込まない)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const out = 'tools/shots-math-edit'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
const panel = page.locator('.math-edit-panel');
const input = page.getByLabel('TeX数式');
const status = page.locator('#math-edit-status');
const latexOf = id => page.evaluate(id => window.__deckStore.getState().deck.slides[1].elements.find(e => e.id === id).latex, id);
const rect = l => l.evaluate(n => { const r = n.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
const overlaps = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
const open = async id => {
  await page.locator(`.fit-inner [data-id="${id}"]`).dblclick();
  await panel.waitFor(); await page.waitForTimeout(150);
};
// 置き場所: 右パネルにも、編集中の数式にも重ならず、スライドの周りの領域に収まる
const checkPlacement = async (name) => {
  const [p, props, stage, anchor] = await Promise.all([rect(panel), rect(page.locator('.props')), rect(page.locator('.stage')), rect(page.locator('.math-edit'))]);
  assert(!overlaps(p, props), `${name}: 右パネルに重なる ${JSON.stringify({ p, props })}`);
  assert(!overlaps(p, anchor), `${name}: 編集中の数式に重なる`);
  assert(inside(p, stage), `${name}: スライド領域からはみ出す ${JSON.stringify({ p, stage })}`);
  return { p, anchor };
};

try {
  await page.goto('http://127.0.0.1:1420/?deck=/tools/fixtures/coffee-extraction/deck.json'); await page.locator('.thumb').first().waitFor();
  await page.evaluate(() => window.__deckStore.getState().setCurrent(1)); await page.waitForTimeout(200);
  const original = await latexOf('s2-ey-formula');

  // 開いた直後: 全選択ではなくカーソルが末尾(1 文字の入力で式が消えない)
  await open('s2-ey-formula');
  const { p, anchor } = await checkPlacement('上の数式');
  assert(p.top >= anchor.bottom, '下に余裕があるときは数式の下に出る');
  const sel = await input.evaluate(t => [t.selectionStart, t.selectionEnd, t.value.length]);
  assert.deepEqual(sel, [sel[2], sel[2], sel[2]]);
  // 内容に合わせて入力欄が伸び、欄の中でスクロールしない
  assert(await input.evaluate(t => t.scrollHeight <= t.clientHeight + 2), '入力欄に収まる');
  await page.screenshot({ path: `${out}/open.png` });

  // 挿入ボタン: 選択した文字を分子に入れ、カーソルは分母へ。Ctrl+Z で戻せる
  await input.fill('a+b');
  await input.evaluate(t => t.setSelectionRange(0, 1));
  await panel.getByRole('button', { name: '分数' }).click();
  assert.equal(await input.inputValue(), String.raw`\dfrac{a}{}+b`);
  await page.keyboard.type('2');
  assert.equal(await input.inputValue(), String.raw`\dfrac{a}{2}+b`);
  await input.evaluate(t => t.setSelectionRange(t.value.length, t.value.length));
  await panel.getByRole('button', { name: '×' }).click();
  assert.equal(await input.inputValue(), String.raw`\dfrac{a}{2}+b \times `);
  await page.keyboard.press('Control+z');
  assert.equal(await input.inputValue(), String.raw`\dfrac{a}{2}+b`, '挿入は入力欄の Ctrl+Z で戻る');
  await input.evaluate(t => t.setSelectionRange(0, 0));
  await panel.getByRole('button', { name: '文字' }).click(); await page.keyboard.type('割合');
  assert(String(await input.inputValue()).startsWith(String.raw`\text{割合}`));
  assert(await page.locator('.math-edit .katex').count(), 'スライド上でそのまま描画される');

  // エラーは日本語で理由を出す
  await input.fill(String.raw`\dfrac{a`);
  assert.match(await status.innerText(), /「}」が足りません/);
  assert.equal(await input.getAttribute('aria-invalid'), 'true');
  await input.fill(String.raw`x + \foo`);
  assert.match(await status.innerText(), /「\\foo」は使えない命令です/);
  await page.screenshot({ path: `${out}/error.png` });
  await input.fill('溶けた 成分');
  assert.match(await status.innerText(), /文字/, '\\text の外の日本語には案内を出す');

  // パネルの余白をクリックしても閉じない。Esc で取り消し
  await status.click();
  assert.equal(await panel.count(), 1, '余白クリックで閉じない');
  await page.keyboard.press('Escape');
  assert.equal(await panel.count(), 0);
  assert.equal(await latexOf('s2-ey-formula'), original, 'Esc で元のまま');

  // 下端の数式は上に出す。Ctrl+Enter で確定
  await open('s2-example-formula');
  const below = await checkPlacement('下端の数式');
  assert(below.p.bottom <= below.anchor.top, '下に入らないときは数式の上に出る');
  await input.fill(String.raw`\text{抽出率} = 19\,\%`);
  await input.press('Control+Enter');
  assert.equal(await panel.count(), 0);
  assert.equal(await latexOf('s2-example-formula'), String.raw`\text{抽出率} = 19\,\%`);

  // 狭い画面・右パネルを広げた状態でも重ならない
  await page.setViewportSize({ width: 1000, height: 700 }); await page.waitForTimeout(300);
  await open('s2-tds-formula');
  await checkPlacement('狭い画面');
  await page.screenshot({ path: `${out}/narrow.png` });
  await page.keyboard.press('Escape');

  // 低い画面の中段の数式: 上下左右どこにも入らずパネルが数式に重なるなら、パネル内に描画結果を出す
  await open('s2-ey-formula');
  {
    const [p, props, stage, anchor] = await Promise.all([rect(panel), rect(page.locator('.props')), rect(page.locator('.stage')), rect(page.locator('.math-edit'))]);
    assert(!overlaps(p, props) && inside(p, stage), '中段の数式: 右パネル・画面外に出ない');
    const preview = page.locator('.math-edit-preview .katex');
    if (overlaps(p, anchor)) assert.equal(await preview.count(), 1, '数式を隠すならパネル内に描画結果を出す');
    else assert.equal(await preview.count(), 0, '数式が見えているなら描画結果は出さない');
    await input.fill('a^2 + b^2');
    if (overlaps(p, anchor)) assert.match(await page.locator('.math-edit-preview').innerText(), /a/);
  }
  await page.screenshot({ path: `${out}/narrow-middle.png` });
  await page.keyboard.press('Escape');

  assert.deepEqual(errors, []);
  console.log('PASS math edit: placement, caret, insert/undo, Japanese errors, blank click, cancel/commit, narrow window');
} finally {
  await browser.close();
}
