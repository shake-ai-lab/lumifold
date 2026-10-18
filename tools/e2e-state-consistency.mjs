// 「状態を切り替えると見た目がずれる」系の検査。vite dev 起動中に使う（ブラウザモードなのでデッキのファイルは書き換わらない）。
//   node tools/e2e-state-consistency.mjs [資料.deck | deck.json ...]   引数なしなら試験用デッキ + decks/*/ の資料全部
// 各要素について、切り替える前後の画面を画素で比べる（編集の枠・選択の枠・カーソルなどの「道具」は隠して比べる）。
//   edit        表示 → 編集に入る（文字・表・数式・図形の編集点）
//   cancel      編集 → 取り消し（元に戻るか）
//   roundtrip   1 文字打って消して確定（データと見た目が変わらないか）
//   select      選択しただけで中身が変わらないか
//   present     プレゼン表示で、位置と文字の折り返しが編集画面と同じか
//   fit         「枠を内容に合わせる」の高さで、文字がはみ出さず、余りすぎないか
// 違いが出たものは tools/shots-consistency/ に前後の画像を残す。
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = process.env.SC_OUT ?? "tools/shots-consistency"; // 並列で走らせるときは出力先を分ける
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const FIXTURE = "tools/fixtures/consistency/deck.json";
writeFixture(FIXTURE);
// フォルダ内の資料の本文(資料名.deck、旧形式の deck.json)。1 ファイルにまとめたもの(中身が zip)は除く
const deckFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .filter((f) => f.isFile() && (f.name === "deck.json" || f.name.endsWith(".deck"))).map((f) => `${dir}/${f.name}`)
  .filter((p) => fs.readFileSync(p).subarray(0, 2).toString() !== "PK");
