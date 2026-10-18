/**
 * 本のページめくりの形(紙を 1 本の折り目で折り返す)。読む画面(Reader.tsx)が毎フレーム呼ぶ。
 *
 * 座標は「本の座標」: 原点は背(とじ目)の上端、右が +x、下が +y。単位は画面の px。
 * 右ページは x = 0〜W、左ページは x = -W〜0 にある。
 * めくる紙の角 C を点 P まで引くと、折り目は C と P の垂直二等分線になり、角の側が折り返されて裏が見える。
 * 計算は「紙が右にある」向きで行い、左から始まるめくりは左右を反転して求める。
 */
export interface Pt { x: number; y: number }
/** CSS の matrix(a, b, c, d, e, f): x' = a x + c y + e、y' = b x + d y + f */
export type Affine = [number, number, number, number, number, number];
/** めくる紙が最初にある側 */
export type Side = "left" | "right";
export type Corner = "top" | "bottom";

export interface Fold {
  /** めくる紙の表の、折れていない部分(表の面の座標。左上が 0,0) */
  front: Pt[];
  /** 折り返した部分(裏の面の座標) */
  back: Pt[];
  /** 裏の面の座標 → 本の座標 */
  backMatrix: Affine;
  /** 折り目(本の座標): 線上の点と、角の側を向いた単位法線 */
  line: { m: Pt; n: Pt };
  /** 同じ折り目を表の面・裏の面の座標で(陰の帯を置くのに使う) */
  frontLine: { m: Pt; n: Pt };
  backLine: { m: Pt; n: Pt };
  /** 角を引いた距離(px)。0 なら折れていない */
  depth: number;
  /** 0 = 元の側に平ら、1 = 反対側に平ら */
  progress: number;
}

const ID: Affine = [1, 0, 0, 1, 0, 0];
const FLIP_X: Affine = [-1, 0, 0, 1, 0, 0];

