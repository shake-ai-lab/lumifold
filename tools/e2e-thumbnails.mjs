import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', error => errors.push(String(error)));
try {
  await page.goto('http://127.0.0.1:1420/?deck=/decks/neural-network/deck.json');
  await page.locator('.thumb').nth(14).waitFor({ state: 'attached' });
  const firstFrame = page.locator('.thumb').first().locator('iframe');
  await firstFrame.waitFor();
  assert.equal(await page.locator('.embed-placeholder').count(), 0);
  assert.equal(await firstFrame.getAttribute('tabindex'), '-1');
  assert.equal(await firstFrame.evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  assert.equal(await page.locator('.thumb .embed-cover,.thumb .embed-bar').count(), 0);
  const neuronThumb = page.locator('.thumb').nth(3);
  await neuronThumb.scrollIntoViewIfNeeded();
  const neuron = neuronThumb.frameLocator('iframe');
  await neuron.locator('#w1').waitFor({ state: 'attached' });
  await page.waitForFunction(() => document.querySelectorAll('.thumb iframe').length > 1);
  const painted = await neuron.locator('canvas').first().evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let i = 0; i < data.length; i += 400) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`);
    return colors.size;
  });
  assert(painted > 10, 'thumbnail canvas contains the actual diagram');
  console.log('PASS: visible thumbnails render real widget content, without editing/interaction overlays');

  // Clicking the mini widget should select the slide, never enter the iframe.
  const rect = await neuronThumb.locator('iframe').boundingBox();
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  assert.equal(await page.evaluate(() => window.__deckStore.getState().current), 3);
  assert.equal(await page.evaluate(() => document.activeElement?.tagName === 'IFRAME'), false);
  const main = page.frameLocator('.fit-inner iframe');
  await main.locator('#w1').waitFor();
  const countFrames = frame => frame.locator('body').evaluate(() => new Promise(resolve => {
    let count = 0, active = true;
    const tick = () => { if (!active) return; count++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    setTimeout(() => { active = false; resolve(count); }, 850);
  }));
  const [previewFrames, mainFrames] = await Promise.all([countFrames(neuron), countFrames(main)]);
  assert(previewFrames > 0 && previewFrames <= 8, `preview has bounded animation: ${previewFrames}`);
  assert(mainFrames > previewFrames * 2, `main widget is not throttled: ${mainFrames}`);
  console.log(`PASS: thumbnail click selects slide; thumbnail frames=${previewFrames}, main frames=${mainFrames}`);

  fs.mkdirSync('tools/shots-thumbnails', { recursive: true });
  await page.locator('.slide-list').evaluate(el => { el.scrollTop = 0; });
  await firstFrame.waitFor();
  await page.waitForTimeout(700);
  await page.locator('.slide-list').screenshot({ path: 'tools/shots-thumbnails/top.png' });
  await page.locator('.thumb').nth(11).scrollIntoViewIfNeeded();
  await firstFrame.waitFor({ state: 'detached' });
  await page.locator('.thumb').nth(11).locator('iframe').waitFor();
  await page.waitForTimeout(1000);
  await page.locator('.slide-list').screenshot({ path: 'tools/shots-thumbnails/lower.png' });
  await page.locator('.thumb').first().scrollIntoViewIfNeeded();
  await firstFrame.waitFor();
  console.log('PASS: offscreen frames released, scrolling back reloads previews, 3D thumbnails load');

  await page.route('**/widgets/missing-preview-test.html', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.evaluate(() => {
    const s = window.__deckStore.getState();
    const widget = s.deck.slides[0].elements.find(e => e.type === 'embed');
    s.setCurrent(0); s.patchElement(widget.id, { src: 'widgets/missing-preview-test.html' });
  });
  await page.locator('.thumb').first().getByText('ウィジェットを読めません', { exact: false }).waitFor();
  assert.equal(await firstFrame.count(), 0, 'a changed/broken source must not show stale content');
  assert.deepEqual(errors, []);
  console.log('PASS: missing widget shows a readable error instead of a stale or white preview');
} finally { await browser.close(); }
