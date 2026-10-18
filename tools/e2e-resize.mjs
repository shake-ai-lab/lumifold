// 画像とグループの拡大縮小(PowerPoint と同じ動き)。vite dev 起動中に: node tools/e2e-resize.mjs
//  - 画像は角のつまみで縦横比を保つ(Shift で外す)。辺のつまみは片方だけ伸びる。図形は角で自由、Shift で保つ
//  - グループの要素をクリックするとグループ全体、もう一度クリックで中の要素。グループはまとめて伸縮し、1 回の Ctrl+Z で戻る
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const URL = process.env.DECK_URL ?? 'http://localhost:1420/?deck=/decks/neural-network/deck.json';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e)));
const out = 'tools/shots-resize'; fs.mkdirSync(out, { recursive: true });
const box = id => page.locator(`.fit-inner [data-id="${id}"]`);
const els = () => page.evaluate(() => { const s = window.__deckStore.getState(); return Object.fromEntries(s.deck.slides[s.current].elements.map(e => [e.id, e])); });
const selection = () => page.evaluate(() => window.__deckStore.getState().selection);
const reset = async elements => {
  await page.evaluate(elements => { const s = window.__deckStore.getState(); window.__deckStore.setState({
    deck: { ...s.deck, slides: [{ id: 'test', elements }] }, current: 0, selection: [], editingId: null, interactingId: null,
  }); }, elements);
  await page.waitForTimeout(100);
};
const select = async ids => { await page.evaluate(ids => window.__deckStore.getState().select(ids), ids); await page.waitForTimeout(120); };
/** つまみを画面上で (dx, dy) ドラッグ */
const drag = async (dir, dx, dy, { shift = false } = {}) => {
  const r = await page.locator(`.moveable-control.moveable-direction.moveable-${dir}`).boundingBox(); assert(r, `${dir} のつまみがある`);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + dx / 2, r.y + r.height / 2 + dy / 2, { steps: 4 });
  await page.mouse.move(r.x + r.width / 2 + dx, r.y + r.height / 2 + dy, { steps: 6 });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await page.waitForTimeout(150);
};
const undo = async () => { await page.keyboard.press('Control+z'); await page.waitForTimeout(100); };
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: ${a} と ${b} の差が ${tol} を超える`);

// 200x100 の画像(縦横比 2)
const pixels = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#3a8"/><circle cx="100" cy="50" r="40" fill="#fc4"/></svg>');
const image = (extra = {}) => ({ id: 'img', type: 'image', x: 280, y: 170, w: 360, h: 180, src: pixels, fit: 'fill', ...extra });
const frame = (extra = {}) => ({ id: 'frame', type: 'shape', shape: 'rect', x: 280, y: 170, w: 360, h: 180, fill: null, line: { color: 'accent1', width: 2 }, ...extra });

try {
  await page.goto(URL); await page.locator('.thumb').first().waitFor();

  // --- 画像: 角は縦横比を保つ、Shift で外す、辺は片方だけ ---
  await reset([image()]); await select(['img']);
  await drag('se', 120, 10);
  let e = (await els()).img;
  assert(e.w > 400, `角で大きくなる w=${e.w}`); near(e.w / e.h, 2, 0.02, '画像の角は縦横比を保つ');
  assert.equal(e.x, 280); assert.equal(e.y, 170);
  const r = await box('img').evaluate(n => { const a = n.getBoundingClientRect(), b = n.querySelector('img').getBoundingClientRect(); return [a.width, a.height, b.width, b.height]; });
  near(r[0], r[2], 1, '画像は枠いっぱい(幅)'); near(r[1], r[3], 1, '画像は枠いっぱい(高さ)');
  await undo(); e = (await els()).img; assert.equal(e.w, 360); assert.equal(e.h, 180);

  await drag('se', 120, 10, { shift: true });
  e = (await els()).img; assert(Math.abs(e.w / e.h - 2) > 0.15, `Shift+角は自由に変わる ${e.w}x${e.h}`);
  await undo();

  await drag('e', 100, 30);
  e = (await els()).img; assert(e.w > 400 && e.h === 180, `辺は幅だけ変わる ${e.w}x${e.h}`);
  await undo();

  // 上の角(nw)は反対の角を止める
  await drag('nw', -60, 0);
  e = (await els()).img; near(e.w / e.h, 2, 0.02, '左上の角も縦横比を保つ'); near(e.x + e.w, 640, 1, '右端は動かない'); near(e.y + e.h, 350, 1, '下端は動かない');
  await undo();
  console.log('PASS image: corner keeps ratio (Shift frees it), edge stretches one side, image fills its frame, single undo');

  // --- 図形: 角は自由、Shift で縦横比を保つ ---
  await reset([frame({ fill: 'accent2' })]); await select(['frame']);
  await drag('se', 120, 10);
  e = (await els()).frame; assert(Math.abs(e.w / e.h - 2) > 0.15, `図形の角は自由 ${e.w}x${e.h}`);
  await undo();
  await drag('se', 120, 10, { shift: true });
  e = (await els()).frame; near(e.w / e.h, 2, 0.02, 'Shift+角で図形も縦横比を保つ');
  await undo();
  console.log('PASS shape: corner is free, Shift keeps ratio');

  // --- グループ: クリックでグループ全体、もう一度クリックで中の要素 ---
  const ring = { id: 'ring', type: 'shape', shape: 'roundRect', x: 272, y: 162, w: 376, h: 196, fill: null, line: { color: 'accent2', width: 3 }, radius: 8, group: 'g' };
  const caption = { id: 'cap', type: 'text', x: 280, y: 360, w: 360, h: 30, style: { fontSize: 12 }, paragraphs: [{ runs: [{ text: '画像の説明' }] }], group: 'g' };
  const other = { id: 'other', type: 'shape', shape: 'rect', x: 900, y: 500, w: 100, h: 60, fill: 'accent3' };
  await reset([image({ group: 'g' }), frame({ group: 'g' }), ring, caption, other]);
  const click = async (id, dx = 0, dy = 0) => {
    const b = await box(id).boundingBox(); await page.mouse.click(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { delay: 60 }); await page.waitForTimeout(150);
  };
  await click('img');
  assert.deepEqual((await selection()).sort(), ['cap', 'frame', 'img', 'ring'], '1 回目のクリックはグループ全体');
  assert.equal(await page.locator('.moveable-control.moveable-direction.moveable-se').count(), 1, 'グループにもつまみが出る');
  await click('img');
  assert.equal((await selection()).length, 1, '2 回目のクリックで中の要素 1 つ');
  const inner = (await selection())[0];
  await click('cap', 0, 0);
  assert.deepEqual(await selection(), ['cap'], '中の要素を選んでいる間は、同じグループの別の要素へそのまま移る');
  await click('other');
  assert.deepEqual(await selection(), ['other'], 'グループの外をクリックすると普通に選ぶ');
  await click('img');
  assert.equal((await selection()).length, 4, '外から戻るとまたグループ全体');
  await page.keyboard.down('Shift'); await click('other'); await page.keyboard.up('Shift');
  assert.equal((await selection()).length, 5, 'Shift でグループに要素を足せる');
  await page.keyboard.down('Shift'); await click('cap'); await page.keyboard.up('Shift');
  assert.deepEqual(await selection(), ['other'], 'Shift でグループのどれかを外すとグループごと外れる');
  console.log(`PASS group select: first click selects the group, second click selects ${inner}, siblings stay inside, Shift adds/removes whole groups`);

  // --- グループの拡大縮小: まとめて伸縮、枠と画像がずれない、1 回で戻る ---
  await click('img');
  const before = await els();
  await drag('se', 150, 0);
  let after = await els();
  const k = after.img.w / before.img.w;
  assert(k > 1.2, `グループごと大きくなる k=${k.toFixed(2)}`);
  near(after.img.w / after.img.h, 2, 0.02, '画像を含むグループは角で縦横比を保つ');
  for (const id of ['img', 'frame', 'ring', 'cap']) {
    near(after[id].w, before[id].w * k, 0.3, `${id} の幅も同じ倍率`); near(after[id].h, before[id].h * k, 0.3, `${id} の高さも同じ倍率`);
    near(after[id].x - after.ring.x, (before[id].x - before.ring.x) * k, 0.3, `${id} の相対位置(x)`);
    near(after[id].y - after.ring.y, (before[id].y - before.ring.y) * k, 0.3, `${id} の相対位置(y)`);
  }
  assert.deepEqual([after.frame.x, after.frame.y, after.frame.w, after.frame.h], [after.img.x, after.img.y, after.img.w, after.img.h], '枠線は画像にぴったり重なったまま');
  assert.equal(after.cap.style.fontSize, 12, '文字の大きさは変えない(PowerPoint と同じ)');
  near(after.ring.x, 272, 0.3, '左上は動かない'); near(after.ring.y, 162, 0.3, '左上は動かない');
  assert.deepEqual(after.other, before.other, 'グループ外は変わらない');
  const dom = await page.evaluate(() => [...document.querySelectorAll('.fit-inner [data-id]')].map(n => [n.dataset.id, parseFloat(n.style.width)]));
  for (const [id, w] of dom) near(w, after[id].w, 0.5, `${id} の表示と中身が一致`);
  await page.screenshot({ path: `${out}/group-resized.png` });
  await undo();
  after = await els();
  for (const id of ['img', 'frame', 'ring', 'cap']) assert.deepEqual(after[id], before[id], `${id} は 1 回の Ctrl+Z で戻る`);

  // 辺のつまみは片方向だけ(画像は引き伸ばし)。Shift+角は自由
  await click('img'); await click('other'); await click('img');
  await drag('e', 120, 0);
  after = await els();
  assert(after.img.w > before.img.w + 50 && after.img.h === before.img.h, `辺は幅だけ ${after.img.w}x${after.img.h}`);
  assert.equal(after.cap.h, before.cap.h);
  await undo();
  console.log('PASS group resize: members scale together (frame stays on the image), text size kept, corner keeps ratio with images, single undo');

  // --- 回転した直線を含むグループ: 向きが変わっても両端が角に付いたまま ---
  const len = Math.hypot(360, 180), deg = Math.atan2(180, 360) * 180 / Math.PI;
  const diag = { id: 'diag', type: 'shape', shape: 'line', x: 460 - len / 2, y: 255, w: len, h: 10, rotation: deg, line: { color: 'dk1', width: 2 }, group: 'h' };
  await reset([frame({ group: 'h' }), diag]);
  await click('frame', 0, -60);
  assert.equal((await selection()).length, 2);
  await drag('s', 0, 120);
  after = await els();
  const d = after.diag, f = after.frame, t = (d.rotation ?? 0) * Math.PI / 180;
  const cx = d.x + d.w / 2, cy = d.y + d.h / 2, hx = Math.cos(t) * d.w / 2, hy = Math.sin(t) * d.w / 2;
  assert(f.h > 230, `高さが伸びる ${f.h}`);
  near(cx - hx, f.x, 0.6, '直線の始点(x)は枠の左上'); near(cy - hy, f.y, 0.6, '直線の始点(y)は枠の左上');
  near(cx + hx, f.x + f.w, 0.6, '直線の終点(x)は枠の右下'); near(cy + hy, f.y + f.h, 0.6, '直線の終点(y)は枠の右下');
  console.log('PASS group with a rotated line: endpoints stay on the corners after a one-way stretch');

  assert.deepEqual(errors, []);
  console.log('PASS no page errors');
} finally {
  await browser.close();
}
