import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";

export type MenuItem = { label: string; icon?: IconName; shortcut?: string; onClick: () => void; disabled?: boolean; danger?: boolean } | "sep";

export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
  content?: ReactNode;
}

/** 右クリックメニュー。外をクリック・Esc・スクロールで閉じる */
export function ContextMenu({ menu, onClose }: { menu: MenuState | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    // 画面の端からはみ出さないよう寄せる
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(menu.y, window.innerHeight - r.height - 4)) });
  }, [menu]);

  useEffect(() => {
    if (menu && pos && (!menu.content || ref.current?.querySelector(".shape-gallery"))) ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [menu, pos]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (document.documentElement.dataset.pickingColor === "true") return;
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "keydown") { e.preventDefault(); e.stopPropagation(); }
      if ((e.type === "pointerdown" || e.type === "wheel") && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close, true);
    window.addEventListener("blur", close);
    window.addEventListener("wheel", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  return createPortal(
    <div
      ref={ref}
      className="context-menu"
      role="dialog"
      aria-label="右クリックメニュー"
      style={{ left: pos?.x ?? menu.x, top: pos?.y ?? menu.y, visibility: pos ? "visible" : "hidden" }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}
    >
      {menu.content}
      {menu.items.map((it, i) =>
        it === "sep" ? (
          <div key={i} className="sep" />
        ) : (
          <button
            key={i}
            className={it.danger ? "danger" : ""}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onClick();
            }}
          >
            <span className="menu-action-label">{it.icon && <Icon name={it.icon} />}{it.label}</span>
            {it.shortcut && <kbd>{it.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
