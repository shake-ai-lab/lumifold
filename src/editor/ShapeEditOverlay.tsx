import { useLayoutEffect, useRef, useState } from "react";
import { resolveColor, type ShapeElement, type ShapePoint, type Theme } from "../model/deck";
import { editablePoints } from "../model/shapes";
import { ShapeEl } from "../render/elements/ShapeEl";
import { useStore } from "../store";
import { FloatingBar } from "./FloatingBar";

export function ShapeEditOverlay({ el, theme, scale }: { el: ShapeElement; theme: Theme; scale: number }) {
  const [start] = useState(() => editablePoints(el)!);
  const [points, setPoints] = useState(start.points);
  const pointsRef = useRef(points);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const history = useRef<ShapePoint[][]>([points]);
  const historyIndex = useRef(0);
  const drag = useRef<{ x: number; y: number; points: ShapePoint[] } | null>(null);
  const update = (next: ShapePoint[]) => { pointsRef.current = next; setPoints(next); };
  const remember = () => {
    if (JSON.stringify(history.current[historyIndex.current]) === JSON.stringify(pointsRef.current)) return;
    history.current = [...history.current.slice(0, historyIndex.current + 1), pointsRef.current];
    historyIndex.current++;
  };
  useLayoutEffect(() => { root.current?.focus(); }, []);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const pts = pointsRef.current;
    if (save && JSON.stringify(pts) !== JSON.stringify(start.points)) {
      // Refit the box around edited vertices, preserving their rotated slide positions.
      const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
      const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
      const w = Math.max(1, (maxX - minX) * el.w), h = Math.max(1, (maxY - minY) * el.h);
      const dx = ((minX + maxX) / 2 - .5) * el.w, dy = ((minY + maxY) / 2 - .5) * el.h;
      const angle = (el.rotation ?? 0) * Math.PI / 180;
      useStore.getState().patchElement(el.id, { shape: "polygon", w, h,
        x: el.x + el.w / 2 + dx * Math.cos(angle) - dy * Math.sin(angle) - w / 2,
        y: el.y + el.h / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) - h / 2,
        points: pts.map(p => ({ x: (p.x - minX) * el.w / w, y: (p.y - minY) * el.h / h })),
        lineJoin: start.lineJoin === "miter" ? "miter" : undefined });
    }
    useStore.getState().setEditing(null);
  };
  const remove = () => {
    if (pointsRef.current.length <= 3) return;
    update(pointsRef.current.filter((_, i) => i !== active)); setActive(0); remember();
  };
  return <div ref={root} className="shape-edit" tabIndex={0} aria-label="図形の編集点"
    style={{ position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h,
      transform: `rotate(${el.rotation ?? 0}deg)` }}
    onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
    onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) finish(true); }}
    onKeyDown={(e) => {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
      else if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); }
      else if ((e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        const index = historyIndex.current + (e.key.toLowerCase() === "y" || e.shiftKey ? 1 : -1);
        if (history.current[index]) { historyIndex.current = index; update(history.current[index]); setActive(0); }
      } else {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!delta) return;
        e.preventDefault(); const step = e.shiftKey ? 10 : 1;
        update(pointsRef.current.map((p, i) => i === active ? { x: p.x + delta[0] * step / el.w, y: p.y + delta[1] * step / el.h } : p)); remember();
      }
    }}>
    <div style={{ opacity: el.opacity, background: resolveColor(el.background, theme) }}><ShapeEl el={{ ...el, shape: "polygon", points, lineJoin: start.lineJoin }} theme={theme} /></div>
    <FloatingBar anchor={root} className="shape-edit-bar" label="編集点の操作">
      <span>編集点</span><button onClick={() => finish(true)}>完了</button><button onClick={() => finish(false)}>取消</button>
      <button disabled={points.length <= 3} onClick={remove}>点を削除</button><span>小さい＋で点を追加</span>
    </FloatingBar>
    {points.map((p, i) => {
      const next = points[(i + 1) % points.length];
      // 画面上で短い辺には「＋」を出さない(隣の辺の＋や編集点と重なって押せなくなる)
      if (Math.hypot((next.x - p.x) * el.w, (next.y - p.y) * el.h) * scale < 30) return null;
      return <button key={`add-${i}`} className="shape-point point-add" aria-label={`辺 ${i + 1} に点を追加`}
        style={{ left: (p.x + next.x) / 2 * el.w, top: (p.y + next.y) / 2 * el.h, width: 13 / scale, height: 13 / scale, fontSize: 12 / scale }}
        onClick={() => { const added = [...points]; added.splice(i + 1, 0, { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 }); update(added); setActive(i + 1); remember(); }}>+</button>;
    })}
    {points.map((p, i) => <button key={i} className={`shape-point vertex${i === active ? " active" : ""}`} aria-label={`編集点 ${i + 1}`}
      style={{ left: p.x * el.w, top: p.y * el.h, width: 11 / scale, height: 11 / scale, borderWidth: 2 / scale }}
      onFocus={() => setActive(i)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation(); setActive(i);
        drag.current = { x: e.clientX, y: e.clientY, points: pointsRef.current };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current; if (!d) return;
        const dx = (e.clientX - d.x) / scale, dy = (e.clientY - d.y) / scale, angle = (el.rotation ?? 0) * Math.PI / 180;
        update(d.points.map((point, j) => j === i ? { x: point.x + (dx * Math.cos(angle) + dy * Math.sin(angle)) / el.w,
          y: point.y + (-dx * Math.sin(angle) + dy * Math.cos(angle)) / el.h } : point));
      }}
      onPointerUp={(e) => { remember(); drag.current = null; e.currentTarget.releasePointerCapture(e.pointerId); }}
      onLostPointerCapture={() => { if (drag.current) { update(drag.current.points); drag.current = null; } }} />)}
  </div>;
}
