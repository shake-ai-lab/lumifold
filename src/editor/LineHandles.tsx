import { useRef } from "react";
import type { ShapeElement, ShapePoint } from "../model/deck";
import { lineEndpoints, lineFromEndpoints } from "../model/shapes";
import { useStore } from "../store";

export function LineHandles({ el, scale, onPreview }: { el: ShapeElement; scale: number; onPreview: (patch: Partial<ShapeElement> | null) => void }) {
  const drag = useRef<{ x: number; y: number; points: [ShapePoint, ShapePoint]; index: number; patch: Partial<ShapeElement> | null } | null>(null);
  return <div className="line-handles">
    {lineEndpoints(el).map((p, index) => <button key={index} className="shape-point" aria-label={index ? "終点" : "始点"}
      style={{ left: p.x, top: p.y, width: 11 / scale, height: 11 / scale, borderWidth: 2 / scale }}
      onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation(); e.preventDefault();
        drag.current = { x: e.clientX, y: e.clientY, points: lineEndpoints(el), index, patch: null };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current; if (!d) return;
        const points: [ShapePoint, ShapePoint] = [...d.points];
        points[d.index] = { x: d.points[d.index].x + (e.clientX - d.x) / scale, y: d.points[d.index].y + (e.clientY - d.y) / scale };
        if (e.shiftKey) {
          const anchor = points[1 - d.index], moved = points[d.index];
          const angle = Math.round(Math.atan2(moved.y - anchor.y, moved.x - anchor.x) / (Math.PI / 4)) * Math.PI / 4;
          const length = Math.hypot(moved.x - anchor.x, moved.y - anchor.y);
          points[d.index] = { x: anchor.x + Math.cos(angle) * length, y: anchor.y + Math.sin(angle) * length };
        }
        d.patch = lineFromEndpoints(points[0], points[1], el.h);
        onPreview(d.patch);
      }}
      onPointerUp={(e) => {
        if (drag.current?.patch) useStore.getState().patchElement(el.id, drag.current.patch);
        drag.current = null; onPreview(null); e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onLostPointerCapture={() => { drag.current = null; onPreview(null); }}
      onKeyDown={(e) => {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!delta) return;
        e.preventDefault(); e.stopPropagation();
        const points = lineEndpoints(el), step = e.shiftKey ? 10 : 1;
        points[index] = { x: p.x + delta[0] * step, y: p.y + delta[1] * step };
        useStore.getState().patchElement(el.id, lineFromEndpoints(points[0], points[1], el.h));
      }} />)}
  </div>;
}
