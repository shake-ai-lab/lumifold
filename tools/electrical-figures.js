// decks/electrical-drawings の図版(ブラウザで動く)。SYM(widgets/_sym.js)を使って SVG を作る。
// tools/create-electrical-assets.mjs が読み込み、FIGS の各項目を PNG にする。座標は資料の px(幅 640 の図は資料でも幅 640)
const K = { ink: "#1E2733", blue: "#1E6BB8", red: "#D9480F", amber: "#F2B705", amberD: "#B98900", green: "#2F8F5B", sub: "#5B6676", mute: "#8A94A3",
  light: "#EDF2F7", line: "#C9D3DE", paper: "#FCFBF7", navy: "#17375E", white: "#FFFFFF", violet: "#8A5CC2" };
const S = SYM, Wr = S.wire, Dt = S.dot;
const svg = (w, h, inner, color = K.ink) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="color:${color};--paper:${K.paper}">${inner}</svg>`;
const g = (color, inner, extra = "") => `<g style="color:${color}"${extra}>${inner}</g>`;
const tr = (x, y, inner) => `<g transform="translate(${x} ${y})">${inner}</g>`;
const T = (x, y, s, o = {}) => S.label(x, y, s, { size: 13, ...o });
const TL = (x, y, lines, o = {}) => lines.map((s, i) => T(x, y + i * (o.size || 13) * (o.lh || 1.5), s, o)).join("");
const R = (x, y, w, h, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 8}" fill="${o.fill ?? "none"}" stroke="${o.stroke ?? K.line}" stroke-width="${o.sw ?? 1.5}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}${o.op != null ? ` opacity="${o.op}"` : ""}/>`;
const Ln = (pts, o = {}) => `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${o.stroke ?? "currentColor"}" stroke-width="${o.sw ?? 2}" stroke-linecap="round" stroke-linejoin="round"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}${o.op != null ? ` opacity="${o.op}"` : ""}/>`;
const Arr = (x1, y1, x2, y2, color = K.blue, s = 8) => g(color, S.G(S.arrow(x1, y1, x2, y2, s)));
function badge(x, y, n, text, color = K.blue, size = 14) {
  return `<circle cx="${x + 11}" cy="${y + 11}" r="11" fill="${color}"/>` + T(x + 11, y + 11.5, n, { size: 12, weight: 700, color: "#fff" }) + T(x + 28, y + 11, text, { size, weight: 700, anchor: "start" });
}
function okMark(x, y, ok) {
  return ok ? `<circle cx="${x}" cy="${y}" r="10" fill="none" stroke="${K.green}" stroke-width="3"/>`
    : `<path d="M${x - 8} ${y - 8}L${x + 8} ${y + 8}M${x + 8} ${y - 8}L${x - 8} ${y + 8}" stroke="${K.red}" stroke-width="3.5" stroke-linecap="round"/>`;
}
const tag = (x, y, s, color = K.blue) => { const w = 10 + s.length * 8; return `<rect x="${x - w / 2}" y="${y - 9}" width="${w}" height="18" rx="9" fill="#fff" stroke="${color}" stroke-width="1.5"/>` + T(x, y + 0.5, s, { size: 11, weight: 700, color }); };
const star = (x, y, size = 18) => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" dominant-baseline="central" fill="${K.amberD}" font-family='${S.FONT}'>★</text>`;
const revMark = (x, y, n = "1", color = K.red) => `<path d="M${x} ${y - 11}L${x + 11} ${y + 8}H${x - 11}Z" fill="#fff" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>` + T(x, y + 2, n, { size: 10, weight: 700, color });

const FIGS = {};
// ------------------------------------------------------------ 記号カード(すべて同じ縮尺: 100 x 70 の枠の中央)
function symCard(kind, opts = {}) {
  const [bx, by, bw, bh] = S.BOX[kind];
  const cx = bx + bw / 2, cy = by + bh / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cx - 50} ${cy - 35} 100 70" width="100" height="70" style="color:${K.ink};--paper:${K.paper}">${S.G(S.draw(kind, opts))}</svg>`;
}
for (const it of S.LIST) FIGS[`sym-${it.id || it.key}`] = { w: 100, h: 70, scale: 3, svg: () => symCard(it.key, it.old ? { old: true } : {}) };
for (const k of ["coilold", "vcap", "ldr", "pe", "vcc"]) FIGS[`sym-${k}`] = { w: 100, h: 70, scale: 3, svg: () => symCard(k) };

// ------------------------------------------------------------ 1 章: 1 つの懐中電灯、4 枚の図
FIGS["fig-four-views"] = { w: 640, h: 476, svg() {
  const cell = (x, y, n, title, cap, inner) => tr(x, y, R(0, 0, 312, 230, { fill: "#fff" }) + badge(10, 10, n, title) + T(156, 213, cap, { size: 12, color: K.sub }) + inner);
  const blk = (x, a, b) => R(x, 84, 80, 56, { fill: K.light, stroke: K.blue, sw: 1.8, r: 6 }) + T(x + 40, b ? 102 : 112, a, { weight: 700 }) + (b ? T(x + 40, 122, b, { size: 11, color: K.sub }) : "");
  const c1 = blk(16, "電源", "電池 3 V") + blk(116, "スイッチ") + blk(216, "ランプ") + Arr(98, 112, 114, 112, K.ink, 7) + Arr(198, 112, 214, 112, K.ink, 7);
  const L = 60, Rr = 250, Tp = 62, B = 176;
  const c2 = Wr([[L, Tp], [106, Tp]]) + S.between("swa", 106, Tp, 206, Tp, { name: "SW1", gap: 18 }) + Wr([[206, Tp], [Rr, Tp]]) + S.between("lamp", Rr, Tp, Rr, B, { name: "L1", gap: 18 })
    + Wr([[Rr, B], [L, B]]) + S.between("batt", L, Tp, L, B, { name: "BT1", value: "3 V", side: "left", gap: 18 });
  // 実体配線図(線番付き)
  const wire = (d, c) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
  const c3 = wire("M130 162H190", "#D64545") + wire("M240 162C268 162 262 92 184 92", "#D64545") + wire("M136 92C60 92 22 120 22 162", "#2B2F36")
    + `<rect x="22" y="144" width="108" height="36" rx="6" fill="#1E6BB8"/>` + T(76, 162, "単 3 × 2", { size: 12, weight: 700, color: "#fff" }) + T(16, 186, "−", { size: 13, color: K.sub }) + T(136, 186, "+", { size: 13, color: K.sub })
    + `<rect x="190" y="146" width="50" height="32" rx="5" fill="#2E3A4A"/><path d="M215 162L226 151" stroke="#E9EDF2" stroke-width="5" stroke-linecap="round"/>`
    + `<rect x="124" y="84" width="72" height="18" rx="4" fill="#3B4656"/><circle cx="136" cy="93" r="4.5" fill="#D7DCE2"/><circle cx="184" cy="93" r="4.5" fill="#D7DCE2"/>`
    + `<circle cx="160" cy="62" r="17" fill="#F2F5F8" stroke="#9AA6B4" stroke-width="1.5"/><rect x="152" y="76" width="16" height="9" fill="#C9CED6"/>`
    + tag(160, 162, "1") + tag(268, 120, "2") + tag(40, 112, "3");
  const rows = [["記号", "品名", "仕様", "数"], ["BT1", "乾電池", "単 3 形 1.5 V", "2"], ["SW1", "スイッチ", "1 回路 ON/OFF", "1"], ["L1", "豆電球", "2.5 V 0.3 A", "1"], ["—", "電線", "赤・黒 各 20 cm", "2"]];
  const xs = [14, 66, 150, 266, 298];
  let c4 = R(14, 46, 284, 150, { r: 4, stroke: K.ink, sw: 1.2 }) + `<rect x="14" y="46" width="284" height="30" fill="${K.light}"/>`;
  rows.forEach((r, i) => { const y = 61 + i * 30; r.forEach((c, j) => { c4 += T(j === 3 ? (xs[3] + xs[4]) / 2 : xs[j] + 8, y, c, { size: 12, anchor: j === 3 ? "middle" : "start", weight: i === 0 ? 700 : 400 }); }); if (i) c4 += Ln([[14, y - 15], [298, y - 15]], { stroke: K.line, sw: 1 }); });
  for (const x of xs.slice(1, 4)) c4 += Ln([[x, 46], [x, 196]], { stroke: K.line, sw: 1 });
  return svg(640, 476, cell(0, 0, "1", "ブロック図", "流れの大筋を、箱と矢印で", c1) + cell(328, 0, "2", "回路図(接続図)", "電気的なつながりを、記号で", c2)
    + cell(0, 246, "3", "実体配線図", "部品の置き場所と線の通り道(数字は線番)", c3) + cell(328, 246, "4", "部品表", "何をいくつ使うか", c4));
} };

