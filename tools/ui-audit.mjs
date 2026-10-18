// 編集画面の表示崩れ監査: 状態(画面幅・選択・各種エディタ/ポップアップ)を順に作り、
//   1. 操作部品が他の要素に覆われていないか(elementFromPoint を中心と左右 2 点で)
//   2. 浮いている UI(右クリックメニュー、編集バー、数式パネル、ダイアログ…)が画面内にあり、右パネル・ツールバーに重ならないか
//   3. ボタン・見出し・ラベルの文字切れ / はみ出し / 不自然な折り返し
//   4. ページ全体・パネルの横あふれ
//   5. pageerror / console.error
//   6. 同じ領域の操作部品どうしの重なり
//   7. スライド上の要素の上に「見えない UI」が乗ってクリックを奪っていないか
//   8. 画面上の文字が 9px 未満になっていないか(スライドと一緒に縮む UI)、数式パネルが編集中の数式を隠していないか、
//      説明文がカタカナ語・英単語の途中で改行していないか
// を自動で調べ、tools/shots-ui-audit/ に状態ごとのスクリーンショット・失敗箇所の拡大(赤枠)・report.json(今回流した分)を書く。
// 右クリックメニューやダイアログが一時的に他の部品を覆うのは note として 1 行にまとめる。
//
// vite dev 起動中に:  node tools/ui-audit.mjs [状態名の一部 ...] [--no-closeups] [--strict]
//   例) node tools/ui-audit.mjs table math     (名前に table か math を含む状態だけ)
// 全状態でおよそ 2 分。ブラウザモードなので deck.json には書き込まない。--strict で FAIL があれば終了コード 1。
// 見た目の違和感(配色・揃え・余白)は自動では分からないので、撮った画像も目で見ること。
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.UI_AUDIT_BASE ?? 'http://127.0.0.1:1420';
const OUT = 'tools/shots-ui-audit';
const args = process.argv.slice(2);
const FILTERS = args.filter(a => !a.startsWith('--'));
const CLOSEUPS = !args.includes('--no-closeups');
const STRICT = args.includes('--strict');
const V1 = { width: 1600, height: 1000 }, V2 = { width: 1280, height: 800 }, V3 = { width: 1000, height: 700 };
const vpName = v => `${v.width}x${v.height}`;

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: V1, permissions: ['clipboard-read', 'clipboard-write'] });
// パネル幅は localStorage に残るので、毎回初期幅から始める
await context.addInitScript(() => { try { localStorage.removeItem('deck-studio.slidesWidth'); localStorage.removeItem('deck-studio.propsWidth'); } catch { /* ignore */ } });
const page = await context.newPage();
let errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${String(e)}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}${m.location()?.url ? ` (${m.location().url})` : ''}`); });
page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });

// ---------------------------------------------------------------- 画面内で実行する検査
function auditInPage(opts) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const out = { covered: [], unreachable: [], floating: [], text: [], page: [], overlap: [], interceptors: [], info: {}, skippedScrolled: 0 };
  const REGIONS = ['.context-menu', '.math-edit-panel', '.table-edit-bar', '.shape-edit-bar', '.widget-controls', '.embed-unlock',
    '.line-handles', '.shape-edit', '.table-edit', '.insert-position', '.comment-image-preview', 'dialog[open]', '.widget-file-error',
    '.toolbar-header', '.toolbar-actions', '.toolbar-selection', '.slide-list', '.props', '.editor-status', '.panel-resizer',
    '.presentation-controls', '.error[role=alert]', '.text-overflow-badge'];
  const only = opts.regions ?? null;
  const regionOf = el => { for (const s of REGIONS) if (el.closest(s)) return s; return null; };
  const R = r => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  const area = r => Math.max(0, r.r - r.l) * Math.max(0, r.b - r.t);
  const inter = (a, b) => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
  const rnd = r => ({ x: Math.round(r.l), y: Math.round(r.t), w: Math.round(r.r - r.l), h: Math.round(r.b - r.t) });
  const label = el => (el.getAttribute?.('aria-label') || (el.innerText || el.textContent || '').trim() || el.value || el.getAttribute?.('placeholder') || el.title || '')
    .replace(/\s+/g, ' ').slice(0, 40);
  const describe = el => {
    if (!el) return 'null';
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    const l = label(el);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}${l ? ` "${l}"` : ''}`;
  };
  const opacityOf = el => { let o = 1; for (let a = el; a && a.nodeType === 1; a = a.parentElement) o *= parseFloat(getComputedStyle(a).opacity); return o; };
  const visible = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    // 閉じた <details> の中身は Chromium では content-visibility: hidden で寸法を持つので checkVisibility で除く
    if (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && opacityOf(el) >= 0.05;
  };
  /** 祖先の overflow と画面端で切られた後の見える矩形。absolute は包含ブロックの連鎖だけをたどる */
  const clipOf = el => {
    const own = R(el.getBoundingClientRect());
    let vis = { ...own };
    const blockers = [];
    let cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const pos = getComputedStyle(cur).position;
      if (pos === 'fixed') break;
      let cb = cur.parentElement;
      if (pos === 'absolute') while (cb && cb !== document.body && getComputedStyle(cb).position === 'static' && getComputedStyle(cb).transform === 'none') cb = cb.parentElement;
      if (!cb || cb === document.body || cb === document.documentElement) break;
      const cs = getComputedStyle(cb);
      const cx = cs.overflowX !== 'visible', cy = cs.overflowY !== 'visible';
      if (cx || cy) {
        const br = cb.getBoundingClientRect();
        const sx = cb.offsetWidth ? br.width / cb.offsetWidth : 1, sy = cb.offsetHeight ? br.height / cb.offsetHeight : 1;
        const box = { l: br.left + cb.clientLeft * sx, t: br.top + cb.clientTop * sy, r: br.left + (cb.clientLeft + cb.clientWidth) * sx, b: br.top + (cb.clientTop + cb.clientHeight) * sy };
        const c = { l: cx ? box.l : -1e9, r: cx ? box.r : 1e9, t: cy ? box.t : -1e9, b: cy ? box.b : 1e9 };
        const next = inter(vis, c);
        if (area(next) < area(vis) - 0.5) blockers.push({ el: cb,
          scroll: (/auto|scroll/.test(cs.overflowX) && cb.scrollWidth > cb.clientWidth + 1) || (/auto|scroll/.test(cs.overflowY) && cb.scrollHeight > cb.clientHeight + 1) });
        vis = next;
      }
      cur = cb;
    }
    const v2 = inter(vis, { l: 0, t: 0, r: vw, b: vh });
    const offViewport = area(v2) < area(vis) - 0.5;
    return { own, vis: v2, blockers, offViewport };
  };
  const transientOf = n => n?.closest?.('.context-menu, dialog[open], .comment-image-preview, .widget-file-error');

  // ---- 1. 覆われた操作部品 / 届かない操作部品
  const CONTROL = 'button, input:not([type=hidden]), select, textarea, [role=button], summary, [role=separator], a[href]';
  const controls = [];
  for (const el of document.querySelectorAll(CONTROL)) {
    if (el.hidden || el.closest('[hidden]')) continue;
    const region = regionOf(el);
    if (!region || (only && !only.includes(region))) continue;
    if (!visible(el)) continue;
    const c = clipOf(el);
    const ownA = area(c.own), visA = area(c.vis);
    const scrollable = c.blockers.some(b => b.scroll);
    if (visA < ownA * 0.95) {
      if (scrollable) { if (visA < ownA * 0.5) { out.skippedScrolled++; continue; } }
      else {
        out.unreachable.push({ region, control: describe(el), visible: Math.round(visA / ownA * 100) + '%', rect: rnd(c.own),
          reason: c.blockers.length ? `切られる: ${describe(c.blockers.at(-1).el)}（スクロールできない）` : '画面の外' });
        if (visA < 4) continue;
      }
    }
    controls.push({ el, region, vis: c.vis });
    const w = c.vis.r - c.vis.l, cx = (c.vis.l + c.vis.r) / 2, cy = (c.vis.t + c.vis.b) / 2;
    const pts = w > 24 ? [[cx, cy], [c.vis.l + w * 0.2, cy], [c.vis.r - w * 0.2, cy]] : [[cx, cy]];
    let by = null, bad = 0;
    for (const [x, y] of pts) {
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit === el || el.contains(hit)) continue;
      if (hit.contains(el) && (getComputedStyle(el).pointerEvents === 'none' || hit.tagName === 'LABEL')) continue;
      by ??= hit; bad++;
    }
    if (by) out.covered.push({ region, control: describe(el), rect: rnd(c.own), points: `${bad}/${pts.length}`, coveredBy: describe(by),
      coverRegion: regionOf(by) ?? (by.closest('.fit') ? 'slide' : by.closest('.stage') ? 'stage' : '?'),
      invisibleCover: opacityOf(by) < 0.05, transient: !!transientOf(by) && !transientOf(el), coverRect: rnd(R(by.getBoundingClientRect())) });
  }

  // ---- 6. 同じ領域で重なっている操作部品
  const skipOverlap = new Set(['.shape-edit', '.line-handles', '.table-edit']);
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
    const a = controls[i], b = controls[j];
    if (a.region !== b.region || skipOverlap.has(a.region) || a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ov = area(inter(a.vis, b.vis));
    if (ov > 4 && ov > 0.1 * Math.min(area(a.vis), area(b.vis))) out.overlap.push({ region: a.region, a: describe(a.el), b: describe(b.el), rect: rnd(inter(a.vis, b.vis)) });
  }
  if (only) return out;

  // ---- 2. 浮いている UI
  const FLOATING = [['.context-menu', 'transient'], ['.math-edit-panel', 'editor'], ['.table-edit-bar', 'editor'], ['.shape-edit-bar', 'editor'],
    ['.widget-controls', 'editor'], ['.embed-unlock', 'editor'], ['.widget-file-error', 'popover'], ['.text-overflow-badge', 'badge'],
    ['.insert-position > span', 'banner'], ['dialog[open]', 'modal'], ['.comment-image-preview', 'modal']];
  const PANELS = [['右パネル', '.props'], ['ツールバー', '.toolbar'], ['スライド一覧', '.slide-list'], ['ステータスバー', '.editor-status']];
  for (const [sel, kind] of FLOATING) for (const el of document.querySelectorAll(sel)) {
    if (!visible(el) || el.closest('.thumb')) continue;
    const c = clipOf(el);
    const o = c.own;
    if (o.l < -1 || o.t < -1 || o.r > vw + 1 || o.b > vh + 1) out.floating.push({ ui: describe(el), kind, problem: '画面からはみ出す', rect: rnd(o) });
    else if (area(c.vis) < area(o) - 2) out.floating.push({ ui: describe(el), kind, problem: `${describe(c.blockers.at(-1)?.el)} に切られる（見えるのは ${Math.round(area(c.vis) / area(o) * 100)}%）`, rect: rnd(o) });
    for (const [name, ps] of PANELS) {
      const p = document.querySelector(ps);
      if (!p || p.contains(el) || el.contains(p) || kind === 'modal') continue;
      const ov = inter(c.vis, R(p.getBoundingClientRect()));
      if (area(ov) > 4) out.floating.push({ ui: describe(el), kind, problem: `${name}に重なる`, rect: rnd(ov), maybeIntended: kind === 'transient' || kind === 'popover' });
    }
  }
  // 数式パネルが編集中の数式そのもの(スライド上のプレビュー)を隠していないか
  const mp = document.querySelector('.math-edit-panel'), ma = document.querySelector('.math-edit');
  if (mp && ma && visible(mp)) {
    const a = R(ma.getBoundingClientRect()), ov = area(inter(R(mp.getBoundingClientRect()), a));
    if (ov > area(a) * 0.2) out.floating.push({ ui: describe(mp), kind: 'editor', problem: `編集中の数式を ${Math.round(ov / area(a) * 100)}% 隠す`, rect: rnd(a) });
  }

  // ---- 3. 文字の切れ・はみ出し・折り返し
  const LABELISH = 'button, summary, h3, h4, kbd, strong, label, small, .group-label, .row > span:first-child, .mode-label, .meta, .presentation-count, .thumb-no, ' +
    '.format-caption, .slide-list-heading, .table-overflow-hint, .text-overflow-badge, .insert-position > span, .selection-context > span, .path, .save-location, .embed-bar > span, .shape-edit-bar > span';
  const seen = new Set();
  for (const root of document.querySelectorAll(REGIONS.join(','))) for (const el of [root, ...root.querySelectorAll('*')]) {
    if (seen.has(el)) continue; seen.add(el);
    if (/^(TEXTAREA|INPUT|SELECT|OPTION|SCRIPT|STYLE)$/.test(el.tagName) || el.closest('svg')) continue;
    if (el.closest('.slide') && !el.closest('.widget-controls, .table-edit-bar, .shape-edit-bar, .insert-position, .embed-unlock, .text-overflow-badge')) continue;
    const nodes = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
    if (!nodes.length || !visible(el)) continue;
    const rects = [];
    for (const n of nodes) { const rg = document.createRange(); rg.selectNodeContents(n); rects.push(...[...rg.getClientRects()].filter(r => r.width > 0.5)); }
    if (!rects.length) continue;
    const U = rects.reduce((u, r) => ({ l: Math.min(u.l, r.left), t: Math.min(u.t, r.top), r: Math.max(u.r, r.right), b: Math.max(u.b, r.bottom) }), { l: 1e9, t: 1e9, r: -1e9, b: -1e9 });
    const cs = getComputedStyle(el);
    const text = nodes.map(n => n.textContent).join('').trim().replace(/\s+/g, ' ').slice(0, 60);
    const region = regionOf(el);
    const own = R(el.getBoundingClientRect());
    const ellipsis = cs.textOverflow === 'ellipsis';
    const hidden = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
    const block = cs.display !== 'inline';
    if (block && (hidden || ellipsis) && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1))
      out.text.push({ region, problem: ellipsis ? '省略（…）で切れている' : '文字が切れている', text, el: describe(el), rect: rnd(own), maybeIntended: ellipsis });
    else {
      const c = clipOf(el);
      if (!c.blockers.some(b => b.scroll) && area(inter(U, c.vis)) < area(U) - 2 && !el.closest('.thumb'))
        out.text.push({ region, problem: `文字が ${c.offViewport ? '画面端' : describe(c.blockers.at(-1)?.el)} で切れている`, text, el: describe(el), rect: rnd(own) });
      else if (block && !hidden && (U.l < own.l - 1 || U.r > own.r + 1 || U.t < own.t - 1 || U.b > own.b + 1))
        out.text.push({ region, problem: '文字が枠の外にはみ出している', text, el: describe(el), rect: rnd(own), overflow: rnd(U) });
    }
    // 画面上の文字の大きさ(スライドと一緒に縮む UI はここで見つかる)
    const scale = el.offsetHeight ? el.getBoundingClientRect().height / el.offsetHeight : 1;
    const px = parseFloat(cs.fontSize) * scale;
    if (px < 9) out.text.push({ region, problem: `画面上の文字が ${px.toFixed(1)}px（読めない大きさ）`, text, el: describe(el), rect: rnd(own), tiny: true });
    const tops = [...new Set(rects.map(r => Math.round(r.top / 3)))];
    // 説明文などの折り返しで、カタカナ語・英単語の途中で切れていないか
    if (tops.length > 1 && !el.matches(LABELISH) && /^(P|SPAN|DIV|LI)$/.test(el.tagName)) {
      const splits = [];
      for (const n of nodes) {
        let prev = null;
        for (let i = 0; i < n.textContent.length; i++) {
          const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 1);
          const r = rg.getClientRects()[0];
          if (r && prev !== null && r.top > prev + 2 && i > 0) {
            const a = n.textContent[i - 1], b = n.textContent[i];
            if ((/[ァ-ヶー]/.test(a) && /[ァ-ヶー]/.test(b)) || (/[A-Za-z0-9]/.test(a) && /[A-Za-z0-9]/.test(b)))
              splits.push(n.textContent.slice(Math.max(0, i - 6), i) + '⏎' + n.textContent.slice(i, i + 6));
          }
          if (r) prev = r.top;
        }
      }
      if (splits.length) out.text.push({ region, problem: '単語の途中で改行', text: splits.join(' / '), el: describe(el), rect: rnd(own), wrap: true });
    }
    if (el.matches(LABELISH)) {
      if (tops.length > 1) {
        // どこで折り返したか: 1 文字ずつ行の上端を見る
        let marked = '';
        for (const n of nodes) {
          let prev = null;
          for (let i = 0; i < n.textContent.length; i++) {
            const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 1);
            const r = rg.getClientRects()[0];
            if (r && prev !== null && r.top > prev + 2) marked += '⏎';
            if (r) prev = r.top;
            marked += n.textContent[i];
          }
        }
        out.text.push({ region, problem: `${tops.length} 行に折り返し`, text: marked.trim().replace(/\s+/g, ' ').slice(0, 80), el: describe(el), rect: rnd(own), wrap: true });
      }
    }
  }

  // ---- 4. ページ・パネルのあふれ
  const de = document.documentElement;
  if (de.scrollWidth > vw + 1) out.page.push({ problem: `ページが横にあふれる（${de.scrollWidth}px > ${vw}px）` });
  if (de.scrollHeight > vh + 1) out.page.push({ problem: `ページが縦にあふれる（${de.scrollHeight}px > ${vh}px）` });
  for (const sel of ['.toolbar', '.editor-status', '.body', '.presentation-controls']) {
    const el = document.querySelector(sel); if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom > vh + 1 || r.right > vw + 1) out.page.push({ problem: `${sel} が画面外に出る`, rect: rnd(R(r)) });
  }
  for (const sel of ['.props', '.slide-list', '.context-menu', '.toolbar-header', '.toolbar-actions', '.toolbar-selection', '.math-edit-panel', '.presentation-controls', '.editor-status']) {
    for (const el of document.querySelectorAll(sel)) {
      if (!visible(el) || el.scrollWidth <= el.clientWidth + 1) continue;
      const right = el.getBoundingClientRect().right;
      const culprits = [...el.querySelectorAll('*')].filter(n => visible(n) && n.getBoundingClientRect().right > right + 1 && !n.closest('.thumb .slide')).slice(0, 3).map(describe);
      out.page.push({ problem: `${sel} が横にあふれる（scrollWidth ${el.scrollWidth} > ${el.clientWidth}）`, culprits });
    }
  }

  // ---- 7. スライド上の要素のクリックを奪う UI
  const slide = document.querySelector('.fit-inner .slide');
  if (slide) for (const node of slide.querySelectorAll(':scope > .el')) {
    if (!visible(node) || node.classList.contains('locked')) continue;
    const c = clipOf(node); const v = c.vis;
    if (area(v) < 4) continue;
    const hits = new Map();
    for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) for (const fy of [0.1, 0.5, 0.9]) {
      const hit = document.elementFromPoint(v.l + (v.r - v.l) * fx, v.t + (v.b - v.t) * fy);
      if (!hit || node.contains(hit) && !hit.closest('.widget-controls, .embed-unlock')) continue;
      const ui = hit.closest('.widget-controls, .embed-unlock, .line-handles, .text-overflow-badge, .table-edit-bar, .shape-edit-bar, .insert-position');
      if (!ui) continue;
      if (node.contains(ui) && opacityOf(hit) >= 0.05) continue; // 自分の操作ボタン
      const key = describe(hit); hits.set(key, { n: (hits.get(key)?.n ?? 0) + 1, invisible: opacityOf(hit) < 0.05, rect: rnd(R(hit.getBoundingClientRect())) });
    }
    for (const [by, h] of hits) out.interceptors.push({ element: node.dataset.id, coveredBy: by, samples: h.n, invisible: h.invisible, rect: h.rect });
  }

  const so = document.querySelector('.fit-inner .slide-outer'), st = document.querySelector('.stage');
  out.info = { viewport: `${vw}x${vh}`, slideScale: so ? +(so.getBoundingClientRect().width / 1280).toFixed(3) : null,
    stage: st ? rnd(R(st.getBoundingClientRect())) : null, toolbarHeight: Math.round(document.querySelector('.toolbar')?.getBoundingClientRect().height ?? 0),
    propsWidth: Math.round(document.querySelector('.props')?.getBoundingClientRect().width ?? 0), controls: controls.length };
  return out;
}

