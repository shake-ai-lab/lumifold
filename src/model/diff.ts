import type { Deck } from "./deck";

/** 2 つの deck の違い。スライドと要素は id で対応づける(id は安定させる約束) */
export interface DeckDiff {
  addedSlides: string[];
  removedSlides: string[];
  /** 両方にあって中身が違うスライド */
  changedSlides: string[];
  /** スライドごとの要素の違い(変更・追加したスライドのみ) */
  elements: Record<string, { added: string[]; changed: string[]; removed: string[] }>;
  /** スライドの並び順だけが変わった */
  reordered: boolean;
  /** テーマ・題名・資料の種類などスライド以外 */
  deckChanged: boolean;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function diffDecks(before: Deck, after: Deck): DeckDiff {
  const old = new Map(before.slides.map((s) => [s.id, s]));
  const now = new Map(after.slides.map((s) => [s.id, s]));
  const diff: DeckDiff = { addedSlides: [], removedSlides: [], changedSlides: [], elements: {}, reordered: false,
    deckChanged: !same(before.theme, after.theme) || !same(before.meta, after.meta) || (before.format ?? "slides") !== (after.format ?? "slides")
      || (before.binding ?? "left") !== (after.binding ?? "left") || before.pageNumbers !== after.pageNumbers };
  for (const slide of after.slides) {
    const prev = old.get(slide.id);
    if (!prev) {
      diff.addedSlides.push(slide.id);
      diff.elements[slide.id] = { added: slide.elements.map((e) => e.id), changed: [], removed: [] };
      continue;
    }
    if (same(prev, slide)) continue;
    diff.changedSlides.push(slide.id);
    const prevEls = new Map(prev.elements.map((e) => [e.id, e]));
    const ids = new Set(slide.elements.map((e) => e.id));
    diff.elements[slide.id] = {
      added: slide.elements.filter((e) => !prevEls.has(e.id)).map((e) => e.id),
      changed: slide.elements.filter((e) => prevEls.has(e.id) && !same(prevEls.get(e.id), e)).map((e) => e.id),
      removed: prev.elements.filter((e) => !ids.has(e.id)).map((e) => e.id),
    };
  }
  diff.removedSlides = before.slides.filter((s) => !now.has(s.id)).map((s) => s.id);
  const kept = (slides: Deck["slides"], other: Map<string, unknown>) => slides.filter((s) => other.has(s.id)).map((s) => s.id);
  diff.reordered = !same(kept(before.slides, now), kept(after.slides, old));
  return diff;
}

export function isEmptyDiff(d: DeckDiff): boolean {
  return !d.addedSlides.length && !d.removedSlides.length && !d.changedSlides.length && !d.reordered && !d.deckChanged;
}

/** 「変更 2 枚・追加 1 枚」のような要約 */
export function describeDiff(d: DeckDiff): string {
  const parts = [
    d.changedSlides.length && `変更 ${d.changedSlides.length} 枚`,
    d.addedSlides.length && `追加 ${d.addedSlides.length} 枚`,
    d.removedSlides.length && `削除 ${d.removedSlides.length} 枚`,
    d.reordered && "並べ替え",
    d.deckChanged && "テーマ・題名",
  ].filter(Boolean);
  return parts.length ? parts.join("・") : "見た目の変更なし";
}
