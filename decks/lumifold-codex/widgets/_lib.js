// lumifold-codex のウィジェット共通: 要素の取得、切り替えボタン、乱数、状態の保存と復元(deck-studio:widget-state / widget-restore)
const $ = (id) => document.getElementById(id);
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reducedMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
function segment(el, onPick) {
  el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { setSeg(el, b.dataset.v); onPick(b.dataset.v); }));
}
function setSeg(el, v) { el.querySelectorAll("button").forEach((b) => { const on = b.dataset.v === String(v); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }); }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let publishing = false;
function publish(state) { if (publishing && parent !== window) parent.postMessage({ type: "deck-studio:widget-state", state }, "*"); }
function onRestore(fn) {
  window.addEventListener("message", (e) => {
    if (e.source !== parent || e.data?.type !== "deck-studio:widget-restore" || !e.data.state) return;
    const p = publishing; publishing = false; fn(e.data.state); publishing = p;
  });
}
function ready() { publishing = true; if (parent !== window) parent.postMessage({ type: "deck-studio:widget-ready" }, "*"); }