/** p ∘ q(q を先に当てる) */
export function compose(p: Affine, q: Affine): Affine {
  return [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];
}
export const apply = (m: Affine, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
export const cssMatrix = (m: Affine) => `matrix(${m.map((v) => +v.toFixed(5)).join(",")})`;
export const cssPolygon = (pts: Pt[]) => (pts.length < 3 ? "polygon(0 0, 0 0, 0 0)" : `polygon(${pts.map((p) => `${p.x.toFixed(2)}px ${p.y.toFixed(2)}px`).join(", ")})`);

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const flip = (p: Pt): Pt => ({ x: -p.x, y: p.y });

/** 多角形を半平面 f(p) >= 0 で切り取る(Sutherland–Hodgman を 1 辺だけ) */
function clip(poly: Pt[], f: (p: Pt) => number): Pt[] {
  const out: Pt[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fb >= 0) {
      const t = fa / (fa - fb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  });
  return out;
}

/**
 * 紙は伸びないので、角は背から紙の幅より遠くへは行けない。下の角を持てば紙の下端より下へ、上の角なら上端より上へは引かない。
 * (P は「紙が右にある」向きの座標)
 */
function constrain(p: Pt, w: number, h: number, c: Pt): Pt {
  let q = { x: p.x, y: c.y === 0 ? Math.max(0, p.y) : Math.min(h, p.y) };
  const a = { x: 0, y: c.y }, da = dist(q, a);
  if (da > w) q = { x: a.x + ((q.x - a.x) * w) / da, y: a.y + ((q.y - a.y) * w) / da };
  const b = { x: 0, y: h - c.y }, diag = Math.hypot(w, h), db = dist(q, b);
  if (db > diag) q = { x: b.x + ((q.x - b.x) * diag) / db, y: b.y + ((q.y - b.y) * diag) / db };
  return q;
}

/** 角の元の位置(本の座標) */
export const cornerPoint = (w: number, h: number, side: Side, corner: Corner): Pt =>
  ({ x: side === "right" ? w : -w, y: corner === "top" ? 0 : h });

/** 紙を反対側まで返したときの角の位置(本の座標) */
export const turnedPoint = (w: number, h: number, side: Side, corner: Corner): Pt =>
  ({ x: side === "right" ? -w : w, y: corner === "top" ? 0 : h });

/** 大きさ w x h の紙の角 corner を、本の座標の点 pointer まで引いたときの形 */
export function foldPage(w: number, h: number, side: Side, corner: Corner, pointer: Pt): Fold {
  const toN = side === "right" ? (p: Pt) => p : flip; // 本 ⇔ 計算用(反転は自分自身が逆)
  const linear = (m: Affine) => (v: Pt): Pt => ({ x: m[0] * v.x + m[2] * v.y, y: m[1] * v.x + m[3] * v.y });
  // 表の面 = 元の側に平らに置いた紙、裏の面 = 反対側に平らに置いた紙。どちらも面の左上が原点
  const frontLocal: Affine = side === "right" ? ID : [-1, 0, 0, 1, w, 0];
  const backLocal: Affine = side === "right" ? [-1, 0, 0, 1, w, 0] : ID;
  const toBook = side === "right" ? ID : FLIP_X;
  const c = { x: w, y: corner === "top" ? 0 : h };
  const p = constrain(toN(pointer), w, h, c);
  const d = dist(c, p);
  const rect: Pt[] = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  const progress = Math.min(1, Math.max(0, (c.x - p.x) / (2 * w)));
  if (d < 0.5) {
    const n = { x: 1, y: 0 }, m = { x: w, y: c.y };
    return { front: rect, back: [], backMatrix: compose(toBook, compose(FLIP_X, backLocal)), depth: 0, progress: 0,
      line: { m: toN(m), n: linear(toBook)(n) }, frontLine: { m: apply(frontLocal, m), n: linear(frontLocal)(n) },
      backLine: { m: apply(backLocal, m), n: linear(backLocal)(n) } };
  }
  const n = { x: (c.x - p.x) / d, y: (c.y - p.y) / d };
  const m = { x: (c.x + p.x) / 2, y: (c.y + p.y) / 2 };
  const side0 = (q: Pt) => (q.x - m.x) * n.x + (q.y - m.y) * n.y; // > 0 が角の側(折り返す側)
  const front = clip(rect, (q) => -side0(q));
  const back = clip(rect, side0);
  // 折り目での鏡映: X' = X - 2((X - M)·n) n
  const k = 2 * (m.x * n.x + m.y * n.y);
  const reflect: Affine = [1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.y, 1 - 2 * n.y * n.y, k * n.x, k * n.y];
  // 裏の面の座標 → 紙の座標(backLocal は自分自身が逆) → 折り返す → 本の座標
  const backMatrix = compose(toBook, compose(reflect, backLocal));
  return {
    front: front.map((q) => apply(frontLocal, q)),
    back: back.map((q) => apply(backLocal, q)),
    backMatrix,
    line: { m: toN(m), n: linear(toBook)(n) },
    frontLine: { m: apply(frontLocal, m), n: linear(frontLocal)(n) },
    backLine: { m: apply(backLocal, m), n: linear(backLocal)(n) },
    depth: d,
    progress,
  };
}

/**
 * 折り目に沿った陰の帯の transform。帯は幅 width・高さ 2 * half の div で、
 * toward = 1 なら折り目から法線の向きへ、-1 なら逆向きへ width だけ伸びる(左端または右端が折り目に来る)。
 */
export function stripTransform(line: { m: Pt; n: Pt }, width: number, half: number, toward: 1 | -1): string {
  const angle = Math.atan2(line.n.y, line.n.x);
  return `translate(${line.m.x.toFixed(2)}px, ${line.m.y.toFixed(2)}px) rotate(${angle.toFixed(5)}rad) translate(${toward === 1 ? 0 : (-width).toFixed(2)}px, ${(-half).toFixed(2)}px)`;
}

/** 自動でめくるときの角の通り道。from → to を進みながら、紙の内側へ lift だけ持ち上がる(下の角なら上へ) */
export function arcPoint(from: Pt, to: Pt, corner: Corner, lift: number, t: number): Pt {
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease-in-out
  const up = Math.sin(Math.PI * t) * lift * (corner === "top" ? 1 : -1);
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e + up };
}