// ------------------------------------------------------------ 2 章: 線と点のルール
FIGS["fig-wire-rules"] = { w: 640, h: 404, svg() {
  const cell = (x, y, n, title, cap, inner) => tr(x, y, R(0, 0, 202, 194, { fill: "#fff" }) + badge(8, 8, n, title, K.blue, 13) + TL(101, 152, cap, { size: 12, color: K.sub, lh: 1.45 }) + inner);
  const cy = 92;
  const a = Wr([[36, cy], [166, cy]]) + Wr([[101, 46], [101, 136]]) + Dt(101, cy, 5);
  const b = g(K.blue, Wr([[36, cy], [166, cy]])) + g(K.red, Wr([[101, 46], [101, 136]])) + T(150, cy - 12, "A", { size: 11, weight: 700, color: K.blue }) + T(113, 52, "B", { size: 11, weight: 700, color: K.red });
  const c = Wr([[36, cy], [166, cy]]) + Wr([[101, cy], [101, 136]]) + Dt(101, cy, 5);
  const d = Wr([[22, cy], [82, cy]]) + Wr([[52, 62], [52, 122]]) + Dt(52, cy, 5) + okMark(52, 50, false) + Arr(88, cy, 108, cy, K.sub, 7)
    + Wr([[114, cy], [184, cy]]) + Wr([[136, cy], [136, 62]]) + Wr([[162, cy], [162, 122]]) + Dt(136, cy, 5) + Dt(162, cy, 5) + okMark(149, 50, true);
  const e = Wr([[36, cy], [89, cy]]) + `<path d="M89 ${cy}A12 12 0 0 1 113 ${cy}" fill="none" stroke="currentColor" stroke-width="2"/>` + Wr([[113, cy], [166, cy]]) + Wr([[101, 46], [101, 136]]);
  const f = Wr([[36, cy], [94, cy]]) + S.terminal(101, cy, 6.5) + Wr([[108, cy], [166, cy]]) + T(101, cy - 22, "TB1-3", { size: 12, weight: 700 }) + T(64, cy + 16, "盤の中", { size: 10, color: K.sub }) + T(138, cy + 16, "外の機器へ", { size: 10, color: K.sub });
  return svg(640, 404, cell(0, 0, "1", "黒丸 = つながる", ["● があれば", "つながっている"], a) + cell(219, 0, "2", "交差 = つながらない", ["● がない交差は", "つながっていない(A と B は別)"], b)
    + cell(438, 0, "3", "T 字 = つながる", ["T 字の分かれ道は", "つながっている"], c) + cell(0, 210, "4", "十字の接続は避ける", ["4 本が 1 点で会う形は", "ずらした 2 つの T 字に"], d)
    + cell(219, 210, "5", "またぎ(古い図面)", ["半円でまたぐ形も", "つながっていない"], e) + cell(438, 210, "6", "○ = 端子", ["ねじで線をとめる所。", "番号で場所を言う"], f));
} };

// ------------------------------------------------------------ 2 章: 線を省略する記号
FIGS["fig-shorthand"] = { w: 640, h: 330, svg() {
  let l = R(0, 0, 304, 330, { fill: "#fff" }) + badge(10, 10, "A", "すべて線で描く", K.sub);
  const T1 = 76, B1 = 270;
  l += S.between("batt", 40, T1, 40, B1, { name: "5 V", side: "left", gap: 16 }) + Wr([[40, T1], [262, T1]]) + Wr([[40, B1], [262, B1]]) + Dt(122, T1) + Dt(192, T1) + Dt(122, B1) + Dt(192, B1);
  [122, 192, 262].forEach((x, i) => { l += S.between("res", x, T1, x, 170, { name: `R${i + 1}`, gap: 13, size: 12 }) + S.between("led", x, 170, x, B1, { name: `D${i + 1}`, gap: 13, size: 12, side: "left" }); });
  l += T(152, 306, "線が多く、同じ点を追いにくい", { size: 12, color: K.sub });
  let r = R(336, 0, 304, 330, { fill: "#fff" }) + badge(346, 10, "B", "電源記号と GND で省略", K.blue);
  r += S.place("vcc", 376, 100) + S.between("batt", 376, 100, 376, 236, { name: "5 V", side: "left", gap: 16 }) + S.place("gnd", 376, 236);
  [462, 528, 594].forEach((x, i) => { r += S.place("vcc", x, 86) + S.between("res", x, 86, x, 166, { name: `R${i + 1}`, gap: 13, size: 12 }) + S.between("led", x, 166, x, 246, { name: `D${i + 1}`, gap: 13, size: 12, side: "left" }) + S.place("gnd", x, 246); });
  r += T(488, 306, "同じ名前の記号どうしは、つながっている", { size: 12, color: K.blue, weight: 700 });
  return svg(640, 330, l + r + T(320, 165, "=", { size: 28, weight: 700, color: K.sub }));
} };

