import type { Element, Paragraph, Slide, TextElement } from "../model/deck";
import { newId } from "../model/ids";

/**
 * 型から作るスライド。座標は CLAUDE.md の作法どおり: 見出し (60, 43, 1160, 86)、本文は y=154〜644、左右 60、間 30。
 * 色はスキーム名だけを使い、どのテーマでも読めるようにする。id は入れるたびに新しく振る。
 */
export interface Layout { key: string; label: string; build: () => Omit<Slide, "id"> }

const paras = (...lines: string[]): Paragraph[] => lines.map((text) => ({ runs: [{ text }] }));
const text = (x: number, y: number, w: number, h: number, lines: string[], style: TextElement["style"] = {}, extra: Partial<TextElement> = {}): TextElement =>
  ({ id: newId("text"), type: "text", x, y, w, h, style, paragraphs: paras(...lines), ...extra });
const title = (label = "見出しを入力") => text(60, 43, 1160, 86, [label], { fontSize: 30, bold: true, color: "dk2", valign: "middle" }, { role: "title" });
const card = (x: number, y: number, w: number, h: number, group: string): Element =>
  ({ id: newId("shape"), type: "shape", shape: "roundRect", x, y, w, h, fill: "lt2", line: null, radius: 12, group });

function columns(n: number, gap = 30, left = 60, width = 1160): { x: number; w: number }[] {
  const w = (width - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: Math.round(left + i * (w + gap)), w: Math.round(w) }));
}

export const LAYOUTS: Layout[] = [
  { key: "blank", label: "空白", build: () => ({ elements: [] }) },
  { key: "title", label: "表紙", build: () => ({ background: { color: "dk2" }, elements: [
    text(60, 200, 1160, 170, ["資料の題名を入力"], { fontSize: 40, bold: true, color: "lt1", valign: "bottom" }, { role: "title" }),
    text(60, 390, 1160, 80, ["副題・ひとことで内容を説明"], { fontSize: 20, color: "lt2" }),
    text(60, 605, 1160, 48, ["日付・名前"], { fontSize: 12, color: "lt2", valign: "middle" }, { role: "caption" }),
  ] }) },
  { key: "section", label: "区切り", build: () => ({ background: { color: "dk2" }, elements: [
    text(60, 180, 300, 125, ["01"], { fontSize: 60, bold: true, color: "accent3", valign: "bottom" }),
    text(60, 317, 1160, 105, ["章の題名を入力"], { fontSize: 36, bold: true, color: "lt1" }, { role: "title" }),
    text(60, 432, 1160, 96, ["この章で伝えることを 1 行で"], { fontSize: 16, color: "lt2" }),
  ] }) },
  { key: "body", label: "見出しと本文", build: () => {
    const body = text(60, 154, 1160, 490, ["要点を 1 つ目", "要点を 2 つ目", "要点を 3 つ目"], { fontSize: 20, paraSpacing: 14 });
    body.paragraphs = body.paragraphs.map((p) => ({ ...p, bullet: true }));
    return { elements: [title(), body] };
  } },
  { key: "two", label: "2 カラム", build: () => ({ elements: [title(), ...columns(2).flatMap(({ x, w }, i) => [
    text(x, 154, w, 48, [i ? "右の見出し" : "左の見出し"], { fontSize: 20, bold: true, color: "dk2" }),
    text(x, 212, w, 432, ["説明を入力"], { fontSize: 16, paraSpacing: 10 }),
  ])] }) },
  { key: "cards", label: "カード 3 枚", build: () => ({ elements: [title(), ...columns(3).flatMap(({ x, w }, i) => {
    const g = newId("g");
    return [card(x, 154, w, 490, g),
      text(x + 29, 183, w - 58, 48, [`ポイント ${i + 1}`], { fontSize: 18, bold: true, color: "dk2", valign: "middle" }, { group: g }),
      text(x + 29, 245, w - 58, 370, ["説明を入力"], { fontSize: 14 }, { group: g })];
  })] }) },
  { key: "steps", label: "手順 4 つ", build: () => ({ elements: [title(), ...columns(4, 48).flatMap(({ x, w }, i) => {
    const cx = x + w / 2, g = newId("g");
    const parts: Element[] = [
      { id: newId("shape"), type: "shape", shape: "ellipse", x: Math.round(cx - 38), y: 154, w: 77, h: 77, fill: "accent1", line: null, group: g },
      text(Math.round(cx - 38), 154, 77, 77, [String(i + 1)], { fontSize: 22, bold: true, color: "lt1", align: "center", valign: "middle" }, { group: g }),
      text(x, 250, w, 58, [`手順 ${i + 1}`], { fontSize: 18, bold: true, color: "dk2", align: "center" }),
      text(x, 312, w, 330, ["説明を入力"], { fontSize: 14 }),
    ];
    if (i < 3) parts.push({ id: newId("shape"), type: "shape", shape: "arrow", x: x + w + 5, y: 182, w: 38, h: 20 });
    return parts;
  })] }) },
  { key: "chart", label: "グラフと結論", build: () => { const g = newId("g"); return { elements: [title(),
    { id: newId("chart"), type: "chart", x: 60, y: 154, w: 700, h: 490, chart: { kind: "bar", title: "グラフの題名",
      labels: ["項目 A", "項目 B", "項目 C", "項目 D"], series: [{ name: "系列 1", values: [3, 5, 4, 6] }], options: { legend: "none" } } },
    text(790, 173, 430, 125, ["+20%"], { fontSize: 54, bold: true, color: "accent1", align: "center", valign: "bottom" }),
    text(790, 312, 430, 60, ["数字の説明"], { fontSize: 13, color: "accent5", align: "center" }),
    { id: newId("shape"), type: "shape", shape: "roundRect", x: 790, y: 490, w: 430, h: 154, fill: "dk2", line: null, radius: 10, group: g },
    text(816, 490, 378, 154, ["結論を 1〜2 行で"], { fontSize: 18, bold: true, color: "lt1", valign: "middle" }, { group: g }),
  ] }; } },
  { key: "table", label: "表", build: () => ({ elements: [title(),
    { id: newId("table"), type: "table", x: 60, y: 154, w: 1160, h: 300, fontSize: 16,
      rows: [["項目", "内容", "備考"], ["", "", ""], ["", "", ""], ["", "", ""]].map((row) => row.map((t) => ({ text: t }))) },
  ] }) },
  { key: "numbers", label: "数字 3 つ", build: () => ({ elements: [title(), ...columns(3).flatMap(({ x, w }, i) => [
    text(x, 200, w, 140, [["120", "3倍", "98%"][i]], { fontSize: 66, bold: true, color: "accent1", align: "center", valign: "bottom" }),
    text(x, 350, w, 44, ["数字の意味"], { fontSize: 18, bold: true, color: "dk2", align: "center" }),
    text(x, 400, w, 120, ["補足を入力"], { fontSize: 14, align: "center" }),
  ])] }) },
];

