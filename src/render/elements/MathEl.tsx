import { useMemo } from "react";
import katex, { type KatexOptions } from "katex";
import "katex/dist/katex.min.css";
import { PT, resolveColor, type MathElement, type Theme } from "../../model/deck";
import { MATH_FONT_SIZE } from "../../model/defaults";

const KATEX_OPTIONS: KatexOptions = { throwOnError: false, trust: false, maxExpand: 1000, maxSize: 20, strict: "ignore", errorColor: "#ff947d" };

/** 前後の $…$ / $$…$$ / \[…\] を外した TeX */
export function mathSource(latex: string): string {
  const source = latex.trim();
  if (source.startsWith("$$") && source.endsWith("$$")) return source.slice(2, -2);
  if (source.startsWith("$") && source.endsWith("$")) return source.slice(1, -1);
  if (source.startsWith("\\[") && source.endsWith("\\]")) return source.slice(2, -2);
  return source;
}

/** 描画と同じ設定で解釈し、書き方の誤りがあれば KaTeX の ParseError を返す */
export function mathParseError(latex: string, displayMode = true): katex.ParseError | null {
  try {
    katex.renderToString(mathSource(latex), { ...KATEX_OPTIONS, displayMode, throwOnError: true });
    return null;
  } catch (e) {
    return e instanceof katex.ParseError ? e : null;
  }
}

/** 表示と書き出し(pptx の画像化)で同じ HTML を使う */
export function renderMathHtml(latex: string, displayMode = true): string {
  return katex.renderToString(mathSource(latex), { ...KATEX_OPTIONS, displayMode });
}

export function MathEl({ el, theme }: { el: MathElement; theme: Theme }) {
  const html = useMemo(() => renderMathHtml(el.latex, el.displayMode ?? true), [el.latex, el.displayMode]);
  return <div className="math-render" style={{ fontSize: (el.fontSize ?? MATH_FONT_SIZE) * PT, color: resolveColor(el.color ?? "dk1", theme) }}
    dangerouslySetInnerHTML={{ __html: html }} />;
}
