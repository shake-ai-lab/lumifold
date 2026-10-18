// Exercise the minified production assets, not Vite's development modules.
// Run after npm run build. Real deck fixtures are served read-only for browser mode.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('.');
const dist = path.join(root, 'dist');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const fixture = pathname.startsWith('/decks/');
    const base = fixture ? path.join(root, 'decks') : dist;
    const relative = fixture ? pathname.slice('/decks/'.length) : pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(base, relative);
    if (!file.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, {'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream'}).end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({channel:'msedge', headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/?deck=/decks/neural-network/deck.json`);
  await page.waitForFunction(() => document.querySelectorAll('.thumb').length === 15 && document.querySelector('.fit-inner .slide'));
  // Thumbnails mount charts even when the opening slide itself contains no chart.
  assert.equal(await page.locator('.thumb').count(), 15);
  for (let current = 0; current < 15; current++) {
    await page.evaluate(i => window.__deckStore.getState().setCurrent(i), current);
    await page.waitForTimeout(80);
    assert.equal(await page.locator('.fit-inner .slide').count(), 1, `slide ${current + 1}`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: production build opens all 15 neural-network slides with thumbnails');

  for (const kind of ['bar','hbar','line','area','pie','doughnut']) {
    await page.evaluate(kind => {
      const store = window.__deckStore;
      const deck = store.getState().deck;
      store.setState({deck:{...deck,slides:[{id:'chart-test',elements:[{
        id:'production-chart',type:'chart',x:60,y:80,w:1000,h:560,
        chart:{kind,labels:['A','B','C'],series:[{name:'Series',values:[3,7,5]}],options:{showValues:false}}
      }]}]},current:0,selection:[]});
    }, kind);
    await page.waitForTimeout(180);
    const painted = await page.locator('.fit-inner .el-chart canvas').evaluate(canvas => {
      const {data} = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
      return data.some((value, index) => index % 4 === 3 && value > 0);
    });
    assert(painted, `${kind} chart must render pixels`);
    assert.deepEqual(errors, [], `${kind} chart must not crash`);
  }
  console.log('PASS: all six supported chart types render in the optimized bundle');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