const decks = process.argv.slice(2).length ? process.argv.slice(2)
  : [FIXTURE, ...fs.readdirSync("decks", { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((d) => deckFiles(`decks/${d.name}`))];
const ONLY = (process.env.CHECKS ?? "edit,cancel,roundtrip,select,present,fit").split(",");
// 画素の比較：1 チャンネルの差が PIXEL を超えた画素を数え、ALLOWED 個を超えたら違いとする。
// 文字は編集中に描き方（アンチエイリアス）が少し変わるので、位置は座標で比べ、画素は大きな変化だけを見る
const PIXEL = 96, ALLOWED = 3, TEXT_PIXEL = 170, TEXT_ALLOWED = 40;

const HIDE = `.text-overflow-badge,.moveable-control-box,.table-edit-bar,.shape-edit-bar,.shape-point,.table-column-resizer,
.math-edit-panel,.widget-controls,.embed-unlock,.line-handles,.insert-position,.selecto-selection{display:none!important}
.text-edit,.math-edit,.table-edit,.shape-edit,.text-edit:focus{outline:none!important;caret-color:transparent!important}
.table-edit .cell.focused{box-shadow:none!important}
*::selection{background:transparent!important}`;

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
const findings = [];
let checked = 0;
const store = (fn, arg) => page.evaluate(fn, arg);
const settle = async (ms = 40) => { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(ms); };

async function shot(clip) { return (await page.screenshot({ clip, type: "png" })).toString("base64"); }
// tolerant: 隣（3x3）の画素に近い色があれば同じとみなす（文字の濃さの揺れを数えない）
async function diff(a, b, threshold = PIXEL, tolerant = false) {
  return page.evaluate(async ([a, b, PIXEL, tolerant]) => {
    const load = async (s) => {
      const img = await createImageBitmap(await (await fetch("data:image/png;base64," + s)).blob());
      const c = new OffscreenCanvas(img.width, img.height), x = c.getContext("2d");
      x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height);
    };
    const A = await load(a), B = await load(b);
    if (A.width !== B.width || A.height !== B.height) return { count: -1 };
    let count = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0; i < A.data.length; i += 4) {
      const p0 = i / 4, px = p0 % A.width, py = (p0 / A.width) | 0;
      const at = (X, x, y) => { const j = (y * A.width + x) * 4; return Math.max(Math.abs(A.data[i] - X.data[j]), Math.abs(A.data[i + 1] - X.data[j + 1]), Math.abs(A.data[i + 2] - X.data[j + 2])); };
      let d = at(B, px, py);
      if (tolerant && d > PIXEL) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = px + dx, y = py + dy;
        if (x >= 0 && y >= 0 && x < A.width && y < A.height) d = Math.min(d, at(B, x, y));
      }
      if (d > PIXEL) { count++; const p = i / 4, x = p % A.width, y = (p / A.width) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    return { count, bbox: count ? [x0, y0, x1, y1] : null, size: [A.width, A.height] };
  }, [a, b, threshold, tolerant]);
}
function record(deck, slide, el, check, detail, images) {
  const name = `${path.basename(path.dirname(deck))}-s${slide + 1}-${el.id}-${check}`.replace(/[^\w.-]/g, "_");
  if (images) images.forEach((img, i) => fs.writeFileSync(path.join(OUT, `${name}-${"ab"[i]}.png`), Buffer.from(img, "base64")));
  findings.push({ deck: path.basename(path.dirname(deck)), slide: slide + 1, id: el.id, type: el.type + (el.shape ? ":" + el.shape : ""), check, detail });
}
async function clipOf(id) {
  return page.evaluate((id) => {
    const n = document.querySelector(`.fit-inner [data-id="${CSS.escape(id)}"]`);
    if (!n) return null;
    const r = n.getBoundingClientRect(), m = 14;
    const x = Math.max(0, Math.floor(r.left - m)), y = Math.max(0, Math.floor(r.top - m));
    const w = Math.min(innerWidth, Math.ceil(r.right + m)) - x, h = Math.min(innerHeight, Math.ceil(r.bottom + m)) - y;
    const hit = [...document.querySelectorAll(".fit-inner .el-embed, .fit-inner .el-chart")].some((f) => { const q = f.getBoundingClientRect(); return q.right > x && q.left < x + w && q.bottom > y && q.top < y + h; });
    return w > 2 && h > 2 ? { x, y, width: w, height: h, moving: hit } : null;
  }, id);
}
// キーの順序を無視した JSON（中身が同じかを比べる）
const elementJson = (id) => store((id) => {
  const s = window.__deckStore.getState(), sort = (v) => Array.isArray(v) ? v.map(sort) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v;
  return JSON.stringify(sort(s.deck.slides[s.current].elements.find((e) => e.id === id)));
}, id);
// 文字の枠の高さ・中身（段落の並び）の高さと幅・アプリの「はみ出し」警告の有無。回転していても崩れないよう offset で測る
const textFit = (id) => page.evaluate((id) => {
  const n = document.querySelector(`.fit-inner [data-id="${CSS.escape(id)}"]`), box = n.firstElementChild, kids = [...box.children];
  const top = Math.min(...kids.map((c) => c.offsetTop)), bottom = Math.max(...kids.map((c) => c.offsetTop + c.offsetHeight));
  return { h: box.clientHeight, w: box.clientWidth, content: Math.round((bottom - top) * 100) / 100, width: box.scrollWidth, scroll: box.scrollHeight,
    badge: !!n.querySelector(".text-overflow-badge") };
}, id);
// 文字・表の中身の位置（スライド座標）。表示中は要素の中、編集中は編集用の枠の中を測る
const geometry = (id, type, editing) => page.evaluate(([id, type, editing]) => {
  const slide = document.querySelector(".fit-inner .slide"), sr = slide.getBoundingClientRect(), scale = sr.width / 1280;
  const n = (r) => [r.left - sr.left, r.top - sr.top, r.width, r.height].map((v) => Math.round((v / scale) * 100) / 100);
  const host = editing ? document.querySelector(type === "text" ? ".fit-inner .text-edit" : ".fit-inner .table-edit table")
    : document.querySelector(`.fit-inner [data-id="${CSS.escape(id)}"] ${type === "text" ? "> div" : "table"}`);
  if (!host) return null;
  const parts = [];
  if (type === "text") {
    host.querySelectorAll("p").forEach((p, i) => parts.push([`p${i}`, n(p.getBoundingClientRect())]));
    host.querySelectorAll("[data-run]").forEach((r, i) => [...r.getClientRects()].forEach((c, j) => parts.push([`run${i}.${j}`, n(c)])));
  } else {
    host.querySelectorAll("td").forEach((td, i) => {
      parts.push([`cell${i}`, n(td.getBoundingClientRect())]);
      const range = document.createRange(); range.selectNodeContents(td);
      [...range.getClientRects()].forEach((c, j) => parts.push([`cell${i}.text${j}`, n(c)]));
    });
  }
  const box = editing && type === "text" ? host : null;
  return { parts, scrollbar: box ? box.offsetWidth - box.clientWidth : 0 };
}, [id, type, editing]);
function compareGeometry(a, b) {
  if (!a || !b) return "測れない";
  if (b.scrollbar > 0) return `編集中にスクロールバー（幅 ${b.scrollbar}px）`;
  if (a.parts.length !== b.parts.length) return `部品の数が違う ${a.parts.length} → ${b.parts.length}`;
  for (let i = 0; i < a.parts.length; i++) {
    const [k, ra] = a.parts[i], rb = b.parts[i][1];
    const d = Math.max(...ra.map((v, j) => Math.abs(v - rb[j])));
    if (d > 0.5) return `${k} が ${d.toFixed(2)}px ずれる [${ra}] → [${rb}]`;
  }
  return null;
}

for (const deck of decks) {
  await page.goto(`http://127.0.0.1:1420/?deck=${encodeURIComponent("/" + deck)}`, { waitUntil: "load" });
  await page.locator(".thumb").first().waitFor({ timeout: 30000 });
  await page.addStyleTag({ content: HIDE });
  await page.mouse.move(2, 990);
  await page.evaluate(() => document.fonts.ready);
  const nSlides = await store(() => window.__deckStore.getState().deck.slides.length);
  const before = findings.length;
  const [from, to] = (process.env.SC_SLIDES ?? `1-${nSlides}`).split("-").map(Number); // 例 SC_SLIDES=1-9（並列で分けるとき）
  for (let si = from - 1; si < Math.min(nSlides, to); si++) {
    await store((i) => { const s = window.__deckStore.getState(); s.setEditing(null); s.select([]); s.setCurrent(i); }, si);
    await settle(si === 0 ? 900 : 350);
    const els = await store(() => { const s = window.__deckStore.getState(); return s.deck.slides[s.current].elements.map((e) => ({ id: e.id, type: e.type, shape: e.shape, locked: !!e.locked })); });
    for (const el of els) {
      if (el.type === "embed" || el.type === "chart") continue; // 中身が動く（アニメーション・iframe）ので画素では比べない
      const clip = await clipOf(el.id);
      if (!clip) continue;
      const moving = clip.moving; delete clip.moving; // ウィジェットと重なる所は画素で比べない（中身が勝手に動く）
      const base = await shot(clip);
      checked++;
      if (ONLY.includes("select")) {
        await store((id) => window.__deckStore.getState().select([id]), el.id); await settle();
        const s = await shot(clip), d = await diff(base, s);
        if (!moving && d.count > ALLOWED) record(deck, si, el, "select", d, [base, s]);
        await store(() => window.__deckStore.getState().select([])); await settle();
      }
      if (ONLY.includes("fit") && el.type === "text") {
        const m = await textFit(el.id);
        if (m.badge && m.content <= m.h + 0.5 && m.width <= m.w + 0.5) record(deck, si, el, "overflow-false", { ...m, note: "収まっているのに「はみ出しています」" });
        if (!m.badge && (m.content > m.h + 1 || m.width > m.w + 1)) record(deck, si, el, "overflow-missed", { ...m, note: "はみ出しているのに警告が出ない" });
      }
      const editable = !el.locked && (["text", "table", "math"].includes(el.type) || (el.type === "shape" && await store((id) => {
        const s = window.__deckStore.getState(); const e = s.deck.slides[s.current].elements.find((x) => x.id === id);
        return !["line", "arrow", "ellipse", "roundRect", "cylinder", "heart"].includes(e.shape);
      }, el.id)));
      if (!editable) continue;
      if (ONLY.includes("edit") || ONLY.includes("cancel")) {
        const textual = el.type === "text" || el.type === "table";
        const g0 = textual ? await geometry(el.id, el.type, false) : null;
        await store((id) => window.__deckStore.getState().setEditing(id, 0), el.id); await settle(80);
        const editingNow = await store(() => window.__deckStore.getState().editingId);
        if (editingNow === el.id) {
          const s = await shot(clip), d = await diff(base, s, textual ? TEXT_PIXEL : PIXEL, textual);
          if (ONLY.includes("edit")) {
            if (textual) {
              const g = compareGeometry(g0, await geometry(el.id, el.type, true));
              if (g) record(deck, si, el, "edit-position", g, [base, s]);
              else if (!moving && d.count > TEXT_ALLOWED) record(deck, si, el, "edit-look", d, [base, s]);
            } else if (!moving && d.count > ALLOWED) record(deck, si, el, "edit", d, [base, s]);
          }
          await store(() => window.__deckStore.getState().setEditing(null)); await settle(60);
          const c = await shot(clip), dc = await diff(base, c, textual ? TEXT_PIXEL : PIXEL, textual);
          if (ONLY.includes("cancel") && !moving && dc.count > (textual ? TEXT_ALLOWED : ALLOWED)) record(deck, si, el, "cancel", dc, [base, c]);
        }
      }
      // 図形：編集点を 1px 動かした編集中の見た目と、確定して多角形になった後の見た目が同じか
      if (ONLY.includes("roundtrip") && el.type === "shape" && !moving) {
        await store((id) => window.__deckStore.getState().setEditing(id), el.id); await settle(80);
        await page.keyboard.press("ArrowRight"); await settle(60);
        const editing = await shot(clip);
        await page.keyboard.press("Enter"); await settle(80);
        const after = await shot(clip), d = await diff(editing, after, PIXEL, true); // 確定後は座標に端数が出るので半画素の差は数えない
        const shape = await store((id) => { const s = window.__deckStore.getState(); return s.deck.slides[s.current].elements.find((e) => e.id === id).shape; }, el.id);
        if (shape !== "polygon") record(deck, si, el, "shape-commit", "確定しても多角形にならない");
        else if (d.count > 40) record(deck, si, el, "shape-commit", d, [editing, after]); // 細い線は確定後の座標の端数で半画素描き分けられる
        await store(() => window.__deckStore.temporal.getState().undo()); await settle(60);
      }
      if (ONLY.includes("roundtrip") && (el.type === "text" || el.type === "table")) {
        const json0 = await elementJson(el.id);
        const pastBefore = await store(() => window.__deckStore.temporal.getState().pastStates.length);
        await store((id) => window.__deckStore.getState().setEditing(id, 0), el.id); await settle(80);
        await page.keyboard.type("x"); await page.keyboard.press("Backspace"); await page.keyboard.press("Control+Enter");
        await settle(80);
        await store(() => window.__deckStore.getState().setEditing(null)); await settle(60);
        const json1 = await elementJson(el.id);
        const s = await shot(clip), d = await diff(base, s, TEXT_PIXEL, true);
        if (json1 !== json0) {
          record(deck, si, el, "roundtrip-data", { before: json0.slice(0, 300), after: json1.slice(0, 300) });
          await store(() => window.__deckStore.temporal.getState().undo()); await settle(60);
          if ((await elementJson(el.id)) !== json0) record(deck, si, el, "roundtrip-undo", "undo で元に戻らない");
        } else {
          if (!moving && d.count > TEXT_ALLOWED) record(deck, si, el, "roundtrip-look", d, [base, s]);
          // 何も変えていない確定で、元に戻す履歴が増えないか（増えると保存も走る）
          const steps = await store(() => window.__deckStore.temporal.getState().pastStates.length);
          if (steps !== pastBefore) {
            record(deck, si, el, "roundtrip-history", `変更なしの確定で元に戻す履歴が ${steps - pastBefore} 増えた`);
            await store(() => window.__deckStore.temporal.getState().undo()); await settle(40);
          }
        }
      }
      if (ONLY.includes("fit") && el.type === "text") {
        await store((id) => window.__deckStore.getState().select([id]), el.id); await settle(60);
        const btn = page.getByRole("button", { name: "枠を内容に合わせる", exact: true });
        if (await btn.count() && await btn.isEnabled()) {
          const json0 = await elementJson(el.id);
          await btn.click(); await settle(80);
          const m = await textFit(el.id);
          if (m.badge) record(deck, si, el, "fit-overflow", { ...m, note: "合わせた直後に「はみ出しています」が出る" });
          else if (m.h - m.content > 6) record(deck, si, el, "fit-slack", m);
          if ((await elementJson(el.id)) !== json0) { await store(() => window.__deckStore.temporal.getState().undo()); await settle(40); }
        }
        await store(() => window.__deckStore.getState().select([])); await settle();
      }
    }
  }
  if (ONLY.includes("present")) await checkPresentation(deck, nSlides);
  console.log(`${deck}: ${nSlides} slides, ${findings.length - before} findings`);
}

async function layout(selector) {
  return page.evaluate((selector) => {
    const slide = document.querySelector(selector);
    const sr = slide.getBoundingClientRect(), scale = sr.width / slide.offsetWidth; // offsetWidth = 論理キャンバスの幅(スライド 1280、ノート 768)
    const n = (r) => [r.left - sr.left, r.top - sr.top, r.width, r.height].map((v) => Math.round((v / scale) * 10) / 10);
    return [...slide.querySelectorAll(":scope > [data-id]")].map((el) => ({
      id: el.dataset.id, rect: n(el.getBoundingClientRect()),
      lines: [...el.querySelectorAll("[data-run]")].map((r) => [...r.getClientRects()].map(n)),
    }));
  }, selector);
}
async function checkPresentation(deck, nSlides) {
  const edit = [];
  for (let i = 0; i < nSlides; i++) {
    await store((i) => { const s = window.__deckStore.getState(); s.select([]); s.setCurrent(i); }, i); await settle(120);
    edit.push(await layout(".fit-inner .slide"));
  }
  await store(() => window.__deckStore.getState().setCurrent(0)); await settle();
  // ノートは「読む」の単ページで、スライドはプレゼンで比べる
  const note = await page.evaluate(() => window.__deckStore.getState().deck.format === "note");
  await page.getByRole("button", { name: note ? /^読む$/ : /プレゼン開始/ }).click();
  if (note) await page.getByRole("button", { name: "単ページ" }).click();
  await page.waitForSelector(note ? ".reader-face .slide" : ".presentation-stage .slide");
  for (let i = 0; i < nSlides; i++) {
    await store((i) => window.__deckStore.getState().setCurrent(i), i); await settle(150);
    const pres = await layout(note ? `.reader-face[data-page="${i}"] .slide` : ".presentation-stage .slide");
    for (const e of edit[i]) {
      const p = pres.find((x) => x.id === e.id);
      const off = (a, b) => a.some((v, k) => Math.abs(v - b[k]) > 0.6);
      if (!p) { findings.push({ deck: path.basename(path.dirname(deck)), slide: i + 1, id: e.id, type: "", check: "present", detail: "プレゼンに無い" }); continue; }
      const lineDiff = e.lines.length !== p.lines.length || e.lines.some((l, k) => l.length !== p.lines[k].length || l.some((r, j) => off(r, p.lines[k][j])));
      if (off(e.rect, p.rect) || lineDiff) findings.push({ deck: path.basename(path.dirname(deck)), slide: i + 1, id: e.id, type: "", check: "present",
        detail: { edit: e.rect, present: p.rect, lines: lineDiff } });
    }
  }
  await page.keyboard.press("Escape"); await settle(200);
}

await browser.close();
const byCheck = {};
for (const f of findings) (byCheck[f.check] ??= []).push(f);
console.log(`\n要素 ${checked} 個を検査。違い ${findings.length} 件${pageErrors.length ? `、ページのエラー ${pageErrors.length} 件` : ""}`);
for (const [check, list] of Object.entries(byCheck)) {
  console.log(`\n## ${check}（${list.length}）`);
  for (const f of list.slice(0, 60)) console.log(`  ${f.deck} s${f.slide} ${f.id} ${f.type}  ${JSON.stringify(f.detail).slice(0, 220)}`);
  if (list.length > 60) console.log(`  …ほか ${list.length - 60} 件`);
}
if (pageErrors.length) console.log("\n## page errors\n" + pageErrors.slice(0, 10).join("\n"));
fs.writeFileSync(path.join(OUT, "findings.json"), JSON.stringify(findings, null, 1));
process.exit(findings.length || pageErrors.length ? 1 : 0);

// ---------------------------------------------------------------- 試験用デッキ（境界条件を集めたもの）
function writeFixture(file) {
  const P = (text, extra = {}) => ({ runs: [{ text }], ...extra });
  const t = (id, x, y, w, h, style, paragraphs, extra = {}) => ({ id, type: "text", x, y, w, h, style: { fontSize: 18, color: "dk1", ...style }, paragraphs, ...extra });
  const two = [P("一行目のテキスト"), P("二行目 Second line")];
  const shapes = ["rect", "roundRect", "ellipse", "triangle", "diamond", "parallelogram", "trapezoid", "pentagon", "hexagon", "star", "rightArrow", "chevron", "callout", "cylinder", "heart"];
  const deck = {
    version: 1, meta: { title: "state consistency fixture" },
    theme: { fonts: { head: "Yu Gothic", body: "Meiryo" }, colors: { lt1: "FFFFFF", lt2: "EEF2F7", dk1: "1F2933", dk2: "52606D", accent1: "087F8C", accent2: "D17720", accent3: "268464", accent4: "BC4B64", accent5: "4A6585", accent6: "725AC1" } },
    slides: [
      { id: "text", elements: [
        t("t-top", 40, 30, 280, 150, {}, two),
        t("t-middle", 340, 30, 280, 150, { valign: "middle" }, two),
        t("t-bottom", 640, 30, 280, 150, { valign: "bottom" }, two),
        t("t-rotated", 960, 40, 280, 140, { valign: "middle", align: "center" }, two, { rotation: 12, opacity: 0.7, background: "lt2" }),
        t("t-bullets", 40, 210, 380, 200, { lineHeight: 1.6, paraSpacing: 10 }, [P("箇条書き 0", { bullet: true }), P("箇条書き 1", { bullet: true, level: 1 }), P("箇条書き 2", { bullet: true, level: 2 }), P("ふつうの段落")]),
        t("t-runs", 440, 210, 380, 200, { valign: "middle" }, [{ runs: [{ text: "大きい", fontSize: 28, bold: true, color: "accent1" }, { text: "斜体", italic: true }, { text: "小さい", fontSize: 11 }] }, P("右寄せの段落", { align: "right" }), P("中央の段落", { align: "center" })]),
        { id: "t-title", type: "text", role: "title", x: 840, y: 210, w: 400, h: 70, paragraphs: [P("既定の見出し")] },
        { id: "t-caption", type: "text", role: "caption", x: 840, y: 290, w: 400, h: 40, paragraphs: [P("既定のキャプション")] },
        t("t-head-font", 840, 340, 400, 60, { font: "head", bold: true }, [P("見出し用フォント")]),
        t("t-empty", 40, 430, 380, 160, { paraSpacing: 8 }, [P("前"), P(""), P("後ろ\n"), P("")]),
        t("t-overflow", 440, 430, 380, 80, { valign: "middle" }, [P("あふれる 1"), P("あふれる 2"), P("あふれる 3"), P("あふれる 4"), P("あふれる 5")]),
        t("t-emoji", 840, 430, 400, 70, { valign: "bottom", align: "right" }, [P("絵文字😀と記号 → ∥ ≒")]),
        t("t-long", 840, 520, 400, 160, { lineHeight: 1.3 }, [P("長い文章が折り返す場合。長い文章が折り返す場合。長い文章が折り返す場合。長い文章が折り返す場合。")]),
      ] },
      { id: "shapes", elements: shapes.map((shape, i) => ({ id: `sh-${shape}`, type: "shape", shape, x: 40 + (i % 5) * 245, y: 30 + Math.floor(i / 5) * 175, w: 200, h: 130,
        fill: "lt2", line: { color: "accent4", width: 10 }, rotation: i % 3 === 2 ? 10 : 0, opacity: i % 4 === 3 ? 0.7 : undefined }))
        .concat([{ id: "sh-polygon", type: "shape", shape: "polygon", x: 40, y: 560, w: 200, h: 130, fill: "lt2", line: { color: "accent1", width: 8 }, points: [{ x: 0, y: 0 }, { x: 1, y: 0.3 }, { x: 0.6, y: 1 }, { x: 0.1, y: 0.8 }] },
          { id: "sh-thin-rect", type: "shape", shape: "rect", x: 285, y: 560, w: 200, h: 130, fill: "lt2", line: { color: "accent1", width: 1 } },
          { id: "sh-nofill", type: "shape", shape: "hexagon", x: 530, y: 560, w: 200, h: 130, fill: null, line: { color: "accent1", width: 6 }, background: "lt2" },
          { id: "sh-line", type: "shape", shape: "line", x: 775, y: 620, w: 200, h: 8, line: { color: "accent2", width: 6 }, rotation: 20 },
          { id: "sh-arrow", type: "shape", shape: "arrow", x: 1020, y: 620, w: 200, h: 8, line: { color: "accent2", width: 6 }, rotation: -15 }]) },
      { id: "tables", elements: [
        { id: "tb-basic", type: "table", x: 40, y: 40, w: 560, h: 240, header: true, fontSize: 16, colW: [1, 2, 1],
          rows: [[{ text: "見出し" }, { text: "中身" }, { text: "右" }], [{ text: "太字", bold: true }, { text: "色つき", color: "accent4" }, { text: "右寄せ", align: "right" }],
            [{ text: "塗り", fill: "accent2" }, { text: "二行の\nセル" }, { text: "中央", align: "center" }]] },
        { id: "tb-rotated", type: "table", x: 680, y: 60, w: 520, h: 200, header: false, fontSize: 14, rotation: 8, opacity: 0.8, background: "lt2",
          rows: [[{ text: "a" }, { text: "b" }], [{ text: "長い文字が入ったセル。長い文字が入ったセル。" }, { text: "d" }]] },
        { id: "tb-dense", type: "table", x: 40, y: 340, w: 1160, h: 300, fontSize: 13, colW: [0.6, 2.4, 1.2, 1.2],
          rows: Array.from({ length: 8 }, (_, r) => Array.from({ length: 4 }, (_, c) => ({ text: r === 0 ? `列 ${c + 1}` : `${r}-${c + 1} の値`, bold: c === 0 && r > 0 }))) },
      ] },
      { id: "math", elements: [
        { id: "m-basic", type: "math", x: 60, y: 60, w: 500, h: 160, latex: String.raw`\sum_{i=1}^{n} w_i x_i + b`, fontSize: 30 },
        { id: "m-rotated", type: "math", x: 660, y: 60, w: 500, h: 160, latex: String.raw`\frac{a}{b} = \sqrt{x^2+y^2}`, fontSize: 26, color: "accent4", rotation: 10, opacity: 0.8, background: "lt2" },
        { id: "m-inline", type: "math", x: 60, y: 300, w: 500, h: 100, latex: String.raw`E = mc^2`, fontSize: 24, displayMode: false },
        { id: "m-matrix", type: "math", x: 660, y: 300, w: 500, h: 200, latex: String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`, fontSize: 28 },
      ] },
    ],
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(deck, null, 1));
}
