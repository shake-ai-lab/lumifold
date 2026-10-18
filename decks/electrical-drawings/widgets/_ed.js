// electrical-drawings のウィジェット共通: 要素の取得、切り替えボタン、乱数、状態の保存と復元(deck-studio:widget-state / widget-restore)
const $ = (id) => document.getElementById(id);
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function segment(el, onPick) {
  el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { setSeg(el, b.dataset.v); onPick(b.dataset.v); }));
}
function setSeg(el, v) { el.querySelectorAll("button").forEach((b) => { const on = b.dataset.v === String(v); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }); }
// 押している間だけ ON になるボタン(マウス・タッチ・Space / Enter)
function momentary(el, onChange) {
  let down = false;
  const set = (v) => { if (down === v) return; down = v; el.classList.toggle("down", v); el.setAttribute("aria-pressed", String(v)); onChange(v); };
  el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); set(true); });
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(t, () => set(false));
  el.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); set(true); } });
  el.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); set(false); } });
  el.addEventListener("blur", () => set(false));
  return { set, get: () => down };
}
let publishing = false;
function publish(state) { if (publishing && parent !== window) parent.postMessage({ type: "deck-studio:widget-state", state }, "*"); }
function onRestore(fn) {
  window.addEventListener("message", (e) => {
    if (e.source !== parent || e.data?.type !== "deck-studio:widget-restore" || !e.data.state) return;
    const p = publishing; publishing = false; fn(e.data.state); publishing = p;
  });
}
function ready() { publishing = true; if (parent !== window) parent.postMessage({ type: "deck-studio:widget-ready" }, "*"); }
