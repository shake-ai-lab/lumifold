import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { resolveColor, type MathElement, type Theme } from "../model/deck";
import { MATH_FONT_SIZE } from "../model/defaults";
import { MathEl, mathParseError } from "../render/elements/MathEl";
import { useStore } from "../store";

/**
 * 挿入ボタン。parts の間に「選択していた文字」→ 空欄の順で入る。
 * 選択なしならカーソルは最初の空欄、選択ありなら選択を最初の空欄に入れ、カーソルは次の空欄(なければ末尾)へ。
 */
const INSERTS: { label: string; title: string; parts: string[] }[][] = [[
  { label: "文字", title: "日本語や単語: \\text{…}(空白もそのまま表示)", parts: ["\\text{", "}"] },
  { label: "分数", title: "分数: \\dfrac{分子}{分母}", parts: ["\\dfrac{", "}{", "}"] },
  { label: "x²", title: "上付き: ^{…}", parts: ["^{", "}"] },
  { label: "xᵢ", title: "下付き: _{…}", parts: ["_{", "}"] },
  { label: "√", title: "平方根: \\sqrt{…}", parts: ["\\sqrt{", "}"] },
  { label: "Σ", title: "総和: \\sum_{i=1}^{n}", parts: ["\\sum_{i=1}^{n} ", ""] },
  { label: "行列", title: "行列: \\begin{pmatrix} … \\end{pmatrix}", parts: ["\\begin{pmatrix} ", " & b \\\\ c & d \\end{pmatrix}"] },
], [
  { label: "×", title: "\\times", parts: [" \\times ", ""] },
  { label: "÷", title: "\\div", parts: [" \\div ", ""] },
  { label: "±", title: "\\pm", parts: [" \\pm ", ""] },
  { label: "≦", title: "\\le", parts: [" \\le ", ""] },
  { label: "≧", title: "\\ge", parts: [" \\ge ", ""] },
  { label: "≠", title: "\\neq", parts: [" \\neq ", ""] },
  { label: "→", title: "\\to", parts: [" \\to ", ""] },
  { label: "・", title: "\\cdot", parts: [" \\cdot ", ""] },
]];

/** KaTeX の解析エラーを、直し方がわかる日本語にする */
function describeError(latex: string, displayMode: boolean): string | null {
  const error = mathParseError(latex, displayMode);
  if (!error) return null;
  const raw = error.message.replace(/^KaTeX parse error: /, "");
  // KaTeX 0.16 系の rawMessage に合わせる(tools/e2e-math-edit.mjs で確認)
  const rules: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/Undefined control sequence: (\\[A-Za-z]+|\\.)/, (m) => `「${m[1]}」は使えない命令です`],
    [/Expected '\}', got 'EOF'|expected '\}'/, () => "「}」が足りません。開いた { を閉じてください(\\dfrac は {分子}{分母} の 2 つが必要)"],
    [/Expected 'EOF', got '\}'/, () => "「}」が多すぎます"],
    [/Expected 'EOF', got '&'/, () => "「&」は行列(pmatrix など)の中でだけ使えます"],
    [/Expected 'EOF', got '\\right'/, () => "\\right に対応する \\left がありません"],
    [/Expected '\\right'/, () => "\\left に対応する \\right がありません"],
    [/Double superscript/, () => "上付き ^ が続いています。x^{ab} のように { } でまとめてください"],
    [/Double subscript/, () => "下付き _ が続いています。x_{ab} のように { } でまとめてください"],
    [/Expected group after '(\^|_)'/, (m) => `「${m[1]}」の後に中身がありません`],
    [/No such environment: (\S+)/, (m) => `「${m[1]}」という環境はありません`],
    [/only one infix operator per group/, () => "\\over などは 1 つのまとまりに 1 回だけです。{ } で分けてください"],
  ];
  const hit = rules.map(([re, say]) => { const m = raw.match(re); return m && say(m); }).find(Boolean);
  const where = Number.isFinite(error.position) ? `(${error.position + 1} 文字目付近)` : "";
  return `${hit ?? "数式の書き方に誤りがあります"}${where}`;
}

/** \text{…} の外に日本語があると空白が消えるので、文字ボタンを案内する */
const looseJapanese = (latex: string) => /[　-ヿ㐀-鿿＀-￯]/.test(latex.replace(/\\text\{[^{}]*\}/g, ""));

