import { useLayoutEffect, useRef, useState } from "react";
import { resolveColor, type TableCell, type TableElement, type Theme } from "../model/deck";
import { TableEl } from "../render/elements/TableEl";
import { TABLE_FONT_SIZE } from "../model/defaults";
import { useStore } from "../store";
import { FloatingBar } from "./FloatingBar";

/** 編集中のセルの文字。文字が無いのにブラウザが <br> を残していても空にする */
function cellText(node: HTMLTableCellElement | undefined): string | undefined {
  if (!node) return undefined;
  return node.textContent === "" ? "" : node.innerText.replace(/\r\n?/g, "\n");
}

/** Edit cells in the same table layout, retaining colors, dimensions and rotation. */
export function TableEditOverlay({ el, theme, scale = 1 }: { el: TableElement; theme: Theme; scale?: number }) {
  const [rows, setRows] = useState<TableCell[][]>(() => {
    const source = el.rows.length ? el.rows : [[{ text: "" }]];
    const cols = Math.max(1, ...source.map((row) => row.length));
    return source.map((row) => Array.from({ length: cols }, (_, col) => ({ ...(row[col] ?? { text: "" }) })));
  });
  const [colW, setColW] = useState(el.colW);
  const [fontSize, setFontSize] = useState(el.fontSize);
  const [fitting, setFitting] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const columnDrag = useRef<{ x: number; y: number; widths: number[]; index: number } | null>(null);
  const [version, setVersion] = useState(0);
  const cols = rows[0].length;
  const initial = Math.max(0, useStore.getState().editingCaret ?? 0);
  const [focus, setFocus] = useState<[number, number]>([Math.min(rows.length - 1, Math.floor(initial / cols)), initial % cols]);
  const focusRef = useRef(focus);
  const cells = useRef(new Map<string, HTMLTableCellElement>());
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    const [row, col] = focusRef.current;
    cells.current.get(`${row}-${col}`)?.focus();
  }, [version]);
  const checkOverflow = () => {
    const overflow = [...cells.current.values()].some(cell => cell.scrollHeight > cell.clientHeight + 1 || cell.scrollWidth > cell.clientWidth + 1);
    setOverflowing(overflow);
    return overflow;
  };
  useLayoutEffect(() => {
    if (checkOverflow() && fitting && (fontSize ?? TABLE_FONT_SIZE) > 6) setFontSize(size => Math.max(6, (size ?? TABLE_FONT_SIZE) - .5));
    else setFitting(false);
  }, [rows, colW, fontSize, fitting]);

  const collect = () => rows.map((row, ri) => row.map((cell, ci) => ({
    ...cell, text: cellText(cells.current.get(`${ri}-${ci}`)) ?? cell.text,
  })));
  const commit = () => {
    if (done.current || useStore.getState().editingId !== el.id) return;
    done.current = true;
    const next = collect();
    if (JSON.stringify(next) !== JSON.stringify(el.rows) || JSON.stringify(colW) !== JSON.stringify(el.colW) || fontSize !== el.fontSize) {
      useStore.getState().patchElement(el.id, { rows: next, colW, fontSize });
    }
    useStore.getState().setEditing(null);
  };
  const cancel = () => { done.current = true; useStore.getState().setEditing(null); };
  const replace = (next: TableCell[][], nextFocus: [number, number], widths = colW) => {
    setRows(next); setColW(widths); focusRef.current = nextFocus; setFocus(nextFocus); setVersion((v) => v + 1);
  };
  const [fr, fc] = focus;
  const widthsFor = (n: number) => colW ? Array.from({ length: n }, () => el.w / n) : undefined;
  const ops = {
    addRow: () => {
      const next = collect(); next.splice(fr + 1, 0, Array.from({ length: cols }, () => ({ text: "" })));
      replace(next, [fr + 1, fc]);
    },
    delRow: () => { if (rows.length > 1) replace(collect().filter((_, i) => i !== fr), [Math.min(fr, rows.length - 2), fc]); },
    addCol: () => replace(collect().map((row) => [...row.slice(0, fc + 1), { text: "" }, ...row.slice(fc + 1)]), [fr, fc + 1], widthsFor(cols + 1)),
    delCol: () => { if (cols > 1) replace(collect().map((row) => row.filter((_, i) => i !== fc)), [fr, Math.min(fc, cols - 2)], widthsFor(cols - 1)); },
  };

  return <div ref={root} className="table-edit" style={{ position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined, transformOrigin: "center center", opacity: el.opacity, background: resolveColor(el.background, theme) }}
    onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
    onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node)) commit(); }}
    onKeyDown={(e) => {
      e.stopPropagation();
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
    }}>
    <FloatingBar anchor={root} className="table-edit-bar" label="表の編集">
      <button onClick={ops.addRow} title="選択セルの下に行を追加">＋行</button>
      <button onClick={ops.delRow} disabled={rows.length <= 1} title="選択セルの行を削除">－行</button>
      <button onClick={ops.addCol} title="選択セルの右に列を追加">＋列</button>
      <button onClick={ops.delCol} disabled={cols <= 1} title="選択セルの列を削除">－列</button>
      <button onClick={() => { setRows(collect()); setFitting(true); }} title="文字を小さくして表の中に収める">文字を収める</button>
      {overflowing && <span className="table-overflow-hint">文字が枠を超えています</span>}
      <button onClick={commit}>完了</button>
      <button onClick={cancel}>取消</button>
    </FloatingBar>
    <TableEl key={version} el={{ ...el, rows, colW, fontSize }} theme={theme} cellProps={(ri, ci) => ({
      ref: (node) => { const key = `${ri}-${ci}`; if (node) cells.current.set(key, node); else cells.current.delete(key); },
      contentEditable: "plaintext-only", suppressContentEditableWarning: true, tabIndex: 0,
      className: fr === ri && fc === ci ? "cell focused" : "cell",
      "aria-label": `${ri + 1}行 ${ci + 1}列`,
      onFocus: () => { focusRef.current = [ri, ci]; setFocus([ri, ci]); },
      onInput: checkOverflow,
      onPaste: (e) => {
        const text = e.clipboardData.getData("text/plain");
        if (!text.includes("\t")) return;
        e.preventDefault();
        const pasted = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map(line => line.split("\t"));
        const next = collect(), newCols = Math.max(cols, ci + Math.max(...pasted.map(row => row.length)));
        while (next.length < ri + pasted.length) next.push([]);
        next.forEach(row => { while (row.length < newCols) row.push({ text: "" }); });
        pasted.forEach((row, r) => row.forEach((value, c) => { next[ri + r][ci + c] = { ...next[ri + r][ci + c], text: value }; }));
        replace(next, [ri, ci], newCols === cols ? colW : undefined);
      },
      onKeyDown: (e) => {
        if (e.key !== "Tab" || e.nativeEvent.isComposing) return;
        e.preventDefault();
        const total = rows.length * cols;
        const next = (ri * cols + ci + (e.shiftKey ? -1 : 1) + total) % total;
        cells.current.get(`${Math.floor(next / cols)}-${next % cols}`)?.focus();
      },
    })} />
    {Array.from({ length: cols - 1 }, (_, index) => {
      const raw = colW?.length === cols ? colW.map(w => Math.max(1, w)) : Array(cols).fill(1);
      const total = raw.reduce((sum, w) => sum + w, 0);
      const widths = raw.map(w => w / total * el.w);
      const left = widths.slice(0, index + 1).reduce((sum, w) => sum + w, 0);
      return <div key={index} role="separator" tabIndex={0} aria-label={`列 ${index + 1} の幅`} aria-orientation="vertical"
        aria-valuenow={Math.round(widths[index])} className="table-column-resizer" style={{ left, width: 8 / scale }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault(); setRows(collect());
          columnDrag.current = { x: e.clientX, y: e.clientY, widths, index };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const drag = columnDrag.current; if (!drag) return;
          const angle = (el.rotation ?? 0) * Math.PI / 180;
          const delta = ((e.clientX - drag.x) * Math.cos(angle) + (e.clientY - drag.y) * Math.sin(angle)) / scale;
          const next = [...drag.widths], pair = next[index] + next[index + 1], min = Math.min(32, pair / 3);
          next[index] = Math.max(min, Math.min(pair - min, drag.widths[index] + delta)); next[index + 1] = pair - next[index]; setColW(next);
        }}
        onPointerUp={(e) => { columnDrag.current = null; e.currentTarget.releasePointerCapture(e.pointerId); }}
        onLostPointerCapture={() => { columnDrag.current = null; }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault(); e.stopPropagation(); setRows(collect());
          const next = [...widths], pair = next[index] + next[index + 1], min = Math.min(32, pair / 3);
          next[index] = Math.max(min, Math.min(pair - min, next[index] + (e.key === "ArrowRight" ? 10 : -10))); next[index + 1] = pair - next[index]; setColW(next);
        }} />;
    })}
  </div>;
}