// ---------------------------------------------------------------- 操作の部品
const box = id => page.locator(`.fit-inner [data-id="${id}"]`);
const notes = [];
const wait = ms => page.waitForTimeout(ms);
async function load(deck = 'demo', slide = 0) {
  // 'note-demo/note-demo.deck' のようにファイルまで書けば、その本文を開く(新しい資料は 資料名.deck)
  // 試験用の資料(tools/fixtures/)を先に探し、無ければ見本の資料(decks/)
  const base = fs.existsSync(`tools/fixtures/${deck.split('/')[0]}`) ? 'tools/fixtures' : 'decks';
  await page.goto(`${BASE}/?deck=/${base}/${deck.includes('/') ? deck : `${deck}/deck.json`}`);
  // 狭いウィンドウで起動するとスライド一覧は閉じた状態で始まる。各状態は一覧が開いた状態から作る
  await page.locator('.fit-inner .slide').first().waitFor();
  if (!(await page.locator('.slide-list').count())) await page.getByRole('button', { name: '一覧', exact: true }).click();
  await page.locator('.thumb').first().waitFor();
  if (slide) await page.locator('.thumb').nth(slide).click();
  await wait(350);
}
async function pointOf(id, fx = 0.5, fy = 0.5) {
  const r = await box(id).boundingBox();
  if (!r) throw new Error(`要素 ${id} が見えない`);
  return [r.x + r.width * fx, r.y + r.height * fy];
}
/** 実際のクリックで選ぶ。他の要素が上にあって選べなければストア経由にして記録する */
async function clickEl(id, fx = 0.5, fy = 0.5, modifiers = []) {
  const [x, y] = await pointOf(id, fx, fy);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.click(x, y);
  for (const m of modifiers) await page.keyboard.up(m);
  await wait(150);
  let sel = await page.evaluate(() => window.__deckStore.getState().selection);
  // グループの要素は 1 回目のクリックでグループ全体が選ばれる。もう一度クリックして中の要素にする(PowerPoint と同じ)
  if (!modifiers.length && sel.length > 1 && sel.includes(id)) {
    await page.mouse.click(x, y); await wait(150);
    sel = await page.evaluate(() => window.__deckStore.getState().selection);
  }
  if (!sel.includes(id)) {
    notes.push(`${current}: クリックで ${id} を選べなかった（選択: ${sel.join(',') || 'なし'}）→ ストアで選択`);
    await page.evaluate(([id, add]) => { const s = window.__deckStore.getState(); s.select(add ? [...s.selection, id] : [id]); }, [id, modifiers.length > 0]);
    await wait(150);
  }
}
async function dblEl(id, fx = 0.5, fy = 0.5) { const [x, y] = await pointOf(id, fx, fy); await page.mouse.dblclick(x, y); await wait(250); }
async function rightEl(id, fx = 0.5, fy = 0.5) { const [x, y] = await pointOf(id, fx, fy); await page.mouse.click(x, y, { button: 'right' }); await wait(200); }
const btn = (name, scope = page) => scope.getByRole('button', { name, exact: true });
// 見本の資料のウィジェット(s9-widget)は位置を固定してある。選んで配置・操作する状態は、先に固定を外して作る
const unlock = (id) => page.evaluate((i) => window.__deckStore.getState().setLocked([i], false), id);
async function openDetails() { await page.locator('.position-details summary').click(); await wait(100); }
/** 試験用のスライドに差し替える(デッキにない配置を作る) */
async function reset(elements) {
  await page.evaluate(elements => { const s = window.__deckStore.getState(); window.__deckStore.setState({
    deck: { ...s.deck, slides: [{ id: 'audit', elements }] }, current: 0, selection: [], editingId: null, interactingId: null }); }, elements);
  await wait(200);
}
async function dragSeparator(name, dx) {
  const r = await page.getByRole('separator', { name, exact: true }).boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + dx, r.y + r.height / 2, { steps: 6 }); await page.mouse.up(); await wait(250);
}
const PNG = fs.readFileSync('tools/fixtures/demo/assets/logo.png');
const star = (extra = {}) => ({ id: 'star', type: 'shape', shape: 'star', x: 480, y: 220, w: 300, h: 260, fill: 'accent1', line: { color: 'dk1', width: 2 }, ...extra });
const table = (extra = {}) => ({ id: 'tbl', type: 'table', x: 300, y: 250, w: 600, h: 200, fontSize: 18,
  rows: [[{ text: '項目' }, { text: '内容' }, { text: '備考' }], [{ text: 'A' }, { text: '説明' }, { text: '' }], [{ text: 'B' }, { text: '説明' }, { text: '' }]], ...extra });

