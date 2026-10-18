// lumifold-codex の 3D ウィジェット共通(three.js): 描画器、大きさの追従、ドラッグとクリックの区別、文字の絵
function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  return renderer;
}
function watchSize(canvas, renderer, camera, after) {
  const fit = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); after?.(w, h);
  };
  new ResizeObserver(fit).observe(canvas); fit();
}
// ドラッグ(見回す)とクリック(選ぶ)を分ける。押してから 5px 以上動いたらドラッグ
function pointerControls(el, { drag, click, hover, wheel, down }) {
  let start = null, last = null, moved = false;
  el.addEventListener("pointerdown", (e) => { start = last = [e.clientX, e.clientY]; moved = false; el.setPointerCapture?.(e.pointerId); down?.(e); });
  el.addEventListener("pointermove", (e) => {
    if (!start) { hover?.(e); return; }
    if (Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5) { if (!moved) el.classList.add("grabbing"); moved = true; }
    if (moved) drag?.(e.clientX - last[0], e.clientY - last[1], e);
    last = [e.clientX, e.clientY];
  });
  const end = (e) => { if (!start) return; const wasDrag = moved; start = null; moved = false; el.classList.remove("grabbing"); if (!wasDrag && e.type === "pointerup") click?.(e); };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  el.addEventListener("pointerleave", () => { if (!start) hover?.(null); });
  if (wheel) el.addEventListener("wheel", (e) => { e.preventDefault(); wheel(e.deltaY, e); }, { passive: false });
}
function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function ndc(e, el) { const r = el.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
// 3D の点 → iframe の中の画面座標(テストと札の位置合わせに使う)
function toScreen(v, camera, el) { const p = v.clone().project(camera); const r = el.getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height, front: p.z < 1 }; }
// 古い紙の地(ノイズ入り)を塗る
function paperFill(g, w, h, base = "#F1E4C6", seed = 1) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < w * h / 90; i++) { g.fillStyle = `rgba(110,75,35,${(r() * 0.06).toFixed(3)})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, "rgba(110,70,30,0)"); v.addColorStop(1, "rgba(110,70,30,.28)"); g.fillStyle = v; g.fillRect(0, 0, w, h);
}
