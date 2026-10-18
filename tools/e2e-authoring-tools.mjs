// 発表者ノート・発表者ビュー、型からスライド追加、画像の追加(選択・貼り付け・ドロップ)、グラフのデータ編集。
// vite dev 起動中に: node tools/e2e-authoring-tools.mjs   (ブラウザモードなので deck.json には書き込まない)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const out = 'tools/shots-authoring-tools'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
const state = () => page.evaluate(() => { const s = window.__deckStore.getState(); return { current: s.current, deck: s.deck, selection: s.selection }; });
const slideEls = async () => { const s = await state(); return s.deck.slides[s.current].elements; };
const button = name => page.getByRole('button', { name, exact: true });

try {
  await page.goto('http://127.0.0.1:1420/?deck=/tools/fixtures/demo/deck.json'); await page.locator('.thumb').first().waitFor();

  // --- 発表者ノート: 右パネルで書き、欄を離れたときに 1 回だけ保存 ---
  const notes = page.getByRole('textbox', { name: '発表者ノート' });
  await notes.fill('最初に結論を言う\n次に理由を 3 つ');
  await page.locator('.fit-inner .slide').click({ position: { x: 5, y: 5 } });
  assert.equal((await state()).deck.slides[0].notes, '最初に結論を言う\n次に理由を 3 つ');
  await page.keyboard.press('Control+z');
  assert.equal((await state()).deck.slides[0].notes, undefined, '1 回の Ctrl+Z で戻る');
  await page.keyboard.press('Control+y');

  // --- 発表者ビュー: P で切り替え。次のスライド・ノート・経過時間 ---
  await button('プレゼン開始').click(); await page.locator('.presentation').waitFor();
  await page.keyboard.press('p');
  await page.locator('.presenter-side').waitFor();
  assert.match(await page.locator('.presenter-notes').innerText(), /最初に結論を言う/);
  assert.equal(await page.locator('.presenter-next .slide-outer').count(), 1, '次のスライドの見本');
  assert.match(await page.locator('.presenter-timer').innerText(), /経過 0:0\d/);
  const stageWidth = await page.locator('.presentation-stage .slide-outer').evaluate(n => n.getBoundingClientRect().width);
  assert(stageWidth > 700, '今のスライドは大きいまま');
  await page.screenshot({ path: `${out}/presenter.png` });
  await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('.presenter-notes').innerText(), /ノートはありません/);
  await page.keyboard.press('p'); assert.equal(await page.locator('.presenter-side').count(), 0);
  await page.keyboard.press('Escape'); await page.locator('.presentation').waitFor({ state: 'detached' });
  console.log('PASS notes + presenter view: panel field, single undo, P toggle, next slide, notes, timer');

  // --- 型からスライド追加 ---
  const before = (await state()).deck.slides.length, at = (await state()).current;
  await button('追加').click();
  const gallery = page.locator('.layout-gallery');
  await gallery.waitFor();
  assert.equal(await gallery.getByRole('button').count(), 10);
  await page.screenshot({ path: `${out}/layouts.png` });
  await gallery.getByRole('button', { name: 'カード 3 枚' }).click();
  let s = await state();
  assert.equal(s.deck.slides.length, before + 1); assert.equal(s.current, at + 1, '今のスライドの後ろに入る');
  const els = s.deck.slides[s.current].elements;
  assert.equal(els.length, 10); assert.equal(els[0].role, 'title');
  assert.equal(new Set(els.map(e => e.id)).size, 10, 'id は重ならない');
  assert.equal(new Set(els.filter(e => e.group).map(e => e.group)).size, 3, 'カードごとにまとまる');
  console.log('PASS layouts: gallery with previews, inserted after current, unique ids, grouped cards');

  // --- 画像: ボタン(ブラウザではファイル選択)、貼り付け、ドロップ ---
  await page.locator('header input[type=file][accept="image/*"]').setInputFiles('tools/fixtures/demo/assets/logo.png');
  await page.waitForFunction(() => { const s = window.__deckStore.getState(); return s.deck.slides[s.current].elements.some(e => e.type === 'image'); });
  let img = (await slideEls()).find(e => e.type === 'image');
  assert(img.src.startsWith('data:image/png'), 'ブラウザでは data URL');
  assert.equal(img.w, img.h, '元画像の縦横比(正方形)のまま');
  assert.deepEqual((await state()).selection, [img.id], '入れた画像が選ばれる');
  const png = fs.readFileSync('tools/fixtures/demo/assets/logo.png').toString('base64');
  const fire = (type, x, y) => page.evaluate(async ([type, png, x, y]) => {
    const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bytes], 'shot.png', { type: 'image/png' }));
    if (type === 'paste') document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    else { const stage = document.querySelector('.editor-stage');
      stage.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y }));
      stage.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y })); }
  }, [type, png, x, y]);
  const count = async () => (await slideEls()).filter(e => e.type === 'image').length;
  await page.locator('.fit-inner .slide').click({ position: { x: 5, y: 5 } });
  await fire('paste'); await page.waitForFunction(() => { const s = window.__deckStore.getState(); return s.deck.slides[s.current].elements.filter(e => e.type === 'image').length === 2; });
  const slide = await page.locator('.fit-inner .slide').boundingBox();
  await fire('drop', slide.x + slide.width * 0.25, slide.y + slide.height * 0.75);
  await page.waitForFunction(() => { const s = window.__deckStore.getState(); return s.deck.slides[s.current].elements.filter(e => e.type === 'image').length === 3; });
  img = (await slideEls()).filter(e => e.type === 'image').at(-1);
  assert(Math.abs(img.x + img.w / 2 - 320) < 30 && Math.abs(img.y + img.h / 2 - 540) < 30, `落とした位置が中心 (${img.x + img.w / 2}, ${img.y + img.h / 2})`);
  // アプリ内でコピーした要素の貼り付けは今までどおり(クリップボードに画像が無いとき)
  const n0 = (await slideEls()).length;
  await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
  await page.waitForFunction(n => { const s = window.__deckStore.getState(); return s.deck.slides[s.current].elements.length === n + 1; }, n0);
  assert.equal(await count(), 4);
  console.log('PASS images: picker (data URL in browser), aspect ratio, paste, drop at pointer, in-app copy/paste still works');

  // --- グラフのデータ編集 ---
  await page.evaluate(() => { const s = window.__deckStore.getState(); s.setCurrent(s.deck.slides.findIndex(sl => sl.elements.some(e => e.id === 's6-chart'))); });
  await page.waitForTimeout(300);
  await page.locator('.fit-inner [data-id="s6-chart"]').dblclick();
  const dialog = page.getByRole('dialog', { name: 'グラフのデータ' }); await dialog.waitFor();
  const cell = dialog.getByLabel('1 行目・系列 1 の値');
  await cell.fill('abc');
  assert.match(await dialog.locator('.dialog-status').innerText(), /数値でないセルが 1 個/);
  assert(await dialog.getByRole('button', { name: '適用 (Ctrl+Enter)' }).isDisabled());
  await cell.fill('１２'); // 全角の数字も読む
  await dialog.getByRole('button', { name: '＋系列' }).click();
  await dialog.getByLabel('系列 3 の名前').fill('目標');
  await page.screenshot({ path: `${out}/chart-data.png` });
  await dialog.getByRole('button', { name: '適用 (Ctrl+Enter)' }).click();
  await dialog.waitFor({ state: 'detached' });
  const chart = (await slideEls()).find(e => e.id === 's6-chart').chart;
  assert.equal(chart.series[0].values[0], 12); assert.equal(chart.series.length, 3); assert.equal(chart.series[2].name, '目標');
  await page.keyboard.press('Control+z');
  assert.equal((await slideEls()).find(e => e.id === 's6-chart').chart.series.length, 2, '1 回の Ctrl+Z で戻る');
  await page.locator('.fit-inner [data-id="s6-chart"]').click(); await page.getByRole('button', { name: 'データを編集', exact: true }).click();
  await dialog.waitFor(); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
  console.log('PASS chart data: double-click/panel entry, invalid cells block apply, full-width digits, add series, single undo, Esc');

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