// ---------------------------------------------------------------- 状態
const states = [];
const S = (name, viewport, run, opt = {}) => states.push({ name: `${vpName(viewport)}-${name}`, viewport, run, ...opt });

for (const v of [V1, V2, V3]) {
  S('none', v, async () => { await load('demo', 2); });
  S('text-selected', v, async () => { await load('demo', 2); await clickEl('s3-card1-head'); await openDetails(); });
}
S('shape-selected', V1, async () => { await load('demo', 2); await clickEl('s3-card1', 0.04, 0.98); await openDetails(); });
S('arrow-selected', V1, async () => { await load('demo', 3); await clickEl('s4-a1'); });
S('image-selected', V1, async () => { await load('demo', 0); await clickEl('s1-logo'); });
S('chart-selected', V1, async () => { await load('demo', 5); await clickEl('s6-chart', 0.5, 0.6); });
S('chart-selected', V3, async () => { await load('demo', 5); await clickEl('s6-chart', 0.5, 0.6); });
S('table-selected', V1, async () => { await load('demo', 4); await clickEl('s5-table'); });
S('embed-selected', V1, async () => { await load('neural-network', 8); await unlock('s9-widget'); await clickEl('s9-widget'); });
S('embed-selected', V3, async () => { await load('neural-network', 8); await unlock('s9-widget'); await clickEl('s9-widget'); });
S('embed-hover-unselected', V1, async () => { await load('neural-network', 8); await unlock('s9-widget'); const [x, y] = await pointOf('s9-widget', 0.5, 0.3); await page.mouse.move(x, y); await wait(250); }, { keepMouse: true });
S('embed-interact', V1, async () => { await load('neural-network', 8); await unlock('s9-widget'); await clickEl('s9-widget'); await btn('操作', box('s9-widget')).click(); await wait(300); });
S('embed-locked-hover', V2, async () => { await load('coffee-extraction', 2); const [x, y] = await pointOf('s3-plot', 0.08, 0.1); await page.mouse.move(x, y); await wait(250); }, { keepMouse: true });
S('embed-none-selected', V1, async () => { await load('neural-network', 8); });
S('embed-full-slide-selected', V2, async () => { await load('neural-network', 8);
  await reset([{ id: 'wide', type: 'embed', x: 0, y: 0, w: 1280, h: 720, src: 'widgets/descent.html', title: '全面ウィジェット' }]);
  await page.evaluate(() => window.__deckStore.getState().select(['wide'])); await wait(400); });
