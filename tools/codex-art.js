// decks/lumifold-codex(ノート「Lumifold の書庫」)の絵: 羊皮紙の地・革の表紙・表紙の書庫の絵・章の紋章・飾り罫。
// tools/create-codex-assets.mjs が読み込み、ART の各項目を Edge で描いて PNG / JPEG にする。座標は資料の px
const K = { gold: "#C9A227", goldL: "#F0D98A", goldD: "#8C6B1C", ink: "#2B2118", rubric: "#9E3A22", paper: "#F3E8CE" };
const svg = (w, h, inner, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${inner}</svg>`;
// 金箔: 斜めに明暗が流れるグラデーション(userSpaceOnUse にしないと水平な線で消える)
const goldDef = (id, x1, y1, x2, y2) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
  <stop offset="0" stop-color="#8C6B1C"/><stop offset=".22" stop-color="#E9CF78"/><stop offset=".42" stop-color="#B8902A"/>
  <stop offset=".62" stop-color="#F3DD92"/><stop offset=".82" stop-color="#A7811F"/><stop offset="1" stop-color="#E2C467"/></linearGradient>`;
// 乱数(毎回同じ絵になるように種から)
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const f1 = (v) => Math.round(v * 10) / 10;
const poly = (pts) => pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ");

// ------------------------------------------------------------ 角の飾り(左上向き。原点が枠の角)
function cornerCurl(s = 1) {
  return `<path d="M0,-5 L5,0 L0,5 L-5,0 Z" transform="scale(${s})" stroke="none" fill="currentColor"/>`
    + `<path transform="scale(${s})" d="M9,0 C21,0 26,8 20,13 C15,17 10,11 15,8 M0,9 C0,21 8,26 13,20 C17,15 11,10 8,15 M13,13 L19,19"/>`;
}
const corners = (w, h, inset, inner) => [[inset, inset, 1, 1], [w - inset, inset, -1, 1], [inset, h - inset, 1, -1], [w - inset, h - inset, -1, -1]]
  .map(([x, y, sx, sy]) => `<g transform="translate(${x} ${y}) scale(${sx} ${sy})">${inner}</g>`).join("");

// ------------------------------------------------------------ 羊皮紙(ページの地)
function parchment(w, h, { frame = true, seed = 3 } = {}) {
  const defs = `
  <radialGradient id="base" cx="50%" cy="44%" r="78%"><stop offset="0" stop-color="#F6EDD6"/><stop offset=".6" stop-color="#EFE2C3"/><stop offset="1" stop-color="#DDC69A"/></radialGradient>
  <radialGradient id="vig" cx="50%" cy="48%" r="72%"><stop offset=".62" stop-color="#6E4520" stop-opacity="0"/><stop offset="1" stop-color="#6E4520" stop-opacity=".34"/></radialGradient>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" seed="${seed}"/>
    <feColorMatrix values="0 0 0 0 .40  0 0 0 0 .28  0 0 0 0 .14  .55 0 0 0 -.2"/></filter>
  <filter id="fiber" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".02 .11" numOctaves="3" seed="${seed + 4}"/>
    <feColorMatrix values="0 0 0 0 .48  0 0 0 0 .34  0 0 0 0 .18  .9 0 0 0 -.42"/></filter>
  <filter id="stain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".0045" numOctaves="4" seed="${seed + 9}"/>
    <feColorMatrix values="0 0 0 0 .55  0 0 0 0 .38  0 0 0 0 .18  1.6 0 0 0 -.86"/></filter>`;
  const fr = frame ? `<g fill="none" stroke="#9A7A44" stroke-opacity=".7" color="#9A7A44">
    <rect x="22" y="22" width="${w - 44}" height="${h - 44}" stroke-width="1.3"/>
    <rect x="27.5" y="27.5" width="${w - 55}" height="${h - 55}" stroke-width=".6"/>
    <g stroke-width="1.1">${corners(w, h, 22, cornerCurl(0.95))}</g></g>` : "";
  return svg(w, h, `<rect width="${w}" height="${h}" fill="url(#base)"/>
    <rect width="${w}" height="${h}" filter="url(#stain)" opacity=".5"/>
    <rect width="${w}" height="${h}" filter="url(#fiber)" opacity=".16"/>
    <rect width="${w}" height="${h}" filter="url(#grain)" opacity=".55"/>
    <rect width="${w}" height="${h}" fill="url(#vig)"/>${fr}`, defs);
}

// ------------------------------------------------------------ 革の表紙(表紙・章の扉・裏表紙の地)。金の型押しの枠
function leather(w, h, { seed = 11 } = {}) {
  const defs = goldDef("gold", 0, 0, w, h) + `
  <radialGradient id="lbase" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="#5A3020"/><stop offset=".55" stop-color="#3E2015"/><stop offset="1" stop-color="#22110A"/></radialGradient>
  <filter id="pebble" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".42" numOctaves="3" seed="${seed}" result="n"/>
    <feDiffuseLighting in="n" surfaceScale="2.4" diffuseConstant="1.15" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="52"/></feDiffuseLighting>
    <feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.18" k2="0" k3="0" k4="0"/></filter>
  <filter id="mottle" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".006" numOctaves="3" seed="${seed + 5}"/>
    <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.4 0 0 0 -.62"/></filter>`;
  const curl = (s) => `<path d="M0,-6 L6,0 L0,6 L-6,0 Z" transform="scale(${s})" fill="url(#gold)" stroke="none"/>`
    + `<path transform="scale(${s})" d="M10,0 C26,0 33,10 26,17 C20,22 13,15 19,10 M0,10 C0,26 10,33 17,26 C22,20 15,13 10,19 M17,17 L27,27 M27,27 C33,30 36,36 32,40 M27,27 C30,33 36,36 40,32"/>`;
  const mid = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M-14,0 L0,-6 L14,0 L0,6 Z" fill="url(#gold)" stroke="none"/><circle cx="-22" cy="0" r="2.2" fill="url(#gold)" stroke="none"/><circle cx="22" cy="0" r="2.2" fill="url(#gold)" stroke="none"/></g>`;
  return svg(w, h, `<rect width="${w}" height="${h}" fill="url(#lbase)" filter="url(#pebble)"/>
    <rect width="${w}" height="${h}" filter="url(#mottle)" opacity=".35"/>
    <g fill="none">
      <rect x="54" y="54" width="${w - 108}" height="${h - 108}" stroke="#000" stroke-opacity=".45" stroke-width="2"/>
      <rect x="55.5" y="55.5" width="${w - 111}" height="${h - 111}" stroke="#FFD9A0" stroke-opacity=".07" stroke-width="1"/>
      <rect x="30" y="30" width="${w - 60}" height="${h - 60}" stroke="url(#gold)" stroke-width="2.6"/>
      <rect x="38" y="38" width="${w - 76}" height="${h - 76}" stroke="url(#gold)" stroke-width="1"/>
      <g stroke="url(#gold)" stroke-width="1.6">${corners(w, h, 38, curl(1.25))}</g>
      ${mid(w / 2, 34, 0)}${mid(w / 2, h - 34, 0)}${mid(34, h / 2, 90)}${mid(w - 34, h / 2, 90)}
    </g>`, defs);
}

// ------------------------------------------------------------ 表紙の絵: アーチの奥へ続く書庫と、光る開いた本
function coverArt() {
  const W = 640, H = 460, VX = 320, VY = 250;
  const r = rng(7);
  const defs = goldDef("g", 0, 0, W, H) + `
  <clipPath id="arch"><path d="M34 460 V212 A286 192 0 0 1 606 212 V460 Z"/></clipPath>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E0805"/><stop offset=".6" stop-color="#21130B"/><stop offset="1" stop-color="#2E1A0E"/></linearGradient>
  <radialGradient id="glow" cx="320" cy="338" r="300" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFD58A" stop-opacity=".85"/><stop offset=".18" stop-color="#E9A84E" stop-opacity=".45"/><stop offset=".55" stop-color="#8A4F1E" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <radialGradient id="rose" cx="320" cy="196" r="40" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFF1C8" stop-opacity=".95"/><stop offset=".7" stop-color="#E7B860" stop-opacity=".55"/><stop offset="1" stop-color="#A06A28" stop-opacity=".2"/></radialGradient>
  <linearGradient id="ray" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFE3A6" stop-opacity=".55"/><stop offset="1" stop-color="#FFE3A6" stop-opacity="0"/></linearGradient>
  <radialGradient id="page" cx="50%" cy="80%" r="80%"><stop offset="0" stop-color="#FFFBEA"/><stop offset="1" stop-color="#EBCB86"/></radialGradient>
  <filter id="soft"><feGaussianBlur stdDeviation="1.2"/></filter>`;
  let s = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  // 天井のリブ(アーチを消失点へ向けて縮める)
  for (const k of [0.82, 0.66, 0.53, 0.42, 0.34]) {
    s += `<path d="M34 460 V212 A286 192 0 0 1 606 212 V460" fill="none" stroke="url(#g)" stroke-opacity="${0.12 + 0.1 * (1 - k)}" stroke-width="${1.6 * k + 0.4}" transform="translate(${VX * (1 - k)} ${VY * (1 - k)}) scale(${k})"/>`;
  }
  // 奥の壁とばら窓
  s += `<rect x="250" y="150" width="140" height="146" fill="#1A0F08"/>`;
  s += `<circle cx="320" cy="196" r="36" fill="url(#rose)"/>`;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    s += `<line x1="320" y1="196" x2="${f1(320 + 36 * Math.cos(a))}" y2="${f1(196 + 36 * Math.sin(a))}" stroke="#6B421A" stroke-width="1.6" stroke-opacity=".8"/>`;
  }
  s += `<circle cx="320" cy="196" r="36" fill="none" stroke="url(#g)" stroke-width="2"/><circle cx="320" cy="196" r="12" fill="none" stroke="#6B421A" stroke-width="1.6"/>`;
  // 床の石畳(消失点へ集まる線と、奥ほど詰まる横線)
  let floor = "";
  for (let i = -10; i <= 10; i++) floor += `<line x1="${VX + i * 70}" y1="460" x2="${VX + i * 7}" y2="296" />`;
  for (let j = 1; j <= 7; j++) { const t = Math.pow(j / 7, 1.7); const y = 296 + (460 - 296) * t; floor += `<line x1="0" y1="${f1(y)}" x2="${W}" y2="${f1(y)}"/>`; }
  s += `<path d="M0 460 L250 296 H390 L640 460 Z" fill="#24150C"/><g stroke="url(#g)" stroke-opacity=".16" stroke-width=".8">${floor}</g>`;
  // 左右の本棚(遠近法。x(t) = VX - 280/(1+3t))
  const PAL = ["#6B2318", "#7A3B1E", "#2C5A55", "#2A3D66", "#8A6A2A", "#4A3222", "#4E5A2A", "#5E2A3A", "#9A5A2A"];
  const shade = (hex, k) => { const v = parseInt(hex.slice(1), 16); const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => Math.min(255, Math.round(x * k))); return `rgb(${c.join(",")})`; };
  const X = (t) => VX - 280 / (1 + 3 * t);
  const Y = (x, yNear) => VY + (yNear - VY) * (x - VX) / (40 - VX);
  const rows = [100, 166, 232, 298, 364, 430];
  let shelves = "";
  for (const side of [1, -1]) {
    const mx = (x) => (side === 1 ? x : W - x);
    // 棚の奥の暗がり
    shelves += `<polygon points="${poly([[mx(40), Y(40, 92)], [mx(250), Y(250, 92)], [mx(250), Y(250, 438)], [mx(40), Y(40, 438)]])}" fill="#120A06"/>`;
    for (let ri = 0; ri < rows.length - 1; ri++) {
      const top = rows[ri], bot = rows[ri + 1] - 6;
      let t = 0;
      while (t < 1) {
        const dt = 0.012 + r() * 0.022;
        const t2 = Math.min(1, t + dt);
        const xa = X(t), xb = X(t2);
        const hgt = (0.62 + r() * 0.33) * (bot - top);
        const lean = r() < 0.06;
        const col = PAL[Math.floor(r() * PAL.length)];
        const k = 0.42 + 0.75 * t;
        const ya1 = Y(xa, bot - hgt), yb1 = Y(xb, bot - hgt - (lean ? 8 : 0)), ya2 = Y(xa, bot), yb2 = Y(xb, bot);
        shelves += `<polygon points="${poly([[mx(xa), ya1], [mx(xb), yb1], [mx(xb), yb2], [mx(xa), ya2]])}" fill="${shade(col, k)}" stroke="#0A0503" stroke-width=".5"/>`;
        if (xa - xb < -3.2 && r() < 0.7) {
          for (const f of [0.16, 0.84]) {
            const yy = bot - hgt * (1 - f);
            shelves += `<line x1="${f1(mx(xa))}" y1="${f1(Y(xa, yy))}" x2="${f1(mx(xb))}" y2="${f1(Y(xb, yy))}" stroke="url(#g)" stroke-opacity="${0.35 + 0.4 * t}" stroke-width="${f1(0.6 + 0.9 * (1 - t))}"/>`;
          }
        }
        t = t2 + (r() < 0.08 ? 0.02 : 0.002);
      }
      // 棚板
      shelves += `<polygon points="${poly([[mx(40), rows[ri + 1] - 6], [mx(250), Y(250, rows[ri + 1] - 6)], [mx(250), Y(250, rows[ri + 1])], [mx(40), rows[ri + 1]]])}" fill="#3A2416" stroke="url(#g)" stroke-opacity=".35" stroke-width=".7"/>`;
    }
    // 棚の手前の柱
    shelves += `<rect x="${side === 1 ? 26 : W - 42}" y="80" width="16" height="380" fill="#2A180D" stroke="url(#g)" stroke-opacity=".55" stroke-width="1"/>`;
  }
  s += shelves;
  // 光(書見台の本から)
  s += `<rect width="${W}" height="${H}" fill="url(#glow)"/>`;
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.16 + (r() - 0.5) * 0.05, len = 190 + r() * 90, wd = 0.035 + r() * 0.03;
    const p1 = [320 + len * Math.cos(a - wd), 336 + len * Math.sin(a - wd)], p2 = [320 + len * Math.cos(a + wd), 336 + len * Math.sin(a + wd)];
    s += `<polygon points="${poly([[320, 336], p1, p2])}" fill="url(#ray)" opacity="${f1(0.35 + r() * 0.4)}"/>`;
  }
  // 書見台
  s += `<polygon points="296,460 344,460 336,384 304,384" fill="#2C1A0E" stroke="url(#g)" stroke-width="1.4"/>`;
  s += `<rect x="286" y="436" width="68" height="10" fill="#3A2416" stroke="url(#g)" stroke-width="1"/>`;
  s += `<polygon points="262,382 378,382 366,356 274,356" fill="#3A2416" stroke="url(#g)" stroke-width="1.4"/>`;
  // 開いた本(ページが少し持ち上がって、1 枚めくれかけている)
  s += `<path d="M320 356 C300 346 282 344 266 348 L272 362 C288 358 304 360 320 366 Z" fill="url(#page)" stroke="#A47A2C" stroke-width=".9"/>`;
  s += `<path d="M320 356 C340 346 358 344 374 348 L368 362 C352 358 336 360 320 366 Z" fill="url(#page)" stroke="#A47A2C" stroke-width=".9"/>`;
  s += `<path d="M320 356 C330 334 344 324 360 322 C352 334 344 346 336 357 C330 356 325 356 320 356 Z" fill="#FFF6DA" stroke="#C8A050" stroke-width=".8" opacity=".95"/>`;
  for (let i = 0; i < 4; i++) s += `<path d="M${276 + i * 2} ${351 + i * 2.6} C${290} ${348 + i * 2.6} ${304} ${350 + i * 2.6} 316 ${355 + i * 2.6}" fill="none" stroke="#B89656" stroke-width=".5"/>`;
  s += `<ellipse cx="320" cy="350" rx="70" ry="26" fill="#FFE9B0" opacity=".28" filter="url(#soft)"/>`;
  // 塵(光の中を漂う)
  for (let i = 0; i < 90; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 1.4, d = 20 + r() * 260;
    const x = 320 + d * Math.cos(a), y = 336 + d * Math.sin(a);
    s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(0.5 + r() * 1.5)}" fill="#FFE7B0" opacity="${f1(0.15 + r() * 0.6 * (1 - d / 300))}"/>`;
  }
  const body = `<g clip-path="url(#arch)">${s}</g>`
    + `<path d="M34 460 V212 A286 192 0 0 1 606 212 V460" fill="none" stroke="url(#g)" stroke-width="3"/>`
    + `<path d="M46 460 V214 A274 180 0 0 1 594 214 V460" fill="none" stroke="url(#g)" stroke-width="1.1"/>`
    + `<path d="M306 12 L334 12 L328 40 L312 40 Z" fill="#2A180D" stroke="url(#g)" stroke-width="1.6"/>`
    + `<circle cx="320" cy="25" r="4" fill="url(#g)"/>`;
  return svg(W, H, body, defs);
}

