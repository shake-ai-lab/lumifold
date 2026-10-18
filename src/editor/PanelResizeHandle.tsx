import { useRef } from "react";
import { readStored } from "../storage";

export function PanelResizeHandle({ label, width, min, max, side, onChange, onReset }: {
  label: string; width: number; min: number; max: number; side: "left" | "right";
  onChange: (width: number) => void; onReset: () => void;
}) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const change = (value: number) => onChange(Math.min(max, Math.max(min, value)));
  return <div className="panel-resizer" role="separator" aria-label={label} aria-orientation="vertical"
    aria-valuemin={min} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(width)} tabIndex={0}
    title="ドラッグで幅を変更 · ダブルクリックで元の幅に戻す"
    onPointerDown={(e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      start.current = { x: e.clientX, width };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.classList.add("resizing");
    }}
    onPointerMove={(e) => { if (start.current) change(start.current.width + (e.clientX - start.current.x) * (side === "left" ? 1 : -1)); }}
    onLostPointerCapture={(e) => { start.current = null; e.currentTarget.classList.remove("resizing"); }}
    onPointerUp={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
    onDoubleClick={onReset}
    onKeyDown={(e) => {
      if (e.key === "Home") { e.preventDefault(); onReset(); }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault(); e.stopPropagation();
        change(width + (e.key === "ArrowRight" ? 1 : -1) * (side === "left" ? 1 : -1) * (e.shiftKey ? 40 : 10));
      }
    }} />;
}

export function readPanelWidth(key: string, fallback: number) {
  const value = Number(readStored(key));
  return value >= 140 && value <= 600 ? value : fallback;
}