/**
 * ノート(768x1024 の縦のページ)の型。見出し (64, 72, 640, 80)、本文は y=188〜952、左右 64、間 24。
 * 本のように読むので、本文は 14pt・行間 1.8 を基本にする。
 */
const NOTE_W = 640, NOTE_X = 64;
const noteTitle = (label = "見出しを入力") => text(NOTE_X, 72, NOTE_W, 80, [label], { fontSize: 24, bold: true, color: "dk2", valign: "bottom" }, { role: "title" });
const noteRule = (y: number, group?: string): Element =>
  ({ id: newId("shape"), type: "shape", shape: "line", x: NOTE_X, y, w: NOTE_W, h: 2, line: { color: "accent1", width: 2 }, ...(group ? { group } : {}) });
const prose = (x: number, y: number, w: number, h: number, lines: string[]) =>
  text(x, y, w, h, lines, { fontSize: 14, lineHeight: 1.8, paraSpacing: 12 });

export const NOTE_LAYOUTS: Layout[] = [
  { key: "blank", label: "空白", build: () => ({ elements: [] }) },
  { key: "cover", label: "表紙", build: () => ({ background: { color: "dk2" }, elements: [
    text(NOTE_X, 300, NOTE_W, 220, ["ノートの題名を入力"], { fontSize: 34, bold: true, color: "lt1", valign: "bottom" }, { role: "title" }),
    { id: newId("shape"), type: "shape", shape: "line", x: NOTE_X, y: 540, w: 120, h: 4, line: { color: "accent3", width: 4 } },
    text(NOTE_X, 568, NOTE_W, 110, ["副題・ひとことで内容を説明"], { fontSize: 16, color: "lt2" }),
    text(NOTE_X, 880, NOTE_W, 48, ["日付・名前"], { fontSize: 12, color: "lt2", valign: "bottom" }, { role: "caption" }),
  ] }) },
  { key: "chapter", label: "章の扉", build: () => ({ elements: [
    text(NOTE_X, 270, NOTE_W, 150, ["01"], { fontSize: 72, bold: true, color: "accent1", valign: "bottom" }),
    noteRule(436),
    text(NOTE_X, 460, NOTE_W, 110, ["章の題名を入力"], { fontSize: 30, bold: true, color: "dk2" }, { role: "title" }),
    text(NOTE_X, 590, NOTE_W, 140, ["この章で書くことを 2〜3 行で"], { fontSize: 14, color: "accent5", lineHeight: 1.8 }),
  ] }) },
  { key: "body", label: "見出しと本文", build: () => ({ elements: [noteTitle(), noteRule(164),
    prose(NOTE_X, 188, NOTE_W, 764, ["本文を入力。1 ページに 1 つの話題を書くと、めくりながら読みやすくなります。", "段落を分けるときは Enter を押します。"])] }) },
  { key: "prose", label: "本文だけ", build: () => ({ elements: [
    prose(NOTE_X, 72, NOTE_W, 880, ["前のページの続きを入力。"])] }) },
  { key: "figure", label: "図と説明", build: () => {
    const g = newId("g");
    return { elements: [noteTitle(), noteRule(164),
      { id: newId("shape"), type: "shape", shape: "rect", x: NOTE_X, y: 188, w: NOTE_W, h: 380, fill: "lt2", line: null, group: g },
      text(NOTE_X, 188, NOTE_W, 380, ["図・画像をここに入れる"], { fontSize: 14, color: "accent5", align: "center", valign: "middle" }, { group: g }),
      text(NOTE_X, 578, NOTE_W, 36, ["図 1  図の説明"], { fontSize: 11, color: "accent5" }, { role: "caption" }),
      prose(NOTE_X, 632, NOTE_W, 320, ["図から読み取れることを書く。"])] };
  } },
  { key: "point", label: "要点の囲み", build: () => {
    const g = newId("g");
    const points = text(NOTE_X + 28, 676, NOTE_W - 56, 252, ["要点 1", "要点 2", "要点 3"], { fontSize: 14, lineHeight: 1.7, paraSpacing: 8 }, { group: g });
    points.paragraphs = points.paragraphs.map((p) => ({ ...p, bullet: true }));
    return { elements: [noteTitle(), noteRule(164),
      prose(NOTE_X, 188, NOTE_W, 380, ["本文を入力。"]),
      { id: newId("shape"), type: "shape", shape: "roundRect", x: NOTE_X, y: 600, w: NOTE_W, h: 352, fill: "lt2", line: null, radius: 12, group: g },
      text(NOTE_X + 28, 624, NOTE_W - 56, 44, ["ポイント"], { fontSize: 15, bold: true, color: "accent1", valign: "middle" }, { group: g }),
      points,
    ] };
  } },
  { key: "ruled", label: "罫線ノート", build: () => {
    const g = newId("g");
    const lines = Array.from({ length: 19 }, (_, i): Element =>
      ({ id: newId("shape"), type: "shape", shape: "line", x: NOTE_X, y: 220 + i * 38, w: NOTE_W, h: 2, line: { color: "accent5", width: 1 }, opacity: 0.45, group: g }));
    return { elements: [noteTitle(), noteRule(164), ...lines] };
  } },
  { key: "table", label: "表", build: () => ({ elements: [noteTitle(), noteRule(164),
    { id: newId("table"), type: "table", x: NOTE_X, y: 188, w: NOTE_W, h: 300, fontSize: 13,
      rows: [["項目", "内容", "備考"], ["", "", ""], ["", "", ""], ["", "", ""]].map((row) => row.map((t) => ({ text: t }))) },
    prose(NOTE_X, 512, NOTE_W, 440, ["表の説明を入力。"]),
  ] }) },
  { key: "chart", label: "グラフ", build: () => ({ elements: [noteTitle(), noteRule(164),
    { id: newId("chart"), type: "chart", x: NOTE_X, y: 188, w: NOTE_W, h: 400, chart: { kind: "bar", title: "グラフの題名",
      labels: ["項目 A", "項目 B", "項目 C", "項目 D"], series: [{ name: "系列 1", values: [3, 5, 4, 6] }], options: { legend: "none" } } },
    prose(NOTE_X, 612, NOTE_W, 340, ["グラフから読み取れることを書く。"]),
  ] }) },
];

/** 資料の種類に合う型の一覧 */
export const layoutsFor = (format: "slides" | "note") => (format === "note" ? NOTE_LAYOUTS : LAYOUTS);