// ------------------------------------------------------------ 2 章: 図枠と表題欄
function sheet(w, h, cols, rows, inner) {
  const m = 16, x0 = 6 + m, y0 = 6 + m, iw = w - 12 - 2 * m, ih = h - 12 - 2 * m, cw = iw / cols, rh = ih / rows;
  let s = `<rect x="6" y="6" width="${w - 12}" height="${h - 12}" fill="#fff" stroke="${K.ink}" stroke-width="2.5"/>` + `<rect x="${x0}" y="${y0}" width="${iw}" height="${ih}" fill="none" stroke="${K.ink}" stroke-width="1.5"/>`;
  for (let i = 0; i < cols; i++) {
    const cx = x0 + cw * (i + 0.5);
    s += T(cx, 6 + m / 2, String(i + 1), { size: 11, weight: 700 }) + T(cx, h - 6 - m / 2, String(i + 1), { size: 11, weight: 700 });
    if (i) s += Ln([[x0 + cw * i, 6], [x0 + cw * i, y0]], { sw: 1.2 }) + Ln([[x0 + cw * i, h - 6], [x0 + cw * i, h - 6 - m]], { sw: 1.2 });
  }
  for (let j = 0; j < rows; j++) {
    const cy = y0 + rh * (j + 0.5), L = "ABCDEF"[j];
    s += T(6 + m / 2, cy, L, { size: 11, weight: 700 }) + T(w - 6 - m / 2, cy, L, { size: 11, weight: 700 });
    if (j) s += Ln([[6, y0 + rh * j], [x0, y0 + rh * j]], { sw: 1.2 }) + Ln([[w - 6, y0 + rh * j], [w - 6 - m, y0 + rh * j]], { sw: 1.2 });
  }
  return s + inner;
}
function titleBlock(x, y, w, rows) {
  // rows: [[ [label, value, width比], ... ], ...] 1 行 30 px
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${rows.length * 30}" fill="#fff" stroke="${K.ink}" stroke-width="1.5"/>`;
  rows.forEach((row, i) => {
    const total = row.reduce((a, c) => a + (c[2] || 1), 0);
    let cx = x;
    row.forEach((c, j) => {
      const cw = (w * (c[2] || 1)) / total;
      if (j) s += Ln([[cx, y + i * 30], [cx, y + i * 30 + 30]], { stroke: K.ink, sw: 1 });
      s += T(cx + 5, y + i * 30 + 9, c[0], { size: 9, anchor: "start", color: K.sub }) + T(cx + 5, y + i * 30 + 21, c[1], { size: c[3] || 12, anchor: "start", weight: 700 });
      cx += cw;
    });
    if (i) s += Ln([[x, y + i * 30], [x + w, y + i * 30]], { stroke: K.ink, sw: 1 });
  });
  return s;
}
function miniLadder(x0, x1, ys, color) {
  // 薄く描いた自己保持の回路(図枠の中身の飾り)
  const [y1, y2, y3] = ys;
  return g(color, Wr([[x0, y1 - 24], [x0, y3 + 20]]) + Wr([[x1, y1 - 24], [x1, y3 + 20]])
    + Wr([[x0, y1], [x0 + 30, y1]]) + S.place("pbb", x0 + 30, y1) + Wr([[x0 + 90, y1], [x0 + 130, y1]]) + S.place("pba", x0 + 130, y1) + Wr([[x0 + 190, y1], [x1 - 90, y1]]) + S.place("coil", x1 - 90, y1) + Wr([[x1 - 30, y1], [x1, y1]])
    + Wr([[x0 + 110, y1], [x0 + 110, y1 + 40], [x0 + 130, y1 + 40]]) + S.place("swa", x0 + 130, y1 + 40) + Wr([[x0 + 190, y1 + 40], [x0 + 210, y1 + 40], [x0 + 210, y1]]) + Dt(x0 + 110, y1) + Dt(x0 + 210, y1)
    + Wr([[x0, y2], [x0 + 130, y2]]) + S.place("swa", x0 + 130, y2) + Wr([[x0 + 190, y2], [x1 - 90, y2]]) + S.place("lamp", x1 - 90, y2) + Wr([[x1 - 30, y2], [x1, y2]])
    + Wr([[x0, y3], [x0 + 130, y3]]) + S.place("swb", x0 + 130, y3) + Wr([[x0 + 190, y3], [x1 - 90, y3]]) + S.place("lamp", x1 - 90, y3) + Wr([[x1 - 30, y3], [x1, y3]]));
}
FIGS["fig-frame"] = { w: 640, h: 420, svg() {
  let s = miniLadder(70, 560, [96, 176, 236], "#9AA6B4");
  s += star(369, 148) + revMark(540, 214);
  s += titleBlock(402, 300, 214, [[["図名", "ポンプ運転回路", 2], ["シート", "3 / 8", 1]], [["図番", "EL-0418", 2], ["改訂", "△1", 1]], [["作成", "山田"], ["検図", "佐藤"], ["日付", "2026-10-18", 1.6, 11]]]);
  s += `<rect x="402" y="266" width="214" height="34" fill="#fff" stroke="${K.ink}" stroke-width="1.5"/>` + T(408, 276, "改訂", { size: 9, anchor: "start", color: K.sub }) + T(408, 290, "△1  2026-10-20  GL の型番を変更", { size: 11, anchor: "start", weight: 700 });
  s += Arr(150, 46, 150, 26, K.blue, 7) + T(160, 46, "列の番号 1〜6", { size: 12, weight: 700, color: K.blue, anchor: "start" });
  s += Arr(46, 349, 28, 349, K.blue, 7) + T(52, 349, "行の記号 A〜D", { size: 12, weight: 700, color: K.blue, anchor: "start" });
  s += Arr(330, 345, 398, 345, K.blue, 7) + T(326, 345, "表題欄", { size: 12, weight: 700, color: K.blue, anchor: "end" });
  s += Arr(330, 283, 398, 283, K.blue, 7) + T(326, 283, "改訂欄", { size: 12, weight: 700, color: K.blue, anchor: "end" });
  s += T(524, 214, "改訂の印", { size: 11, weight: 700, color: K.red, anchor: "end" });
  return svg(640, 420, sheet(640, 420, 6, 4, s));
} };

// ------------------------------------------------------------ 4 章: 読む手順の例(ブロックに分ける)
FIGS["fig-read-steps"] = { w: 640, h: 352, svg() {
  const zones = [[8, 170, "#1E6BB8", "① 電源部"], [170, 300, "#2F8F5B", "② 入力部"], [300, 450, "#B98900", "③ 制御部"], [450, 632, "#8A5CC2", "④ 出力部"]];
  let s = zones.map(([a, b, c, t]) => `<rect x="${a + 2}" y="10" width="${b - a - 4}" height="318" rx="8" fill="${c}" opacity=".07"/>` + T((a + b) / 2, 340, t, { size: 13, weight: 700, color: c })).join("");
  const V = 36, G = 300;
  s += Wr([[155, V], [568, V]]) + Wr([[40, G], [600, G]]) + T(180, V - 14, "+5V", { size: 12, weight: 700 }) + T(606, G, "GND", { size: 12, weight: 700, anchor: "start" });
  // 電源部
  s += S.between("batt", 40, 90, 40, G, { name: "BT1", value: "9 V", side: "right", gap: 26, size: 12 }) + Wr([[40, 90], [70, 90]]);
  s += `<rect x="70" y="70" width="60" height="50" rx="3" fill="#fff" stroke="currentColor" stroke-width="2"/>` + T(100, 86, "U1", { size: 12, weight: 700 }) + T(100, 104, "78L05", { size: 10 });
  s += Wr([[100, 120], [100, G]]) + Dt(100, G) + Wr([[130, 90], [155, 90], [155, V]]) + Dt(155, 90) + S.between("cap", 155, 90, 155, G, { name: "C1", value: "0.1µF", gap: 14, size: 11 }) + Dt(155, G);
  // 入力部
  s += S.between("res", 215, V, 215, 150, { name: "R1", value: "10kΩ", gap: 14, size: 11 }) + Dt(215, V) + S.between("pba", 215, 150, 215, G, { name: "SW1", side: "right", gap: 28, size: 11 }) + Dt(215, G) + Wr([[215, 150], [330, 150]]) + Dt(215, 150);
  // 制御部
  s += `<rect x="330" y="110" width="100" height="100" rx="3" fill="#fff" stroke="currentColor" stroke-width="2"/>` + T(380, 150, "U2", { size: 13, weight: 700 }) + T(380, 170, "マイコン", { size: 11 })
    + T(336, 140, "IN", { size: 9, anchor: "start" }) + T(424, 180, "OUT", { size: 9, anchor: "end" }) + Wr([[380, 110], [380, V]]) + Dt(380, V) + Wr([[380, 210], [380, G]]) + Dt(380, G);
  // 出力部
  s += Wr([[430, 190], [450, 190]]) + S.between("res", 450, 190, 530, 190, { name: "R2", value: "1kΩ", gap: 16, size: 11 }) + S.place("npn", 530, 190) + T(574, 214, "Q1", { size: 12, weight: 700, anchor: "start" })
    + Wr([[568, 220], [568, G]]) + Dt(568, G) + S.between("led", 568, 96, 568, 160, { name: "D1", side: "left", gap: 16, size: 11 }) + S.between("res", 568, V, 568, 96, { name: "R3", value: "330Ω", side: "left", gap: 16, size: 11 });
  return svg(640, 352, s);
} };

