import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { gridColor, PT, resolveColor, type TableElement, type Theme } from "../../model/deck";
import { TABLE_FONT_SIZE } from "../../model/defaults";
import { TEXT_WRAP } from "./TextEl";

export function TableEl({ el, theme, cellProps }: { el: TableElement; theme: Theme;
  cellProps?: (row: number, col: number) => HTMLAttributes<HTMLTableCellElement> & { ref?: Ref<HTMLTableCellElement> };
}) {
  const rows = el.rows.length ? el.rows : [[{ text: "" }]];
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const colW = el.colW && el.colW.length === cols ? el.colW.map(w => Math.max(1, w)) : Array(cols).fill(1);
  const header = el.header ?? true;
  const headBg = resolveColor("accent1", theme, "#333333");
  const headFg = resolveColor("lt1", theme, "#FFFFFF");
  const altBg = resolveColor("lt2", theme, "#F3F3F3");
  // 地の行は透明にしない(下の要素が 1 行おきに透ける)。要素の背景色があればそれを見せ、なければスライドの背景色で塗る
  const baseBg = el.background ? "transparent" : `var(--slide-bg, ${resolveColor("lt1", theme, "#FFFFFF")})`;
  const fg = resolveColor("dk1", theme, "#000000");
  const GRID_COLOR = gridColor(theme);
  const table: CSSProperties = {
    width: "100%",
    height: "100%",
    display: "grid",
    gridTemplateColumns: colW.map(w => `minmax(0, ${w}fr)`).join(" "),
    gridTemplateRows: `repeat(${rows.length}, minmax(0, 1fr))`,
    borderTop: `1px solid ${GRID_COLOR}`,
    borderLeft: `1px solid ${GRID_COLOR}`,
    fontSize: (el.fontSize ?? TABLE_FONT_SIZE) * PT,
    color: fg,
  };
  return (
    <table style={table}>
      <tbody style={{ display: "contents" }}>
        {rows.map((row, ri) => {
          const isHead = header && ri === 0;
          const rowBg = isHead ? headBg : (header ? ri - 1 : ri) % 2 === 1 ? altBg : baseBg;
          return (
            <tr key={ri} style={{ display: "contents" }}>
              {Array.from({ length: cols }, (_, ci) => {
                const c = row[ci] ?? { text: "" };
                return (
                <td
                  key={ci}
                  {...cellProps?.(ri, ci)}
                  style={{
                    borderRight: `1px solid ${GRID_COLOR}`,
                    borderBottom: `1px solid ${GRID_COLOR}`,
                    display: "block", minWidth: 0, minHeight: 0, alignContent: "center",
                    padding: "4px 8px",
                    verticalAlign: "middle",
                    textAlign: c.align ?? "left",
                    fontWeight: isHead || c.bold ? 700 : 400,
                    color: c.color ? resolveColor(c.color, theme, fg) : isHead ? headFg : fg,
                    background: c.fill ? resolveColor(c.fill, theme, rowBg) : rowBg,
                    overflow: "hidden",
                    ...TEXT_WRAP,
                  }}
                >
                  {c.text}
                </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