S('long-title-and-path', V3, async () => { await load('demo', 2);
  await page.evaluate(() => { const s = window.__deckStore.getState(); window.__deckStore.setState({
    deck: { ...s.deck, meta: { ...s.deck.meta, title: '2026年度 第3四半期 事業部別の売上・利益の振り返りと来期の重点施策（取締役会向け詳細版）' } },
    deckPath: 'C:\\Users\\user\\Documents\\資料\\2026\\取締役会\\第3四半期\\事業部別の振り返り\\deck.json' }); });
  await clickEl('s3-card1-head'); await page.evaluate(() => window.__deckStore.getState().flash('AIへの修正依頼をコピーしました。Claude Code に貼り付けて実行してください')); await wait(150); });
S('open-error', V2, async () => { await page.goto(`${BASE}/?deck=/decks/__missing__/deck.json`); await page.locator('.error[role=alert]').waitFor(); await wait(200); });
S('math-selected', V1, async () => { await load('coffee-extraction', 1); await clickEl('s2-ey-formula'); await openDetails(); });
S('multi-selected', V2, async () => { await load('demo', 2); await clickEl('s3-card1-head'); await clickEl('s3-card2-head', 0.5, 0.5, ['Shift']); await clickEl('s3-card3-head', 0.5, 0.5, ['Shift']); });
S('locked-text', V2, async () => {
  await load('demo', 2); await rightEl('s3-card1-head'); await btn('位置を固定').click(); await wait(150);
  await page.evaluate(() => window.__deckStore.getState().select(['s3-card1-head'])); await wait(150); await openDetails();
});
S('locked-text-menu', V2, async () => { await load('demo', 2); await rightEl('s3-card1-head'); await btn('位置を固定').click(); await wait(150); await rightEl('s3-card1-head'); });
S('text-edit', V1, async () => { await load('demo', 2); await dblEl('s3-card1-body', 0.5, 0.1); });
S('text-edit-format-menu', V1, async () => { await load('demo', 2); await dblEl('s3-card1-body', 0.5, 0.1); await rightEl('s3-card1-body', 0.5, 0.1); });
S('text-edit-format-menu', V3, async () => { await load('demo', 2); await dblEl('s3-card3-body', 0.5, 0.1); await rightEl('s3-card3-body', 0.8, 0.1); });
S('text-context-menu', V1, async () => { await load('demo', 2); await rightEl('s3-card1-head'); });
S('text-context-menu-bottom-right', V3, async () => { await load('demo', 7); await rightEl('s8-body', 0.97, 0.95); });
S('table-edit', V1, async () => { await load('demo', 4); await dblEl('s5-table', 0.3, 0.3); });
S('table-context-menu', V1, async () => { await load('demo', 4); await rightEl('s5-table', 0.3, 0.3); });
// 一覧と設定を閉じた低い画面では、スライドが高さで決まり上下の余白が 24px しかない
S('table-edit-top-edge-no-panels', V3, async () => { await load('demo', 0); await btn('一覧').click(); await btn('設定').click(); await reset([table({ y: 6 })]); await dblEl('tbl', 0.2, 0.5); });
S('table-edit-right-edge', V3, async () => { await load('demo', 0); await reset([table({ x: 1010, w: 260 })]); await dblEl('tbl', 0.2, 0.5); });
S('math-edit', V1, async () => { await load('coffee-extraction', 1); await dblEl('s2-ey-formula'); });
S('math-edit', V3, async () => { await load('coffee-extraction', 1); await dblEl('s2-ey-formula'); });
S('math-insert-mode', V1, async () => { await load('demo', 2); await btn('数式').click(); await wait(200); });
S('math-insert-mode', V3, async () => { await load('demo', 2); await btn('数式').click(); await wait(200); });
S('shape-points', V1, async () => { await load('demo', 0); await reset([star()]); await clickEl('star', 0.5, 0.6); await btn('編集点を編集', page.locator('.props')).click(); await wait(200); });
S('shape-points-top-right', V3, async () => { await load('demo', 0); await reset([star({ x: 1090, y: 8, w: 180, h: 150 })]); await clickEl('star', 0.5, 0.6); await page.keyboard.press('F2'); await wait(200); });
S('line-endpoints-top-edge', V2, async () => { await load('demo', 0); await reset([{ id: 'ln', type: 'shape', shape: 'arrow', x: 0, y: 0, w: 400, h: 12, line: { color: 'dk1', width: 3 } }]);
  await page.evaluate(() => window.__deckStore.getState().select(['ln'])); await wait(200); });