// ------------------------------------------------------------ 4 章: LED と抵抗の電圧
FIGS["fig-led-calc"] = { w: 640, h: 236, svg() {
  const Tp = 52, B = 180;
  let s = S.between("batt", 60, Tp, 60, B, { name: "電源", value: "5.0 V", side: "left", gap: 22 }) + Wr([[60, Tp], [150, Tp]]) + S.between("res", 150, Tp, 270, Tp, { name: "R", gap: 18 })
    + Wr([[270, Tp], [330, Tp]]) + S.between("led", 330, Tp, 450, Tp, { name: "LED", gap: 38 }) + Wr([[450, Tp], [530, Tp], [530, B], [60, B]]);
  const br = (a, b, t, c) => Ln([[a, 78], [a, 84], [b, 84], [b, 78]], { stroke: c, sw: 1.8 }) + T((a + b) / 2, 102, t, { size: 13, weight: 700, color: c });
  s += br(170, 250, "3.0 V", K.blue) + T(210, 122, "抵抗が受け持つ", { size: 11, color: K.sub }) + br(350, 430, "2.0 V", K.green) + T(390, 122, "LED の Vf", { size: 11, color: K.sub });
  s += Arr(546, 88, 546, 150, K.red, 9) + T(560, 112, "I", { size: 15, weight: 700, color: K.red, anchor: "start", attrs: ' font-style="italic"' }) + T(560, 132, "電流", { size: 11, color: K.sub, anchor: "start" });
  s += T(296, 214, "3.0 V + 2.0 V = 5.0 V(電源の電圧)", { size: 13, weight: 700, color: K.ink });
  return svg(640, 236, s);
} };

// ------------------------------------------------------------ 4 章: よく出る回路の形
FIGS["fig-patterns"] = { w: 640, h: 548, svg() {
  const cell = (x, y, n, title, cap, inner) => tr(x, y, R(0, 0, 312, 266, { fill: "#fff" }) + badge(10, 10, n, title, K.blue, 14) + TL(156, cap.length > 1 ? 236 : 246, cap, { size: 12, color: K.sub }) + inner);
  const a = S.place("vcc", 90, 66, 0, { text: "+9V" }) + S.between("res", 90, 66, 90, 136, { name: "R1", gap: 14, size: 12 }) + Dt(90, 136) + Wr([[90, 136], [190, 136]]) + S.terminal(196, 136, 5) + T(208, 136, "Vout", { size: 13, weight: 700, anchor: "start" })
    + S.between("res", 90, 136, 90, 206, { name: "R2", gap: 14, size: 12 }) + S.place("gnd", 90, 206) + T(222, 166, "R1 = R2 なら", { size: 11, color: K.sub }) + T(222, 184, "Vout = 4.5 V", { size: 12, weight: 700, color: K.blue });
  const b = S.place("vcc", 90, 60) + S.between("res", 90, 60, 90, 130, { name: "R", value: "10kΩ", gap: 14, size: 12 }) + Dt(90, 130) + Wr([[90, 130], [196, 130]]) + Arr(196, 130, 210, 130, K.ink, 7) + T(214, 130, "入力へ", { size: 12, anchor: "start" })
    + S.between("pba", 90, 130, 90, 202, { name: "SW", side: "left", gap: 22, size: 12 }) + S.place("gnd", 90, 202) + T(150, 168, "離す → 5 V(H)", { size: 12, anchor: "start" }) + T(150, 188, "押す → 0 V(L)", { size: 12, anchor: "start" });
  const c = S.place("vcc", 176, 52, 0, { text: "+12V" }) + Wr([[176, 52], [176, 64]]) + S.between("coil", 176, 64, 176, 124, { name: "K1", side: "left", gap: 16, size: 12 }) + Wr([[176, 64], [226, 64]]) + Wr([[176, 124], [226, 124]])
    + S.between("diode", 226, 124, 226, 64, { name: "D1", side: "right", gap: 14, size: 12 }) + Dt(176, 64) + Dt(176, 124) + Wr([[176, 124], [176, 148]]) + S.place("npn", 138, 178) + T(196, 196, "Q1", { size: 12, weight: 700, anchor: "start" })
    + Wr([[176, 208], [176, 212]]) + S.place("gnd", 176, 212) + S.between("res", 62, 178, 138, 178, { name: "R", value: "1kΩ", gap: 16, size: 11 }) + S.terminal(56, 178, 5) + T(56, 198, "マイコン", { size: 10, color: K.sub });
  const d = `<rect x="70" y="80" width="100" height="90" rx="3" fill="#fff" stroke="currentColor" stroke-width="2"/>` + T(120, 116, "U1", { size: 13, weight: 700 }) + T(120, 136, "IC", { size: 11 }) + T(120, 92, "VCC", { size: 9 }) + T(120, 160, "GND", { size: 9 })
    + S.place("vcc", 120, 52) + Wr([[120, 52], [120, 80]]) + Wr([[120, 64], [226, 64]]) + Dt(120, 64) + S.between("cap", 226, 64, 226, 186, { name: "C", value: "0.1µF", gap: 14, size: 12 })
    + Wr([[120, 170], [120, 196]]) + S.place("gnd", 120, 196) + Wr([[120, 186], [226, 186]]) + Dt(120, 186);
  return svg(640, 548, cell(0, 0, "1", "分圧回路", ["抵抗 2 本で電圧を分けて取り出す"], tr(30, 4, a)) + cell(328, 0, "2", "プルアップ抵抗", ["スイッチの状態を H / L(1 / 0)で読む"], tr(26, 8, b))
    + cell(0, 282, "3", "トランジスタで駆動", ["小さな信号で大きな負荷(リレー)を動かす。", "D1 はコイルの逆向きの電圧を逃がす"], tr(34, -6, c))
    + cell(328, 282, "4", "パスコン", ["IC の電源ピンのすぐそばに置き、", "電源の小さな乱れを吸収する"], tr(24, 4, d)));
} };

