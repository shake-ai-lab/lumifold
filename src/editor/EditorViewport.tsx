import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "../store";
import { isTypingTarget } from "../keyboard";

const MIN = 0.1, MAX = 4;
const PRESETS = [10, 25, 50, 75, 100, 125, 150, 200, 300, 400];

/** Display zoom never changes document geometry or undo history. */
export function EditorViewport({ canvas, children }: {
  canvas: { w: number; h: number }; children: (scale: number) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  const fit = Math.max(0.05, Math.min((room.w - 48) / canvas.w, (room.h - 48) / canvas.h));
  const scale = zoom ?? fit;
  const anchor = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setRoom({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const changeZoom = (value: number | null, point?: { x: number; y: number }) => {
    const node = ref.current;
    if (!node) return;
    const next = value === null ? null : Math.max(MIN, Math.min(MAX, value));
    if (next === zoom) return;
    const px = point?.x ?? node.clientWidth / 2, py = point?.y ?? node.clientHeight / 2;
    anchor.current = {
      x: (node.scrollLeft + px - Math.max(24, (node.clientWidth - canvas.w * scale) / 2)) / scale,
      y: (node.scrollTop + py - Math.max(24, (node.clientHeight - canvas.h * scale) / 2)) / scale,
      px, py,
    };
    setZoom(next);
  };

  useLayoutEffect(() => {
    const node = ref.current, point = anchor.current;
    if (!node) return;
    if (zoom === null) { node.scrollLeft = 0; node.scrollTop = 0; }
    else if (point) {
      node.scrollLeft = Math.max(24, (node.clientWidth - canvas.w * scale) / 2) + point.x * scale - point.px;
      node.scrollTop = Math.max(24, (node.clientHeight - canvas.h * scale) / 2) + point.y * scale - point.py;
    }
    anchor.current = null;
  }, [zoom, scale, canvas]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1);
      changeZoom(scale * Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.002), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    const key = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.defaultPrevented) return;
      if (isTypingTarget(event.target) || (event.target as HTMLElement | null)?.closest?.("[role=dialog]")) return;
      if (useStore.getState().editingId || useStore.getState().interactingId) return;
      if (!["+", "=", "-", "0"].includes(event.key)) return;
      event.preventDefault();
      changeZoom(event.key === "0" ? null : scale * (event.key === "-" ? 1 / 1.2 : 1.2));
    };
    node.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", key);
    return () => { node.removeEventListener("wheel", wheel); window.removeEventListener("keydown", key); };
  });

  const percent = Math.round(scale * 100);
  const presets = [...new Set([...PRESETS, percent])].sort((a, b) => a - b);
  return <div className="editor-viewport">
    <div ref={ref} className="fit" aria-label="編集キャンバス">
      <div className="fit-content" style={{ width: `max(100%, ${canvas.w * scale + 48}px)`, height: `max(100%, ${canvas.h * scale + 48}px)` }}>
        <div className="fit-inner">{children(scale)}</div>
      </div>
    </div>
    <div className="zoom-controls" role="group" aria-label="表示倍率">
      <span className="zoom-hint">Ctrl＋ホイールで拡大・縮小</span>
      <button type="button" aria-label="縮小" title="縮小 (Ctrl＋−)" disabled={scale <= MIN} onClick={() => changeZoom(scale / 1.2)}>−</button>
      <select aria-label="ズーム倍率" value={zoom === null ? "fit" : String(percent)} onChange={(event) => changeZoom(event.target.value === "fit" ? null : Number(event.target.value) / 100)}>
        <option value="fit">全体表示 ({Math.round(fit * 100)}%)</option>
        {presets.map((value) => <option key={value} value={value}>{value}%</option>)}
      </select>
      <button type="button" aria-label="拡大" title="拡大 (Ctrl＋＋)" disabled={scale >= MAX} onClick={() => changeZoom(scale * 1.2)}>＋</button>
      <button type="button" title="全体表示 (Ctrl＋0)" aria-pressed={zoom === null} onClick={() => changeZoom(null)}>全体表示</button>
    </div>
  </div>;
}
