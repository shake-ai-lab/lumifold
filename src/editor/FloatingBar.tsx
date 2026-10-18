import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * 編集中の要素に付く操作バー。スライドの拡縮や回転に関係なく画面の座標で置き、
 * スライドの周りの領域(.stage)からはみ出さない: 要素の上 → 入らなければ下 → それも無理なら領域の上端。
 * 横は要素の左端に揃え、右に入らなければ左へずらす。
 * ボタンを押しても編集中の要素からフォーカスを奪わない(奪うと「外をクリックしたら確定」が働いてしまう)。
 */
export function FloatingBar({ anchor, className, label, children }: {
  anchor: RefObject<HTMLElement | null>; className: string; label: string; children: ReactNode;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    const stage = anchor.current?.closest(".stage") as HTMLElement | null;
    const layout = () => {
      if (!anchor.current || !bar.current) return;
      const a = anchor.current.getBoundingClientRect();
      const s = stage?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
      const gap = 6, w = bar.current.offsetWidth, h = bar.current.offsetHeight;
      const above = a.top - gap - h, below = a.bottom + gap;
      const top = above >= s.top + gap ? above : below + h <= s.bottom - gap ? below : s.top + gap;
      const left = Math.max(s.left + gap, Math.min(a.left, s.right - gap - w));
      setPlace({ left, top });
    };
    layout();
    const observer = new ResizeObserver(layout);
    if (stage) observer.observe(stage);
    if (bar.current) observer.observe(bar.current);
    window.addEventListener("resize", layout);
    return () => { observer.disconnect(); window.removeEventListener("resize", layout); };
  }, [anchor]);
  return createPortal(<div ref={bar} className={`floating-bar ${className}`} role="toolbar" aria-label={label}
    style={{ ...(place ?? { left: 0, top: 0 }), visibility: place ? undefined : "hidden" }}
    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}>
    {children}
  </div>, document.body);
}