// ------------------------------------------------------------ 4 章: 練習(暗くなると点く常夜灯)
function nightLight(color, glow) {
  const V = 40, G = 300;
  let s = Wr([[90, V], [560, V]]) + Wr([[90, G], [298, G]]) + T(90, V - 16, "+5V", { size: 13, weight: 700 }) + T(304, G, "GND", { size: 12, weight: 700, anchor: "start" });
  s += S.between("res", 90, V, 90, 160, { name: "R1", value: "10kΩ", gap: 14, size: 12 }) + Dt(90, 160) + S.between("ldr", 90, 160, 90, G, { name: "CdS", value: "明るいと小さい", gap: 36, size: 12 });
  s += Wr([[90, 160], [180, 160]]) + S.between("res", 180, 160, 260, 160, { name: "R2", value: "4.7kΩ", gap: 18, size: 12 }) + S.place("npn", 260, 160) + T(318, 182, "Q1", { size: 12, weight: 700, anchor: "start" });
  const led = S.between("led", 500, 130, 420, 130, { name: "D1", gap: 20, size: 12 });
  s += Wr([[298, 190], [298, G]]) + Wr([[298, 130], [420, 130]]) + (glow ? g(glow, led) : led) + Wr([[500, 130], [560, 130]]) + S.between("res", 560, 130, 560, V, { name: "R3", value: "330Ω", gap: 14, size: 12 });
  if (!glow) return g(color, s);
  return `<defs><radialGradient id="ledglow"><stop offset="0" stop-color="${glow}" stop-opacity=".9"/><stop offset=".5" stop-color="${glow}" stop-opacity=".35"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs><circle cx="460" cy="130" r="46" fill="url(#ledglow)"/>` + g(color, s);
}
FIGS["fig-practice"] = { w: 640, h: 330, svg: () => svg(640, 330, nightLight(K.ink)) };

// ------------------------------------------------------------ 5 章: シーケンス図の決まり
const plc = { a: (x, y) => Ln([[x - 30, y], [x - 8, y]]) + Ln([[x - 8, y - 11], [x - 8, y + 11]]) + Ln([[x + 8, y - 11], [x + 8, y + 11]]) + Ln([[x + 8, y], [x + 30, y]]),
  b: (x, y) => plc.a(x, y) + Ln([[x - 12, y + 11], [x + 12, y - 11]]),
  coil: (x, y) => Ln([[x - 30, y], [x - 12, y]]) + `<path d="M${x - 6} ${y - 12}A16 16 0 0 0 ${x - 6} ${y + 12}M${x + 6} ${y - 12}A16 16 0 0 1 ${x + 6} ${y + 12}" fill="none" stroke="currentColor" stroke-width="2"/>` + Ln([[x + 12, y], [x + 30, y]]) };
FIGS["fig-ladder-rules"] = { w: 640, h: 400, svg() {
  const P = 64, N = 372, ys = [104, 194, 284];
  let s = Arr(110, 34, 330, 34, K.blue, 9) + T(220, 16, "左の母線から右の母線へ、電気が流れる", { size: 12, weight: 700, color: K.blue });
  s += Arr(30, 84, 30, 304, K.blue, 9) + T(12, 194, "上から下へ順に読む", { size: 12, weight: 700, color: K.blue, attrs: ' transform="rotate(-90 10 194)"' });
  s += Wr([[P, 60], [P, 316]]) + Wr([[N, 60], [N, 316]]) + T(P, 334, "母線 P(+)", { size: 12, weight: 700 }) + T(N, 334, "母線 N(−)", { size: 12, weight: 700 });
  ys.forEach((y, i) => (s += T(44, y, String(i + 1), { size: 12, color: K.sub })));
  s += Wr([[P, ys[0]], [120, ys[0]]]) + S.place("pba", 120, ys[0]) + T(150, ys[0] - 40, "PB1", { size: 12, weight: 700 }) + Wr([[180, ys[0]], [270, ys[0]]]) + S.place("coil", 270, ys[0]) + T(300, ys[0] - 22, "X(コイル)", { size: 12, weight: 700 }) + Wr([[330, ys[0]], [N, ys[0]]]);
  s += Wr([[P, ys[1]], [120, ys[1]]]) + S.place("swa", 120, ys[1]) + T(150, ys[1] + 20, "X の a 接点", { size: 11 }) + Wr([[180, ys[1]], [270, ys[1]]]) + S.place("lamp", 270, ys[1]) + T(300, ys[1] - 22, "L1", { size: 12, weight: 700 }) + Wr([[330, ys[1]], [N, ys[1]]]);
  s += Wr([[P, ys[2]], [120, ys[2]]]) + S.place("swb", 120, ys[2]) + T(150, ys[2] + 26, "X の b 接点", { size: 11 }) + Wr([[180, ys[2]], [270, ys[2]]]) + S.place("lamp", 270, ys[2]) + T(300, ys[2] - 22, "L2", { size: 12, weight: 700 }) + Wr([[330, ys[2]], [N, ys[2]]]);
  s += `<path d="M282 ${ys[0] + 10}C240 150 190 150 160 ${ys[1] - 18}" fill="none" stroke="${K.blue}" stroke-width="1.6" stroke-dasharray="5 4"/>` + Arr(164, ys[1] - 22, 157, ys[1] - 12, K.blue, 7);
  s += `<path d="M292 ${ys[0] + 10}C250 200 200 230 166 ${ys[2] - 20}" fill="none" stroke="${K.blue}" stroke-width="1.6" stroke-dasharray="5 4"/>` + Arr(170, ys[2] - 24, 161, ys[2] - 13, K.blue, 7);
  s += T(218, 368, "接点は「何もしていないとき」の形で描く", { size: 12, weight: 700, color: K.red });
  // 右: 描き方の対応表
  s += R(404, 50, 236, 300, { fill: "#fff" }) + T(522, 72, "接点とコイルの描き方", { size: 13, weight: 700 }) + T(470, 96, "JIS C 0617", { size: 10, color: K.sub }) + T(590, 96, "ラダー図(PLC)", { size: 10, color: K.sub });
  [["swa", "a", "a 接点(メーク)", "押す・動くと閉じる"], ["swb", "b", "b 接点(ブレーク)", "押す・動くと開く"], ["coil", "coil", "コイル", "電気が来ると接点が動く"]].forEach(([k, p, name, note], i) => {
    const y = 136 + i * 76;
    s += S.place(k, 440, y) + plc[p](590, y) + T(522, y + 26, name, { size: 12, weight: 700 }) + T(522, y + 43, note, { size: 10, color: K.sub });
  });
  return svg(640, 400, s);
} };

