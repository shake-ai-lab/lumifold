import { PT, resolveColor, type Paragraph, type Run, type Theme } from "../model/deck";

export type RunFormat = Omit<Run, "text">;
export type TextRange = { start: number; end: number };

export function paragraphAtOffset(paragraphs: Paragraph[], position: number) {
  let start = 0;
  for (let index = 0; index < paragraphs.length; index++) {
    const length = paragraphs[index].runs.reduce((sum, run) => sum + run.text.length, 0);
    if (position <= start + length || index === paragraphs.length - 1) return { index, start, length };
    start += length + 1;
  }
  return { index: 0, start: 0, length: 0 };
}

export function setParagraphBullet(paragraphs: Paragraph[], range: TextRange, bullet: boolean): Paragraph[] {
  const from = paragraphAtOffset(paragraphs, range.start).index;
  const to = paragraphAtOffset(paragraphs, Math.max(range.start, range.end - 1)).index;
  return paragraphs.map((p, index) => index < from || index > to ? p : { ...p, bullet: bullet || undefined, level: bullet ? p.level : undefined });
}

// Read only the supported text model, never store arbitrary pasted HTML.
export function readParagraphs(root: HTMLElement, theme: Theme): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let current: Paragraph | null = null;
  const finish = () => {
    if (current) {
      if (!current.runs.length) current.runs.push({ text: "" });
      paragraphs.push(current);
      current = null;
    }
  };
  const visit = (node: Node, inherited: RunFormat) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (!text) return;
      current ??= { runs: [] };
      const last = current.runs[current.runs.length - 1];
      const { text: _text, ...lastFormat } = last ?? { text: "" };
      if (last && JSON.stringify(lastFormat) === JSON.stringify(inherited)) last.text += text;
      else current.runs.push({ ...inherited, text });
      return;
    }
    if (!(node instanceof HTMLElement) || node.hasAttribute("aria-hidden")) return;
    const block = node.tagName === "P" || node.tagName === "DIV";
    if (block) {
      finish();
      current = { runs: [] };
      if (node.dataset.bullet === "true") current.bullet = true;
      if (node.dataset.level !== undefined) current.level = Number(node.dataset.level);
      const align = node.style.textAlign || node.dataset.align;
      if (align === "left" || align === "center" || align === "right") current.align = align;
    }
    const format = { ...inherited };
    const original: RunFormat = node.dataset.run ? JSON.parse(node.dataset.run) : {};
    Object.assign(format, original);
    const st = node.style;
    if (st.fontWeight) format.bold = st.fontWeight === "bold" || Number(st.fontWeight) >= 600;
    if (node.tagName === "B" || node.tagName === "STRONG") format.bold = true;
    if (st.fontStyle) format.italic = st.fontStyle === "italic";
    if (node.tagName === "I" || node.tagName === "EM") format.italic = true;
    if (st.fontSize) {
      const size = parseFloat(st.fontSize) / (st.fontSize.endsWith("pt") ? 1 : PT);
      format.fontSize = original.fontSize !== undefined && Math.abs(original.fontSize - size) < 0.001
        ? original.fontSize : Math.round(size * 1000) / 1000;
    }
    if (st.color) {
      const color = st.color;
      const probe = document.createElement("span");
      probe.style.color = original.color ? resolveColor(original.color, theme, "inherit") : "";
      // Preserve theme references instead of freezing them to RGB on every edit.
      if (!original.color || probe.style.color !== color) {
        const rgb = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgb) format.color = rgb.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, "0")).join("").toUpperCase();
        else if (/^#[\da-f]{6}$/i.test(color)) format.color = color.slice(1);
      }
    }
    if (node.dataset.run !== undefined && !node.textContent) {
      current ??= { runs: [] };
      current.runs.push({ ...format, text: "" });
    }
    if (node.tagName === "BR") {
      // A sole/final BR is the browser's empty-line placeholder.
      if (node.nextSibling) visit(document.createTextNode("\n"), format);
    } else node.childNodes.forEach((child) => visit(child, format));
    if (block) finish();
  };
  root.childNodes.forEach((node) => visit(node, {}));
  finish();
  return paragraphs.length ? paragraphs : [{ runs: [{ text: "" }] }];
}

