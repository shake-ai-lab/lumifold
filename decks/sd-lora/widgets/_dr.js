// sd-lora のウィジェット共通: 乱数、SD 1.5 と cosine のノイズスケジュール、canvas の解像度合わせ、状態の保存と復元
const $ = (id) => document.getElementById(id);
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { const u = Math.max(r(), 1e-12), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const T = 1000;
// SD 1.5: scaled linear（β の平方根を 0.00085→0.012 で線形に並べて 2 乗）
const ABAR_SD = (() => { const a = []; let p = 1; const b0 = Math.sqrt(0.00085), b1 = Math.sqrt(0.012); for (let i = 0; i < T; i++) { const b = (b0 + (b1 - b0) * i / (T - 1)) ** 2; p *= 1 - b; a.push(p); } return a; })();
// cosine（Nichol & Dhariwal 2021、s = 0.008、β ≤ 0.999）
const ABAR_COS = (() => { const f = (t) => Math.cos((t / T + 0.008) / 1.008 * Math.PI / 2) ** 2; const a = []; let p = 1; for (let i = 0; i < T; i++) { p *= 1 - Math.min(1 - f(i + 1) / f(i), 0.999); a.push(p); } return a; })();
function fitCanvas(c) {
  const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext("2d"); g.setTransform(d, 0, 0, d, 0, 0);
  return { g, w: r.width, h: r.height };
}
const fmt = (v, n = 0) => v.toLocaleString("en-US", { minimumFractionDigits: n, maximumFractionDigits: n });
function segment(el, onPick) {
  el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { setSeg(el, b.dataset.v); onPick(b.dataset.v); }));
}
function setSeg(el, v) { el.querySelectorAll("button").forEach((b) => { const on = b.dataset.v === String(v); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }); }
// アプリに状態を預け、読み直したときに戻す（deck-studio:widget-state / widget-restore）
let publishing = false;
function publish(state) { if (publishing && parent !== window) parent.postMessage({ type: "deck-studio:widget-state", state }, "*"); }
function onRestore(fn) {
  window.addEventListener("message", (e) => {
    if (e.source !== parent || e.data?.type !== "deck-studio:widget-restore" || !e.data.state) return;
    const p = publishing; publishing = false; fn(e.data.state); publishing = p;
  });
}
function ready() { publishing = true; if (parent !== window) parent.postMessage({ type: "deck-studio:widget-ready" }, "*"); }
