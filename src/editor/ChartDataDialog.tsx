import { useEffect, useRef, useState } from "react";
import type { ChartElement } from "../model/deck";
import { useStore } from "../store";

/**
 * グラフのデータを表で直すダイアログ。1 行目が系列名、1 列目がラベル。
 * Excel などからコピーした表(タブ区切り)を、どのセルにでも貼り付けられる。
 */
export function ChartDataDialog({ el }: { el: ChartElement }) {
  const { patchElement, openDialog } = useStore.getState();
  const [grid, setGrid] = useState<string[][]>(() => {
    const c = el.chart;
    return [["", ...c.series.map((s) => s.name)], ...c.labels.map((l, i) => [l, ...c.series.map((s) => String(s.values[i] ?? ""))])];
  });
  const rows = grid.length, cols = Math.max(...grid.map((r) => r.length));
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { root.current?.querySelector<HTMLInputElement>("tbody tr:nth-child(2) input:not([disabled])")?.focus(); }, []);
  // 数値として読めない値のセル(空欄は 0 として扱う)。あるうちは適用できない
  const toNumber = (v: string) => Number(v.replace(/[,，\s]/g, "").replace(/[０-９．－]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)));
  const invalid = (r: number, c: number) => r > 0 && c > 0 && (grid[r]?.[c] ?? "").trim() !== "" && !Number.isFinite(toNumber(grid[r][c]));
  const invalidCount = grid.reduce((n, row, r) => n + row.filter((_, c) => invalid(r, c)).length, 0);

  const setCell = (r: number, c: number, v: string) =>
    setGrid((g) => g.map((row, ri) => (ri === r ? Array.from({ length: Math.max(row.length, c + 1) }, (_, ci) => (ci === c ? v : row[ci] ?? "")) : row)));

  const pasteAt = (r0: number, c0: number, text: string) => {
    const block = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
    setGrid((g) => {
      const out = g.map((r) => [...r]);
      block.forEach((line, i) =>
        line.forEach((v, j) => {
          const r = r0 + i, c = c0 + j;
          while (out.length <= r) out.push([]);
          while (out[r].length <= c) out[r].push("");
          out[r][c] = v.trim();
        }),
      );
      const w = Math.max(...out.map((r) => r.length));
      return out.map((r) => [...r, ...Array(w - r.length).fill("")]);
    });
  };

  const apply = () => {
    if (invalidCount) return;
    const body = grid.slice(1).filter((r) => r.some((v) => v.trim() !== ""));
    const labels = body.map((r) => r[0] ?? "");
    const series = Array.from({ length: cols - 1 }, (_, k) => ({
      name: grid[0][k + 1] || `系列${k + 1}`,
      values: body.map((r) => {
        const raw = String(r[k + 1] ?? "").trim();
        const n = toNumber(raw);
        return raw && Number.isFinite(n) ? n : 0;
      }),
    }));
    patchElement(el.id, { chart: { ...el.chart, labels, series: series.length ? series : [{ name: "系列1", values: labels.map(() => 0) }] } });
    openDialog(null);
  };

  return (
    <div className="dialog-backdrop" onMouseDown={() => openDialog(null)}>
      <div ref={root} className="dialog chart-data-dialog" role="dialog" aria-modal="true" aria-labelledby="chart-data-title" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") openDialog(null);
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) apply();
      }}>
        <h3 id="chart-data-title">グラフのデータ</h3>
        <p className="hint">1 行目 = 系列名、1 列目 = ラベル。Excel の表をコピーして、どのセルにでも貼り付けられます。</p>
        <div className="grid-wrap">
          <table className="data-grid">
            <tbody>
              {grid.map((row, r) => (
                <tr key={r}>
                  {Array.from({ length: cols }, (_, c) => (
                    <td key={c} className={r === 0 ? "head" : c === 0 ? "label" : invalid(r, c) ? "invalid" : ""}>
                      {r === 0 && c === 0 ? (
                        <span className="corner">ラベル ＼ 系列</span>
                      ) : (
                        <input
                          value={row[c] ?? ""}
                          aria-label={r === 0 ? `系列 ${c} の名前` : c === 0 ? `${r} 行目のラベル` : `${r} 行目・系列 ${c} の値`}
                          aria-invalid={invalid(r, c) || undefined}
                          placeholder={r === 0 ? `系列${c}` : c === 0 ? `ラベル${r}` : "0"}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          onPaste={(e) => {
                            const t = e.clipboardData.getData("text/plain");
                            if (t.includes("\t") || t.includes("\n")) {
                              e.preventDefault();
                              pasteAt(r, c, t);
                            }
                          }}
                        />
                      )}
                    </td>
                  ))}
                  <td className="ops">
                    {r > 0 && rows > 2 && (
                      <button title="この行を消す" onClick={() => setGrid((g) => g.filter((_, i) => i !== r))}>×</button>
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} className="ops">
                    {c > 0 && cols > 2 && (
                      <button title="この系列を消す" onClick={() => setGrid((g) => g.map((row) => row.filter((_, i) => i !== c)))}>×</button>
                    )}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="dialog-btns">
          <button onClick={() => setGrid((g) => [...g, Array(cols).fill("")])}>＋行(ラベル)</button>
          <button onClick={() => setGrid((g) => g.map((row, i) => [...row, i === 0 ? `系列${cols}` : ""]))}>＋系列</button>
          <span className="dialog-status" role="status">{invalidCount ? `数値でないセルが ${invalidCount} 個あります(赤枠)` : ""}</span>
          <button onClick={() => openDialog(null)}>取り消し</button>
          <button className="primary" disabled={!!invalidCount} onClick={apply}>適用 (Ctrl+Enter)</button>
        </div>
      </div>
    </div>
  );
}
