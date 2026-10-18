import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
try {
  await page.goto('http://127.0.0.1:1420/?deck=/tools/fixtures/demo/deck.json');
  await page.locator('.thumb').first().waitFor();
  const fixture = { id: 'rich-fixture', type: 'text', x: 100, y: 80, w: 750, h: 500, rotation: 8, opacity: 0.8,
    style: { fontSize: 22, color: 'dk1', valign: 'middle', paraSpacing: 18 },
    paragraphs: [
      { bullet: true, level: 1, runs: [{ text: '先頭😀 ', bold: true, color: 'accent1', fontSize: 24 }, { text: 'ふつうの文字' }] },
      { runs: [{ text: '' }] },
      { align: 'right', runs: [{ text: '最終行', italic: true }] },
    ] };
  const reset = () => page.evaluate(el => {
    const s = window.__deckStore.getState(); s.setEditing(null);
    if (s.deck.slides[s.current].elements.some(e => e.id === el.id)) s.patchElement(el.id, el);
    else s.addElement(el);
  }, fixture);
  const edit = () => page.evaluate(() => window.__deckStore.getState().setEditing('rich-fixture', 0));
  const get = () => page.evaluate(() => {
    const s = window.__deckStore.getState(); return s.deck.slides[s.current].elements.find(e => e.id === 'rich-fixture');
  });
  const measure = selector => page.locator(selector).evaluate(el => [...el.querySelectorAll('p,[data-run]')].map(n => {
    const r = n.getBoundingClientRect(), s = getComputedStyle(n);
    return { x: r.x, y: r.y, w: r.width, h: r.height, size: s.fontSize, color: s.color, align: s.textAlign };
  }));
  await reset(); const before = await measure('.fit-inner [data-id="rich-fixture"]'); await edit();
  assert.deepEqual(await measure('.text-edit'), before);
  assert.equal(await page.locator('.text-edit').evaluate(el => getComputedStyle(el).opacity), '0.8');
  console.log('PASS: rotated, translucent, vertically centered text retains exact geometry');
  await page.keyboard.press('Control+Home'); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await page.keyboard.insertText('追加箇条書き'); await page.keyboard.press('Control+Enter');
  const a = await get(); assert.equal(a.paragraphs.length, 4); assert.equal(a.paragraphs[1].bullet, true);
  assert.equal(a.paragraphs[1].level, 1); assert.equal(a.paragraphs[1].runs.map(r => r.text).join(''), '追加箇条書き');
  await edit(); await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace');
  await page.keyboard.insertText('置換😀'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await page.keyboard.insertText('末尾'); await page.keyboard.press('Control+Enter');
  assert.equal((await get()).paragraphs.map(p => p.runs.map(r => r.text).join('')).join('\n'), '置換😀\n末尾');
  assert.equal((await get()).paragraphs.at(-1).bullet, undefined);
  console.log('PASS: bullet insertion, Enter exits empty bullet, replacement');
  await reset(); await edit();
  await page.locator('.text-edit').evaluate(root => {
    const ps = root.querySelectorAll('p'), range = document.createRange();
    range.setStart(ps[0].querySelector('[data-run]').firstChild, 2);
    range.setEnd(ps[2].querySelector('[data-run]').firstChild, 2);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.locator('.text-edit').evaluate(root => root.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 600, clientY: 500 })));
  await page.getByRole('button', { name: '文字色 accent4', exact: true }).click();
  await page.keyboard.press('Escape'); await page.keyboard.press('Control+Enter');
  const mixed = (await get()).paragraphs;
  assert.equal(mixed[0].runs[0].text, '先頭'); assert.equal(mixed[0].runs[0].color, 'accent1');
  assert.equal(mixed[0].runs[1].text, '😀 '); assert.equal(mixed[0].runs[1].color, 'accent4');
  assert.equal(mixed[2].runs[0].text, '最終'); assert.equal(mixed[2].runs[0].color, 'accent4');
  assert.equal(mixed[2].runs[1].text, '行'); assert.equal(mixed[2].runs[1].color, undefined);
  console.log('PASS: cross-paragraph selection excludes bullet markers and preserves emoji');
  await edit(); await page.keyboard.press('Control+End');
  await page.locator('.text-edit').evaluate(root => {
    const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', '\n貼り付け\n\n末尾😀');
    clipboardData.setData('text/html', '<b>should not be inserted</b>');
    root.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  });
  await page.keyboard.press('Control+Enter');
  assert((await get()).paragraphs.map(p => p.runs.map(r => r.text).join('')).join('\n').endsWith('\n貼り付け\n\n末尾😀'));
  console.log('PASS: multiline paste preserves empty paragraphs and inserts only plain text');
  assert.deepEqual(errors, []);
} finally { await browser.close(); }


