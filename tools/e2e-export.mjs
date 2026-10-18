// 書き出し(M3): PowerPoint と PDF。ブラウザモードでは pptx はダウンロード、PDF は印刷用の面を page.pdf() で確かめる。
// vite dev 起動中に: node tools/e2e-export.mjs [デッキ名…]   (既定: demo coffee-extraction)
// pptx の中身は python-pptx で確かめる(tools/check-pptx.py)。出力は tools/out-export/
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const decks = process.argv.slice(2).length ? process.argv.slice(2) : ['demo', 'coffee-extraction'];
const out = 'tools/out-export'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const errors = []; page.on('pageerror', e => errors.push(String(e)));

try {
  for (const name of decks) {
    const dir = fs.existsSync(`tools/fixtures/${name}`) ? `tools/fixtures/${name}` : `decks/${name}`; // 試験用の資料を先に探し、無ければ見本の資料
    const file = fs.existsSync(`${dir}/${name}.deck`) ? `${name}.deck` : 'deck.json'; // 新しいデッキは 資料名.deck、既存は旧名 deck.json
    await page.goto(`http://127.0.0.1:1420/?deck=/${dir}/${file}`); await page.locator('.thumb').first().waitFor();
    const deck = await page.evaluate(() => window.__deckStore.getState().deck);
    fs.writeFileSync(`${out}/${name}.deck.json`, JSON.stringify(deck));

    // --- PowerPoint ---
    await page.getByRole('button', { name: '書き出し', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: 'PowerPoint(.pptx)' }).click()]);
    const pptx = `${out}/${name}.pptx`;
    await download.saveAs(pptx);
    assert.match(download.suggestedFilename(), /\.pptx$/);
    const report = execFileSync('python', ['tools/check-pptx.py', pptx, `${out}/${name}.deck.json`, `${out}/${name}-media`], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    process.stdout.write(report);

    // --- PDF(印刷用の面) ---
    await page.evaluate(() => { window.print = () => { window.__printed = (window.__printed ?? 0) + 1; }; });
    await page.getByRole('button', { name: '書き出し', exact: true }).click();
    await page.getByRole('button', { name: 'PDF(印刷から保存)' }).click();
    await page.waitForFunction(() => window.__printed === 1, null, { timeout: 15000 });
    assert.equal(await page.locator('.print-root .print-page').count(), deck.slides.length);
    const pdf = await page.pdf({ path: `${out}/${name}.pdf`, preferCSSPageSize: true, printBackground: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    assert.equal(pages, deck.slides.length, `PDF のページ数 ${pages}`);
    // 紙の大きさ: スライド 1280x720 px、ノート 768x1024 px(px × 0.75 = pt)
    const box = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/);
    const want = deck.format === 'note' ? [576, 768] : [960, 540];
    assert(box && Math.abs(+box[1] - want[0]) < 1 && Math.abs(+box[2] - want[1]) < 1, `PDF の紙の大きさ ${box?.slice(1)} != ${want}`);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.locator('.print-root').waitFor({ state: 'detached' });
    console.log(`PASS ${name}: pptx (${deck.slides.length} slides) and pdf (${pages} pages)`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