S('color-picker', V1, async () => { await load('demo', 2); await clickEl('s3-card1', 0.04, 0.98); await page.locator('.props .row').filter({ hasText: /^塗り/ }).locator('.custom-color summary').click(); await wait(150); });
S('color-picker', V3, async () => { await load('demo', 2); await clickEl('s3-card1', 0.04, 0.98); await page.locator('.props .row').filter({ hasText: /^塗り/ }).locator('.custom-color summary').click(); await wait(150); });
S('shape-gallery', V1, async () => { await load('demo', 2); await btn('図形').click(); await wait(200); });
S('shape-gallery', V3, async () => { await load('demo', 2); await btn('図形').click(); await wait(200); });
S('element-context-menu', V1, async () => { await load('demo', 2); await rightEl('s3-card1', 0.04, 0.98); });
S('thumb-context-menu', V1, async () => { await load('demo', 0); await page.locator('.thumb').nth(2).click({ button: 'right' }); await wait(200); });
S('thumb-context-menu-last', V3, async () => { await load('demo', 0); const t = page.locator('.thumb').last(); await t.scrollIntoViewIfNeeded(); await t.click({ button: 'right', position: { x: 150, y: 60 } }); await wait(200); });
const comments = async () => {
  await load('demo', 2); await clickEl('s3-card1', 0.04, 0.98);
  await page.getByLabel('新しいコメント').fill('このカードの見出しを短くして、本文の箇条書きを3項目に揃えてください。参考画像の配色に合わせる。'.repeat(2));
  await page.locator('.object-comments input[type=file]').setInputFiles([{ name: 'ref-a.png', mimeType: 'image/png', buffer: PNG }, { name: 'ref-b.png', mimeType: 'image/png', buffer: PNG }]);
  await wait(200); await btn('コメントを追加').click(); await wait(150);
  await page.getByLabel('新しいコメント').fill('下書き中のコメント');
  await page.locator('.object-comments input[type=file]').setInputFiles({ name: 'draft.png', mimeType: 'image/png', buffer: PNG }); await wait(200);
  await page.locator('.props').evaluate(n => { n.scrollTop = n.scrollHeight; }); await wait(150);
};
S('comments', V1, comments);
S('comments', V3, comments);
S('comment-image-preview', V2, async () => { await comments(); await page.locator('.object-comments article .comment-images button').first().click(); await wait(200); });
S('present', V1, async () => { await load('demo', 2); await btn('プレゼン開始').click(); await wait(300); });
S('present', V3, async () => { await load('demo', 2); await btn('プレゼン開始').click(); await wait(300); });
S('present-embed', V2, async () => { await load('neural-network', 8); await btn('プレゼン開始').click(); await wait(500); });
// ノート(縦のページ)と読む画面
const NOTE = 'note-demo/note-demo.deck';
S('note-editor', V2, async () => { await load(NOTE, 4); });
S('note-layouts', V1, async () => { await load(NOTE, 1); await page.getByRole('button', { name: /追加/ }).click(); await page.getByRole('group', { name: 'ページの型' }).waitFor(); await wait(200); });
S('note-read-spread', V1, async () => { await load(NOTE, 3); await btn('読む').click(); await btn('見開き').click(); await wait(400); });
S('note-read-single', V3, async () => { await load(NOTE, 3); await btn('読む').click(); await btn('単ページ').click(); await wait(400); });
S('note-read-turning', V2, async () => {
  await load(NOTE, 3); await btn('読む').click(); await btn('見開き').click(); await wait(300);
  await page.keyboard.press('ArrowRight'); await wait(300);
});
S('no-slide-list', V2, async () => { await load('demo', 2); await btn('一覧').click(); await clickEl('s3-card1-head'); });
S('no-props', V2, async () => { await load('demo', 2); await btn('設定').click(); await clickEl('s3-card1-head'); });
S('no-panels', V3, async () => { await load('demo', 2); await btn('一覧').click(); await btn('設定').click(); await clickEl('s3-card1-head'); });
S('props-max', V3, async () => { await load('demo', 2); await clickEl('s3-card1-head'); await dragSeparator('設定パネルの幅', -900); await openDetails(); });
S('props-max', V1, async () => { await load('demo', 2); await clickEl('s3-card1', 0.04, 0.98); await dragSeparator('設定パネルの幅', -900); await openDetails(); });
S('props-min', V3, async () => { await load('demo', 2); await clickEl('s3-card1', 0.04, 0.98); await dragSeparator('設定パネルの幅', 900); await openDetails();
  await page.locator('.props .row').filter({ hasText: /^塗り/ }).locator('.custom-color summary').click(); await wait(150); });
