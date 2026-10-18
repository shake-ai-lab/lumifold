import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { PT, resolveColor, type Paragraph, type Run, type TextElement, type Theme } from "../../model/deck";
import { DEFAULT_LINE_HEIGHT, textFontSize } from "../../model/defaults";

const BULLET_INDENT = 24; // 1 レベルあたりの字下げ px
const BULLET_WIDTH = 18;

export function TextEl({ el, theme, warn = false }: { el: TextElement; theme: Theme; warn?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    if (!warn || !ref.current) return;
    const node = ref.current;
    let active = true;
    const check = () => { if (active) setOverflow(contentHeight(node) > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1); };
    check(); const observer = new ResizeObserver(check); observer.observe(node);
    void document.fonts.ready.then(check);
    return () => { active = false; observer.disconnect(); };
  }, [el, warn]);
  return <><div ref={ref} style={textBoxStyle(el, theme)}><TextParagraphs paragraphs={el.paragraphs} theme={theme} spacing={el.style?.paraSpacing ?? 0} /></div>
    {warn && overflow && <span className="text-overflow-badge" title="文字が枠からはみ出しています。設定パネルで枠または文字サイズを調整してください。">⚠ 文字がはみ出しています</span>}</>;
}

/** 段落が並んでいる高さ（px）。scrollHeight と違い、行の高さからはみ出すフォントの字面の余白は含めない */
export function contentHeight(box: HTMLElement): number {
  const kids = [...box.children] as HTMLElement[];
  if (!kids.length) return 0;
  return Math.max(...kids.map((k) => k.offsetTop + k.offsetHeight)) - Math.min(...kids.map((k) => k.offsetTop));
}

/**
 * 改行の規則。日本語は文節の途中で切らない(auto-phrase: Chromium 119+ で lang="ja" のとき有効)、
 * 行頭禁則は strict(ー や小書きのかなを行頭に置かない)、1 行に収まらない語だけ任意の位置で折る。
 * 表示・文字編集・枠合わせ・表で共有し、状態を切り替えても改行位置が変わらないようにする。
 */
export const TEXT_WRAP: CSSProperties = { whiteSpace: "pre-wrap", wordBreak: "auto-phrase", overflowWrap: "anywhere", lineBreak: "strict" };

export function textBoxStyle(el: TextElement, theme: Theme): CSSProperties {
  const st = el.style ?? {};
  const sizePt = textFontSize(el);
  const fontKey = st.font ?? (el.role === "title" ? "head" : "body");
  const justify = st.valign === "middle" ? "center" : st.valign === "bottom" ? "flex-end" : "flex-start";
  const box: CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: justify,
    fontSize: sizePt * PT,
    fontWeight: st.bold ? 700 : 400,
    fontStyle: st.italic ? "italic" : "normal",
    fontFamily: `"${theme.fonts[fontKey]}", sans-serif`,
    color: resolveColor(st.color ?? "dk1", theme, "#000000"),
    lineHeight: st.lineHeight ?? DEFAULT_LINE_HEIGHT,
    textAlign: st.align ?? "left",
    overflow: "hidden",
    ...TEXT_WRAP,
  };
  return box;
}

export function TextParagraphs({ paragraphs, theme, spacing }: { paragraphs: Paragraph[]; theme: Theme; spacing: number }) {
  return (
    <>
      {paragraphs.map((p, i) => (
        <ParagraphView key={i} p={p} theme={theme} last={i === paragraphs.length - 1} spacing={spacing} />
      ))}
    </>
  );
}

function ParagraphView({ p, theme, last, spacing }: { p: Paragraph; theme: Theme; last: boolean; spacing: number }) {
  const level = p.level ?? 0;
  const style: CSSProperties = {
    margin: 0,
    marginBottom: last ? 0 : spacing,
    textAlign: p.align,
    display: p.bullet ? "flex" : undefined,
    paddingLeft: p.bullet ? level * BULLET_INDENT : undefined,
    minHeight: "1em",
    flexShrink: 0,
  };
  return (
    <p style={style} data-bullet={p.bullet || undefined} data-level={p.level} data-align={p.align}>
      {p.bullet && (
        <span style={{ flex: "none", width: BULLET_WIDTH, display: "inline-block", userSelect: "none" }} aria-hidden contentEditable={false}>
          {level === 0 ? "•" : "–"}
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }} data-text-content>
        {p.runs.map((r, i) => (
          <RunView key={i} r={r} theme={theme} />
        ))}
        {(p.runs.every((r) => !r.text) || p.runs.map(r => r.text).join("").endsWith("\n")) && <br />}
      </span>
    </p>
  );
}

function RunView({ r, theme }: { r: Run; theme: Theme }) {
  const style: CSSProperties = {};
  if (r.bold !== undefined) style.fontWeight = r.bold ? 700 : 400;
  if (r.italic !== undefined) style.fontStyle = r.italic ? "italic" : "normal";
  if (r.color) style.color = resolveColor(r.color, theme, "inherit");
  if (r.fontSize) style.fontSize = r.fontSize * PT;
  const { text: _text, ...format } = r;
  return <span style={style} data-run={JSON.stringify(format)}>{r.text}</span>;
}
