import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const out = 'tools/shots/authoring-review'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
const sample = JSON.parse(fs.readFileSync('tools/fixtures/authoring-review/deck.json', 'utf8'));
// Emulate only the OS boundary. All app UI, parsing, persistence and copying logic is real.
await page.addInitScript(({ sample }) => {
  localStorage.setItem('deck-studio.propsWidth', '220');
  window.testFiles = { '/original/deck.json': JSON.stringify(sample) };
  window.testSavePath = null; window.testOpenPath = null; window.testWrites = []; window.testCopies = [];
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    transformCallback() { return 1; },
    async invoke(cmd, args) {
      if (cmd === 'initial_deck') return '/original/deck.json';
      if (cmd === 'prepare_deck') return { path: args.path, unpacked: false }; // .deck のまとめファイルでなければそのまま開く
      if (cmd === 'read_deck') { if (!(args.path in window.testFiles)) throw Error('missing file'); return window.testFiles[args.path]; }
      if (cmd === 'write_deck') {
        await new Promise(r => setTimeout(r, 70));
        if (window.testFailWrite) throw Error('write denied');
        window.testFiles[args.path] = args.text; window.testWrites.push(args.path); return;
      }
      if (cmd === 'import_asset') { window.testCopies.push(args); return 'assets/copied-' + window.testCopies.length; }
      if (cmd === 'plugin:dialog|save') return window.testSavePath;
      if (cmd === 'plugin:dialog|open') return window.testOpenPath;
      if (cmd === 'watch_deck' || cmd === 'plugin:event|listen' || cmd === 'plugin:event|unlisten') return 1;
      throw Error('Unexpected OS call: ' + cmd);
    }
  };
}, { sample });
const state = () => page.evaluate(() => { const s = window.__deckStore.getState(); return { deck: s.deck, path: s.deckPath, editing: s.editingId, selection: s.selection, error: s.error }; });
const button = name => page.getByRole('button', { name, exact: true });
try {
  await page.goto('http://localhost:1420/'); await page.locator('.thumb').first().waitFor();
  const original = await page.evaluate(() => window.testFiles['/original/deck.json']);
  await button('新規資料').click(); await button('キャンセル').click(); assert.equal((await state()).path, '/original/deck.json');
  await button('新規資料').click(); await button('保存先を選ぶ').click(); await page.locator('dialog').waitFor({ state: 'detached' });
  assert.equal((await state()).path, '/original/deck.json');
  await page.evaluate(() => { window.testSavePath = '/new/deck.json'; });
  await button('新規資料').click(); await page.getByLabel('資料の題名').fill('UIから作成'); await button('保存先を選ぶ').click();
  await page.locator('dialog').waitFor({ state: 'detached' });
  assert.equal((await state()).deck.meta.title, 'UIから作成'); assert.equal((await state()).deck.slides[0].elements.length, 2);
  assert.equal(await page.evaluate(() => window.testFiles['/original/deck.json']), original);
  console.log('PASS new document: cancel both dialogs, create title/body, original unchanged');

  await button('見出し').click(); await page.getByRole('textbox', { name: 'テキストを編集' }).waitFor();
  assert.equal(await page.evaluate(() => getSelection().toString()), '見出しを入力');
  await page.keyboard.insertText('そのまま入力'); await page.keyboard.press('Control+Enter');
  let s = await state(); const title = s.deck.slides[0].elements.find(e => e.id === s.selection[0]); assert.equal(title.style.fontSize, 36);
  assert.equal(title.paragraphs[0].runs[0].text, 'そのまま入力');
  // 文節で改行するので、区切りのない「あいうえお」の繰り返しではなく普通の文で試す
  await button('テキスト').click(); await page.keyboard.insertText('誤字・数値・言い回しを変えるたびに、画像を作り直す必要がある。'.repeat(8)); await page.keyboard.press('Control+Enter');
  const id = (await state()).selection[0];
  await page.evaluate(id => window.__deckStore.getState().patchElement(id, { w: 400, h: 70 }), id);
  await page.locator('.props .overflow-message').waitFor();
  assert.equal(await page.locator('.fit-inner .text-overflow-badge').count(), 1);
  const fontWidth = await page.getByLabel('文字 pt', { exact: true }).evaluate(n => n.getBoundingClientRect().width);
  assert(fontWidth >= 70);
  const before = (await state()).deck.slides[0].elements.find(e => e.id === id);
  await button('文字を枠に収める').click(); await page.locator('.props .overflow-message').waitFor({ state: 'detached' });
  const after = (await state()).deck.slides[0].elements.find(e => e.id === id); assert(after.style.fontSize < before.style.fontSize);
  assert.equal(after.paragraphs.map(p => p.runs.map(r => r.text).join('')).join('\n'), before.paragraphs.map(p => p.runs.map(r => r.text).join('')).join('\n'));
  await page.keyboard.press('Control+z'); assert.equal((await state()).deck.slides[0].elements.find(e => e.id === id).style.fontSize, before.style.fontSize);
  await page.evaluate(id => window.__deckStore.getState().patchElement(id, { w: 1160, h: 70, y: 170 }), id);
  await button('枠を内容に合わせる').click(); await page.locator('.props .overflow-message').waitFor({ state: 'detached' });
  await page.locator('.fit-inner .text-overflow-badge').waitFor({ state: 'detached' });
  await page.screenshot({ path: `${out}/text-fit-and-narrow-panel.png` });
  console.log('PASS text: immediate selected placeholder, readable 220px panel, overflow detection, shrink/expand, preserved text, undo');

  await page.evaluate(() => {
    const s = window.__deckStore.getState(); s.addSlide();
    s.addElement({ id: 'placement-table', type: 'table', x: 60, y: 180, w: 1160, h: 300, fontSize: 24,
      rows: [[{text:'参照先'},{text:'重み'},{text:'値'}],[{text:'A'},{text:'0.7'},{text:'10'}],[{text:'B'},{text:'0.3'},{text:'20'}]] });
  });

  await button('数式').click(); await page.keyboard.press('Escape'); assert.equal(await page.locator('.insert-position').count(), 0);
  await button('数式').click(); const canvas = await page.locator('.fit-inner .slide').boundingBox();
  await page.mouse.click(canvas.x + canvas.width * .25, canvas.y + canvas.height * .85);
  await page.getByLabel('TeX数式').fill('a+b=c');
  await page.screenshot({ path: `${out}/math-placement.png` });
  await page.keyboard.press('Control+Enter'); s = await state();
  const math = s.deck.slides.flatMap(s => s.elements).find(e => e.id === s.selection[0]); assert.equal(math.type, 'math'); assert(math.y > 600); assert(math.y + math.h <= 720); assert.equal(math.latex, 'a+b=c');
  await page.keyboard.press('Control+z'); assert.notEqual((await state()).deck.slides.flatMap(s => s.elements).find(e => e.id === math.id)?.latex, 'a+b=c');
  console.log('PASS math: click placement, cancel placement, editor panel, commit and undo');

  await page.evaluate(() => { window.testSavePath = '/copy/deck.json'; });
  await button('名前を付けて保存').click(); await button('保存先を選ぶ').click(); await page.locator('dialog').waitFor({ state: 'detached' });
  assert.equal((await state()).path, '/copy/deck.json');
  const saved = await page.evaluate(() => window.testFiles['/copy/deck.json']);
  await page.evaluate(() => { window.testFiles['/bom/deck.json'] = '\uFEFF' + window.testFiles['/copy/deck.json']; window.testOpenPath = '/bom/deck.json'; });
  await button('開く').click(); await page.waitForFunction(() => window.__deckStore.getState().deckPath === '/bom/deck.json'); assert.equal((await state()).error, null);
  assert.deepEqual(JSON.parse(JSON.stringify((await state()).deck)), JSON.parse(saved));
  await page.evaluate(() => { window.testFiles['/bad.json'] = '{invalid'; window.testOpenPath = '/bad.json'; });
  await button('開く').click(); await page.getByRole('alert').waitFor(); assert.equal((await state()).path, '/bom/deck.json'); assert.match((await state()).error, /JSONの書式/);
  await page.screenshot({ path: `${out}/read-error.png` }); await button('閉じる').click();
  console.log('PASS persistence: save-as, reopen, BOM, invalid JSON preserves document and offers recovery');

  await page.evaluate(() => { window.testFailWrite = true; window.testSavePath = '/failure.json'; });
  await button('新規資料').click(); await button('保存先を選ぶ').click(); await page.locator('dialog [role=alert]').waitFor();
  assert.equal((await state()).path, '/bom/deck.json'); await button('キャンセル').click();
  await page.evaluate(() => { window.testFailWrite = false; });
  const copy = await page.evaluate(async () => {
    const { copyDeckAssets } = await import('/src/tauri.ts');
    const d = structuredClone(window.__deckStore.getState().deck);
    d.slides = [{ id: 'assets', elements: [
      { id: 'i', type: 'image', src: 'assets/a.png', comments: [{ images: [{ src: 'assets/a.png' }] }] },
      { id: 'e', type: 'embed', src: 'widgets/a.html' }
    ] }];
    return await copyDeckAssets(d, '/original', '/copy');
  });
  assert.equal(copy.slides[0].elements[0].src, copy.slides[0].elements[0].comments[0].images[0].src);
  assert.equal(await page.evaluate(() => window.testCopies.length), 2);
  assert.deepEqual(errors, []); console.log('PASS failures preserve active file; assets copy once; no page errors');
} finally { await browser.close(); }
