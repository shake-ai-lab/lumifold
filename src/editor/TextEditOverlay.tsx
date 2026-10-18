import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveColor, type Paragraph, type TextElement, type Theme } from "../model/deck";
import { TextParagraphs, contentHeight, textBoxStyle } from "../render/elements/TextEl";
import { useStore } from "../store";
import { ContextMenu, type MenuState } from "./ContextMenu";
import { TextFormatControls } from "./TextFormatControls";
import { formatParagraphs, paragraphAtOffset, readParagraphs, replaceText, restoreSelection, selectionOffsets, setParagraphBullet, type RunFormat, type TextRange } from "./richText";
import { paragraphsToText, sameParagraphs } from "./runs";

/** The browser owns the editable DOM until commit, so IME and the caret are not reset on input. */
export function TextEditOverlay({ el, theme }: { el: TextElement; theme: Theme }) {
  const ref = useRef<HTMLDivElement>(null);
  const committed = useRef(false);
  const dirty = useRef(false);
  const menuOpen = useRef(false);
  const selection = useRef<TextRange | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [wholeFormat, setWholeFormat] = useState<RunFormat>({});
  const wholeFormatRef = useRef<RunFormat>({});
  const markup = (paragraphs: Paragraph[]) => renderToStaticMarkup(
    <TextParagraphs paragraphs={paragraphs} theme={theme} spacing={el.style?.paraSpacing ?? 0} />,
  );
  const [initialHTML] = useState(() => markup(el.paragraphs));
  const history = useRef<{ html: string; selection: TextRange | null; format: RunFormat }[]>([]);
  const historyIndex = useRef(0);
  const composing = useRef(false);

  /**
   * 収まっていればスクロールさせない（カーソルを見せるための数 px のスクロールで文字がずれないよう clip）。
   * はみ出していればスクロールでき、編集の始めは表示と同じ位置に合わせる。表示中の段落は隠れているだけで配置は残っているので、その位置を測る
   */
  const syncOverflow = (align: boolean) => {
    const root = ref.current;
    if (!root) return;
    let shift = 0;
    if (align) {
      const shown = root.parentElement?.querySelector<HTMLElement>(`:scope > [data-id="${CSS.escape(el.id)}"] > div`);
      const a = shown?.firstElementChild as HTMLElement | null, b = root.firstElementChild as HTMLElement | null;
      if (a && b) shift = b.offsetTop - a.offsetTop;
    }
    root.style.overflow = contentHeight(root) > root.clientHeight || shift > 0 ? "auto" : "clip";
    if (align) root.scrollTop = Math.max(0, shift);
  };

  useLayoutEffect(() => {
    const root = ref.current!;
    root.focus({ preventScroll: true });
    const caret = useStore.getState().editingCaret;
    const end = paragraphsToText(el.paragraphs).length;
    restoreSelection(root, caret === -1 ? { start: 0, end } : { start: caret ?? end, end: caret ?? end });
    syncOverflow(true);
    history.current = [{ html: root.innerHTML, selection: selectionOffsets(root), format: {} }];
    // Mount only: changes remain in the browser until the editing session ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remember = () => {
    dirty.current = true;
    syncOverflow(false);
    if (composing.current || !ref.current) return;
    const entry = { html: ref.current.innerHTML, selection: selectionOffsets(ref.current), format: wholeFormatRef.current };
    if (entry.html === history.current[historyIndex.current]?.html) return;
    history.current = [...history.current.slice(0, historyIndex.current + 1), entry];
    historyIndex.current = history.current.length - 1;
    // Programmatic paste restores the caret but does not scroll it into view.
    requestAnimationFrame(() => {
      const root = ref.current, sel = window.getSelection();
      if (!root || !sel?.rangeCount) return;
      const caret = sel.getRangeAt(0).getBoundingClientRect(), box = root.getBoundingClientRect();
      const scale = box.height / root.offsetHeight || 1;
      if (caret.bottom > box.bottom) root.scrollTop += (caret.bottom - box.bottom) / scale;
      if (caret.top < box.top) root.scrollTop -= (box.top - caret.top) / scale;
    });
  };
  const commit = () => {
    if (committed.current || useStore.getState().editingId !== el.id) return;
    committed.current = true;
    if (dirty.current && ref.current) {
      const paragraphs = readParagraphs(ref.current, theme);
      if (!sameParagraphs(paragraphs, el.paragraphs) || Object.keys(wholeFormatRef.current).length) {
        useStore.getState().patchElement(el.id, { paragraphs,
          ...(Object.keys(wholeFormatRef.current).length ? { style: { ...el.style, ...wholeFormatRef.current } } : {}) });
      }
    }
    useStore.getState().setEditing(null);
  };
  const closeMenu = useCallback(() => {
    setMenu(null);
    menuOpen.current = false;
    ref.current?.focus();
    if (ref.current && selection.current) restoreSelection(ref.current, selection.current);
  }, []);
  const applyFormat = (patch: RunFormat) => {
    const root = ref.current!;
    const range = selection.current;
    if (!range || range.start === range.end) {
      wholeFormatRef.current = { ...wholeFormatRef.current, ...patch };
      setWholeFormat(wholeFormatRef.current);
    }
    root.innerHTML = markup(formatParagraphs(readParagraphs(root, theme), patch,
      range && range.start !== range.end ? range : undefined));
    if (range) restoreSelection(root, range);
    remember();
  };
  const insertText = (text: string) => {
    const root = ref.current!;
    const range = selectionOffsets(root);
    if (!range) return;
    const normalized = text.replace(/\r\n?/g, "\n");
    root.innerHTML = markup(replaceText(readParagraphs(root, theme), range, normalized));
    const end = range.start + normalized.length;
    restoreSelection(root, { start: end, end });
    remember();
  };
  const setBullet = (range: TextRange, bullet: boolean) => {
    const root = ref.current!;
    root.innerHTML = markup(setParagraphBullet(readParagraphs(root, theme), range, bullet));
    restoreSelection(root, range);
    remember();
  };

  return <>
    <div ref={ref} className="text-edit" contentEditable suppressContentEditableWarning role="textbox"
      aria-label="テキストを編集" aria-multiline spellCheck={false}
      dangerouslySetInnerHTML={{ __html: initialHTML }}
      style={{ ...textBoxStyle({ ...el, style: { ...el.style, ...wholeFormat } }, theme), position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined, transformOrigin: "center center",
        opacity: el.opacity, background: resolveColor(el.background, theme), outline: "1px dashed #2a9d8f", outlineOffset: 2,
        border: 0, padding: 0, margin: 0, userSelect: "text",
        // 表示と同じ上下位置で編集する。safe: はみ出したときは上端からスクロールできるようにする
        justifyContent: el.style?.valign === "middle" ? "safe center" : el.style?.valign === "bottom" ? "safe flex-end" : "flex-start" }}
      onInput={remember}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => { composing.current = false; remember(); }}
      onBlur={() => { if (!menuOpen.current) commit(); }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault(); e.stopPropagation();
        selection.current = selectionOffsets(ref.current!);
        menuOpen.current = true;
        const node = window.getSelection()?.anchorNode;
        const span = node instanceof HTMLElement ? node : node?.parentElement;
        const st = span ? getComputedStyle(span) : null;
        const rgb = st?.color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        const value = { ...el.style, fontSize: st ? Math.round(parseFloat(st.fontSize) * 0.75 * 1000) / 1000 : el.style?.fontSize,
          color: rgb ? rgb.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, "0")).join("") : el.style?.color,
          bold: st ? Number(st.fontWeight) >= 600 : el.style?.bold, italic: st?.fontStyle === "italic" };
        const range = selection.current;
        const paragraphs = readParagraphs(ref.current!, theme);
        const bullet = range ? paragraphs[paragraphAtOffset(paragraphs, range.start).index]?.bullet : false;
        setMenu({ x: e.clientX, y: e.clientY, items: [{ label: bullet ? "箇条書きを解除" : "箇条書きにする",
          onClick: () => { if (range) setBullet(range, !bullet); } }], content: <TextFormatControls
          key={`${e.timeStamp}`} value={value} theme={theme}
          selectedText={!!selection.current && selection.current.start !== selection.current.end} onChange={applyFormat} /> });
      }}
      onPaste={(e) => {
        e.preventDefault();
        insertText(e.clipboardData.getData("text/plain"));
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing || composing.current) return;
        if (e.key === "Escape") { e.preventDefault(); committed.current = true; useStore.getState().setEditing(null); }
        else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
        else if (e.key === "Enter" || e.key === "Backspace") {
          const root = ref.current!;
          const range = selectionOffsets(root);
          const paragraphs = readParagraphs(root, theme);
          const at = range ? paragraphAtOffset(paragraphs, range.start) : null;
          if (range && at && range.start === range.end && paragraphs[at.index].bullet &&
            ((e.key === "Enter" && !e.shiftKey && at.length === 0) || (e.key === "Backspace" && range.start === at.start))) {
            e.preventDefault(); setBullet(range, false);
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey && range && at && paragraphAtOffset(paragraphs, range.end).index === at.index) {
              // Soft line break: keep the same paragraph and its single bullet.
              const replaced = replaceText(paragraphs, range, "\n");
              const first = replaced[at.index], second = replaced[at.index + 1];
              replaced.splice(at.index, 2, { ...first, runs: [...first.runs, { text: "\n" }, ...second.runs] });
              root.innerHTML = markup(replaced);
              restoreSelection(root, { start: range.start + 1, end: range.start + 1 });
              remember();
            } else insertText("\n");
          }
        }
        else if ((e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase())) {
          e.preventDefault();
          const next = historyIndex.current + (e.key.toLowerCase() === "y" || e.shiftKey ? 1 : -1);
          const entry = history.current[next];
          if (entry && ref.current) {
            historyIndex.current = next; ref.current.innerHTML = entry.html;
            wholeFormatRef.current = entry.format; setWholeFormat(entry.format);
            if (entry.selection) restoreSelection(ref.current, entry.selection);
            dirty.current = next !== 0;
          }
        }
      }} />
    <ContextMenu menu={menu} onClose={closeMenu} />
  </>;
}
