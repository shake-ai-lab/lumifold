import { CANVAS_SIZES, deckFormat, type Deck, type DeckFormat, type Element } from "./deck";
import { isLineShape, MATH_FONT_SIZE, SHAPE_DEFAULTS, TABLE_FONT_SIZE, textFontSize } from "./defaults";

/**
 * 資料の種類(スライド ⇔ ノート)を変える。PowerPoint の「スライドのサイズ → サイズに合わせて調整」と同じく、
 * 初回は全ページの中身を縦横比を保って新しい大きさに収め、中央に置く。元の種類に戻すときは逆変換する。
 * 文字の大きさ・線幅も同じ倍率にする。変換中に加えた編集も逆変換して引き継ぐ。
 */
export function convertDeckFormat(deck: Deck, format: DeckFormat): Deck {
  const current = deckFormat(deck);
  if (current === format) return deck;
  const from = CANVAS_SIZES[current], to = CANVAS_SIZES[format];
  // Returning to the source format must undo the first fit, including its margins.
  // Persist the source so saving/reopening in the other format is reversible too.
  const returning = deck.formatOrigin === format;
  const k = returning ? 1 / Math.min(from.w / to.w, from.h / to.h) : Math.min(to.w / from.w, to.h / from.h);
  const dx = (to.w - from.w * k) / 2, dy = (to.h - from.h * k) / 2;
  const next: Deck = { ...deck, slides: deck.slides.map((s) => ({ ...s, elements: s.elements.map((el) => scaleElement(el, k, dx, dy)) })) };
  if (format === "note") next.format = "note";
  else delete next.format;
  if (returning) delete next.formatOrigin;
  else next.formatOrigin = current;
  return next;
}

// Keep subpixel/point precision: rounding to whole pixels or half points loses
// information on every round trip, especially for small text and thin lines.
const px = (v: number) => Math.round(v * 1e9) / 1e9;
const pt = px;

function scaleElement(el: Element, k: number, dx: number, dy: number): Element {
  const box = { x: px(el.x * k + dx), y: px(el.y * k + dy), w: px(el.w * k), h: px(el.h * k) };
  switch (el.type) {
    case "text": {
      // 大きさを書いていない文字は役割ごとの既定を倍率にかけて書き込む
      const base = textFontSize(el);
      return { ...el, ...box,
        style: { ...el.style, fontSize: pt(base * k), ...(el.style?.paraSpacing ? { paraSpacing: px(el.style.paraSpacing * k) } : {}) },
        paragraphs: el.paragraphs.map((p) => ({ ...p, runs: p.runs.map((r) => (r.fontSize ? { ...r, fontSize: pt(r.fontSize * k) } : r)) })) };
    }
    case "table":
      // Column widths are relative weights, not canvas pixels.
      return { ...el, ...box, fontSize: pt((el.fontSize ?? TABLE_FONT_SIZE) * k) };
    case "math":
      return { ...el, ...box, fontSize: pt((el.fontSize ?? MATH_FONT_SIZE) * k) };
    case "shape": {
      const out = { ...el, ...box };
      if (el.line) out.line = { ...el.line, width: px(el.line.width * k) };
      else if (el.line === undefined && isLineShape(el.shape)) out.line = { color: SHAPE_DEFAULTS.lineColor, width: px(SHAPE_DEFAULTS.lineWidth * k) };
      if (el.radius !== undefined || el.shape === "roundRect") out.radius = px((el.radius ?? SHAPE_DEFAULTS.radius) * k);
      if (el.arrowHeadLength !== undefined) out.arrowHeadLength = px(el.arrowHeadLength * k);
      if (el.arrowHeadWidth !== undefined) out.arrowHeadWidth = px(el.arrowHeadWidth * k);
      return out;
    }
    default:
      return { ...el, ...box };
  }
}