// ------------------------------------------------------------ 章の紋章(金の輪の中に道具の線画)
function emblem(inner, { w = 320, h = 230 } = {}) {
  const cx = w / 2, cy = h / 2, R = 100;
  const defs = goldDef("eg", cx - R, cy - R, cx + R, cy + R);
  let dots = "";
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; dots += `<circle cx="${f1(cx + (R - 8) * Math.cos(a))}" cy="${f1(cy + (R - 8) * Math.sin(a))}" r="${i % 3 === 0 ? 2.4 : 1.2}"/>`; }
  return svg(w, h, `<g fill="url(#eg)" stroke="none">${dots}</g>
    <g fill="none" stroke="url(#eg)"><circle cx="${cx}" cy="${cy}" r="${R}" stroke-width="2.6"/><circle cx="${cx}" cy="${cy}" r="${R - 16}" stroke-width="1"/></g>
    <g transform="translate(${cx} ${cy})" fill="none" stroke="url(#eg)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`, defs);
}
const goldFill = (op = 0.35) => `fill="url(#eg)" fill-opacity="${op}"`;
// 羽ペン(先が原点、上へ伸びる)
function quill(len = 120, wide = 18) {
  let barbs = "";
  for (let i = 0; i < 9; i++) { const y = -len * (0.28 + i * 0.075); barbs += `<path d="M0 ${f1(y)} L${f1(-wide * 0.9 * (1 - i * 0.05))} ${f1(y - 10)}" stroke-width="1"/><path d="M0 ${f1(y)} L${f1(wide * 0.75 * (1 - i * 0.06))} ${f1(y - 12)}" stroke-width="1"/>`; }
  return `<path d="M0 0 C${-wide} ${-len * 0.35} ${-wide * 1.1} ${-len * 0.8} 0 ${-len} C${wide * 0.9} ${-len * 0.78} ${wide * 0.8} ${-len * 0.36} 0 0 Z" ${goldFill(0.18)}/>`
    + `<path d="M0 6 L0 ${-len + 6}" stroke-width="1.6"/>${barbs}<path d="M-3 4 L0 14 L3 4" stroke-width="1.6"/>`;
}
const EMBLEMS = {
  // 巻一 設計の約束: 羅針盤
  "emblem-1": () => {
    let st = "";
    for (let i = 0; i < 8; i++) {
      const long = i % 2 === 0, L = long ? 66 : 38, a = (i / 8) * Math.PI * 2 - Math.PI / 2, b = 9;
      const tip = [L * Math.cos(a), L * Math.sin(a)], l = [b * Math.cos(a - Math.PI / 2), b * Math.sin(a - Math.PI / 2)], rr = [b * Math.cos(a + Math.PI / 2), b * Math.sin(a + Math.PI / 2)];
      st += `<polygon points="${poly([[0, 0], l, tip])}" ${goldFill(long ? 0.9 : 0.5)} stroke-width="1.4"/><polygon points="${poly([[0, 0], rr, tip])}" stroke-width="1.4"/>`;
    }
    return st + `<circle r="14" stroke-width="2"/><circle r="4" fill="url(#eg)"/><circle r="50" stroke-width="1" stroke-dasharray="2 5"/>`
      + `<text x="0" y="-72" text-anchor="middle" font-family="Georgia, serif" font-size="14" font-weight="700" fill="url(#eg)" stroke="none">N</text>`;
  },
  // 巻二 道具を選ぶ: 鍵と羽ペン
  "emblem-2": () => {
    const key = `<g transform="rotate(-45)"><circle cx="0" cy="-52" r="15"/><circle cx="0" cy="-52" r="6"/><path d="M0 -37 L0 58"/><path d="M0 34 H14 V42 H6 V48 H14 V58 H0"/><path d="M-6 -30 H6 M-6 -24 H6" stroke-width="1.4"/></g>`;
    return key + `<g transform="rotate(42) translate(0 62)">${quill(128, 17)}</g>`;
  },
  // 巻三 二つの世界をつなぐ: 石橋と 2 つの塔
  "emblem-3": () => {
    let vous = "";
    for (let i = 1; i < 10; i++) { const a = Math.PI + (i / 10) * Math.PI; vous += `<path d="M${f1(46 * Math.cos(a))} ${f1(20 + 34 * Math.sin(a))} L${f1(56 * Math.cos(a))} ${f1(20 + 44 * Math.sin(a))}" stroke-width="1.3"/>`; }
    const tower = (x) => `<path d="M${x - 14} 34 V-34 H${x - 9} V-41 H${x - 3} V-34 H${x + 3} V-41 H${x + 9} V-34 H${x + 14} V34" ${goldFill(0.14)}/><path d="M${x - 4} -14 V-22 A4 4 0 0 1 ${x + 4} -22 V-14 Z" stroke-width="1.4"/>`;
    return tower(-64) + tower(64) + `<path d="M-50 -14 H50" stroke-width="2.4"/><path d="M-50 -4 H50" stroke-width="1.2"/>`
      + `<path d="M-50 34 V20 A46 34 0 0 1 46 20 V34" /><path d="M-50 20 A56 44 0 0 1 56 20" stroke-width="1.2" transform="translate(-3 0)"/>${vous}`
      + `<path d="M-80 46 C-60 40 -40 52 -20 46 C0 40 20 52 40 46 C60 40 80 52 90 46" stroke-width="1.3"/><path d="M-66 58 C-46 52 -26 64 -6 58 C14 52 34 64 54 58 C64 55 70 58 74 58" stroke-width="1"/>`;
  },
  // 巻四 紙面を描く: インク壺と羽ペン
  "emblem-4": () => `<path d="M-34 52 C-40 52 -42 48 -42 42 L-38 10 C-37 4 -30 0 -22 0 H22 C30 0 37 4 38 10 L42 42 C42 48 40 52 34 52 Z" ${goldFill(0.22)}/>`
    + `<path d="M-14 0 V-10 H14 V0" /><path d="M-18 -10 H18" stroke-width="2.8"/><path d="M-30 30 H30" stroke-width="1.2"/><path d="M-26 40 H26" stroke-width="1"/>`
    + `<g transform="translate(2 4) rotate(24)">${quill(92, 16)}</g>`,
  // 巻五 手で直す: ディバイダーと三角定規
  "emblem-5": () => {
    let ticks = "";
    for (let i = 0; i <= 10; i++) ticks += `<path d="M${-56 + i * 9} 46 V${i % 5 === 0 ? 36 : 41}" stroke-width="1.1"/>`;
    return `<path d="M-60 50 L56 50 L-60 -48 Z" ${goldFill(0.12)} stroke-width="1.8"/><path d="M-44 36 L22 36 L-44 -20 Z" stroke-width="1.2"/>${ticks}`
      + `<circle cx="18" cy="-56" r="8"/><path d="M18 -64 V-74" /><path d="M13 -50 L-12 50 M23 -50 L52 50" stroke-width="2.6"/><path d="M-12 50 L-14 58 M52 50 L55 58" stroke-width="1.6"/>`
      + `<path d="M0 0 A40 40 0 0 0 36 0" stroke-width="1.2" stroke-dasharray="3 4" transform="translate(2 8)"/>`;
  },
  // 巻六 本として読む: めくれかけた開いた本
  "emblem-6": () => `<path d="M0 34 C-22 22 -50 20 -72 26 L-72 -30 C-50 -36 -22 -34 0 -22 Z" ${goldFill(0.14)}/>`
    + `<path d="M0 34 C22 22 50 20 72 26 L72 -30 C50 -36 22 -34 0 -22 Z" ${goldFill(0.14)}/>`
    + `<path d="M0 -22 C10 -48 30 -62 54 -64 C44 -44 34 -24 24 0 C16 -10 8 -16 0 -22 Z" ${goldFill(0.32)} stroke-width="1.8"/>`
    + [-60, -50, -40, -30, -20].map((x, i) => `<path d="M${x} ${-24 + i * 1.2} C${x + 14} ${-26 + i} ${x + 22} ${-22 + i} ${x + 28} ${-18 + i * 1.5}" stroke-width="1"/>`).join("")
    + [-58, -48, -38, -28, -18].map((x, i) => `<path d="M${x} ${-4 + i * 1.2} C${x + 14} ${-6 + i} ${x + 22} ${-2 + i} ${x + 28} ${2 + i * 1.5}" stroke-width="1"/>`).join("")
    + `<path d="M0 34 V44 M-72 26 V34 C-50 28 -22 30 0 44 C22 30 50 28 72 34 V26" stroke-width="1.6"/>`,
  // 巻七 外へ渡す・確かめる: 封蝋の手紙
  "emblem-7": () => `<rect x="-70" y="-42" width="140" height="88" rx="4" ${goldFill(0.12)}/><path d="M-70 -42 L0 10 L70 -42" /><path d="M-70 46 L-18 -2 M70 46 L18 -2" stroke-width="1.4"/>`
    + `<path d="M0 10 m-22 0 a22 22 0 1 0 44 0 a22 22 0 1 0 -44 0" fill="#7A2414" stroke-width="2"/>`
    + `<path d="M-14 26 C-16 34 -10 36 -9 30 M12 28 C14 36 20 34 17 27" fill="#7A2414" stroke-width="1.4"/>`
    + `<text x="0" y="17" text-anchor="middle" font-family="Georgia, serif" font-size="22" font-weight="700" fill="url(#eg)" stroke="none">L</text>`
    + `<circle r="16" cy="10" stroke-width="1" stroke-dasharray="1.5 3"/>`,
  // 裏表紙: Lumifold の印(折れた紙と L)
  "emblem-seal": () => `<path d="M-40 -56 H24 L48 -32 V56 H-40 Z" ${goldFill(0.12)}/><path d="M24 -56 V-32 H48" ${goldFill(0.45)}/>`
    + `<text x="2" y="30" text-anchor="middle" font-family="Georgia, serif" font-size="80" font-weight="700" fill="url(#eg)" stroke="none">L</text>`
    + `<path d="M-28 44 H36" stroke-width="1.2"/>`,
};

