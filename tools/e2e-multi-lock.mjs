// 複数選択の右パネル(共通の書式をまとめて変える・混在の表示・1 回の undo)、
// 「位置を固定」(位置は守るが中身は編集できる)、一覧の番号がスライドを隠さないこと。
// vite dev 起動中に: node tools/e2e-multi-lock.mjs   (ブラウザモードなので deck.json には書き込まない)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const out = 'tools/shots-multi-lock'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
const get = id => page.evaluate(id => { const s = window.__deckStore.getState(); return s.deck.slides[s.current].elements.find(e => e.id === id); }, id);
const select = ids => page.evaluate(ids => window.__deckStore.getState().select(ids), ids);
const props = page.locator('.props');
const fontOf = el => el.style?.fontSize;
// 右パネルの 1 行(ラベル + 入力)。select は選択肢の文字も名前に入るので、行の見出しで探す
const field = label => props.locator('label.row').filter({ has: page.locator(':scope > span:first-child', { hasText: new RegExp(`^${label}$`) }) }).locator('select, input').first();

try {
  await page.goto('http://127.0.0.1:1420/?deck=/tools/fixtures/demo/deck.json'); await page.locator('.thumb').first().waitFor();
  await page.locator('.thumb').nth(2).click(); await page.waitForTimeout(200);

  // --- 複数選択: 共通の値をまとめて変える ---
  await select(['s3-card1-head', 's3-card2-head', 's3-card1']);
  await props.getByText('3 個を選択中').waitFor();
  const size = field('文字 pt');
  assert.equal(await size.inputValue(), '18', '見出し 2 つは同じ 18pt');
  await size.fill('22'); await size.press('Enter');
  assert.equal(fontOf(await get('s3-card1-head')), 22); assert.equal(fontOf(await get('s3-card2-head')), 22);
  await page.screenshot({ path: `${out}/multi.png` });
  await page.locator('.fit-inner .slide').click({ position: { x: 5, y: 5 } }); // 入力欄から外す(Ctrl+Z を文書へ)
  await page.keyboard.press('Control+z');
  assert.equal(fontOf(await get('s3-card1-head')), 18); assert.equal(fontOf(await get('s3-card2-head')), 18, '1 回の Ctrl+Z で両方戻る');

  await select(['s3-card1-head', 's3-card1-body']);
  await props.getByText('2 個を選択中').waitFor();
  assert.equal(await size.inputValue(), '', '値がそろっていなければ空欄');
  assert.equal(await size.getAttribute('placeholder'), '混在');
  const color = field('文字色');
  await color.selectOption('accent2');
  assert.equal((await get('s3-card1-head')).style.color, 'accent2'); assert.equal((await get('s3-card1-body')).style.color, 'accent2');

  await select(['s3-card1', 's3-card2']);
  await field('塗り').selectOption('accent3');
  assert.equal((await get('s3-card1')).fill, 'accent3'); assert.equal((await get('s3-card2')).fill, 'accent3');
  await select(['s3-card1', 's3-card2', 's3-card1-head']);
  assert.equal(await field('背景色').inputValue(), '', '背景色はどれも「なし」');
  await field('不透明度 %').fill('50'); await field('不透明度 %').press('Enter');
  assert.equal((await get('s3-card1')).opacity, 0.5); assert.equal((await get('s3-card1-head')).opacity, 0.5);

  // 固定が一部だけなら「混在」
  await page.evaluate(() => window.__deckStore.getState().patchElement('s3-card2', { locked: true }));
  await select(['s3-card1', 's3-card2']);
  assert.equal(await field('位置を固定').evaluate(n => n.indeterminate), true);
  await page.evaluate(() => window.__deckStore.getState().patchElement('s3-card2', { locked: undefined }));
  console.log('PASS multi-selection: common font size/color/fill/opacity, mixed values, single undo, tri-state lock');

  // --- 位置を固定: 中身は編集できるが、位置・大きさは変えられない ---
  await page.evaluate(() => window.__deckStore.getState().patchElement('s3-card3-head', { locked: true }));
  await page.locator('.fit-inner [data-id="s3-card3-head"]').dblclick();
  await page.locator('.text-edit').waitFor();
  await page.keyboard.press('Escape'); await page.locator('.text-edit').waitFor({ state: 'detached' });
  await select(['s3-card3-head']);
  await props.locator('.locked-hint').waitFor();
  await props.locator('.position-details summary').click();
  assert(await props.locator('.position-details input[type=number]').first().isDisabled(), '位置の数値は変えられない');
  await page.keyboard.press('F2'); await page.locator('.text-edit').waitFor();
  await page.keyboard.press('Escape');
  const before = await get('s3-card3-head');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Delete');
  const after = await get('s3-card3-head');
  assert(after && after.x === before.x, '矢印キーで動かない・Delete で消えない');
  console.log('PASS lock: double-click and F2 edit text, geometry inputs disabled, arrow/delete blocked');

  // --- 一覧の番号はスライドの外(左)にあり、タイトルを隠さない ---
  const [no, frame] = await Promise.all([page.locator('.thumb-no').first().boundingBox(), page.locator('.thumb-frame').first().boundingBox()]);
  assert(no.x + no.width <= frame.x + 1, '番号はサムネイルの左');
  console.log('PASS thumbnails: slide number sits outside the slide');

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
