import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', error => errors.push(String(error)));
const state = () => page.evaluate(() => {
  const s = window.__deckStore.getState();
  return { current: s.current, selection: s.selection, deck: s.deck, editingId: s.editingId };
});
const get = async id => { const s = await state(); return s.deck.slides[s.current].elements.find(e => e.id === id); };
const box = id => page.locator(`.fit-inner [data-id="${id}"]`);
const context = async id => { const rect = await box(id).boundingBox(); await page.mouse.click(rect.x + 15, rect.y + 15, { button: 'right' }); };
try {
  await page.goto('http://127.0.0.1:1420/?deck=/tools/fixtures/demo/deck.json');
  await page.locator('.thumb').nth(2).click();
  await box('s3-card1-head').click();
  const before = await get('s3-card1-head');
  await page.locator('.position-details summary').click();
  const x = page.getByLabel('X', { exact: true });
  await x.fill(''); assert.equal((await get(before.id)).x, before.x);
  await x.fill('300'); assert.equal((await get(before.id)).x, before.x);
  await x.press('Enter'); assert.equal((await get(before.id)).x, 300);
  await page.keyboard.press('Control+z'); assert.equal((await get(before.id)).x, before.x);
  await x.fill('-100'); await x.press('Escape'); assert.equal((await get(before.id)).x, before.x);
  const width = page.getByLabel('幅', { exact: true }); await width.fill('0'); await width.press('Enter');
  assert.equal((await get(before.id)).w, before.w);
  console.log('PASS: numeric drafts, commit, cancel, validation and single-step undo');

  await context('s3-card1');
  await page.getByRole('button', { name: 'コピー Ctrl+C', exact: true }).click();
  await page.locator('.thumb').nth(3).click();
  const count = (await state()).deck.slides[3].elements.length;
  await page.keyboard.press('Control+v');
  assert.equal((await state()).deck.slides[3].elements.length, count + 1);
  let pasted = (await state()).selection[0];
  await context(pasted); await page.getByRole('button', { name: '位置を固定', exact: true }).click();
  assert.equal((await get(pasted)).locked, true);
  await context(pasted); assert(await page.getByRole('button', { name: '削除 Delete', exact: true }).isDisabled());
  await page.getByRole('button', { name: '固定を解除', exact: true }).click(); assert.equal((await get(pasted)).locked, undefined);
  await context(pasted); await page.getByRole('button', { name: '複製 Ctrl+D', exact: true }).click();
  assert.equal((await state()).deck.slides[3].elements.length, count + 2);
  console.log('PASS: universal context menu, copy between slides, lock/unlock and duplicate');

  await page.locator('.thumb').nth(2).click();
  await box('s3-card1-head').click(); await page.keyboard.down('Shift'); await box('s3-card2-head').click(); await page.keyboard.up('Shift');
  assert.equal((await state()).selection.length, 2);
  await page.getByRole('button', { name: '上揃え', exact: true }).click();
  assert.equal((await get('s3-card1-head')).y, (await get('s3-card2-head')).y);
  assert(await page.getByRole('button', { name: '横に等間隔', exact: true }).isDisabled());
  await context('s3-card1-head'); assert.equal((await state()).selection.length, 2); await page.keyboard.press('Escape');
  console.log('PASS: multi-selection alignment and right-click preserves selected set');

  const slideCount = (await state()).deck.slides.length;
  await page.locator('.thumb').nth(2).click({ button: 'right' });
  await page.getByRole('button', { name: 'スライドを複製', exact: true }).click();
  assert.equal((await state()).deck.slides.length, slideCount + 1); assert.equal((await state()).current, 3);
  await page.getByRole('button', { name: '図形', exact: true }).click();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  const shapeId = (await state()).selection[0]; assert.equal((await get(shapeId)).shape, 'roundRect');
  await page.getByRole('button', { name: '表', exact: true }).click(); await page.locator('.table-edit').waitFor();
  await page.getByRole('button', { name: '完了', exact: true }).click();
  console.log('PASS: slide context menu, keyboard-accessible shape menu and table insertion');

  fs.mkdirSync('tools/shots-editor-ux', { recursive: true });
  await page.locator('.thumb').nth(2).click(); await box('s3-card1-head').click();
  await page.screenshot({ path: 'tools/shots-editor-ux/wide.png' });
  await page.setViewportSize({ width: 960, height: 600 });
  await page.screenshot({ path: 'tools/shots-editor-ux/compact.png' });
  assert(await page.getByRole('button', { name: 'プレゼン開始', exact: true }).isVisible());
  assert(await page.locator('.toolbar-actions').evaluate(el => el.scrollWidth <= el.clientWidth));
  const smallWidth = await page.locator('.fit-inner .slide-outer').evaluate(el => el.getBoundingClientRect().width);
  await page.getByRole('button', { name: '一覧', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  // Short viewports become height-limited when the panels close, so the slide only grows a little.
  await page.waitForFunction(width => document.querySelector('.fit-inner .slide-outer').getBoundingClientRect().width > width + 20, smallWidth);
  assert.equal(await page.locator('.slide-list,.props').count(), 0);
  await page.screenshot({ path: 'tools/shots-editor-ux/expanded-canvas.png' });
  await page.getByRole('button', { name: '一覧', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  assert.equal(await page.locator('.slide-list,.props').count(), 2);
  assert.deepEqual(errors, []);
  console.log('PASS: compact viewport keeps toolbar controls accessible; no page errors');
} finally { await browser.close(); }
