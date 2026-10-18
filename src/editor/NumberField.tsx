import { useEffect, useRef, useState } from "react";

/** Keep partial input local; one completed edit produces one undo step. */
/** value が null なら「混在」(複数選択で値がそろっていない)。空のまま確定しても何も変えない */
export function NumberField({ value, onCommit, min, max, step = 1, disabled }: {
  value: number | null; onCommit: (value: number) => void; min?: number; max?: number; step?: number; disabled?: boolean;
}) {
  const shown = value === null ? "" : String(value);
  const [draft, setDraft] = useState(shown);
  const cancelled = useRef(false);
  useEffect(() => setDraft(shown), [shown]);
  return <input type="number" value={draft} min={min} max={max} step={step} disabled={disabled} placeholder={value === null ? "混在" : undefined}
    onChange={(e) => setDraft(e.target.value)}
    onBlur={() => {
      const number = Number(draft);
      if (cancelled.current || !draft.trim() || !Number.isFinite(number) || (min !== undefined && number < min) || (max !== undefined && number > max)) {
        cancelled.current = false; setDraft(shown); return;
      }
      if (number !== value) onCommit(number);
    }}
    onKeyDown={(e) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelled.current = true; setDraft(shown); e.currentTarget.blur(); }
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); e.currentTarget.blur(); }
    }} />;
}