export function MathEditOverlay({ el, theme }: { el: MathElement; theme: Theme }) {
  const [latex, setLatex] = useState(el.latex);
  const input = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const [covers, setCovers] = useState(false); // 低い画面でパネルが数式に重なるときは、パネル内に描画結果を出す
  const [compact, setCompact] = useState(false); // スライド領域が低いときは見出しを省き、挿入ボタンを 1 行にする
  const error = useMemo(() => describeError(latex, el.displayMode ?? true), [latex, el.displayMode]);

  // 全選択で開くと 1 文字の入力で式が消えるので、カーソルは末尾に置く
  useLayoutEffect(() => { const ta = input.current; ta?.focus(); ta?.setSelectionRange(ta.value.length, ta.value.length); }, []);

  // 入力欄は内容に合わせて伸ばす(上限を超えたら欄の中でスクロール)
  useLayoutEffect(() => {
    const ta = input.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight + 2, 220)}px`;
  }, [latex]);

  // 数式のすぐ下 → 上 → 右 → 左の順に、入る場所へ置く。スライドの周りの領域からはみ出さず、右パネルには重ねない
  useLayoutEffect(() => {
    const stage = anchor.current?.closest(".stage") as HTMLElement | null;
    const layout = () => {
      if (!anchor.current || !panel.current) return;
      const a = anchor.current.getBoundingClientRect();
      const s = stage?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
      const gap = 8;
      setCompact(s.height < 600);
      const width = Math.min(Math.max(a.width, 380), 560, s.width - gap * 2);
      // 置き場所は描画結果の枠を除いた高さで決める(枠の分で「入らない」と判定し続けないように)
      const preview = panel.current.querySelector<HTMLElement>(".math-edit-preview");
      const full = panel.current.offsetHeight, height = full - (preview ? preview.offsetHeight + 8 : 0);
      const clampX = (x: number) => Math.min(Math.max(x, s.left + gap), s.right - gap - width);
      const clampY = (y: number, h = height) => Math.min(Math.max(y, s.top + gap), s.bottom - gap - h);
      const fitsY = (y: number) => y >= s.top + gap && y + height <= s.bottom - gap;
      const fitsX = (x: number) => x >= s.left + gap && x + width <= s.right - gap;
      const below = a.bottom + gap, above = a.top - gap - height, right = a.right + gap, left = a.left - gap - width;
      const spot = fitsY(below) ? { left: clampX(a.left), top: below }
        : fitsY(above) ? { left: clampX(a.left), top: above }
        : fitsX(right) ? { left: right, top: clampY(a.top) }
        : fitsX(left) ? { left, top: clampY(a.top) }
        : { left: clampX(a.left), top: clampY(below) };
      const hides = spot.left < a.right && a.left < spot.left + width && spot.top < a.bottom && a.top < spot.top + height;
      setPlace({ ...spot, top: hides ? clampY(spot.top, full) : spot.top, width });
      setCovers(hides);
    };
    layout();
    const observer = new ResizeObserver(layout);
    if (stage) observer.observe(stage);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", layout);
    return () => { observer.disconnect(); window.removeEventListener("resize", layout); };
  }, []);

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save && latex !== el.latex) useStore.getState().patchElement(el.id, { latex });
    useStore.getState().setEditing(null);
  };

  const insert = (parts: string[]) => {
    const ta = input.current;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end } = ta;
    const selected = ta.value.slice(start, end);
    const text = parts[0] + selected + parts.slice(1).join("");
    const caret = start + parts[0].length + (selected ? selected.length + (parts.length > 2 ? parts[1].length : parts.slice(1).join("").length) : 0);
    ta.focus();
    // execCommand なら入力欄の Ctrl+Z で戻せる。使えない環境では値を直接書き換える
    if (!document.execCommand("insertText", false, text)) {
      ta.setRangeText(text, start, end, "end");
      setLatex(ta.value);
    }
    ta.setSelectionRange(caret, caret);
  };

  return <div ref={anchor} className="math-edit" style={{ position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h, transform: `rotate(${el.rotation ?? 0}deg)` }}
    onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
    onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget) && !panel.current?.contains(e.relatedTarget)) finish(true); }}
    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); finish(false); } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); } }}>
    <div style={{ width: "100%", height: "100%", opacity: el.opacity, background: resolveColor(el.background, theme) }}><MathEl el={{ ...el, latex }} theme={theme} /></div>
    {createPortal(<div ref={panel} className={`math-edit-panel${compact ? " compact" : ""}`} role="dialog" aria-label="数式の編集"
      style={{ ...(place ?? { left: 0, top: 0, width: 380 }), opacity: place ? 1 : 0 }}
      onMouseDown={(e) => { if (e.target !== input.current) e.preventDefault(); /* 入力欄からフォーカスを外さない(余白やボタンで確定しない) */ }}>
      <label htmlFor="math-edit-input">数式（TeX）</label>
      <textarea id="math-edit-input" ref={input} aria-label="TeX数式" aria-invalid={!!error} aria-describedby="math-edit-status" spellCheck={false}
        value={latex} onChange={(e) => setLatex(e.target.value)} />
      {covers && <div className="math-edit-preview" aria-label="描画結果" style={{ background: resolveColor(el.background ?? "lt1", theme) }}>
        <MathEl el={{ ...el, latex, fontSize: Math.min(el.fontSize ?? MATH_FONT_SIZE, 18) }} theme={theme} />
      </div>}
      <p id="math-edit-status" className={error ? "math-edit-error" : "math-edit-ok"} role="status">
        {error ?? (looseJapanese(latex) ? "日本語は「文字」ボタンで \\text{…} に入れると、空白もそのまま表示されます"
          : covers ? "上の枠が描画結果です(スライドの数式はこのパネルの下)" : "スライド上でそのまま確認できます")}
      </p>
      {(compact ? [INSERTS.flat()] : INSERTS).map((row, i) => <div key={i} className="math-insert" role="group" aria-label={compact ? "挿入" : i ? "記号を挿入" : "構造を挿入"}>
        {row.map((b) => <button key={b.label} type="button" title={b.title} onClick={() => insert(b.parts)}>{b.label}</button>)}
      </div>)}
      <div className="math-edit-actions">
        <small>Ctrl+Enter で確定 · Esc で取消</small>
        <button type="button" onClick={() => finish(false)}>取消</button>
        <button type="button" className="primary" onClick={() => finish(true)}>完了</button>
      </div>
    </div>, document.body)}
  </div>;
}
