// 文字要素の段落と、編集中の文字列での位置のやり取り(キャレットの位置・変更の有無)
import type { Paragraph } from "../model/deck";

export function paragraphsToText(ps: Paragraph[]): string {
  return ps.map((p) => p.runs.map((r) => r.text).join("")).join("\n");
}

/** 描画済みテキスト要素の上の座標から、段落を改行でつないだ文字列での位置を求める(ダブルクリックした所にキャレットを置く) */
export function caretOffsetAt(root: HTMLElement, clientX: number, clientY: number): number | null {
  type CaretDoc = Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
  const range = (document as CaretDoc).caretRangeFromPoint?.(clientX, clientY);
  if (!range || !root.contains(range.startContainer)) return null;
  let offset = 0;
  const paras = Array.from(root.querySelectorAll("p"));
  for (let pi = 0; pi < paras.length; pi++) {
    const walker = document.createTreeWalker(paras[pi], NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => ((n.parentElement?.closest("[aria-hidden]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n === range.startContainer) return offset + range.startOffset;
      offset += (n.textContent ?? "").length;
    }
    if (paras[pi].contains(range.startContainer)) return offset; // 箇条書き記号の上など
    offset += 1; // 段落の区切り(\n)
  }
  return null;
}

/** 段落の中身が同じか（オブジェクトのキーの順序は問わない） */
export function sameParagraphs(a: Paragraph[], b: Paragraph[]): boolean {
  const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v;
  // 空の段落は runs: [] と [{ text: "" }] のどちらでも同じ表示になる
  const norm = (ps: Paragraph[]) => ps.map((p) => ({ ...p, runs: p.runs.filter((r) => r.text !== "") }));
  return JSON.stringify(canon(norm(a))) === JSON.stringify(canon(norm(b)));
}