// ------------------------------------------------------------ 5 章: リレーのコイルと接点
FIGS["fig-relay-xref"] = { w: 640, h: 360, svg() {
  let s = R(10, 40, 228, 286, { dash: "6 5", stroke: K.blue, sw: 1.6, fill: "#fff" }) + T(124, 24, "K1(リレー 1 個)", { size: 13, weight: 700, color: K.blue });
  s += S.between("coil", 60, 110, 60, 230, { noLeads: false }) + T(60, 96, "A1", { size: 11, color: K.sub }) + T(60, 246, "A2", { size: 11, color: K.sub }) + T(60, 268, "コイル", { size: 12, weight: 700 });
  s += S.between("swa", 170, 80, 170, 160) + T(184, 88, "13", { size: 10, color: K.sub, anchor: "start" }) + T(184, 152, "14", { size: 10, color: K.sub, anchor: "start" }) + T(194, 120, "a 接点", { size: 12, weight: 700, anchor: "start" });
  s += S.between("swb", 170, 200, 170, 280) + T(184, 208, "21", { size: 10, color: K.sub, anchor: "start" }) + T(184, 272, "22", { size: 10, color: K.sub, anchor: "start" }) + T(194, 240, "b 接点", { size: 12, weight: 700, anchor: "start" });
  s += Ln([[76, 170], [158, 170]], { dash: "4 4", sw: 1.6 }) + Ln([[120, 120], [120, 240]], { dash: "4 4", sw: 1.6 }) + Ln([[120, 120], [158, 120]], { dash: "4 4", sw: 1.6 }) + Ln([[120, 240], [163, 240]], { dash: "4 4", sw: 1.6 });
  s += T(124, 310, "点線 = 機械的にいっしょに動く", { size: 10, color: K.sub });
  // 右: 図面では別々の行に描く
  const P = 290, N = 620, ys = [96, 196, 276];
  s += T(455, 24, "図面では、コイルと接点を別の行に描く", { size: 13, weight: 700 });
  s += Wr([[P, 56], [P, 306]]) + Wr([[N, 56], [N, 306]]);
  ys.forEach((y, i) => (s += T(272, y, String(i + 1), { size: 12, color: K.sub })));
  s += Wr([[P, ys[0]], [326, ys[0]]]) + S.place("pba", 326, ys[0]) + T(356, ys[0] - 40, "PB1", { size: 12, weight: 700 }) + Wr([[386, ys[0]], [500, ys[0]]]) + S.place("coil", 500, ys[0]) + Wr([[560, ys[0]], [N, ys[0]]])
    + T(530, ys[0] - 22, "K1", { size: 13, weight: 700 }) + T(516, ys[0] - 22, "A1", { size: 9, color: K.sub, anchor: "end" }) + T(544, ys[0] - 22, "A2", { size: 9, color: K.sub, anchor: "start" });
  s += R(486, ys[0] + 14, 90, 46, { r: 4, fill: K.light, stroke: K.blue, sw: 1.2 }) + T(531, ys[0] + 28, "13-14 → 2 行", { size: 11, weight: 700, color: K.blue }) + T(531, ys[0] + 46, "21-22 → 3 行", { size: 11, weight: 700, color: K.blue });
  s += T(476, ys[0] + 30, "接点の行き先 →", { size: 11, weight: 700, color: K.blue, anchor: "end" }) + T(476, ys[0] + 47, "(クロスリファレンス)", { size: 10, color: K.blue, anchor: "end" });
  s += Wr([[P, ys[1]], [326, ys[1]]]) + S.place("swa", 326, ys[1]) + T(356, ys[1] - 22, "K1", { size: 12, weight: 700 }) + T(334, ys[1] + 14, "13", { size: 9, color: K.sub }) + T(378, ys[1] + 14, "14", { size: 9, color: K.sub })
    + Wr([[386, ys[1]], [500, ys[1]]]) + S.place("lamp", 500, ys[1]) + T(530, ys[1] - 22, "RL", { size: 12, weight: 700 }) + Wr([[560, ys[1]], [N, ys[1]]]);
  s += Wr([[P, ys[2]], [326, ys[2]]]) + S.place("swb", 326, ys[2]) + T(356, ys[2] - 18, "K1", { size: 12, weight: 700 }) + T(334, ys[2] + 22, "21", { size: 9, color: K.sub }) + T(378, ys[2] + 22, "22", { size: 9, color: K.sub })
    + Wr([[386, ys[2]], [500, ys[2]]]) + S.place("lamp", 500, ys[2]) + T(530, ys[2] - 22, "GL", { size: 12, weight: 700 }) + Wr([[560, ys[2]], [N, ys[2]]]);
  s += T(455, 336, "同じ名前(K1)の部品は、どこに描かれていても 1 つのリレー", { size: 12, weight: 700, color: K.blue });
  return svg(640, 360, s);
} };

// ------------------------------------------------------------ 5 章: 自己保持の 3 場面
FIGS["fig-selfhold-steps"] = { w: 640, h: 570, svg() {
  const steps = [
    { n: "1", head: "起動 PB2 を押す", lines: ["PB2 が閉じて", "MC に電気が来る。", "MC の a 接点も閉じる"], pb1: false, pb2: true, mc: true },
    { n: "2", head: "PB2 から手を離す", lines: ["保持の接点が", "PB2 の代わりに通す。", "MC は入ったまま"], pb1: false, pb2: false, mc: true },
    { n: "3", head: "停止 PB1 を押す", lines: ["b 接点が開き MC が切れる。", "保持も外れるので、", "離しても止まったまま"], pb1: true, pb2: false, mc: false },
  ];
  let s = "";
  steps.forEach((st, i) => {
    const oy = i * 192;
    const aLive = !st.pb1, bLive = aLive && (st.pb2 || st.mc);
    const col = (on) => (on ? K.red : K.ink);
    let r = R(0, 0, 640, 178, { fill: "#fff" }) + badge(12, 14, st.n, st.head, st.mc ? K.red : K.sub, 14) + TL(16, 62, st.lines, { size: 12, anchor: "start", lh: 1.55 });
    const P = 210, N = 624, y = 72, hy = 128;
    r += g(K.red, Wr([[P, 30], [P, 156]])) + Wr([[N, 30], [N, 156]]) + T(P, 18, "P", { size: 11, weight: 700 }) + T(N, 18, "N", { size: 11, weight: 700 });
    r += g(K.red, Wr([[P, y], [236, y]]) + S.place("pbb", 236, y, 0, { on: st.pb1 }));
    r += g(col(aLive), Wr([[296, y], [350, y]]) + Wr([[320, y], [320, hy], [350, hy]]) + Dt(320, y));
    r += g(col(aLive && st.pb2), S.place("pba", 350, y, 0, { on: st.pb2 })) + g(col(aLive && st.mc), S.place("swa", 350, hy, 0, { on: st.mc }));
    r += g(col(bLive), Wr([[410, y], [530, y]]) + Wr([[410, hy], [450, hy], [450, y]]) + Dt(450, y));
    r += (st.mc ? `<rect x="548" y="${y - 8}" width="24" height="16" fill="rgba(242,183,5,.35)"/>` : "") + g(col(st.mc), S.place("coil", 530, y)) + Wr([[590, y], [N, y]]);
    r += T(266, y - 40, "PB1 停止", { size: 11, weight: 700 }) + T(380, y - 40, "PB2 起動", { size: 11, weight: 700 }) + T(380, hy + 20, "MC a 接点(保持)", { size: 11 }) + T(560, y - 22, st.mc ? "MC 入" : "MC 切", { size: 12, weight: 700, color: st.mc ? K.red : K.sub });
    s += tr(0, oy, r);
  });
  return svg(640, 570, s);
} };

