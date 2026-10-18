import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e)));
const out = 'tools/shots-editing-expansion'; fs.mkdirSync(out, { recursive: true });
const box = id => page.locator(`.fit-inner [data-id="${id}"]`);
const get = id => page.evaluate(id => { const s = window.__deckStore.getState(); return s.deck.slides[s.current].elements.find(e => e.id === id); }, id);
const reset = async elements => {
  await page.evaluate(elements => { const s = window.__deckStore.getState(); window.__deckStore.setState({
    deck: { ...s.deck, slides: [{ id: 'test', elements }] }, current: 0, selection: [], editingId: null, interactingId: null,
  }); }, elements);
  await page.waitForTimeout(100);
};
const select = async id => { await page.evaluate(id => window.__deckStore.getState().select([id]), id); await page.waitForTimeout(120); assert.equal(await page.locator('.position-details').count(), 1); };
const startEdit = async id => { await page.evaluate(id => window.__deckStore.getState().setEditing(id), id); };
const move = async (locator, dx, dy, release = true) => {
  const r = await locator.boundingBox(); assert(r);
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + dx, r.y + r.height / 2 + dy, { steps: 8 });
  if (release) await page.mouse.up();
};
const shape = (kind, extra = {}) => ({ id: 'object', type: 'shape', shape: kind, x: 280, y: 170, w: 360, h: 180, fill: 'accent1', line: { color: 'dk1', width: 2 }, ...extra });
const text = { id: 'text', type: 'text', x: 260, y: 200, w: 640, h: 300, background: '112233', style: { fontSize: 20 }, paragraphs: [{ runs: [{ text: '普通の行' }] }, { bullet: true, runs: [{ text: '項目' }] }] };
try {
  await page.goto('http://127.0.0.1:1420/?deck=/decks/neural-network/deck.json'); await page.locator('.thumb').first().waitFor();
  await reset([text]); await startEdit('text');
  const root = page.locator('.text-edit'); await root.waitFor();
  assert.equal(await root.evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(17, 34, 51)');
  await page.keyboard.press('Control+End'); await page.keyboard.press('Enter');
  assert.equal(await root.locator('[data-bullet="true"]').count(), 2);
  await page.keyboard.press('Enter');
  assert.equal(await root.locator('[data-bullet="true"]').count(), 1);
  assert.equal(await root.locator('p').count(), 3, 'empty bullet exits without adding another empty row');
  await page.keyboard.insertText('通常に戻る'); await page.keyboard.press('Control+Enter');
  assert.equal((await get('text')).paragraphs.at(-1).bullet, undefined);
  await startEdit('text'); await root.waitFor();
  await page.evaluate(async () => { const { restoreSelection } = await import('/src/editor/richText.ts'); restoreSelection(document.querySelector('.text-edit'), { start: 5, end: 5 }); });
  await page.keyboard.press('Backspace'); assert.equal(await root.locator('[data-bullet="true"]').count(), 0);
  await page.keyboard.press('Escape');
  await reset([text]); await startEdit('text'); await root.waitFor(); await page.keyboard.press('Control+End');
  await page.keyboard.press('Shift+Enter'); await page.keyboard.insertText('続き'); await page.keyboard.press('Control+Enter');
  assert.equal((await get('text')).paragraphs.length, 2); assert.equal((await get('text')).paragraphs[1].runs.map(r => r.text).join(''), '項目\n続き');
  console.log('PASS bullets: empty Enter exits, Backspace removes marker, Shift+Enter soft break, background preserved');

  for (const kind of ['rect', 'roundRect', 'ellipse', 'triangle', 'star', 'rightArrow']) {
    await reset([shape(kind)]); await select('object');
    await move(page.locator('.moveable-se'), 80, 45, false); await page.waitForTimeout(80);
    const dims = await box('object').evaluate(n => ({ w: parseFloat(n.style.width), h: parseFloat(n.style.height), svgW: +n.querySelector('svg').getAttribute('width'), svgH: +n.querySelector('svg').getAttribute('height') }));
    assert(dims.w > 400); assert(Math.abs(dims.w - dims.svgW) < 1); assert(Math.abs(dims.h - dims.svgH) < 1);
    assert.equal((await get('object')).w, 360, 'no store writes during resize');
    assert.equal(await page.locator('.moveable-snap-digit').count(), 0);
    await page.mouse.up(); await page.keyboard.press('Control+z'); assert.equal((await get('object')).w, 360);
  }
  console.log('PASS shape resize: rect, rounded rect, ellipse, triangle, star, block arrow follow the frame live; single undo');

  const pixels = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="cyan"/></svg>');
  for (const [element, child] of [
    [{...text,id:'object',x:280,y:170,w:360,h:180}, ':scope > div'],
    [{id:'object',type:'image',x:280,y:170,w:360,h:180,src:pixels}, 'img'],
    [{id:'object',type:'table',x:280,y:170,w:360,h:180,colW:[500,500],rows:[[{text:'A'},{text:'B'}],[{text:'C'},{text:'D'}]]}, 'table'],
    [{id:'object',type:'chart',x:280,y:170,w:360,h:180,chart:{kind:'bar',labels:['A','B'],series:[{name:'値',values:[2,5]}]}}, 'canvas'],
    [{id:'object',type:'embed',x:280,y:170,w:360,h:180,src:'widgets/neuron.html'}, 'iframe'],
  ]) {
    await reset([element]); await select('object'); await box('object').locator(child).waitFor();
    await move(page.locator('.moveable-se'),60,30,false); await page.waitForTimeout(150);
    const dimensions = await box('object').evaluate((node,child)=>({outer:node.getBoundingClientRect().width,inner:node.querySelector(child).getBoundingClientRect().width}),child);
    assert(Math.abs(dimensions.outer-dimensions.inner)<2,`${element.type} follows resized box`);
    assert.equal((await get('object')).w,360); await page.mouse.up(); await page.keyboard.press('Control+z'); assert.equal((await get('object')).w,360);
  }
  console.log('PASS other object resize: text, image, table, chart and widget follow bounds during drag, single undo');

  await reset([shape('arrow', { h: 8, rotation: 25 })]); await select('object');
  const oldLine = await get('object');
  const endpoints = e => { const a = (e.rotation ?? 0) * Math.PI / 180, dx = Math.cos(a) * e.w / 2, dy = Math.sin(a) * e.w / 2; return [{x:e.x+e.w/2-dx,y:e.y+e.h/2-dy},{x:e.x+e.w/2+dx,y:e.y+e.h/2+dy}]; };
  await move(page.getByRole('button', { name: '終点', exact: true }), 80, 70);
  const newLine = await get('object');
  assert(Math.abs(endpoints(newLine)[0].x - endpoints(oldLine)[0].x) < .01);
  assert(Math.abs(endpoints(newLine)[0].y - endpoints(oldLine)[0].y) < .01);
  assert(newLine.rotation > oldLine.rotation); assert.equal(await page.locator('.moveable-rotation-control').count(), 0);
  await page.screenshot({ path: `${out}/arrow.png` });
  await page.keyboard.press('Control+z'); assert.deepEqual(await get('object'), oldLine);
  console.log('PASS line endpoint: free angle/length, opposite endpoint stationary, undo restores original');

  await reset([shape('star', { rotation: 15 })]); await select('object');
  await page.getByRole('button', { name: '編集点を編集', exact: true }).click();
  await page.locator('.shape-edit').waitFor();
  await move(page.getByRole('button', { name: '編集点 1', exact: true }), -60, -40);
  await page.getByRole('button', { name: '辺 1 に点を追加', exact: true }).click();
  assert.equal(await page.locator('.vertex').count(), 11);
  await page.getByRole('button', { name: '点を削除', exact: true }).click(); assert.equal(await page.locator('.vertex').count(), 10);
  await page.screenshot({ path: `${out}/points.png` });
  await page.getByRole('button', { name: '完了', exact: true }).click();
  assert.equal((await get('object')).shape, 'polygon'); assert.equal((await get('object')).points.length, 10);
  await page.keyboard.press('Control+z'); assert.equal((await get('object')).shape, 'star');
  console.log('PASS editable vertices: rotated shapes, drag beyond bounds, add/delete point, commit and undo');

  const right = page.getByRole('separator', { name: '設定パネルの幅', exact: true });
  const beforeWidth = await page.locator('.props').evaluate(n => n.getBoundingClientRect().width);
  await move(right, -100, 0); const afterWidth = await page.locator('.props').evaluate(n => n.getBoundingClientRect().width);
  assert(afterWidth > beforeWidth + 90);
  await right.focus(); await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.props').evaluate(n => n.getBoundingClientRect().width), afterWidth + 10);
  await right.dblclick(); assert.equal(await page.locator('.props').evaluate(n => n.getBoundingClientRect().width), 260);
  await move(page.getByRole('separator', { name: 'スライド一覧の幅', exact: true }), 70, 0);
  assert(await page.locator('.thumb .slide-outer').first().evaluate(n => n.getBoundingClientRect().width > 230));
  console.log('PASS panels: drag, keyboard, reset, thumbnails scale with panel width');

  await reset([{ id: 'widget', type: 'embed', x: 200, y: 150, w: 780, h: 420, src: 'widgets/neuron.html', title: 'ニューロン' }]); await select('widget');
  await box('widget').locator('iframe').waitFor();
  await box('widget').getByRole('button', { name: '操作', exact: true }).click();
  assert.equal(await page.locator('.moveable-control-box').count(), 0);
  assert.equal(await box('widget').locator('.embed-cover').count(), 0);
  const frame = page.frameLocator('.fit-inner [data-id="widget"] iframe');
  const range = frame.locator('input[type="range"]').first();
  const value = await range.inputValue(); await range.focus(); await range.press('ArrowRight'); assert.notEqual(await range.inputValue(), value);
  const pos = await get('widget'); await range.press('Escape'); await page.waitForTimeout(50);
  assert.equal(await box('widget').locator('.embed-cover').count(), 1); assert.deepEqual(await get('widget'), pos);
  await page.evaluate(() => window.__deckStore.getState().patchElement('widget', { locked: true }));
  assert.equal(await box('widget').locator('.embed-bar').count(), 0); assert.equal(await box('widget').locator('.embed-cover').count(), 0);
  assert.equal(await box('widget').locator('.embed').evaluate(n => getComputedStyle(n).outlineStyle), 'none');
  await range.focus(); await range.press('ArrowLeft'); assert.equal((await get('widget')).x, pos.x);
  await page.mouse.move(10, 10); await page.waitForTimeout(200); await page.screenshot({ path: `${out}/locked-widget.png` });
  await box('widget').hover(); await box('widget').getByRole('button', { name: 'ウィジェットの固定を解除' }).click();
  assert.equal((await get('widget')).locked, undefined);
  await page.mouse.move(10,10); await page.waitForTimeout(180);
  assert.equal(await box('widget').locator('.widget-controls').evaluate(n=>getComputedStyle(n).opacity),'1'); // Selection keeps the labelled controls discoverable.
  await page.evaluate(() => window.__deckStore.getState().select([]));
  await page.waitForTimeout(180);
  assert.equal(await box('widget').locator('.widget-controls').evaluate(n=>getComputedStyle(n).opacity),'0');
  await box('widget').hover(); await page.waitForTimeout(180); await page.screenshot({path:`${out}/widget-controls.png`});
  console.log('PASS widgets: explicit operation, iframe Esc, lock auto-enables interaction, no fixed bar/frame, hover unlock');

  await reset([shape('rect')]); await select('object');
  const bg = page.locator('.props .row').filter({ has: page.locator('span').filter({ hasText: /^背景色$/ }) }).first();
  await bg.locator('.custom-color summary').click();
  await bg.getByLabel('カラーコード').fill('#123abc'); await bg.getByLabel('カラーコード').press('Enter');
  assert.equal((await get('object')).background, '123ABC');
  assert.equal(await box('object').evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(18, 58, 188)');
  await page.evaluate(() => { window.EyeDropper = class { async open() { return { sRGBHex: '#fedcba' }; } }; });
  await bg.getByRole('button', { name: 'スポイト', exact: true }).click(); assert.equal((await get('object')).background, 'FEDCBA');
  console.log('PASS colors: hex, object background, EyeDropper result integration (picker API mocked)');

  const table = { id:'table', type:'table', x:180, y:200, w:500, h:210, fontSize:18, colW:[240,700,420], rows:Array.from({length:5},(_,r)=>[{text:`行 ${r}`},{text:'編集できる表の内容'},{text:'詳細'}]) };
  await reset([table]); await select('table');
  const widths = await box('table').evaluate(n => ({ parent:n.getBoundingClientRect().width, table:n.querySelector('table').getBoundingClientRect().width, right:n.querySelector('tr td:last-child').getBoundingClientRect().right, end:n.getBoundingClientRect().right }));
  assert(Math.abs(widths.parent-widths.table)<1); assert(Math.abs(widths.right-widths.end)<1);
  await startEdit('table'); await page.locator('.table-edit').waitFor();
  await page.getByLabel('2行 2列', {exact:true}).fill('編集中の内容を維持');
  await move(page.getByRole('separator',{name:'列 1 の幅',exact:true}),35,0);
  assert.equal(await page.getByLabel('2行 2列',{exact:true}).innerText(),'編集中の内容を維持');
  await page.getByRole('button',{name:'文字を収める',exact:true}).click(); await page.waitForTimeout(250);
  await page.screenshot({path:`${out}/table.png`});
  await page.getByRole('button',{name:'完了',exact:true}).click();
  assert.notDeepEqual((await get('table')).colW,table.colW); assert.equal((await get('table')).rows[1][1].text,'編集中の内容を維持');
  console.log('PASS table: proportional columns fit bounds, drag column width preserves draft, text fit and save');

  await reset([shape('rect')]); await select('object');
  await page.getByLabel('新しいコメント').fill('この図形を参考画像に合わせて修正');
  await page.locator('.object-comments input[type=file]').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=','base64')});
  await page.getByRole('button',{name:'コメントを追加',exact:true}).click();
  const comment = (await get('object')).comments[0]; assert(comment.images[0].src.startsWith('data:image/png')); assert(comment.id);
  await page.getByRole('button',{name:'AIへの修正依頼をコピー',exact:true}).click();
  const copied = await page.evaluate(()=>navigator.clipboard.readText()); assert(copied.includes('"elementId": "object"')); assert(copied.includes(comment.text));
  await page.getByRole('button',{name:'解決済みにする',exact:true}).click(); assert.equal((await get('object')).comments[0].resolved,true);
  await page.screenshot({path:`${out}/comments.png`});
  console.log('PASS comments: image attachment, per-object IDs, AI request clipboard, resolution saved');

  await page.getByRole('button',{name:'数式',exact:true}).click();
  await page.locator('.insert-position').click({ position: { x: 200, y: 350 } });
  await page.getByLabel('TeX数式').waitFor();
  await page.getByLabel('TeX数式').fill(String.raw`\frac{1}{n}\sum_{i=1}^{n} x_i^2`);
  assert(await page.locator('.math-edit .katex').count());
  await page.screenshot({path:`${out}/math.png`});
  await page.getByLabel('TeX数式').press('Control+Enter');
  const math = await page.evaluate(()=>{const s=window.__deckStore.getState();return s.deck.slides[0].elements.find(e=>e.type==='math');});
  assert.equal(math.latex,String.raw`\frac{1}{n}\sum_{i=1}^{n} x_i^2`);
  await startEdit(math.id); await page.getByLabel('TeX数式').fill('\\invalidcommand{');
  assert.equal(await page.locator('.math-edit .katex-error').count(),1);
  await page.keyboard.press('Escape'); assert.equal((await get(math.id)).latex,math.latex);
  console.log('PASS TeX: live rendering, commit, invalid syntax shown, cancel preserves equation');
  fs.writeFileSync(`${out}/roundtrip.json`,await page.evaluate(()=>JSON.stringify(window.__deckStore.getState().deck,null,2)));
  assert.deepEqual(errors,[]); console.log('PASS no page errors');
} finally { await browser.close(); }