S('props-min-text', V2, async () => { await load('demo', 2); await clickEl('s3-card1-head'); await dragSeparator('設定パネルの幅', 900); await openDetails(); });
S('list-max', V1, async () => { await load('demo', 2); await dragSeparator('スライド一覧の幅', 900); await clickEl('s3-card1-head'); });
S('list-max-props-max', V3, async () => { await load('demo', 2); await dragSeparator('スライド一覧の幅', 900); await dragSeparator('設定パネルの幅', -900); await clickEl('s3-card1-head'); await openDetails(); });
S('widget-file-error', V3, async () => { await load('demo', 2); await btn('動く図解').click(); await wait(200); });
S('embed-replace-error', V1, async () => { await load('neural-network', 8); await unlock('s9-widget'); await clickEl('s9-widget'); await btn('HTMLを差し替える').click(); await wait(200); });
S('file-dialog', V3, async () => { await load('demo', 2); await btn('新規資料').click(); await wait(250); });
S('pack-dialog', V3, async () => { await load('demo', 2); await btn('1ファイルにまとめる').click(); await wait(250); });
S('overflow-badge-top', V2, async () => { await load('demo', 0); await reset([{ id: 'ov', type: 'text', x: 900, y: 0, w: 380, h: 60, style: { fontSize: 24 },
  paragraphs: [{ runs: [{ text: '枠からあふれる長い文章です。'.repeat(6) }] }] }]); });

