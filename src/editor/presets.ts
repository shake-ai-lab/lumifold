import { DEFAULT_THEME, CANVAS_SIZES, type Deck, type DeckFormat, type TextElement } from "../model/deck";
import { PAGE_MARGIN } from "../model/defaults";
import { newId } from "../model/ids";

/** 見出し・本文の枠。スライドは左右 60、ノートは左右 64(layouts.ts の作法と同じ) */
export function textPreset(kind: "title" | "body", format: DeckFormat = "slides"): TextElement {
  const note = format === "note", { w } = CANVAS_SIZES[format], margin = PAGE_MARGIN[format];
  return { id: newId("text"), type: "text", role: kind,
    x: margin, y: kind === "title" ? (note ? 72 : 43) : 180, w: w - margin * 2, h: kind === "title" ? (note ? 80 : 86) : (note ? 520 : 360),
    style: { fontSize: kind === "title" ? (note ? 24 : 36) : (note ? 14 : 26), bold: kind === "title" },
    paragraphs: [{ runs: [{ text: kind === "title" ? "見出しを入力" : "本文を入力" }] }] };
}

export function blankDeck(title: string, layout: boolean, format: DeckFormat = "slides"): Deck {
  const head = textPreset("title", format);
  head.paragraphs = [{ runs: [{ text: title }] }];
  return { version: 1, ...(format === "note" ? { format } : {}), meta: { title, created: new Date().toISOString().slice(0, 10) },
    theme: structuredClone(DEFAULT_THEME),
    slides: [{ id: newId("slide"), elements: layout ? [head, textPreset("body", format)] : [] }] };
}
