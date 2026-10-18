import type { ShapeElement, ShapeKind, ShapePoint } from "./deck";

export const SHAPES: [ShapeKind, string][] = [
  ["rect", "四角"], ["roundRect", "角丸"], ["ellipse", "円"], ["line", "線"], ["arrow", "矢印"],
  ["triangle", "三角形"], ["diamond", "ひし形"], ["parallelogram", "平行四辺形"], ["trapezoid", "台形"],
  ["pentagon", "五角形"], ["hexagon", "六角形"], ["star", "星"], ["rightArrow", "右矢印"],
  ["leftArrow", "左矢印"], ["upArrow", "上矢印"], ["downArrow", "下矢印"], ["doubleArrow", "左右矢印"],
  ["chevron", "山形"], ["callout", "吹き出し"], ["cylinder", "円柱"], ["heart", "ハート"],
];
export const BLOCK_ARROWS: ShapeKind[] = ["rightArrow", "leftArrow", "upArrow", "downArrow", "doubleArrow"];
const pts = (...coords: number[]): ShapePoint[] => Array.from({ length: coords.length / 2 }, (_, i) => ({ x: coords[i * 2], y: coords[i * 2 + 1] }));
/**
 * 編集点の編集で使う頂点。表示と同じ線の位置になるよう、rect は線幅の半分、triangle は線幅ぶん内側に寄せた点を返す
 * （ShapeEl の rect・triangle は線を枠の内側に描き、ほかの図形は頂点の上に線の中心を置く）。角の形も表示に合わせる
 */
export function editablePoints(el: ShapeElement): { points: ShapePoint[]; lineJoin: "miter" | "round" } | null {
  const points = shapePoints(el);
  if (!points) return null;
  const sw = el.line ? el.line.width : 0;
  const inset = el.shape === "rect" ? sw / 2 : el.shape === "triangle" ? sw : 0;
  const ix = Math.min(inset, el.w / 2) / el.w, iy = Math.min(inset, el.h / 2) / el.h;
  return {
    points: points.map((p) => ({ x: ix + p.x * (1 - 2 * ix), y: iy + p.y * (1 - 2 * iy) })),
    lineJoin: el.lineJoin ?? (el.shape === "rect" || el.shape === "triangle" ? "miter" : "round"),
  };
}

export function shapePoints(el: ShapeElement): ShapePoint[] | null {
  const shaft = Math.max(0.05, Math.min(0.95, el.shaftRatio ?? 0.4));
  const head = Math.max(0.05, Math.min(0.45, el.headRatio ?? 0.3));
  const top = (1 - shaft) / 2, bottom = 1 - top;
  const arrow = pts(0, top, 1 - head, top, 1 - head, 0, 1, .5, 1 - head, 1, 1 - head, bottom, 0, bottom);
  switch (el.shape) {
    case "polygon": return el.points?.length ? el.points : pts(0, 0, 1, 0, 1, 1, 0, 1);
    case "rect": return pts(0, 0, 1, 0, 1, 1, 0, 1);
    case "triangle": return pts(.5, 0, 1, 1, 0, 1);
    case "diamond": return pts(.5, 0, 1, .5, .5, 1, 0, .5);
    case "parallelogram": return pts(.2, 0, 1, 0, .8, 1, 0, 1);
    case "trapezoid": return pts(.2, 0, .8, 0, 1, 1, 0, 1);
    case "hexagon": return pts(.25, 0, .75, 0, 1, .5, .75, 1, .25, 1, 0, .5);
    case "pentagon":
    case "star": {
      const count = el.shape === "star" ? 10 : 5;
      return Array.from({ length: count }, (_, i) => {
        const angle = -Math.PI / 2 + i * Math.PI * 2 / count;
        const r = el.shape === "star" && i % 2 ? .22 : .5;
        return { x: .5 + Math.cos(angle) * r, y: .5 + Math.sin(angle) * r };
      });
    }
    case "rightArrow": return arrow;
    case "leftArrow": return arrow.map(({ x, y }) => ({ x: 1 - x, y }));
    case "upArrow": return arrow.map(({ x, y }) => ({ x: y, y: 1 - x }));
    case "downArrow": return arrow.map(({ x, y }) => ({ x: y, y: x }));
    case "doubleArrow": return pts(0, .5, head, 0, head, top, 1 - head, top, 1 - head, 0, 1, .5, 1 - head, 1, 1 - head, bottom, head, bottom, head, 1);
    case "chevron": return pts(0, 0, .7, 0, 1, .5, .7, 1, 0, 1, .3, .5);
    case "callout": return pts(0, 0, 1, 0, 1, .75, .45, .75, .2, 1, .25, .75, 0, .75);
    default: return null;
  }
}

export function lineEndpoints(el: ShapeElement): [ShapePoint, ShapePoint] {
  const angle = (el.rotation ?? 0) * Math.PI / 180;
  const dx = Math.cos(angle) * el.w / 2, dy = Math.sin(angle) * el.w / 2;
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
  return [{ x: cx - dx, y: cy - dy }, { x: cx + dx, y: cy + dy }];
}
export function lineFromEndpoints(a: ShapePoint, b: ShapePoint, height: number): Partial<ShapeElement> {
  const w = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
  return { x: (a.x + b.x) / 2 - w / 2, y: (a.y + b.y) / 2 - height / 2, w, h: height,
    rotation: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
}
