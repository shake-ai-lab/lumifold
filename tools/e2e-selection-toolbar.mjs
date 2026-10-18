import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto('http://localhost:1420/?deck=/tools/fixtures/demo/deck.json');
  await page.waitForSelector('.thumb');
  const toolbar = page.getByRole('group', { name: '選択した要素の操作', exact: true });
  const button = name => toolbar.getByRole('button', { name, exact: true });
  assert(await button('左揃え').isDisabled());
  assert.equal(await page.locator('.props').getByRole('button', { name: '左揃え', exact: true }).count(), 0);
  await page.evaluate(() => {
    const store = window.__deckStore;
    const deck = structuredClone(store.getState().deck);
    deck.slides[0].elements = ['a','b','c','d','e'].map((id, i) => ({ id, type:'shape', shape:'rect', x:100+i*150, y:220, w:80, h:80, fill:'accent1' }));
    store.setState({deck, selection:[], editingId:null, interactingId:null});
  });
  const select = ids => page.evaluate(ids => window.__deckStore.getState().select(ids), ids);
  const order = () => page.evaluate(() => window.__deckStore.getState().deck.slides[0].elements.map(e => e.id));
  await select(['b','c']);
  for (const [name, expected] of [['前へ',['a','d','b','c','e']], ['後ろへ',['b','c','a','d','e']], ['最前面',['a','d','e','b','c']], ['最背面',['b','c','a','d','e']]]) {
    await button(name).click(); assert.deepEqual(await order(), expected);
    await page.keyboard.press('Control+z'); assert.deepEqual(await order(), ['a','b','c','d','e']);
  }
  await select(['b','d']); await button('前へ').click(); assert.deepEqual(await order(), ['a','c','b','e','d']);
  await page.keyboard.press('Control+z');
  assert(await button('横に等間隔').isDisabled());
  await select(['a','b','c']); assert(await button('横に等間隔').isEnabled());
  await page.getByRole('button', {name:'設定',exact:true}).click();
  assert.equal(await page.locator('.props').count(),0);
  await button('上揃え').click();
  await button('複製 (Ctrl+D)').click(); assert.equal((await order()).length,8);
  await button('削除 (Del)').click(); assert.equal((await order()).length,5);
  await select(['a']);
  await page.evaluate(() => window.__deckStore.getState().patchElement('a',{locked:true}));
  assert(await button('最前面').isDisabled()); assert(await button('削除 (Del)').isDisabled());
  for (const width of [1600,960,800]) {
    await page.setViewportSize({width,height:800});
    assert(await toolbar.evaluate(el=>el.scrollWidth<=el.clientWidth));
    const rect=await button('削除 (Del)').boundingBox(); assert(rect.x>=0 && rect.x+rect.width<=width);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: top toolbar, stable multi-selection order, single-step undo, availability, panel hiding, duplicate/delete and responsive widths');
} finally { await browser.close(); }
