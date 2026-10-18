import type { Element } from "../model/deck";
import { isLineShape } from "../model/defaults";

export interface Box { x: number; y: number; w: number; h: number }

const rad = (deg = 0) => (deg * Math.PI) / 180;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** 回転を含めた外接矩形(Moveable のグループ枠と同じ) */
export function outerBox(els: Element[]): Box {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const el of els) {
    const c = Math.abs(Math.cos(rad(el.rotation))), s = Math.abs(Math.sin(rad(el.rotation)));
    const hw = (el.w * c + el.h * s) / 2, hh = (el.w * s + el.h * c) / 2;
    const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
    x1 = Math.min(x1, cx - hw); y1 = Math.min(y1, cy - hh);
    x2 = Math.max(x2, cx + hw); y2 = Math.max(y2, cy + hh);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * グループの枠 from を to に伸縮したときの各要素(PowerPoint のグループの拡大縮小と同じく、文字の大きさや線幅は変えない)。
 * 直線・矢印は両端を写して向きと長さを決め直す。ほかの回転した要素は自分の向きの伸び率で近似する(縦横比を保つときは正確)
 */
export function scaleInto(els: Element[], from: Box, to: Box): Record<string, Partial<Element>> {
  const sx = from.w ? to.w / from.w : 1, sy = from.h ? to.h / from.h : 1;
  const out: Record<string, Partial<Element>> = {};
  for (const el of els) {
    const c = Math.cos(rad(el.rotation)), s = Math.sin(rad(el.rotation));
    const cx = to.x + (el.x + el.w / 2 - from.x) * sx, cy = to.y + (el.y + el.h / 2 - from.y) * sy;
    const along = Math.hypot(c * sx, s * sy);
    const w = el.w * along;
    let h = el.h * Math.hypot(s * sx, c * sy), rotation = el.rotation;
    if (el.type === "shape" && isLineShape(el.shape)) {
      h = el.h;
      if (sx !== sy) {
        const deg = Math.round((Math.atan2(s * sy, c * sx) * 180) / Math.PI * 10) / 10;
        const norm = ((deg % 360) + 360) % 360;
        rotation = norm === 0 ? undefined : norm;
      }
    }
    out[el.id] = { x: r1(cx - w / 2), y: r1(cy - h / 2), w: r1(w), h: r1(h), rotation };
  }
  return out;
}