// ------------------------------------------------------------ 5 章: インターロック(制御回路と主回路)
FIGS["fig-interlock"] = { w: 640, h: 540, svg() {
  const P = 40, N = 600;
  let s = Wr([[P, 26], [P, 266]]) + Wr([[N, 26], [N, 266]]) + T(P, 14, "P", { size: 11, weight: 700 }) + T(N, 14, "N", { size: 11, weight: 700 });
  const y1 = 64, h1 = 114, y2 = 192, h2 = 242;
  s += T(22, y1, "1", { size: 12, color: K.sub }) + T(22, y2, "2", { size: 12, color: K.sub });
  s += `<rect x="350" y="${y1 - 26}" width="80" height="56" rx="6" fill="rgba(242,183,5,.25)"/><rect x="350" y="${y2 - 26}" width="80" height="56" rx="6" fill="rgba(242,183,5,.25)"/>`;
  s += Wr([[P, y1], [70, y1]]) + S.place("pbb", 70, y1) + T(100, y1 - 40, "PB0 停止", { size: 11, weight: 700 }) + Wr([[130, y1], [210, y1]]) + Wr([[160, y1], [160, h2], [210, h2]]) + Wr([[160, h1], [210, h1]]) + Wr([[160, y2], [210, y2]])
    + Dt(160, y1) + Dt(160, h1) + Dt(160, y2);
  s += S.place("pba", 210, y1) + T(240, y1 - 40, "PB1 正転", { size: 11, weight: 700 }) + S.place("swa", 210, h1) + T(240, h1 + 18, "MC1(保持)", { size: 10 }) + Wr([[270, y1], [360, y1]]) + Wr([[270, h1], [310, h1], [310, y1]]) + Dt(310, y1);
  s += S.place("swb", 360, y1) + T(390, y1 - 18, "MC2", { size: 12, weight: 700 }) + Wr([[420, y1], [480, y1]]) + S.place("coil", 480, y1) + T(510, y1 - 22, "MC1 正転", { size: 12, weight: 700 }) + Wr([[540, y1], [N, y1]]);
  s += S.place("pba", 210, y2) + T(240, y2 - 40, "PB2 逆転", { size: 11, weight: 700 }) + S.place("swa", 210, h2) + T(240, h2 + 18, "MC2(保持)", { size: 10 }) + Wr([[270, y2], [360, y2]]) + Wr([[270, h2], [310, h2], [310, y2]]) + Dt(310, y2);
  s += S.place("swb", 360, y2) + T(390, y2 - 18, "MC1", { size: 12, weight: 700 }) + Wr([[420, y2], [480, y2]]) + S.place("coil", 480, y2) + T(510, y2 - 22, "MC2 逆転", { size: 12, weight: 700 }) + Wr([[540, y2], [N, y2]]);
  s += T(390, y1 + 36, "インターロック", { size: 11, weight: 700, color: K.amberD }) + T(390, y2 + 36, "インターロック", { size: 11, weight: 700, color: K.amberD });
  // 主回路
  s += Ln([[16, 282], [624, 282]], { stroke: K.line, sw: 1.5 }) + T(20, 302, "主回路(モータへ行く太い電気の通り道)", { size: 13, weight: 700, anchor: "start" });
  const Lx = [60, 85, 110], ya = [348, 366, 384], yb = [428, 446, 464], Mx = [470, 495, 520];
  const short = Ln([[60, 332], [60, ya[0]], [Mx[0], ya[0]], [Mx[0], yb[2]], [110, yb[2]], [110, 332]], { stroke: "rgba(217,72,15,.25)", sw: 9 });
  s += short;
  ["L1", "L2", "L3"].forEach((t, i) => (s += T(Lx[i], 326, t, { size: 11, weight: 700 }) + Wr([[Lx[i], 334], [Lx[i], yb[i]]]) + Dt(Lx[i], ya[i])));
  ["U", "V", "W"].forEach((t, i) => (s += T(Mx[i], 326, t, { size: 11, weight: 700 }) + Wr([[Mx[i], 334], [Mx[i], 490]])));
  for (let i = 0; i < 3; i++) {
    s += Wr([[Lx[i], ya[i]], [200, ya[i]]]) + S.place("swa", 200, ya[i]) + Wr([[260, ya[i]], [Mx[i], ya[i]]]) + Dt(Mx[i], ya[i]);
    const to = 2 - i === 1 ? 1 : 2 - i; // L1 → W、L2 → V、L3 → U
    s += Wr([[Lx[i], yb[i]], [200, yb[i]]]) + S.place("swa", 200, yb[i]) + Wr([[260, yb[i]], [Mx[to], yb[i]]]) + Dt(Mx[to], yb[i]);
  }
  s += Ln([[231, ya[0] - 13], [231, ya[2] - 6]], { dash: "4 3", sw: 1.4 }) + Ln([[231, yb[0] - 13], [231, yb[2] - 6]], { dash: "4 3", sw: 1.4 });
  s += T(272, ya[0] - 16, "MC1(正転)", { size: 11, weight: 700, anchor: "start" }) + T(272, yb[0] - 16, "MC2(逆転)", { size: 11, weight: 700, anchor: "start" });
  s += TL(536, yb[0], ["L1 → W", "L3 → U", "(入れかえ)"], { size: 11, color: K.sub, anchor: "start", lh: 1.4 });
  s += `<circle cx="495" cy="514" r="18" fill="#fff" stroke="currentColor" stroke-width="2"/>` + T(495, 514, "M", { size: 15, weight: 700 }) + Ln([[470, 490], [483, 500]]) + Ln([[520, 490], [507, 500]]) + Ln([[495, 490], [495, 496]]);
  s += TL(150, 494, ["両方入ると L1 → MC1 → U → MC2 → L3 と", "電源の線どうしが直接つながる = 短絡"], { size: 12, weight: 700, color: K.red, anchor: "start", lh: 1.45 });
  return svg(640, 540, s);
} };