// ------------------------------------------------------------ 見出しの下の飾り(❦ のような左右対称の唐草)
function fleuron() {
  const w = 64, h = 20, c = "#A8832A";
  const leaf = (sx) => `<g transform="translate(32 10) scale(${sx} 1)"><path d="M6 0 C12 -8 22 -8 26 -2 C20 -2 14 0 6 0 Z M6 0 C12 8 22 8 26 2 C20 2 14 0 6 0 Z" fill="${c}"/><circle cx="30" cy="0" r="1.6" fill="${c}"/></g>`;
  return svg(w, h, `<path d="M32 3 L38 10 L32 17 L26 10 Z" fill="${c}"/>${leaf(1)}${leaf(-1)}`);
}

const ART = {
  parchment: { w: 768, h: 1024, scale: 1.5, type: "jpeg", svg: () => parchment(768, 1024) },
  leather: { w: 768, h: 1024, scale: 1.5, type: "jpeg", svg: () => leather(768, 1024) },
  "cover-art": { w: 640, h: 460, scale: 2, svg: coverArt },
  fleuron: { w: 64, h: 20, scale: 3, svg: fleuron },
};
for (const [name, fn] of Object.entries(EMBLEMS)) ART[name] = { w: 320, h: 230, scale: 2, svg: () => emblem(fn()) };
