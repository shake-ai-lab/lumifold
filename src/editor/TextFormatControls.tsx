import { Icon } from "./Icon";
import { useState } from "react";
import { resolveColor, type Theme } from "../model/deck";
import { SCHEME_COLOR_NAMES } from "../model/defaults";
import type { RunFormat } from "./richText";
import { ColorPicker } from "./ColorPicker";

export function TextFormatControls({ value, theme, selectedText, onChange }: {
  value: RunFormat; theme: Theme; selectedText?: boolean; onChange: (patch: RunFormat) => void;
}) {
  const [size, setSize] = useState(String(value.fontSize ?? 16));
  const [format, setFormat] = useState(value);
  const apply = (patch: RunFormat) => { setFormat((prev) => ({ ...prev, ...patch })); onChange(patch); };
  const setFontSize = () => {
    const number = Number(size);
    if (Number.isFinite(number) && number >= 1 && number <= 400) {
      if (number !== format.fontSize) apply({ fontSize: number });
    } else setSize(String(format.fontSize ?? 16));
  };
  return <div className="text-format-controls">
    <div className="format-caption">{selectedText ? "選択した文字" : "テキスト全体"}</div>
    <label className="format-row">文字サイズ
      <input aria-label="文字サイズ" type="number" min="1" max="400" step="1" value={size}
        onChange={(e) => setSize(e.target.value)} onBlur={setFontSize}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setFontSize(); } }} />
      <span>pt</span>
    </label>
    <div className="format-row">
      <button type="button" aria-pressed={!!format.bold} onClick={() => apply({ bold: !format.bold })}><Icon name="bold" />太字</button>
      <button type="button" aria-pressed={!!format.italic} onClick={() => apply({ italic: !format.italic })}><Icon name="italic" />斜体</button>
    </div>
    <div className="format-row">文字色
      <input aria-label="文字色" type="color" value={resolveColor(format.color ?? "dk1", theme, "#000000")}
        onChange={(e) => apply({ color: e.target.value.slice(1).toUpperCase() })} />
    </div>
    <div className="format-colors">
      {SCHEME_COLOR_NAMES.map((color) =>
        <button key={color} type="button" title={color} aria-label={`文字色 ${color}`} aria-pressed={format.color === color}
          style={{ background: resolveColor(color, theme, "#000000") }} onClick={() => apply({ color })} />)}
    </div>
    <ColorPicker value={resolveColor(format.color ?? "dk1", theme, "#000000")} onChange={(color) => apply({ color })} />
  </div>;
}
