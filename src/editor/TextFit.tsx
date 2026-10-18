import { Icon } from "./Icon";
import { useLayoutEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { canvasSize, unitName, type TextElement, type Theme } from "../model/deck";
import { TextParagraphs, contentHeight, textBoxStyle } from "../render/elements/TextEl";
import { textFontSize } from "../model/defaults";
import { useStore } from "../store";

export function textHeight(el: TextElement, theme: Theme): number {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${el.w}px;visibility:hidden;pointer-events:none`;
  host.innerHTML = renderToStaticMarkup(<div style={textBoxStyle(el, theme)}><TextParagraphs paragraphs={el.paragraphs} theme={theme} spacing={el.style?.paraSpacing ?? 0} /></div>);
  const box = host.firstElementChild as HTMLElement;
  box.style.height = "auto"; box.style.justifyContent = "flex-start"; box.style.overflow = "visible";
  document.body.appendChild(host);
  const height = Math.ceil(contentHeight(box)) + 2;
  host.remove();
  return height;
}

function scaledText(el: TextElement, factor: number): TextElement {
  const base = textFontSize(el);
  return { ...el, style: { ...el.style, fontSize: base * factor,
    paraSpacing: (el.style?.paraSpacing ?? 0) * factor }, paragraphs: el.paragraphs.map(p => ({ ...p,
    runs: p.runs.map(r => r.fontSize ? { ...r, fontSize: r.fontSize * factor } : r) })) };
}

export function TextFit({ el, theme }: { el: TextElement; theme: Theme }) {
  const [height, setHeight] = useState(0);
  const editing = useStore(s => s.editingId === el.id);
  const deck = useStore(s => s.deck);
  const pageH = canvasSize(deck).h;
  useLayoutEffect(() => {
    let active = true;
    const measure = () => { if (active) setHeight(textHeight(el, theme)); };
    measure(); void document.fonts.ready.then(measure);
    return () => { active = false; };
  }, [el, theme]);
  const overflow = height > el.h + 1;
  const fit = () => {
    let low = 0.01, high = 1;
    for (let i = 0; i < 16; i++) {
      const mid = (low + high) / 2;
      if (textHeight(scaledText(el, mid), theme) <= el.h) low = mid; else high = mid;
    }
    const next = scaledText(el, low);
    useStore.getState().patchElement(el.id, { style: next.style, paragraphs: next.paragraphs });
  };
  return <div className="text-fit-controls">
    {overflow && <p role="status" className="overflow-message">文字が枠からはみ出しています</p>}
    <div className="btns">
      <button disabled={!!el.locked || editing || height > pageH || height < 1} onClick={() => useStore.getState().patchElement(el.id,
        { h: height, y: Math.min(el.y, pageH - height) })}><Icon name="fitFrame" />枠を内容に合わせる</button>
      <button disabled={editing || !overflow} onClick={fit}><Icon name="fitText" />文字を枠に収める</button>
    </div>
    {height > pageH && <p className="hint">1枚に収まらない分量です。文字を縮めるか、{unitName(deck)}を分けてください。</p>}
    {editing && <p className="hint">入力を確定すると枠を調整できます。</p>}
  </div>;
}
