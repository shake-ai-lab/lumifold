// ノート形式(縦のページ)と読む画面のテスト。vite dev 起動中に: node tools/e2e-note.mjs
// 編集画面の大きさ・ノートの型・種類の切り替え(縮めて中央 → Ctrl+Z で戻る)、
// 読む画面の見開き / 単ページ、クリック・キー・ホイール・ドラッグでめくる、少しだけ引いたら戻る、角のめくれ、動きを減らす設定、
// ページ番号(外側・中央・ページごとに外す)、右綴じ(見開き・単ページ・ドラッグ・キーの向き)、めくる音。
// めくっている途中の画面は tools/shots-note/ に残す(目で見て確かめる)。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.DECK_URL ?? 'http://localhost:1420';
const OUT = 'tools/shots-note';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
let failed = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`PASS: ${name}`); }
  catch (error) { failed++; console.log(`FAIL: ${name}\n  ${String(error.message ?? error).split('\n').slice(0, 6).join('\n  ')}`); }
};

async function open(deck, viewport = { width: 1600, height: 1000 }, options = {}) {
  const context = await browser.newContext({ viewport, ...options });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(`${BASE}/?deck=${encodeURIComponent(deck)}`);
  await page.waitForSelector('.fit-inner .slide');
  await page.waitForTimeout(500);
  return page;
}
const state = (page) => page.evaluate(() => { const s = window.__deckStore.getState(); return { current: s.current, deck: s.deck }; });
const current = async (page) => (await state(page)).current;
const settle = (page) => page.waitForFunction(() => !document.querySelector('.reader-face[data-role="back"], .reader-face[data-role="back-mirrored"]'), null, { timeout: 4000 });
/** めくり終えて current が want になるまで待つ(めくり始める前に「終わった」と見なさない) */
const arrive = (page, want) => page.waitForFunction((want) => window.__deckStore.getState().current === want
  && !document.querySelector('.reader-face[data-role="back"], .reader-face[data-role="back-mirrored"]'), want, { timeout: 4000 });
const facePages = (page) => page.$$eval('.reader-face', (els) => els.map((e) => Number(e.dataset.page)).sort((a, b) => a - b));
const NOTE = '/tools/fixtures/note-demo/note-demo.deck';

// ---- 編集画面 ----
{
  const page = await open(NOTE);
  await check('ノートは 768x1024 の縦のページで編集する', async () => {
    const size = await page.$eval('.fit-inner .slide', (el) => [el.style.width, el.style.height]);
    assert.deepEqual(size, ['768px', '1024px']);
    const thumb = await page.locator('.thumb .slide-outer').first().boundingBox();
    assert(thumb.height > thumb.width, '一覧のサムネイルも縦長');
    assert(thumb.height <= thumb.width / 0.75 + 1);
    assert.equal(await page.locator('.slide-list-heading').innerText().then((t) => t.startsWith('ページ')), true);
    assert.equal(await page.getByRole('button', { name: '読む', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'プレゼン開始' }).count(), 0);
  });
  await check('ノートの型から縦のページを足せる', async () => {
    const before = (await state(page)).deck.slides.length;
    await page.getByRole('button', { name: /追加/ }).click();
    const gallery = page.getByRole('group', { name: 'ページの型' });
    await gallery.waitFor();
    assert.equal(await gallery.locator('button').count(), 10);
    await page.screenshot({ path: `${OUT}/layout-gallery.png` });
    await gallery.getByRole('button', { name: '見出しと本文' }).click();
    const { deck, current: cur } = await state(page);
    assert.equal(deck.slides.length, before + 1);
    for (const el of deck.slides[cur].elements) assert(el.x >= 0 && el.y >= 0 && el.x + el.w <= 768 && el.y + el.h <= 1024, `${el.id} がページの外`);
    await page.keyboard.press('Control+z');
    assert.equal((await state(page)).deck.slides.length, before);
  });
  await check('挿入する要素はページの中央に入る', async () => {
    await page.locator('.thumb').nth(1).click();
    await page.getByRole('button', { name: '表', exact: true }).click();
    const { deck, current: cur } = await state(page);
    const table = deck.slides[cur].elements.at(-1);
    assert.equal(table.type, 'table');
    assert.equal(Math.round(table.x + table.w / 2), 384);
    assert(table.w <= 640);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
  });
  await page.context().close();
}

