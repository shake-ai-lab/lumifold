import { Icon } from "./Icon";
import { useStore, type AlignKind } from "../store";
import { unitName } from "../model/deck";

const ALIGNMENTS: [AlignKind, string][] = [["left", "左揃え"], ["hcenter", "左右中央"], ["right", "右揃え"],
  ["top", "上揃え"], ["vmiddle", "上下中央"], ["bottom", "下揃え"]];

/** 整列・等間隔も共通の線画と短いラベルで表示する。 */
export function ArrangeControls({ count, disabled }: { count: number; disabled?: boolean }) {
  const { align, distribute, deck } = useStore();
  const reference = count <= 1 ? `${unitName(deck)}に対して揃える` : "選択した要素同士を揃える";
  return <>
    <span className="group" role="group" aria-label="整列" title={reference}>
      <span className="group-label">整列</span>
      {ALIGNMENTS.map(([kind, label]) => <button key={kind} disabled={disabled || count === 0} aria-label={label}
        title={`${label}：${reference}`} onClick={() => align(kind)}><Icon name={kind} />{label}</button>)}
    </span>
    <span className="group" role="group" aria-label="間隔">
      <span className="group-label">間隔</span>
      <button disabled={disabled || count < 3} aria-label="横に等間隔" title="横に等間隔：3つ以上選択すると使えます" onClick={() => distribute("h")}><Icon name="distributeH" />横等間隔</button>
      <button disabled={disabled || count < 3} aria-label="縦に等間隔" title="縦に等間隔：3つ以上選択すると使えます" onClick={() => distribute("v")}><Icon name="distributeV" />縦等間隔</button>
    </span>
  </>;
}