// ---------------------------------------------------------------- 実行
let current = '';
const report = [];
const started = Date.now();
const selected = states.filter(s => !FILTERS.length || FILTERS.some(f => s.name.includes(f)));
// 前回の画像は、今回撮る状態の分だけ消す(一部だけ流したときに他の状態の画像を残す)
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png') && selected.some(st => f === `${st.name}.png` || f.startsWith(`${st.name}__`))) fs.rmSync(`${OUT}/${f}`);
for (const st of selected) {
  current = st.name; errors = [];
  const entry = { state: st.name, shot: `${OUT}/${st.name}.png`, closeups: [] };
  try {
    await page.setViewportSize(st.viewport);
    await st.run();
    if (!st.keepMouse) { await page.mouse.move(st.viewport.width / 2, st.viewport.height - 4); }
    await wait(250);
    const res = await page.evaluate(auditInPage, {});
    // 右パネルが長いときは、スクロールしながら見えている部分も検査する
    const steps = await page.evaluate(() => { const p = document.querySelector('.props'); return p ? Math.ceil(p.scrollHeight / Math.max(1, p.clientHeight * 0.8)) : 0; });
    if (steps > 1 && !st.name.includes('comments')) {
      const start = await page.evaluate(() => document.querySelector('.props').scrollTop);
      for (let i = 1; i < steps; i++) {
        await page.evaluate(i => { const p = document.querySelector('.props'); p.scrollTop = i * p.clientHeight * 0.8; }, i); await wait(60);
        const more = await page.evaluate(auditInPage, { regions: ['.props'] });
        for (const k of ['covered', 'unreachable', 'overlap']) for (const it of more[k]) if (!res[k].some(x => x.control === it.control && x.a === it.a)) res[k].push({ ...it, scrolled: i });
      }
      await page.evaluate(t => { document.querySelector('.props').scrollTop = t; }, start); await wait(60);
    }
    Object.assign(entry, res);
    await page.screenshot({ path: entry.shot });
    // 失敗箇所の拡大(赤枠付き)
    const fails = [
      ...res.covered.filter(c => !c.transient).map(c => ({ rect: c.rect, tag: 'covered' })),
      ...res.unreachable.map(c => ({ rect: c.rect, tag: 'unreachable' })),
      ...res.floating.filter(f => !f.maybeIntended).map(f => ({ rect: f.rect, tag: 'floating' })),
      ...res.text.filter(t => !t.maybeIntended && !t.wrap).map(t => ({ rect: t.rect, tag: 'text' })),
      ...res.overlap.map(o => ({ rect: o.rect, tag: 'overlap' })),
      ...res.interceptors.filter(i => i.invisible).map(i => ({ rect: i.rect, tag: 'interceptor' })),
    ];
    if (CLOSEUPS) for (const [i, f] of fails.slice(0, 6).entries()) {
      const { width, height } = st.viewport;
      const clip = { x: Math.max(0, f.rect.x - 80), y: Math.max(0, f.rect.y - 60) };
      clip.width = Math.max(40, Math.min(width - clip.x, f.rect.w + 160)); clip.height = Math.max(40, Math.min(height - clip.y, f.rect.h + 120));
      if (clip.x >= width || clip.y >= height) continue;
      await page.evaluate(r => { const d = document.createElement('div'); d.id = '__audit_mark';
        d.style.cssText = `position:fixed;left:${r.x - 2}px;top:${r.y - 2}px;width:${r.w + 4}px;height:${r.h + 4}px;outline:2px solid #ff2d55;pointer-events:none;z-index:2147483647`;
        document.body.appendChild(d); }, f.rect);
      const p = `${OUT}/${st.name}__${i + 1}-${f.tag}.png`;
      await page.screenshot({ path: p, clip }); entry.closeups.push(p);
      await page.evaluate(() => document.getElementById('__audit_mark')?.remove());
    }
  } catch (e) {
    entry.setupError = String(e).split('\n')[0];
    try { await page.screenshot({ path: entry.shot }); } catch { /* ignore */ }
  }
  entry.errors = [...new Set(errors)];
  report.push(entry);
  const n = k => entry[k]?.length ?? 0;
  console.log(`${entry.setupError ? 'ERR ' : '    '}${st.name.padEnd(44)} covered ${n('covered')}  unreachable ${n('unreachable')}  floating ${n('floating')}  text ${n('text')}  page ${n('page')}  overlap ${n('overlap')}  interceptors ${n('interceptors')}  errors ${n('errors')}${entry.setupError ? '  ' + entry.setupError : ''}`);
}
await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ notes, report }, null, 2));

