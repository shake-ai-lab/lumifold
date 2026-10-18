import { useStore } from "../store";
import { unitName } from "../model/deck";
import { ArrangeControls } from "./ArrangeControls";
import { Icon } from "./Icon";

/** Canvas-wide actions stay available even when the properties panel is closed. */
export function SelectionToolbar() {
  const { deck, current, selection, editingId, interactingId, reorderSelected, duplicateSelected, removeSelected } = useStore();
  const selected = deck?.slides[current]?.elements.filter(el => selection.includes(el.id)) ?? [];
  const units = new Set(selected.map(el => el.group ? `group:${el.group}` : `element:${el.id}`)).size;
  const locked = selected.some(el => el.locked);
  const disabled = selected.length === 0 || locked || !!editingId || !!interactingId;
  const hint = !selected.length ? "要素を選ぶと使えます" : locked ? "固定した要素を含む" : interactingId ? "操作中 · Esc で配置へ" : editingId
    ? "編集中は使えません" : units === 1 ? `${unitName(deck)}に対して整列` : "要素同士で整列";
  return <div className="toolbar-selection" role="group" aria-label="選択した要素の操作">
    <span className="selection-context" title={hint}>
      <strong>{selected.length ? `${selected.length} 個を選択` : "要素の操作"}</strong>
      <span>{hint}</span>
    </span>
    <ArrangeControls count={units} disabled={disabled} />
    <span className="group" role="group" aria-label="重なり順">
      <span className="group-label">重なり順</span>
      <button disabled={disabled} title="選択した要素を最前面へ" onClick={() => reorderSelected("front")}><Icon name="front" />最前面</button>
      <button disabled={disabled} title="選択した要素を1つ前へ" onClick={() => reorderSelected("forward")}><Icon name="forward" />前へ</button>
      <button disabled={disabled} title="選択した要素を1つ後ろへ" onClick={() => reorderSelected("backward")}><Icon name="backward" />後ろへ</button>
      <button disabled={disabled} title="選択した要素を最背面へ" onClick={() => reorderSelected("back")}><Icon name="back" />最背面</button>
    </span>
    <span className="group" role="group" aria-label="要素の複製と削除">
      <button disabled={disabled} aria-label="複製 (Ctrl+D)" title="選択した要素を複製 (Ctrl+D)" onClick={duplicateSelected}><Icon name="duplicate" />複製</button>
      <button disabled={disabled} className="danger" aria-label="削除 (Del)" title="選択した要素を削除 (Del)" onClick={removeSelected}><Icon name="delete" />削除</button>
    </span>
  </div>;
}