// ---- 資料の種類の切り替え ----
{
  const page = await open('/tools/fixtures/demo/deck.json');
  await check('スライド → ノートに切り替えると中身を縮めて中央へ、Ctrl+Z で戻る', async () => {
    const before = (await state(page)).deck;
    assert.equal(await page.getByRole('button', { name: 'プレゼン開始' }).count(), 1);
    await page.getByLabel('資料の種類').selectOption('note');
    const after = (await state(page)).deck;
    assert.equal(after.format, 'note');
    const k = 768 / 1280, dy = (1024 - 720 * k) / 2;
    const a = before.slides[0].elements[0], b = after.slides[0].elements[0];
    const near = (got, want) => assert(Math.abs(got - want) < 0.51, `${got} != ${want}`);
    near(b.x, a.x * k); near(b.y, a.y * k + dy); near(b.w, a.w * k);
    for (const s of after.slides) for (const el of s.elements) assert(el.x >= -1 && el.x + el.w <= 769 && el.y + el.h <= 1025, `${el.id} がはみ出す`);
    const sizes = await page.$eval('.fit-inner .slide', (el) => [el.style.width, el.style.height]);
    assert.deepEqual(sizes, ['768px', '1024px']);
    assert.equal(await page.getByRole('button', { name: '読む', exact: true }).count(), 1);
    await page.screenshot({ path: `${OUT}/converted-to-note.png` });
    await page.locator('.stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    assert.deepEqual((await state(page)).deck, before);
  });
  await page.context().close();
}

// ---- 読む画面: 見開き ----
{
  const page = await open(NOTE);
  await page.getByRole('button', { name: '読む', exact: true }).click();
  await page.locator('.reader').waitFor();
  await page.waitForTimeout(300);
  const n = (await state(page)).deck.slides.length;
  await check('横長の画面では見開きで始まり、表紙は右に 1 枚', async () => {
    assert.equal(await page.getByRole('button', { name: '見開き' }).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await facePages(page), [0]);
    assert.equal(await page.locator('.presentation-count').innerText(), `1 / ${n}`);
    const book = await page.locator('.reader-book').boundingBox();
    assert(Math.abs(book.width / book.height - 1.5) < 0.01, `見開きは 3:2 (${book.width}x${book.height})`);
    assert.equal(await page.locator('.toolbar, .props, .slide-list').count(), 0);
  });
  const book = await page.locator('.reader-book').boundingBox();
  const W = book.width / 2, H = book.height;
  await check('角に近づくと紙が少しめくれ、離れると戻る', async () => {
    await page.mouse.move(book.x + book.width - 10, book.y + H - 10);
    await page.locator('.reader-face[data-role="back"]').waitFor();
    await page.screenshot({ path: `${OUT}/peek.png` });
    await page.mouse.move(book.x + book.width / 2, book.y + H / 2);
    await settle(page);
    assert.equal(await current(page), 0);
  });
  await check('少しだけ引いて離すと、めくらずに戻る', async () => {
    const sx = book.x + book.width - 20, sy = book.y + H - 20;
    await page.mouse.move(sx, sy); await page.mouse.down();
    await page.mouse.move(sx - W * 0.15, sy - 10, { steps: 12 });
    await page.waitForTimeout(200); // 速く払わない
    await page.mouse.move(sx - W * 0.16, sy - 10, { steps: 2 });
    await page.mouse.up();
    await settle(page);
    assert.equal(await current(page), 0);
  });
  await check('角をつまんでドラッグするとめくれる(表 → 裏 → 下のページ)', async () => {
    const sx = book.x + book.width - 20, sy = book.y + H - 20;
    await page.mouse.move(sx, sy); await page.mouse.down();
    for (const [i, f] of [0.3, 0.7, 1.1].entries()) {
      await page.mouse.move(sx - W * f, sy - H * 0.1 * Math.sin(Math.PI * f / 1.4), { steps: 8 });
      assert.equal(await page.locator('.reader-face[data-role="back"]').count(), 1);
      assert.deepEqual(await facePages(page), [0, 1, 2], 'めくる紙(0)・裏(1)・下(2)');
      await page.screenshot({ path: `${OUT}/drag-${i + 1}.png` });
    }
    await page.mouse.up();
    await settle(page);
    assert.equal(await current(page), 1);
    assert.deepEqual(await facePages(page), [1, 2]);
    assert.equal(await page.locator('.presentation-count').innerText(), `2–3 / ${n}`);
    await page.screenshot({ path: `${OUT}/spread-2-3.png` });
  });
  await check('→ キー・クリック・ホイールでめくる(途中で押すと前のめくりを終えて次へ)', async () => {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(260);
    await page.screenshot({ path: `${OUT}/key-turn-mid.png` });
    assert.equal(await page.locator('.reader-face[data-role="back"]').count(), 1);
    await page.keyboard.press('ArrowRight'); // 途中で次へ
    await arrive(page, 5);
    await page.mouse.click(book.x + W * 0.5, book.y + H * 0.5); // 左ページをクリックで戻る
    await arrive(page, 3);
    await page.mouse.move(book.x + W * 1.5, book.y + H * 0.5);
    await page.mouse.wheel(0, 120);
    await arrive(page, 5);
  });
  await check('左ページの角から戻すめくり', async () => {
    const sx = book.x + 20, sy = book.y + H - 20;
    await page.mouse.move(sx, sy); await page.mouse.down();
    await page.mouse.move(sx + W * 0.8, sy - 60, { steps: 10 });
    assert.equal(await page.locator('.reader-face[data-role="back"]').count(), 1);
    await page.screenshot({ path: `${OUT}/drag-back.png` });
    await page.mouse.move(sx + W * 1.3, sy - 20, { steps: 6 });
    await page.mouse.up();
    await arrive(page, 3);
  });
  await check('End / Home、最後と最初ではそれ以上めくらない', async () => {
    await page.keyboard.press('End');
    assert.equal(await current(page), n - 1);
    assert.equal(await page.getByRole('button', { name: '次のページ' }).isDisabled(), true);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.reader-face[data-role="back"]').count(), 0);
    await page.keyboard.press('Home');
    assert.equal(await current(page), 0);
    assert.equal(await page.getByRole('button', { name: '前のページ' }).isDisabled(), true);
  });
  await check('単ページに切り替えて 1 枚ずつめくる(紙の裏に表が透ける)', async () => {
    await page.getByRole('button', { name: '単ページ' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
    const single = await page.locator('.reader-book').boundingBox();
    assert(Math.abs(single.width / single.height - 0.75) < 0.01);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.reader-face[data-role="back-mirrored"]').count(), 1);
    await page.screenshot({ path: `${OUT}/single-turn-mid.png` });
    await arrive(page, 1);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/single-back-mid.png` });
    await arrive(page, 0);
    // 左 3 分の 1 をドラッグして戻る
    await page.keyboard.press('ArrowRight'); await arrive(page, 1);
    const sx = single.x + 30, sy = single.y + single.height * 0.6;
    await page.mouse.move(sx, sy); await page.mouse.down();
    await page.mouse.move(sx + single.width * 0.6, sy, { steps: 10 });
    await page.screenshot({ path: `${OUT}/single-drag-back.png` });
    await page.mouse.up();
    await arrive(page, 0);
  });
  await check('表示の選び方を覚え、Esc で編集に戻る(めくりの途中ならめくり終えたページ)', async () => {
    await page.keyboard.press('ArrowRight');
    await page.locator('.reader-face[data-role="back-mirrored"]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.reader').waitFor({ state: 'detached' });
    assert.equal(await current(page), 1);
    await page.getByRole('button', { name: '読む', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '単ページ' }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: '見開き' }).click();
    await page.getByRole('button', { name: /編集に戻る/ }).click();
  });
  await page.context().close();
}

// ---- 動きを減らす設定・狭い画面 ----
{
  const page = await open(NOTE, { width: 800, height: 900 }, { reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '読む', exact: true }).click();
  await page.locator('.reader').waitFor();
  await check('縦長の画面では単ページで始まる / 動きを減らす設定ではめくらずに切り替える', async () => {
    assert.equal(await page.getByRole('button', { name: '単ページ' }).getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await current(page), 1);
    assert.equal(await page.locator('.reader-face').count(), 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false);
    await page.screenshot({ path: `${OUT}/narrow-single.png` });
  });
  await page.context().close();
}

// ---- ページ番号 ----
{
  const page = await open(NOTE);
  await check('ページ番号は表紙と「番号なし」のページを除いて、見開きの外側に付く', async () => {
    const num = (i) => page.locator(`.thumb`).nth(i).locator('.page-number');
    assert.equal(await num(0).count(), 0, '表紙には付けない');
    assert.equal(await num(1).innerText(), '2');
    assert.equal(await num(2).count(), 0, '章の扉(hidePageNumber)');
    await page.getByRole('button', { name: '読む', exact: true }).click();
    await page.getByRole('button', { name: '見開き' }).click();
    await page.keyboard.press('End'); await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); await arrive(page, 1);
    await page.keyboard.press('ArrowRight'); await arrive(page, 3);
    const book = await page.locator('.reader-book').boundingBox();
    const left = await page.locator('.reader-face[data-page="3"] .page-number').boundingBox();
    const right = await page.locator('.reader-face[data-page="4"] .page-number').boundingBox();
    assert.equal(await page.locator('.reader-face[data-page="3"] .page-number').innerText(), '4');
    assert(left.x - book.x < book.width * 0.1, '左ページの番号は左下');
    assert(book.x + book.width - (right.x + right.width) < book.width * 0.1, '右ページの番号は右下');
    assert(left.y > book.y + book.height * 0.9);
    await page.screenshot({ path: `${OUT}/page-numbers.png` });
    await page.keyboard.press('Escape');
  });
  await check('右パネルで番号の付け方・ページごとの番号なしを変え、Ctrl+Z で戻る', async () => {
    await page.locator('.thumb').nth(1).click();
    await page.locator('.stage').click({ position: { x: 5, y: 5 } });
    await page.getByLabel('ページ番号').selectOption('');
    assert.equal(await page.locator('.page-number').count(), 0);
    await page.locator('.stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    assert.equal((await state(page)).deck.pageNumbers, 'outside');
    await page.getByLabel('ページ番号').selectOption('center');
    const center = await page.locator('.fit-inner .page-number').boundingBox();
    const slide = await page.locator('.fit-inner .slide-outer').boundingBox();
    assert(Math.abs(center.x + center.width / 2 - (slide.x + slide.width / 2)) < 2, '下の中央');
    await page.getByLabel(/には番号を付けない/).check();
    assert.equal(await page.locator('.fit-inner .page-number').count(), 0);
    assert.equal((await state(page)).deck.slides[1].hidePageNumber, true);
  });
  await page.context().close();
}

// ---- 右綴じ ----
{
  const page = await open(NOTE);
  await page.locator('.stage').click({ position: { x: 5, y: 5 } });
  await page.getByLabel('綴じ方').selectOption('right');
  await page.getByRole('button', { name: '読む', exact: true }).click();
  await page.getByRole('button', { name: '見開き' }).click();
  await page.keyboard.press('Home');
  const book = await page.locator('.reader-book').boundingBox();
  const W = book.width / 2, H = book.height;
  const sideOf = async (i) => { const r = await page.locator(`.reader-face[data-page="${i}"] .reader-sheet`).boundingBox(); return r.x + r.width / 2 < book.x + W ? 'left' : 'right'; };
  await check('右綴じ: 表紙は左に 1 枚、← で次へ、2 ページ目は右・3 ページ目は左', async () => {
    assert.deepEqual(await facePages(page), [0]);
    assert.equal(await sideOf(0), 'left');
    const order = await page.$$eval('.presentation-controls button[aria-label$="のページ"]', (els) => els.map((e) => e.getAttribute('aria-label')));
    assert.deepEqual(order, ['次のページ', '前のページ'], '次へを左に置く');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/rtl-turn-mid.png` });
    await arrive(page, 1);
    assert.equal(await sideOf(1), 'right');
    assert.equal(await sideOf(2), 'left');
    await page.screenshot({ path: `${OUT}/rtl-spread-2-3.png` });
  });
  await check('右綴じ: 左ページの角をつまんで右へめくる / → で戻る / 左ページのクリックで次へ', async () => {
    const sx = book.x + 20, sy = book.y + H - 20;
    await page.mouse.move(sx, sy); await page.mouse.down();
    await page.mouse.move(sx + W * 0.7, sy - 60, { steps: 10 });
    await page.screenshot({ path: `${OUT}/rtl-drag.png` });
    await page.mouse.move(sx + W * 1.2, sy - 20, { steps: 6 });
    await page.mouse.up();
    await arrive(page, 3);
    await page.keyboard.press('ArrowRight');
    await arrive(page, 1);
    await page.mouse.click(book.x + W * 0.5, book.y + H * 0.5);
    await arrive(page, 3);
  });
  await check('右綴じの単ページ: とじ目は右端、← で次へ(紙は左からめくれる)', async () => {
    await page.getByRole('button', { name: '単ページ' }).click();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.reader-face[data-role="back-mirrored"]').count(), 1);
    await page.screenshot({ path: `${OUT}/rtl-single-mid.png` });
    await arrive(page, 4);
    await page.keyboard.press('ArrowRight');
    await arrive(page, 3);
    await page.getByRole('button', { name: '見開き' }).click();
  });
  await page.context().close();
}

// ---- めくる音 ----
{
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  // 鳴らした数を数える(音そのものは headless では聞けないので、ノイズを鳴らす呼び出しを数える)
  await context.addInitScript(() => {
    window.__sounds = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) { window.__sounds++; return start.apply(this, args); };
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?deck=${encodeURIComponent(NOTE)}`);
  await page.waitForSelector('.fit-inner .slide');
  await page.getByRole('button', { name: '読む', exact: true }).click();
  await check('めくると紙の音が鳴り、「めくる音」を切ると鳴らない(選択は覚える)', async () => {
    const sounds = () => page.evaluate(() => window.__sounds);
    assert.equal(await page.getByRole('button', { name: 'めくる音' }).getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('ArrowRight'); await arrive(page, 1);
    const one = await sounds();
    assert(one >= 4, `持ち上げ・めくり・着地の音 (${one})`);
    await page.getByRole('button', { name: 'めくる音' }).click();
    assert.equal(await page.getByRole('button', { name: 'めくる音' }).getAttribute('aria-pressed'), 'false');
    const two = await sounds();
    await page.keyboard.press('ArrowRight'); await arrive(page, 3);
    assert.equal(await sounds(), two, '切ったら鳴らない');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '読む', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'めくる音' }).getAttribute('aria-pressed'), 'false');
  });
  await context.close();
}

// ---- スライドの資料は今までどおりプレゼン ----
{
  const page = await open('/tools/fixtures/demo/deck.json');
  await check('スライドの資料は「プレゼン開始」で今までのプレゼン画面', async () => {
    await page.getByRole('button', { name: 'プレゼン開始' }).click();
    await page.locator('.presentation').waitFor();
    assert.equal(await page.locator('.reader').count(), 0);
    await page.keyboard.press('Escape');
  });
  await page.context().close();
}

await check('コンソールエラーなし', async () => assert.deepEqual(errors, []));
await browser.close();
console.log(failed ? `${failed} 件失敗` : 'すべて成功');
process.exit(failed ? 1 : 0);
