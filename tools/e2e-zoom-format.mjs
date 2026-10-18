// Requires Vite on localhost:1420. Browser fixtures are read-only.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import fs from 'node:fs';

const bundle = await build({ stdin: { contents: 'export * from "./src/model/format"; export * from "./src/model/deck";', resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { convertDeckFormat, parseDeck, DEFAULT_THEME } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const near = (a, b, message) => assert(Math.abs(a - b) < 1e-7, `${message}: ${a} != ${b}`);
const comparable = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'number' ? Math.round(v * 1e7) / 1e7 : v));
const geometry = { x: 30.125, y: 70.75, w: 220.25, h: 30.5 };
const elements = [
  { type: 'text', style: { fontSize: 18.25, paraSpacing: 3.75 }, paragraphs: [{ runs: [{ text: 'test', fontSize: 7.25 }] }] },
  { type: 'shape', shape: 'arrow', line: { width: 0.25, color: 'accent1' }, arrowHeadWidth: 3.5, arrowHeadLength: 7.25, rotation: 23 },
  { type: 'shape', shape: 'roundRect', radius: 2.25 },
  { type: 'table', fontSize: 12.25, colW: [1, 2], rows: [[{ text: 'A' }, { text: 'B' }]] },
  { type: 'math', fontSize: 15.75, latex: 'x^2' },
  { type: 'embed', src: 'widgets/test.html', locked: true },
  { type: 'image', src: 'assets/test.png' },
  { type: 'chart', chart: { kind: 'bar', labels: ['A'], series: [{ name: 'B', values: [1] }] } },
].map((el, index) => ({ ...geometry, id: `element-${index}`, ...el }));

for (const origin of ['slides', 'note']) {
  const original = { version: 1, ...(origin === 'note' ? { format: 'note' } : {}), theme: DEFAULT_THEME, meta: {}, slides: [{ id: 's1', elements }] };
  const other = origin === 'slides' ? 'note' : 'slides';
  assert.equal(convertDeckFormat(original, origin), original);
  let deck = original;
  for (let i = 0; i < 20; i++) {
    deck = parseDeck(JSON.stringify(convertDeckFormat(deck, other)));
    assert.equal(deck.formatOrigin, origin);
    deck = convertDeckFormat(deck, origin);
    assert.equal(deck.formatOrigin, undefined);
  }
  assert.deepEqual(comparable(deck), comparable(original), `${origin}: 20 round trips including save/reopen preserve all element properties`);
  const converted = convertDeckFormat(original, other);
  const k = converted.slides[0].elements[0].w / geometry.w;
  converted.slides[0].elements[0].x += 12 * k;
  converted.slides[0].elements[0].paragraphs[0].runs[0].text = 'edited';
  const returned = convertDeckFormat(converted, origin);
  near(returned.slides[0].elements[0].x, geometry.x + 12, 'edits transform back');
  assert.equal(returned.slides[0].elements[0].paragraphs[0].runs[0].text, 'edited');
}
console.log('PASS: both format directions, 20 round trips, save/reopen, every element type, fractional styles and retained edits');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${process.env.DECK_URL ?? 'http://localhost:1420'}/?deck=/tools/fixtures/demo/deck.json`);
  await page.locator('.zoom-controls').waitFor();
  const state = () => page.evaluate(() => structuredClone(window.__deckStore.getState().deck));
  const dimensions = () => page.locator('.fit-inner .slide-outer').boundingBox();
  const original = await state();
  const sizeBefore = await dimensions();
  for (let i = 0; i < 3; i++) {
    await page.getByLabel('資料の種類').selectOption('note');
    await page.getByLabel('資料の種類').selectOption('slides');
  }
  const returned = await state();
  for (let i = 0; i < original.slides.length; i++) {
    original.slides[i].elements.forEach((el, j) => {
      const after = returned.slides[i].elements[j];
      for (const key of ['x', 'y', 'w', 'h']) near(after[key], el[key], `${el.id}.${key}`);
    });
  }
  near((await dimensions()).width, sizeBefore.width, 'viewport returns to fit');
  await page.locator('.stage').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  assert.equal((await state()).format, 'note');
  await page.keyboard.press('Control+y');
  assert.equal((await state()).format, undefined);
  console.log('PASS: UI format switching, restored size, undo and redo');

  const beforeZoom = await state();
  await page.getByLabel('ズーム倍率').selectOption('200');
  near((await dimensions()).width, 2560, '200% zoom');
  assert(await page.locator('.fit').evaluate(el => el.scrollWidth > el.clientWidth && el.scrollHeight > el.clientHeight));
  await page.locator('.fit').evaluate(el => { el.scrollLeft = el.scrollWidth; el.scrollTop = el.scrollHeight; });
  const bottom = await page.locator('.fit').boundingBox();
  const slide = await dimensions();
  assert(slide.x + slide.width <= bottom.x + bottom.width && slide.y + slide.height <= bottom.y + bottom.height, 'bottom/right edges are reachable');
  await page.getByRole('button', { name: '縮小', exact: true }).click();
  assert((await dimensions()).width < 2560);
  await page.getByRole('button', { name: '拡大', exact: true }).click();
  near((await dimensions()).width, 2560, 'zoom in restores 200%');
  await page.getByRole('button', { name: '全体表示', exact: true }).click();
  near((await dimensions()).width, sizeBefore.width, 'fit reset');
  await page.keyboard.press('Control+=');
  assert((await dimensions()).width > sizeBefore.width);
  await page.keyboard.press('Control+0');
  const wheelFit = await dimensions();
  await page.mouse.move(wheelFit.x + wheelFit.width / 2, wheelFit.y + wheelFit.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -180);
  await page.keyboard.up('Control');
  await page.waitForFunction(w => document.querySelector('.fit-inner .slide-outer').getBoundingClientRect().width > w, wheelFit.width);
  assert.deepEqual(await state(), beforeZoom, 'zoom never modifies deck');
  console.log('PASS: zoom controls, Ctrl shortcuts, Ctrl wheel, scrolling to edges and unchanged document');

  await page.getByLabel('ズーム倍率').selectOption('100');
  await page.locator('.thumb').nth(2).click();
  const target = page.locator('.fit-inner [data-id="s3-card1-head"]');
  await target.scrollIntoViewIfNeeded();
  const beforeDrag = (await state()).slides[2].elements.find(el => el.id === 's3-card1-head');
  const rect = await target.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 40, rect.y + rect.height / 2 + 20, { steps: 8 });
  await page.mouse.up();
  const afterDrag = (await state()).slides[2].elements.find(el => el.id === beforeDrag.id);
  assert(Math.abs(afterDrag.x - beforeDrag.x - 40) <= 6, 'drag x at 100%, allowing alignment snapping');
  assert(Math.abs(afterDrag.y - beforeDrag.y - 20) <= 6, 'drag y at 100%, allowing alignment snapping');
  await page.keyboard.press('Control+z');
  await page.getByLabel('ズーム倍率').selectOption('200');
  await target.scrollIntoViewIfNeeded();
  const largeRect = await target.boundingBox();
  await page.mouse.move(largeRect.x + largeRect.width / 2, largeRect.y + largeRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(largeRect.x + largeRect.width / 2 + 80, largeRect.y + largeRect.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  const largeDrag = (await state()).slides[2].elements.find(el => el.id === beforeDrag.id);
  assert(Math.abs(largeDrag.x - beforeDrag.x - 40) <= 6, 'drag x at 200%, allowing alignment snapping');
  assert(Math.abs(largeDrag.y - beforeDrag.y - 20) <= 6, 'drag y at 200%, allowing alignment snapping');
  await page.keyboard.press('Control+z');
  await page.getByLabel('ズーム倍率').selectOption('100');
  console.log('PASS: dragging after zoom and scrolling uses correct document coordinates');

  fs.mkdirSync('tools/shots-zoom-format', { recursive: true });
  await page.screenshot({ path: 'tools/shots-zoom-format/zoom-100.png' });
  await page.getByRole('button', { name: '全体表示', exact: true }).click();
  for (const viewport of [{ width: 960, height: 600 }, { width: 1600, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    assert(await page.getByRole('button', { name: '全体表示', exact: true }).isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert(await page.locator('.zoom-controls').evaluate(el => el.scrollWidth <= el.clientWidth));
    await page.screenshot({ path: `tools/shots-zoom-format/fit-${viewport.width}.png` });
  }
  await page.keyboard.press('Escape');
  await page.getByLabel('資料の種類').selectOption('note');
  await page.getByLabel('ズーム倍率').selectOption('150');
  near((await dimensions()).width, 768 * 1.5, 'note zoom');
  await page.getByLabel('資料の種類').selectOption('slides');
  assert.equal(await page.getByLabel('ズーム倍率').inputValue(), 'fit');
  assert.deepEqual(errors, []);
  console.log('PASS: narrow/wide layouts, note zoom and fit reset on format changes; no page errors');
} finally { await browser.close(); }
