import { useEffect, useState } from "react";
import { useStore } from "../store";

const PALETTE = ["FFFFFF", "D1D5DB", "6B7280", "111827", "000000", "EF4444", "F97316", "F59E0B", "FACC15", "84CC16", "22C55E", "10B981", "14B8A6", "06B6D4", "0EA5E9", "3B82F6", "6366F1", "8B5CF6", "A855F7", "D946EF", "EC4899", "F43F5E", "FECACA", "FED7AA", "FEF08A", "BBF7D0", "A5F3FC", "BFDBFE", "DDD6FE", "FBCFE8"];
type EyeDropperConstructor = new () => { open: () => Promise<{ sRGBHex: string }> };

export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hex, setHex] = useState(value);
  const [picking, setPicking] = useState(false);
  useEffect(() => setHex(value), [value]);
  const apply = (color: string) => { setHex(color); onChange(color.replace(/^#/, "").toUpperCase()); };
  const commit = () => {
    const code = hex.replace(/^#/, "");
    if (/^[\da-f]{6}$/i.test(code)) apply(code);
    else if (/^[\da-f]{3}$/i.test(code)) apply(code.split("").map(c => c + c).join(""));
    else setHex(value);
  };
  const EyeDropper = (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper;
  return <div className="color-picker">
    <div className="custom-color-row">
      <input aria-label="自由な色" type="color" value={/^#[\da-f]{6}$/i.test(value) ? value : "#000000"} onChange={(e) => apply(e.target.value)} />
      <input aria-label="カラーコード" type="text" value={hex} maxLength={7} onChange={(e) => setHex(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
      <button type="button" disabled={!EyeDropper || picking} title={EyeDropper ? "画面上の色を拾う（Esc で取消）" : "この環境はスポイトに対応していません"}
        onClick={async () => {
          if (!EyeDropper) return;
          setPicking(true); document.documentElement.dataset.pickingColor = "true";
          try { apply((await new EyeDropper().open()).sRGBHex); }
          catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) useStore.getState().flash("スポイトを開始できませんでした"); }
          finally { setPicking(false); delete document.documentElement.dataset.pickingColor; }
        }}>スポイト</button>
    </div>
    <div className="color-palette">{PALETTE.map(color => <button key={color} type="button" aria-label={`色 #${color}`} title={`#${color}`}
      style={{ background: `#${color}` }} onClick={() => apply(color)} />)}</div>
  </div>;
}
