import type { ReactNode } from "react";
import type { Element, TextElement, Theme } from "../model/deck";
import { textFontSize } from "../model/defaults";
import { shapePoints } from "../model/shapes";
import { hasClipboard, useStore } from "../store";
import type { MenuItem } from "./ContextMenu";
import { formatParagraphs, type RunFormat } from "./richText";
import { TextFormatControls } from "./TextFormatControls";

/**
 * 要素の右クリックメニュー。種類ごとの中身の編集、コピー・貼り付け・複製、重なり順、位置の固定、削除。
 * 文字要素 1 つなら、文字全体の書式(大きさ・色・太字・斜体)もメニューの中で変えられる
 */
export function elementMenu(el: Element, ids: string[], locked: boolean, theme: Theme, openedAt: number): { items: MenuItem[]; content?: ReactNode } {
  const state = useStore.getState();
  const single = ids.length === 1;
  const items: MenuItem[] = [];
  if (single && (el.type === "text" || el.type === "table")) {
    items.push({ icon: el.type === "table" ? "table" : "text", label: el.type === "table" ? "表のセルを編集" : "テキストを編集", shortcut: "F2", onClick: () => state.setEditing(el.id, 0) }, "sep");
  }
  if (single && el.type === "shape" && shapePoints(el)) items.push({ icon: "edit", label: "編集点を編集", shortcut: "F2", disabled: locked, onClick: () => state.setEditing(el.id) }, "sep");
  if (single && el.type === "math") items.push({ icon: "math", label: "数式を編集", shortcut: "F2", onClick: () => state.setEditing(el.id) }, "sep");
  if (single && el.type === "chart") items.push({ icon: "table", label: "グラフのデータを編集", onClick: () => state.openDialog({ kind: "chart", id: el.id }) }, "sep");
  items.push(
    { icon: "copy", label: "コピー", shortcut: "Ctrl+C", onClick: () => { state.copySelected(); } },
    { icon: "paste", label: "貼り付け", shortcut: "Ctrl+V", disabled: !hasClipboard(), onClick: () => state.paste() },
    { icon: "duplicate", label: "複製", shortcut: "Ctrl+D", disabled: locked, onClick: state.duplicateSelected },
    "sep",
    { icon: "front", label: "最前面へ", disabled: locked, onClick: () => state.reorderSelected("front") },
    { icon: "back", label: "最背面へ", disabled: locked, onClick: () => state.reorderSelected("back") },
    { icon: locked ? "unpin" : "pin", label: locked ? "固定を解除" : "位置を固定", onClick: () => state.setLocked(ids, !locked) },
    "sep",
    { icon: "delete", label: "削除", shortcut: "Delete", disabled: locked, danger: true, onClick: state.removeSelected },
  );
  if (!single || el.type !== "text") return { items };
  const apply = (patch: RunFormat) => {
    const s = useStore.getState();
    const current = s.deck?.slides[s.current].elements.find((item): item is TextElement => item.id === el.id && item.type === "text");
    if (!current || current.locked) return;
    s.patchElement(current.id, { style: { ...current.style, ...patch }, paragraphs: formatParagraphs(current.paragraphs, patch) });
  };
  return { items, content: <TextFormatControls key={`${el.id}-${openedAt}`} theme={theme} value={{ ...el.style, fontSize: textFontSize(el) }} onChange={apply} /> };
}
