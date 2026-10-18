// Launch the release EXE with an isolated WebView profile and a disposable deck.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('.');
const exe = path.join(root, 'src-tauri/target/release/lumifold.exe');
fs.mkdirSync(path.join(root, 'output'), { recursive: true });
const run = fs.mkdtempSync(path.join(root, 'output/release-smoke-'));
fs.cpSync(path.join(root, 'tools/fixtures/demo'), path.join(run, 'demo'), { recursive: true });
const deckPath = path.join(run, 'demo/deck.json');
const endpoint = 'http://127.0.0.1:9338';
const env = { ...process.env, SMOKE_EXE: exe, DECK_STUDIO_OPEN: deckPath,
  WEBVIEW2_USER_DATA_FOLDER: path.join(run, 'webview'),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9338' };
const pid = Number(execFileSync('powershell.exe', ['-NoProfile', '-Command',
  '$releaseProcess = Start-Process -FilePath $env:SMOKE_EXE -WindowStyle Hidden -PassThru; $releaseProcess.Id'], { env, encoding: 'utf8', windowsHide: true }).trim());
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`${endpoint}/json/version`)).ok) break; } catch { /* Wait for WebView2. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.connectOverCDP(endpoint);
  const page = browser.contexts()[0].pages()[0];
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.locator('.zoom-controls').waitFor({ timeout: 20000 });
  assert(page.url().includes('tauri.localhost'), `must test embedded production assets: ${page.url()}`);
  assert.equal(await page.locator('.thumb').count(), 8);
  const original = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
  await page.getByLabel('資料の種類').selectOption('note');
  await page.waitForFunction(() => window.__deckStore.getState().saveState === 'saved');
  assert.equal(JSON.parse(fs.readFileSync(deckPath, 'utf8')).formatOrigin, 'slides');
  // Reopen from disk, so inverse scaling must survive serialization.
  await page.evaluate(async path => { await window.__deckStore.getState().openDeck(path); }, deckPath);
  await page.getByLabel('資料の種類').selectOption('slides');
  await page.waitForFunction(() => window.__deckStore.getState().saveState === 'saved');
  const restored = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
  for (let i = 0; i < original.slides.length; i++) {
    original.slides[i].elements.forEach((el, j) => {
      for (const key of ['x', 'y', 'w', 'h']) assert(Math.abs(el[key] - restored.slides[i].elements[j][key]) < 1e-7, `${el.id}.${key}`);
    });
  }
  await page.getByLabel('ズーム倍率').selectOption('200');
  assert.equal(Math.round((await page.locator('.fit-inner .slide-outer').boundingBox()).width), 2560);
  await page.getByRole('button', { name: '全体表示', exact: true }).click();
  assert.equal(await page.getByLabel('ズーム倍率').inputValue(), 'fit');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(run, 'release.png') });
  console.log('PASS: release EXE opens deck, saves/reopens format conversion, restores geometry, zooms to 200% and resets to fit');
  console.log(`Screenshot: ${path.join(run, 'release.png')}`);
} finally {
  await browser?.close();
  if (Number.isInteger(pid) && pid > 0) { try { process.kill(pid); } catch { /* Already exited. */ } }
}