// ------------------------------------------------------------ 6 章: 配線図と線番
FIGS["fig-wiring"] = { w: 640, h: 486, svg() {
  let s = R(14, 40, 164, 250, { fill: K.light, stroke: K.sub }) + T(96, 24, "操作盤の扉", { size: 13, weight: 700 });
  s += R(232, 40, 394, 250, { fill: "#fff", stroke: K.sub }) + T(429, 24, "制御盤の中", { size: 13, weight: 700 });
  const btn = (cx, cy, c, t) => `<circle cx="${cx}" cy="${cy}" r="24" fill="${c}" stroke="#C9D3DE" stroke-width="4"/>` + T(cx, cy, t, { size: 12, weight: 700, color: "#fff" });
  s += btn(64, 112, "#D63B2F", "停止") + T(64, 150, "PB1(b)", { size: 11, weight: 700 }) + btn(64, 212, "#2F8F5B", "起動") + T(64, 250, "PB2(a)", { size: 11, weight: 700 });
  const screw = (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="#D7DCE2" stroke="${K.sub}" stroke-width="1.2"/>`;
  // 端子台 TB1(端子の番号 = 線番)
  s += `<rect x="268" y="74" width="44" height="130" rx="3" fill="${K.light}" stroke="${K.ink}" stroke-width="1.5"/>` + T(290, 62, "TB1", { size: 12, weight: 700 });
  const tbY = [96, 140, 184];
  tbY.forEach((y, i) => (s += Ln([[268, y + 22], [312, y + 22]], { stroke: K.line, sw: 1 }) + T(290, y, String(i + 1), { size: 12, weight: 700 }) + screw(268, y) + screw(312, y)));
  // 電源と MC
  s += R(330, 52, 120, 34, { r: 4, fill: "#2E3A4A", stroke: "#2E3A4A" }) + T(390, 69, "電源 24 V", { size: 12, weight: 700, color: "#fff" }) + screw(370, 86) + T(380, 100, "P", { size: 10, weight: 700, anchor: "start" }) + screw(450, 69) + T(460, 60, "N", { size: 10, weight: 700, anchor: "start" });
  s += R(480, 124, 120, 110, { r: 4, fill: K.light, stroke: K.ink }) + T(540, 170, "MC", { size: 15, weight: 700 }) + T(540, 190, "電磁接触器", { size: 10, color: K.sub });
  [["13", 140], ["14", 184], ["A1", 210]].forEach(([t, y]) => (s += screw(480, y) + T(490, y, t, { size: 10, anchor: "start", weight: 700 })));
  s += screw(600, 210) + T(590, 210, "A2", { size: 10, anchor: "end", weight: 700 });
  // 線(数字は線番)
  const red = "#C73A3A";
  s += g(red, Wr([[88, 100], [130, 100], [130, 96], [268, 96]]) + Wr([[88, 124], [200, 124], [200, 140], [268, 140]]) + Wr([[88, 200], [215, 200], [215, 140]]) + Dt(215, 140) + Wr([[88, 224], [230, 224], [230, 184], [268, 184]])
    + Wr([[312, 96], [370, 96], [370, 86]]) + Wr([[312, 140], [480, 140]]) + Wr([[312, 184], [466, 184], [466, 210], [480, 210]]) + Wr([[466, 184], [480, 184]]) + Dt(466, 184));
  s += g(K.blue, Wr([[600, 210], [614, 210], [614, 69], [450, 69]]));
  s += screw(88, 100) + screw(88, 124) + screw(88, 200) + screw(88, 224);
  s += tag(150, 96, "1", red) + tag(160, 124, "2", red) + tag(160, 200, "2", red) + tag(160, 224, "3", red) + tag(340, 96, "1", red) + tag(400, 140, "2", red) + tag(400, 184, "3", red) + tag(614, 140, "0", K.blue);
  s += T(429, 274, "端子台をはさんで、扉と盤の中をつなぐ", { size: 11, color: K.sub });
  // 下: 同じ回路のシーケンス図(線番付き)
  s += Ln([[14, 306], [626, 306]], { stroke: K.line, sw: 1.5 }) + T(18, 326, "同じ回路のシーケンス図(線番付き)", { size: 13, weight: 700, anchor: "start" });
  const P = 40, N = 600, y = 384, hy = 440;
  s += Wr([[P, 350], [P, 466]]) + Wr([[N, 350], [N, 466]]);
  s += Wr([[P, y], [90, y]]) + S.place("pbb", 90, y) + T(120, y - 40, "PB1 停止", { size: 11, weight: 700 }) + Wr([[150, y], [230, y]]) + S.place("pba", 230, y) + T(260, y - 40, "PB2 起動", { size: 11, weight: 700 })
    + Wr([[290, y], [470, y]]) + S.place("coil", 470, y) + T(500, y - 22, "MC", { size: 12, weight: 700 }) + T(484, y + 18, "A1", { size: 9, color: K.sub }) + T(516, y + 18, "A2", { size: 9, color: K.sub }) + Wr([[530, y], [N, y]]);
  s += Wr([[190, y], [190, hy], [230, hy]]) + S.place("swa", 230, hy) + T(260, hy + 18, "MC 13-14", { size: 10 }) + Wr([[290, hy], [330, hy], [330, y]]) + Dt(190, y) + Dt(330, y);
  s += tag(66, y, "1", red) + tag(170, y, "2", red) + tag(400, y, "3", red) + tag(566, y, "0", K.blue);
  return svg(640, 486, s);
} };

// ------------------------------------------------------------ まとめ: 腕だめしの図面
FIGS["fig-final"] = { w: 640, h: 470, svg() {
  let s = miniLadder(66, 420, [104, 214, 284], K.ink);
  s += T(46, 104, "1", { size: 12, color: K.sub }) + T(46, 214, "2", { size: 12, color: K.sub }) + T(46, 284, "3", { size: 12, color: K.sub });
  s += T(126, 64, "PB1 停止", { size: 11, weight: 700 }) + T(226, 64, "PB2 起動", { size: 11, weight: 700 }) + T(360, 82, "MC", { size: 12, weight: 700 }) + T(226, 162, "MC", { size: 11, weight: 700 });
  s += T(226, 196, "MC", { size: 11, weight: 700 }) + T(226, 312, "MC", { size: 11, weight: 700 }) + T(360, 192, "RL 運転", { size: 11, weight: 700 }) + T(360, 262, "GL 停止", { size: 11, weight: 700 });
  s += star(268, 238) + revMark(404, 254);
  s += titleBlock(440, 354, 176, [[["図名", "ポンプ運転回路"]], [["図番", "EL-0418", 1.3], ["改訂", "△1", 1]], [["作成", "山田"], ["検図", "佐藤"]]]);
  s += `<rect x="440" y="314" width="176" height="40" fill="#fff" stroke="${K.ink}" stroke-width="1.5"/>` + T(446, 324, "改訂", { size: 9, anchor: "start", color: K.sub }) + T(446, 340, "△1 GL を LED 形に変更", { size: 11, anchor: "start", weight: 700 });
  return svg(640, 470, sheet(640, 470, 4, 3, s));
} };

// ------------------------------------------------------------ 表紙・扉・地
FIGS["cover-art"] = { w: 640, h: 340, svg: () => svg(640, 340, nightLight("#FFFFFF", "#FFD54A"), "#fff") };
const doorIcon = (inner) => svg(320, 170, `<g transform="translate(160 85) scale(3)" style="color:#fff">${inner}</g>`, "#fff");
FIGS["door-01"] = { w: 320, h: 170, svg: () => doorIcon(S.place("lamp", -30, 0)) };
FIGS["door-02"] = { w: 320, h: 170, svg: () => doorIcon(Wr([[-40, 0], [40, 0]]) + Wr([[-12, 0], [-12, -22]]) + Wr([[14, 0], [14, 22]]) + Dt(-12, 0, 4) + Dt(14, 0, 4)) };
FIGS["door-03"] = { w: 320, h: 170, svg: () => doorIcon(S.place("res", -30, -10) + S.place("res", -30, 14, 0, { old: true })) };
FIGS["door-04"] = { w: 320, h: 170, svg: () => doorIcon(S.place("led", -30, 6)) };
FIGS["door-05"] = { w: 320, h: 170, svg: () => doorIcon(S.place("pba", -30, 12)) };
FIGS["door-06"] = { w: 320, h: 170, svg: () => doorIcon(`<rect x="-42" y="-13" width="84" height="26" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>` + [-30, -10, 10, 30].map((x) => S.terminal(x, 0, 5).replace("var(--paper, #fff)", "none")).join("") + Wr([[-30, -13], [-30, -26]]) + Wr([[10, 13], [10, 26]])) };
FIGS["bg-blueprint"] = { w: 768, h: 1024, scale: 1.5, svg() {
  let s = `<rect width="768" height="1024" fill="${K.navy}"/>`;
  for (let x = 0; x <= 768; x += 16) s += `<line x1="${x}" y1="0" x2="${x}" y2="1024" stroke="#fff" stroke-opacity="${x % 80 === 0 ? 0.11 : 0.045}" stroke-width="1"/>`;
  for (let y = 0; y <= 1024; y += 16) s += `<line x1="0" y1="${y}" x2="768" y2="${y}" stroke="#fff" stroke-opacity="${y % 80 === 0 ? 0.11 : 0.045}" stroke-width="1"/>`;
  s += `<rect x="24" y="24" width="720" height="976" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>`;
  return svg(768, 1024, s);
} };
