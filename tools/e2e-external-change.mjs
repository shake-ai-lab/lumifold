// 外部(Claude Code など)で deck.json が書き換えられたときの知らせ・差分の表示・元に戻す。
// vite dev 起動中に: node tools/e2e-external-change.mjs
// tools/fixtures/external/ に demo の写しを毎回作り、ファイルを書き換えてから reload() を呼ぶ(ブラウザでは監視が無いため)。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dir = 'tools/fixtures/external';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.cpSync('tools/fixtures/demo/assets', path.join(dir, 'assets'), { recursive: true });
const original = JSON.parse(fs.readFileSync('tools/fixtures/demo/deck.json', 'utf8'));
const write = deck => fs.writeFileSync(path.join(dir, 'deck.json'), JSON.stringify(deck, null, 2) + '\n');
write(original);
const out = 'tools/shots-external-change'; fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
const banner = page.locator('.external-change');
const store = fn => page.evaluate(fn);
const reload = () => store(() => window.__deckStore.getState().reload());
const deckNow = () => store(() => window.__deckStore.getState().deck);

try {
  await page.goto(`http://127.0.0.1:1420/?deck=/${dir}/deck.json`); await page.locator('.thumb').first().waitFor();
  assert.equal(await banner.count(), 0);

  // AI の書き換え: 3 枚目の見出しを変更、4 枚目に要素を追加、2 枚目の後ろにスライドを追加
  const ai = structuredClone(original);
  ai.slides[2].elements.find(e => e.id === 's3-title').paragraphs[0].runs[0].text = 'AI が直した見出し';
  ai.slides[3].elements.push({ id: 's4-ai-note', type: 'text', x: 60, y: 600, w: 600, h: 40, paragraphs: [{ runs: [{ text: '追記' }] }] });
  ai.slides.splice(2, 0, { id: 's-ai', elements: [{ id: 's-ai-title', type: 'text', role: 'title', x: 60, y: 43, w: 1160, h: 86, paragraphs: [{ runs: [{ text: '新しいスライド' }] }] }] });
  write(ai); await reload();
  await banner.waitFor();
  const text = await banner.innerText();
  assert.match(text, /変更 2 枚/); assert.match(text, /追加 1 枚/); assert.match(text, /要素: 変更 1・追加 2/);
  assert.equal(await page.locator('.thumb-badge').count(), 3, '一覧に「更新」2 と「追加」1');
  assert.equal(await page.locator('.thumb-badge', { hasText: '追加' }).count(), 1);

  // 変更箇所へ: 変更・追加のあるスライドへ順に移動し、変わった要素に点線の枠
  await banner.getByRole('button', { name: /変更箇所へ/ }).click();
  assert.equal(await store(() => window.__deckStore.getState().current), 2, '最初の変更は追加した 3 枚目');
  await banner.getByRole('button', { name: /変更箇所へ/ }).click();
  assert.equal(await store(() => window.__deckStore.getState().current), 3);
  assert.equal(await page.locator('.change-mark').count(), 1, '変更した見出しに枠');
  await page.screenshot({ path: `${out}/banner.png` });

  // 続けて書き換えられたら、最初の状態からの差分にまとめる
  const ai2 = structuredClone(ai);
  ai2.slides[5].elements[0].paragraphs = [{ runs: [{ text: '2 回目の変更' }] }];
  write(ai2); await reload();
  assert.equal(await banner.count(), 1);
  assert.match(await banner.innerText(), /変更 3 枚/);

  // 元に戻す: 最初の書き換えの前の状態へ(自動保存でファイルも戻る)
  await banner.getByRole('button', { name: '元に戻す', exact: true }).click();
  assert.equal(await banner.count(), 0);
  assert.equal(JSON.stringify(await deckNow()), JSON.stringify(original), '書き換え前と同じ');
  assert.equal(await page.locator('.thumb-badge, .change-mark').count(), 0);
  await page.keyboard.press('Control+z');
  assert.equal((await deckNow()).slides.length, original.slides.length + 1, 'Ctrl+Z で外部の版をやり直せる');
  await page.keyboard.press('Control+y');

  // 書き換えの後に人が編集したら、まとめての取り消しはできない(Ctrl+Z で順に戻す)
  const ai3 = structuredClone(original); ai3.slides[0].elements[0].paragraphs = [{ runs: [{ text: '3 回目' }] }];
  write(ai3); await reload(); await banner.waitFor();
  await store(() => { const s = window.__deckStore.getState(); s.patchElement(s.deck.slides[s.current].elements[0].id, { x: 70 }); });
  assert(await banner.getByRole('button', { name: '元に戻す', exact: true }).isDisabled());
  await banner.getByRole('button', { name: '閉じる', exact: true }).click();
  assert.equal(await banner.count(), 0);

  assert.deepEqual(errors, []);
  console.log('PASS external change: summary, badges, jump + marks, merged changes, revert + redo, disabled after edit, dismiss');
} finally {
  await browser.close();
}
