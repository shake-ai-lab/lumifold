import { useEffect, useRef } from "react";
import type { Element } from "../model/deck";
import { shapePoints } from "../model/shapes";
import { hasClipboard, redo, undo, useStore } from "../store";
import { isTypingTarget } from "../keyboard";
import { insertImageFiles, isImageFile } from "./images";

/**
 * 編集画面のキー操作と貼り付け。矢印で微調整(Shift で 10px)、Delete、F2 で中身の編集、Esc で選択解除、
 * Ctrl+A / C / X / V / D / Z / Y。画像の貼り付けはシステムのクリップボードを優先する
 */
export function useEditorKeys(selection: string[], byId: Map<string, Element>): void {
  const imagePasted = useRef(false);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target) || (e.target as HTMLElement | null)?.closest?.(".object-comments")) return;
      const files = [...(e.clipboardData?.files ?? [])].filter(isImageFile);
      if (!files.length || useStore.getState().editingId) return;
      e.preventDefault();
      imagePasted.current = true;
      void insertImageFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const state = useStore.getState();
      if (state.pendingMath && e.key === "Escape") { useStore.setState({ pendingMath: false }); return; }
      if (state.interactingId) {
        if (e.key === "Escape") { e.preventDefault(); state.setInteracting(null); }
        return;
      }
      if (isTypingTarget(e.target)) return;
      const locked = selection.some((id) => byId.get(id)?.locked);
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === "a") { e.preventDefault(); state.selectAll(); }
        else if (key === "c" && selection.length) { e.preventDefault(); state.copySelected(); }
        else if (key === "x" && selection.length && !locked) { e.preventDefault(); state.cutSelected(); }
        else if (key === "v") {
          // 既定の貼り付け(paste イベント)を先に通し、画像ならそちらを入れる。画像でなければアプリ内でコピーした要素を貼る
          imagePasted.current = false;
          window.setTimeout(() => { if (!imagePasted.current && hasClipboard()) useStore.getState().paste(); }, 0);
        }
        else if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        } else if (key === "y") {
          e.preventDefault();
          redo();
        } else if (key === "d" && selection.length && !locked) {
          e.preventDefault();
          state.duplicateSelected();
        }
        return;
      }
      if (selection.length === 0) return;
      if (e.key === "F2" && selection.length === 1) {
        const el = byId.get(selection[0]);
        if (el && (el.type === "text" || el.type === "table" || el.type === "math" || (el.type === "shape" && !el.locked && shapePoints(el)))) { e.preventDefault(); state.setEditing(el.id, 0); }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (!locked) state.removeSelected();
        return;
      }
      if (e.key === "Escape") {
        state.select([]);
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const d: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const mv = d[e.key];
      if (!mv) return;
      e.preventDefault();
      const patches: Record<string, Partial<Element>> = {};
      for (const id of selection) {
        const el = byId.get(id);
        if (el && !el.locked) patches[id] = { x: el.x + mv[0], y: el.y + mv[1] };
      }
      if (Object.keys(patches).length) state.patchElements(patches);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, byId]);
}
