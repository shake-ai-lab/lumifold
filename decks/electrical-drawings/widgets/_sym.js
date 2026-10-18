// 電気図記号(JIS C 0617 / IEC 60617 に沿った、教材用の描き方)を SVG の文字列で作る。
// ウィジェット(/*INC:_sym.js*/)と資料の図版(tools/create-electrical-assets.mjs)で共有する。
// 2 端子の記号は横向きで、端子は (0,0) と (60,0)。線の色は currentColor(CSS の color で変わる)。
// 接点の向き: a 接点は可動片が上へ浮く、b 接点は可動片が下へ傾いて固定側の短い線に触れる(IEC の縦向きの記号を右へ 90° 回した形)。
const SYM = (() => {
  const FONT = '"BIZ UDPGothic", "Yu Gothic UI", "Meiryo", sans-serif';
  const r2 = (v) => Math.round(v * 100) / 100;
  const P = (d, extra = "") => `<path d="${d}"${extra}/>`;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // 塗りつぶした矢じり(x2, y2 が先端)
  function head(x1, y1, x2, y2, s = 6) {
    const a = Math.atan2(y2 - y1, x2 - x1), w = s * 0.5;
    const bx = x2 - s * Math.cos(a), by = y2 - s * Math.sin(a);
    return `<path d="M${r2(x2)} ${r2(y2)}L${r2(bx - w * Math.sin(a))} ${r2(by + w * Math.cos(a))}L${r2(bx + w * Math.sin(a))} ${r2(by - w * Math.cos(a))}Z" fill="currentColor" stroke="none"/>`;
  }
  const arrow = (x1, y1, x2, y2, s = 6) => {
    const a = Math.atan2(y2 - y1, x2 - x1);
    return P(`M${r2(x1)} ${r2(y1)}L${r2(x2 - s * 0.7 * Math.cos(a))} ${r2(y2 - s * 0.7 * Math.sin(a))}`) + head(x1, y1, x2, y2, s);
  };
  const txt = (x, y, s, size = 14, extra = "") =>
    `<text x="${r2(x)}" y="${r2(y)}" font-size="${size}" text-anchor="middle" dominant-baseline="central" fill="currentColor" stroke="none" font-family='${FONT}'${extra}>${esc(s)}</text>`;
  const circ = (cx, cy, r, extra = "") => `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}"${extra}/>`;
  const rect = (x, y, w, h, extra = "") => `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}"${extra}/>`;
  const bumps = (n, dx, dy, sweep) => Array.from({ length: n }, () => `a4.5 4.5 0 0 ${sweep} ${dx} ${dy}`).join("");
  const plus = (x, y, s = 3) => P(`M${x - s} ${y}H${x + s}M${x} ${y - s}V${y + s}`, ' stroke-width="1.6"');
  const minus = (x, y, s = 3) => P(`M${x - s} ${y}H${x + s}`, ' stroke-width="1.6"');
  const diodeBody = () => P("M0 0H22M38 0H60M38 -10V10") + P("M22 -10L38 0L22 10Z", ' fill="currentColor"');
  const resBody = (old) => (old ? P("M0 0H14L16.67 -7L22 7L27.33 -7L32.67 7L38 -7L43.33 7L46 0H60") : P("M0 0H15M45 0H60") + rect(15, -6, 30, 12));

  // 接点。closed は「いま閉じているか」ではなく可動片の位置: a 接点は押されると閉じ、b 接点は押されると開く
  // 閉じた a 接点は線に埋もれないよう、接点の位置に小さな点を打つ(動きを見せる図のため)
  const shut = () => circ(20, 0, 2.8, ' fill="currentColor" stroke="none"') + circ(40, 0, 2.8, ' fill="currentColor" stroke="none"');
  function contactA(on) { return P("M0 0H20M40 0H60") + (on ? P("M20 0L40 0", ' stroke-width="3.2"') + shut() : P("M20 0L41 -12")); }
  function contactB(on) {
    // on = 動作した(押された・コイルに電気が来た)
    const end = on ? [20 + 24 * Math.cos(0.7), 24 * Math.sin(0.7)] : [44, 10];
    return P("M0 0H20M40 0H60M40 0V8") + P(`M20 0L${r2(end[0])} ${r2(end[1])}`);
  }
  // 押しボタンの操作部(点線の軸と頭)。y は可動片の中央の高さ
  function pusher(y) {
    const top = y - 16;
    return P(`M30 ${r2(y - 1)}V${r2(top)}`, ' stroke-dasharray="3 2.5"') + P(`M24 ${r2(top + 3)}V${r2(top)}H36V${r2(top + 3)}`);
  }

  const shapes = {
    res: (o) => resBody(o.old),
    vres: (o) => resBody(o.old) + arrow(17, 14, 44, -14, 7),
    pot: (o) => resBody(o.old) + P("M30 -24V-12") + head(30, -24, 30, o.old ? -8 : -6, 7),
    ldr: (o) => resBody(o.old) + arrow(14, -24, 24, -12, 6) + arrow(24, -26, 34, -14, 6),
    cap: () => P("M0 0H26M34 0H60M26 -12V12M34 -12V12"),
    ecap: () => P("M0 0H26M34 0H60M26 -12V12M34 -12V12") + plus(18, -13),
    vcap: () => P("M0 0H26M34 0H60M26 -12V12M34 -12V12") + arrow(17, 14, 44, -14, 7),
    ind: () => P(`M0 0H12${bumps(4, 9, 0, 1)}H60`),
    xfmr: () => P(`M0 -18H20${bumps(4, 0, 9, 1)}H0M60 -18H40${bumps(4, 0, 9, 0)}H60M28 -20V20M32 -20V20`),
    diode: () => diodeBody(),
    led: () => diodeBody() + arrow(28, -13, 37, -22, 6) + arrow(35, -10, 44, -19, 6),
    pd: () => diodeBody() + arrow(39, -24, 30, -15, 6) + arrow(46, -20, 37, -11, 6),
    zener: () => P("M0 0H22M38 0H60M34 -13L38 -10V10L42 13") + P("M22 -10L38 0L22 10Z", ' fill="currentColor"'),
    npn: () => circ(31, 0, 19) + P("M0 0H22M22 -12V12M22 -6L38 -16V-30M22 6L38 16V30") + head(22, 6, 37, 15.4, 7),
    pnp: () => circ(31, 0, 19) + P("M0 0H22M22 -12V12M22 -6L38 -16V-30M22 6L38 16V30") + head(38, 16, 23.5, 7, 7),
    nmos: () => circ(29, 0, 19) + P("M0 6H16M16 -12V12M22 -14V-8M22 -3V3M22 8V14M22 -11H38V-30M22 11H38V30M38 0V11") + arrow(38, 0, 23, 0, 6),
    opamp: () => P("M10 -26L10 26L56 0ZM0 -12H10M0 12H10M56 0H70") + minus(17, -12) + plus(17, 12),
    lamp: () => P("M0 0H18M42 0H60") + circ(30, 0, 12) + P("M21.5 -8.5L38.5 8.5M38.5 -8.5L21.5 8.5"),
    motor: () => P("M0 0H16M44 0H60") + circ(30, 0, 14) + txt(30, 0.5, "M", 15, ' font-weight="700"'),
    meter: (o) => P("M0 0H16M44 0H60") + circ(30, 0, 14) + txt(30, 0.5, o.letter || "V", 15, ' font-weight="700"'),
    buzzer: () => P("M0 0H22M38 0H60M22 0V-12M38 0V-12") + P("M14 -12H46A16 16 0 0 1 14 -12Z"),
    acsrc: () => P("M0 0H18M42 0H60") + circ(30, 0, 12) + P("M22.5 0C25 -6 28 -6 30 0C32 6 35 6 37.5 0"),
    batt: () => P("M0 0H27M33 0H60M27 -13V13") + P("M33 -7V7", ' stroke-width="4.5"') + plus(19, -14),
    fuse: () => P("M0 0H60") + rect(15, -5, 30, 10),
    mccb: (o) => P("M0 0H20M40 0H60") + (o.on ? P("M20 0L40 0", ' stroke-width="3.2"') + shut() : P("M20 0L41 -12")) + P("M36.5 -3.5L43.5 3.5M43.5 -3.5L36.5 3.5"),
    swa: (o) => contactA(o.on),
    swb: (o) => contactB(o.on),
    swc: () => P("M0 0H20M40 -12H60M40 10H60M40 10V2") + P("M20 0L44 8.5"),
    pba: (o) => contactA(o.on) + pusher(o.on ? 0 : -6),
    pbb: (o) => contactB(o.on) + pusher(o.on ? 10 * Math.tan(0.7) : 4.2),
    coil: () => P("M0 0H18M42 0H60") + rect(18, -8, 24, 16),
    coilold: () => P("M0 0H17M43 0H60") + circ(30, 0, 13),
    gnd: () => P("M0 0V10M-12 10H12M-7.5 15.5H7.5M-3 21H3"),
    pe: () => P("M0 0V10M-12 10H12M-7.5 15.5H7.5M-3 21H3") + circ(0, 14, 16),
    chassis: () => P("M0 0V10M-12 10H12M-12 10L-17 18M-2 10L-7 18M8 10L3 18"),
    sgnd: () => P("M0 0V10M-11 10H11L0 21Z"),
    vcc: (o) => P("M0 0V-12M-11 -12H11") + txt(0, -22, o.text || "+5V", 13, ' font-weight="700"'),
    term: () => P("M0 0H24") + circ(30, 0, 5, ' fill="var(--paper, #fff)"'),
    plug: () => P("M0 0H22M22 -8V8M22 -8H34M22 8H34") + P("M60 0H40M40 -6A8 8 0 0 0 40 6", ""),
  };

  // 端子の位置(回す前の座標)。2 端子の記号は a(0,0) と b(60,0)
  const TWO = { a: [0, 0], b: [60, 0] };
  const PINS = {
    pot: { a: [0, 0], b: [60, 0], w: [30, -24] },
    xfmr: { p1: [0, -18], p2: [0, 18], s1: [60, -18], s2: [60, 18] },
    npn: { b: [0, 0], c: [38, -30], e: [38, 30] },
    pnp: { b: [0, 0], c: [38, -30], e: [38, 30] },
    nmos: { g: [0, 6], d: [38, -30], s: [38, 30] },
    opamp: { m: [0, -12], p: [0, 12], o: [70, 0] },
    swc: { a: [0, 0], b: [60, -12], c: [60, 10] },
    gnd: { a: [0, 0] }, pe: { a: [0, 0] }, chassis: { a: [0, 0] }, sgnd: { a: [0, 0] }, vcc: { a: [0, 0] },
  };
  // 画像にするときの枠(回す前の座標、線幅込みの余白は呼ぶ側で足す)
  const BOX = {
    res: [0, -8, 60, 16], vres: [0, -16, 60, 32], pot: [0, -26, 60, 34], ldr: [0, -28, 60, 36], cap: [0, -13, 60, 26], ecap: [0, -17, 60, 30], vcap: [0, -16, 60, 32],
    ind: [0, -6, 60, 8], xfmr: [0, -21, 60, 42], diode: [0, -11, 60, 22], led: [0, -24, 60, 35], pd: [0, -26, 60, 37], zener: [0, -14, 60, 28],
    npn: [0, -31, 52, 62], pnp: [0, -31, 52, 62], nmos: [0, -31, 50, 62], opamp: [0, -27, 70, 54], lamp: [0, -13, 60, 26], motor: [0, -15, 60, 30], meter: [0, -15, 60, 30],
    buzzer: [0, -14, 60, 22], acsrc: [0, -13, 60, 26], batt: [0, -18, 60, 32], fuse: [0, -6, 60, 12], mccb: [0, -14, 60, 18], swa: [0, -14, 60, 16], swb: [0, -2, 60, 14],
    swc: [0, -14, 60, 26], pba: [0, -24, 60, 26], pbb: [0, -14, 60, 26], coil: [0, -9, 60, 18], coilold: [0, -14, 60, 28], gnd: [-13, 0, 26, 22], pe: [-17, -3, 34, 34],
    chassis: [-18, 0, 32, 19], sgnd: [-12, 0, 24, 22], vcc: [-16, -30, 32, 30], term: [0, -6, 36, 12], plug: [0, -9, 60, 18],
  };
  const SW = 2; // 線幅
  const G = (inner, extra = "") => `<g fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"${extra}>${inner}</g>`;
  function draw(kind, o = {}) {
    const f = shapes[kind];
    if (!f) throw new Error("unknown symbol " + kind);
    return f(o);
  }
  function place(kind, x, y, rot = 0, o = {}) {
    const t = `translate(${r2(x)} ${r2(y)})` + (rot ? ` rotate(${rot})` : "") + (o.flip ? " scale(1 -1)" : "");
    return G(draw(kind, o), ` transform="${t}"${o.cls ? ` class="${o.cls}"` : ""}${o.attrs || ""}`);
  }
  function pin(kind, x, y, rot, name) {
    const p = (PINS[kind] || TWO)[name];
    if (!p) throw new Error(`${kind} has no pin ${name}`);
    const a = (rot * Math.PI) / 180;
    return [r2(x + p[0] * Math.cos(a) - p[1] * Math.sin(a)), r2(y + p[0] * Math.sin(a) + p[1] * Math.cos(a))];
  }
  // 単体の記号の SVG(画像・図鑑のカード用)。pad は余白、scale は拡大率
  function standalone(kind, o = {}, pad = 6, scale = 1) {
    const [bx, by, bw, bh] = BOX[kind];
    const w = bw + pad * 2, h = bh + pad * 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bx - pad} ${by - pad} ${w} ${h}" width="${r2(w * scale)}" height="${r2(h * scale)}">${G(draw(kind, o))}</svg>`;
  }

  // ---- 回路図を描く道具(座標はそのまま px)
  const wire = (pts, extra = "") => `<polyline points="${pts.map((p) => p.map(r2).join(",")).join(" ")}" fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
  const dot = (x, y, r = 3.6) => `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r}" fill="currentColor" stroke="none"/>`;
  const terminal = (x, y, r = 4.2) => `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r}" fill="var(--paper, #fff)" stroke="currentColor" stroke-width="${SW}"/>`;
  function label(x, y, s, o = {}) {
    const size = o.size || 13, anchor = o.anchor || "middle";
    const extra = (o.weight ? ` font-weight="${o.weight}"` : "") + (o.color ? ` fill="${o.color}"` : ' fill="currentColor"') + (o.attrs || "");
    return `<text x="${r2(x)}" y="${r2(y)}" font-size="${size}" text-anchor="${anchor}" dominant-baseline="central" stroke="none" font-family='${FONT}'${extra}>${esc(s)}</text>`;
  }
  // 2 点の間に 2 端子の記号を置き、余った長さは線でつなぐ。o.name / o.value を記号の脇に書く
  function between(kind, x1, y1, x2, y2, o = {}) {
    const len = Math.hypot(x2 - x1, y2 - y1), rot = Math.round((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI);
    const a = (rot * Math.PI) / 180, off = (len - 60) / 2;
    const sx = x1 + off * Math.cos(a), sy = y1 + off * Math.sin(a);
    let s = "";
    if (off > 0.5 && !o.noLeads) s += wire([[x1, y1], [sx, sy]], o.wireAttrs || "") + wire([[sx + 60 * Math.cos(a), sy + 60 * Math.sin(a)], [x2, y2]], o.wireAttrs || "");
    s += place(kind, sx, sy, rot, o);
    if (o.name || o.value) {
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, horiz = Math.abs(y2 - y1) < 1;
      const side = o.side || (horiz ? "above" : "right"), gap = o.gap || (horiz ? 20 : 20);
      const lines = [o.name, o.value].filter(Boolean);
      const size = o.size || 13;
      lines.forEach((t, i) => {
        const weight = i === 0 && o.name ? "700" : "400";
        if (side === "above") s += label(cx, cy - gap - (lines.length - 1 - i) * (size + 2), t, { size, weight, color: o.labelColor });
        else if (side === "below") s += label(cx, cy + gap + i * (size + 2), t, { size, weight, color: o.labelColor });
        else if (side === "right") s += label(cx + gap, cy + (i - (lines.length - 1) / 2) * (size + 2), t, { size, weight, anchor: "start", color: o.labelColor });
        else s += label(cx - gap, cy + (i - (lines.length - 1) / 2) * (size + 2), t, { size, weight, anchor: "end", color: o.labelColor });
      });
    }
    return s;
  }

  // 図鑑・クイズに出す記号(cat: passive / semi / switch / power)
  const LIST = [
    { key: "res", name: "抵抗器", code: "R", cat: "passive", desc: "電流を流れにくくして、量を調整する。", tip: "新 JIS は長方形。ギザギザは旧 JIS とアメリカ式" },
    { key: "res", old: true, id: "res-old", name: "抵抗器(旧JIS)", answer: "抵抗器", code: "R", cat: "passive", desc: "古い図面や海外の図面で見るギザギザの抵抗。", tip: "長方形もギザギザも同じ抵抗器" },
    { key: "vres", name: "可変抵抗器", code: "VR", cat: "passive", desc: "抵抗の値を変えられる。", tip: "斜めに突き抜ける矢印 =「値を変えられる」" },
    { key: "pot", name: "ボリューム(3 端子)", code: "VR", cat: "passive", desc: "つまみで分ける割合を変える。音量つまみなど。", tip: "体に当たる矢印 = 動く接点(ワイパ)" },
    { key: "cap", name: "コンデンサ", code: "C", cat: "passive", desc: "電気をためて放す。直流は通さず、交流は通す。", tip: "2 枚の板が向かい合う形" },
    { key: "ecap", name: "電解コンデンサ", code: "C", cat: "passive", desc: "容量が大きい。+ と − の向き(極性)がある。", tip: "+ の印がある板が + 側。逆につなぐと壊れる" },
    { key: "ind", name: "コイル", code: "L", cat: "passive", desc: "電流の変化をじゃまする。フィルタや電源に使う。", tip: "ばねのように巻いた線の形" },
    { key: "xfmr", name: "変圧器(トランス)", code: "T", cat: "passive", desc: "2 つのコイルで交流の電圧を変える。", tip: "向かい合う 2 つのコイル + 鉄心の 2 本線" },
    { key: "diode", name: "ダイオード", code: "D", cat: "semi", desc: "電流を一方向にだけ流す。", tip: "三角の向きに流れる。棒の側がカソード(−)" },
    { key: "led", name: "発光ダイオード(LED)", code: "D / LED", cat: "semi", desc: "電流が流れると光る。向きがある。", tip: "外へ出ていく 2 本の矢印 = 光を出す" },
    { key: "pd", name: "フォトダイオード", code: "D / PD", cat: "semi", desc: "光が当たると電流が流れる。光センサー。", tip: "入ってくる矢印 = 光を受ける" },
    { key: "zener", name: "ツェナーダイオード", code: "ZD", cat: "semi", desc: "逆向きにかけた電圧を一定に保つ。", tip: "棒の両端が曲がっている" },
    { key: "npn", name: "トランジスタ(NPN)", code: "Q / Tr", cat: "semi", desc: "小さな電流で大きな電流を開け閉めする。", tip: "矢印が外向き。Not Pointing iN = NPN" },
    { key: "pnp", name: "トランジスタ(PNP)", code: "Q / Tr", cat: "semi", desc: "NPN と電流の向きが逆のトランジスタ。", tip: "矢印が内向き(Pointing iN = PNP)" },
    { key: "nmos", name: "MOSFET(N チャネル)", code: "Q", cat: "semi", desc: "ゲートの電圧で大きな電流を開け閉めする。", tip: "ゲートが離れて描かれる = 電流をほぼ使わない" },
    { key: "opamp", name: "オペアンプ", code: "U / IC", cat: "semi", desc: "+ と − の入力の差を大きくして出す。", tip: "三角形 = 増幅器" },
    { key: "swa", name: "a 接点(メーク接点)", code: "S / SW", cat: "switch", desc: "ふだんは開いていて、動作すると閉じる。", tip: "可動片が浮いている = ふだんは切れている" },
    { key: "swb", name: "b 接点(ブレーク接点)", code: "S / SW", cat: "switch", desc: "ふだんは閉じていて、動作すると開く。", tip: "可動片が短い線に触れている = ふだんはつながる" },
    { key: "pba", name: "押しボタン(a 接点)", code: "PB", cat: "switch", desc: "押している間だけ閉じる。起動ボタンに使う。", tip: "点線 = 頭と接点が機械的につながっている" },
    { key: "pbb", name: "押しボタン(b 接点)", code: "PB", cat: "switch", desc: "押している間だけ開く。停止ボタンに使う。", tip: "押すと触れていた接点が離れる" },
    { key: "coil", name: "リレーのコイル", code: "K / MC / X", cat: "switch", desc: "電気が来ると、同じ名前の接点が一斉に動く。", tip: "長方形 + 名前。旧 JIS は円で描く" },
    { key: "fuse", name: "ヒューズ", code: "F", cat: "switch", desc: "流れすぎると中の線が溶けて回路を切る。", tip: "長方形を線が突き抜ける" },
    { key: "mccb", name: "配線用遮断器(ブレーカ)", code: "MCCB / CB", cat: "switch", desc: "流れすぎを検知して自動で切る。戻せば再び使える。", tip: "接点の × 印 = 遮断できる" },
    { key: "batt", name: "電池(直流電源)", code: "BT / E", cat: "power", desc: "直流の電源。長い線が +、短い太い線が −。", tip: "長い = +、短い = −" },
    { key: "acsrc", name: "交流電源", code: "AC", cat: "power", desc: "コンセントのように向きが入れかわる電源。", tip: "丸の中の波 = 交流" },
    { key: "lamp", name: "ランプ(表示灯)", code: "PL / L", cat: "power", desc: "電気が来ると光る。運転中の表示などに使う。", tip: "丸の中の × = ランプ" },
    { key: "motor", name: "電動機(モータ)", code: "M", cat: "power", desc: "電気で回る機械。", tip: "丸 + M。丸は回る機械や計器" },
    { key: "meter", name: "電圧計", code: "V", cat: "power", desc: "電圧を測る計器。A なら電流計。", tip: "丸 + 測るものの文字" },
    { key: "gnd", name: "接地(アース)", code: "E / GND", cat: "power", desc: "大地につなぐ。回路の 0 V の基準にも使う。", tip: "下へ短くなっていく 3 本線" },
    { key: "chassis", name: "フレーム接続(シャーシ)", code: "FG", cat: "power", desc: "機械の金属の枠につなぐ。", tip: "斜めの線 = 金属の枠" },
    { key: "sgnd", name: "信号グラウンド", code: "GND", cat: "power", desc: "電子回路で 0 V の基準を表すことが多い形。", tip: "下向きの三角(描き方は会社やツールで違う)" },
  ];
  return { FONT, head, arrow, draw, place, pin, standalone, wire, dot, terminal, label, between, LIST, BOX, G };
})();
