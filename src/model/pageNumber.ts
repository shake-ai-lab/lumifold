import { canvasSize, deckFormat, resolveColor, type Deck } from "./deck";

/**
 * 自動のページ番号(ノンブル)の位置と書式。画面(Slide.tsx)と PowerPoint 書き出し(pptx.ts)で同じものを使う。
 * 1 ページ目(表紙)と hidePageNumber のページには付けない。
 * 「外側」は本のように見開きの外側の角: 左綴じでは表紙の次から 左・右・左…、右綴じではその逆。スライドでは右下。
 */
export interface PageNumberBox { text: string; x: number; y: number; w: number; h: number; align: "left" | "center" | "right"; fontSize: number; color: string }

export function pageNumberBox(deck: Deck, index: number): PageNumberBox | null {
  const slide = deck.slides[index];
  if (!deck.pageNumbers || !slide || index <= 0 || slide.hidePageNumber) return null;
  const { w, h } = canvasSize(deck), note = deckFormat(deck) === "note";
  const margin = note ? 64 : 60, bw = 120, bh = note ? 28 : 26;
  const y = h - (note ? 58 : 44);
  let align: PageNumberBox["align"] = "center";
  if (deck.pageNumbers === "outside") {
    // 見開きでは奇数番目(0 始まり)のページが表紙側(左綴じなら左)に来る
    const firstSide = index % 2 === 1;
    align = !note ? "right" : (deck.binding === "right") === firstSide ? "right" : "left";
  }
  const x = align === "left" ? margin : align === "right" ? w - margin - bw : (w - bw) / 2;
  // 地が暗いページでは明るい色で
  const bg = resolveColor(slide.background?.color ?? "lt1", deck.theme, "#FFFFFF");
  const dark = luminance(bg) < 0.45;
  return { text: String(index + 1), x, y, w: bw, h: bh, align, fontSize: note ? 10 : 11,
    color: resolveColor(dark ? "lt2" : "accent5", deck.theme, dark ? "#EEEEEE" : "#777777") };
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 1;
  const v = parseInt(m[1], 16), r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
