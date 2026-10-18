import { unitName } from "../model/deck";
import { describeDiff } from "../model/diff";
import { useStore } from "../store";

/**
 * 資料が外(Claude Code など)で書き換えられたときの知らせ。
 * 何が変わったか(一覧に「更新」「追加」、スライド上は点線の枠)、変更箇所への移動、まとめて元に戻すを出す。
 */
export function ExternalChangeBanner() {
  const change = useStore((s) => s.externalChange);
  const deck = useStore((s) => s.deck);
  const current = useStore((s) => s.current);
  if (!change || !deck || deck === change.before) return null; // Ctrl+Z などで変更前に戻っていれば出さない
  const { diff } = change;
  const edited = deck !== change.after;
  const touched = new Set([...diff.changedSlides, ...diff.addedSlides]);
  const targets = deck.slides.map((s, i) => (touched.has(s.id) ? i : -1)).filter((i) => i >= 0);
  const counts = Object.values(diff.elements).reduce((sum, e) => ({ added: sum.added + e.added.length, changed: sum.changed + e.changed.length,
    removed: sum.removed + e.removed.length }), { added: 0, changed: 0, removed: 0 });
  const elementSummary = [counts.changed && `変更 ${counts.changed}`, counts.added && `追加 ${counts.added}`, counts.removed && `削除 ${counts.removed}`].filter(Boolean).join("・");
  const next = () => {
    const after = targets.find((i) => i > current) ?? targets[0];
    if (after !== undefined) useStore.getState().setCurrent(after);
  };
  return <div className="external-change" role="status" aria-live="polite">
    <strong>資料が外部で更新されました</strong>
    <span>{unitName(deck)}: {describeDiff(diff)}{elementSummary && ` / 要素: ${elementSummary}`}</span>
    {change.backup && <span className="external-change-note" title={change.backup}>変更前の版は .history に保存済み</span>}
    <span className="external-change-actions">
      {targets.length > 0 && <button onClick={next} title={`変更・追加された${unitName(deck)}へ順に移動`}>変更箇所へ（{targets.length}）</button>}
      <button disabled={edited} onClick={() => useStore.getState().revertExternalChange()}
        title={edited ? "その後に編集したため使えません。Ctrl+Z で 1 つずつ戻せます" : "外部の変更をすべて取り消して、変更前に戻す"}>元に戻す</button>
      <button onClick={() => useStore.getState().dismissExternalChange()}>閉じる</button>
    </span>
  </div>;
}