function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => node.parentElement?.closest("[aria-hidden]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  return nodes;
}

// Offsets use UTF-16, as DOM Range does. Paragraph separators count as one.
export function selectionOffsets(root: HTMLElement): TextRange | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const offset = (container: Node, position: number) => {
    const before = document.createRange();
    before.setStart(root, 0);
    before.setEnd(container, position);
    const fragment = document.createElement("div");
    fragment.append(before.cloneContents());
    fragment.querySelectorAll("[aria-hidden]").forEach((node) => node.remove());
    const blocks = fragment.querySelectorAll("p, div");
    return (fragment.textContent?.length ?? 0) + Math.max(0, blocks.length - 1);
  };
  return { start: offset(range.startContainer, range.startOffset), end: offset(range.endContainer, range.endOffset) };
}

export function restoreSelection(root: HTMLElement, offsets: TextRange) {
  const range = document.createRange();
  const locate = (offset: number): [Node, number] => {
    const paragraphs = Array.from(root.children);
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i] as HTMLElement;
      const nodes = textNodes(p);
      for (const node of nodes) {
        if (offset <= node.length) return [node, Math.max(0, offset)];
        offset -= node.length;
      }
      if (offset <= 0 || i === paragraphs.length - 1) return [p.querySelector("[data-run]") ?? p.querySelector("[data-text-content]") ?? p, 0];
      offset--;
    }
    return [root, root.childNodes.length];
  };
  range.setStart(...locate(offsets.start));
  range.setEnd(...locate(offsets.end));
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

export function formatParagraphs(paragraphs: Paragraph[], patch: RunFormat, selection?: TextRange): Paragraph[] {
  let offset = 0;
  return paragraphs.map((p) => {
    const runs: Run[] = [];
    for (const run of p.runs) {
      const start = offset;
      offset += run.text.length;
      const from = selection ? Math.max(0, selection.start - start) : 0;
      const to = selection ? Math.min(run.text.length, selection.end - start) : run.text.length;
      if (from >= to && selection) { runs.push(run); continue; }
      if (from > 0) runs.push({ ...run, text: run.text.slice(0, from) });
      runs.push({ ...run, ...patch, text: run.text.slice(from, to) });
      if (to < run.text.length) runs.push({ ...run, text: run.text.slice(to) });
    }
    offset++;
    return { ...p, runs };
  });
}

/** Split/merge paragraphs in the model; native Enter treats flex bullet rows as columns. */
export function replaceText(paragraphs: Paragraph[], selection: TextRange, text: string): Paragraph[] {
  const locate = (position: number) => {
    for (let i = 0; i < paragraphs.length; i++) {
      const length = paragraphs[i].runs.reduce((sum, run) => sum + run.text.length, 0);
      if (position <= length || i === paragraphs.length - 1) return { index: i, offset: Math.min(position, length) };
      position -= length + 1;
    }
    return { index: 0, offset: 0 };
  };
  const from = locate(selection.start), to = locate(selection.end);
  const slice = (runs: Run[], start: number, end = Infinity) => {
    let offset = 0;
    return runs.flatMap((run) => {
      const a = Math.max(0, start - offset), b = Math.min(run.text.length, end - offset);
      offset += run.text.length;
      return a < b ? [{ ...run, text: run.text.slice(a, b) }] : [];
    });
  };
  const first = paragraphs[from.index], last = paragraphs[to.index];
  const prefix = slice(first.runs, 0, from.offset), suffix = slice(last.runs, to.offset);
  const { text: _text, ...format } = prefix[prefix.length - 1] ?? suffix[0] ?? first.runs[0] ?? { text: "" };
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const inserted = lines.map((line, i) => {
    const runs = [...(i === 0 ? prefix : []), ...(line ? [{ ...format, text: line }] : []), ...(i === lines.length - 1 ? suffix : [])];
    return { ...first, runs: runs.length ? runs : [{ ...format, text: "" }] };
  });
  return [...paragraphs.slice(0, from.index), ...inserted, ...paragraphs.slice(to.index + 1)];
}