// ---------------------------------------------------------------- まとめ(同じ問題は状態をまとめて 1 行に)
const groups = new Map();
const add = (level, key, line, state) => { const g = groups.get(key) ?? { level, line, states: [] }; g.states.push(state); groups.set(key, g); };
for (const e of report) {
  if (e.setupError) add('FAIL', `setup|${e.state}`, `状態を作れなかった: ${e.setupError}`, e.state);
  // 右クリックメニュー・ダイアログが一時的に他の部品を覆うのは想定どおりなので、状態ごとに 1 行にまとめる
  const transient = new Map();
  for (const c of e.covered ?? []) {
    if (c.transient || c.coverRegion === '.context-menu') { const k = c.coveredBy.split(' ')[0]; transient.set(k, (transient.get(k) ?? 0) + 1); continue; }
    add('FAIL', `cov|${c.control}|${c.coveredBy}`, `[覆われた操作部品] ${c.region} ${c.control} ← ${c.coveredBy}${c.invisibleCover ? '（透明な要素）' : ''}`, e.state);
  }
  for (const [k, n] of transient) add('note', `covt|${e.state}|${k}`, `[一時的な覆い] ${k} が ${n} 個の操作部品を覆う（メニュー・ダイアログ表示中）`, e.state);
  for (const c of e.unreachable ?? []) add('FAIL', `unr|${c.control}|${c.reason}`, `[届かない操作部品] ${c.region} ${c.control}: ${c.reason}（見える ${c.visible}）`, e.state);
  for (const f of e.floating ?? []) add(f.maybeIntended ? 'note' : 'FAIL', `flo|${f.ui.split(' ')[0]}|${f.problem.replace(/\d+%/, '')}`, `[浮いている UI] ${f.ui}: ${f.problem}`, e.state);
  for (const t of e.text ?? []) add(t.maybeIntended ? 'note' : t.wrap ? 'warn' : 'FAIL', `txt|${t.problem.replace(/[\d.]+ ?(行|px)/, 'n$1')}|${t.text}`, `[文字] ${t.region} ${t.problem}: 「${t.text}」 (${t.el.split(' ')[0]})`, e.state);
  for (const p of e.page ?? []) add('FAIL', `page|${p.problem.replace(/\d+/g, 'n')}`, `[あふれ] ${p.problem}${p.culprits?.length ? ' 原因候補: ' + p.culprits.join(', ') : ''}`, e.state);
  for (const o of e.overlap ?? []) add('FAIL', `ovl|${o.a}|${o.b}`, `[重なり] ${o.region} ${o.a} と ${o.b}`, e.state);
  for (const i of e.interceptors ?? []) add(i.invisible ? 'FAIL' : 'note', `int|${i.coveredBy}|${i.invisible}`, `[クリックを奪う UI] スライド要素 ${i.element} の上に ${i.coveredBy}${i.invisible ? '（透明）' : ''}`, e.state);
  // favicon が無い 404 はブラウザモードだけの既知の現象
  for (const m of e.errors ?? []) add(/favicon.ico|__missing__/.test(m) ? 'note' : 'FAIL', `err|${m.slice(0, 120)}`, `[エラー] ${m.slice(0, 200)}`, e.state);
}
const order = { FAIL: 0, warn: 1, note: 2 };
const sorted = [...groups.values()].sort((a, b) => order[a.level] - order[b.level] || b.states.length - a.states.length);
console.log(`\n==== ${selected.length} 状態、${((Date.now() - started) / 1000).toFixed(0)} 秒。スクリーンショット・report.json: ${OUT}/`);
for (const g of sorted) console.log(`${g.level.padEnd(4)} ${g.line}\n       状態(${g.states.length}): ${g.states.slice(0, 6).join(', ')}${g.states.length > 6 ? ' …' : ''}`);
for (const n of notes) console.log(`note ${n}`);
const failCount = sorted.filter(g => g.level === 'FAIL').length;
console.log(`\nFAIL ${failCount} 種類 / warn ${sorted.filter(g => g.level === 'warn').length} / note ${sorted.filter(g => g.level === 'note').length}`);
if (STRICT && failCount) process.exit(1);
