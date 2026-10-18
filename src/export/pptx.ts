import PptxGenJS from "pptxgenjs";
import {
  canvasSize, chartPalette, gridColor, resolveColor, type ChartElement, type ColorRef, type Deck, type Element, type EmbedElement, type ImageElement,
  type ShapeElement, type TableElement, type TextElement, type Theme,
} from "../model/deck";
import { shapePoints } from "../model/shapes";
import { DEFAULT_LINE_HEIGHT, isLineShape, SHAPE_DEFAULTS, TABLE_FONT_SIZE, textFontSize } from "../model/defaults";
import { inTauri, joinPath, readAsset } from "../tauri";
import { rasterizeMath } from "./rasterize";
import { naturalSize as sizeOf, readDataUrl } from "../imageData";
import { pageNumberBox } from "../model/pageNumber";

/**
 * deck.json → pptx。座標は px を 96px = 1inch で換算(スライド 1280x720 は LAYOUT_WIDE 13.333 x 7.5 inch、ノート 768x1024 は 8 x 10.667 inch)。
 * 文字・図形・表・グラフは PowerPoint で編集できるネイティブ要素にする。
 * 数式は画像、ウィジェット(動く要素)は題名入りの枠(静止画の代わり)にする。発表者ノートも入れる。
 */
const IN = (px: number) => px / 96;
const PTS = (px: number) => px * 0.75; // 線幅・余白など px → pt

export interface ExportReport { warnings: string[] }

export async function buildPptx(deck: Deck, deckDir: string | null): Promise<{ base64: string; report: ExportReport }> {
  const pres = new PptxGenJS();
  const size = canvasSize(deck);
  if (size.w === 1280 && size.h === 720) pres.layout = "LAYOUT_WIDE";
  else {
    pres.defineLayout({ name: "DECK_PAGE", width: IN(size.w), height: IN(size.h) });
    pres.layout = "DECK_PAGE";
  }
  pres.title = deck.meta?.title ?? "";
  pres.author = deck.meta?.author ?? "";
  pres.theme = { headFontFace: deck.theme.fonts.head, bodyFontFace: deck.theme.fonts.body };
  const report: ExportReport = { warnings: [] };
  const theme = deck.theme;
  const hex = (ref: ColorRef | null | undefined, fallback = "000000") => resolveColor(ref, theme, "#" + fallback).replace("#", "").toUpperCase();

  for (const [index, slide] of deck.slides.entries()) {
    const s = pres.addSlide();
    const bg = hex(slide.background?.color ?? "lt1", "FFFFFF");
    s.background = { color: bg };
    if (slide.notes) s.addNotes(slide.notes);
    for (const el of slide.elements) {
      try {
        if (el.background && el.type !== "text") backdrop(s, el, hex(el.background));
        if (el.type === "text") addText(s, el, theme, hex);
        else if (el.type === "shape") addShape(s, el, hex);
        else if (el.type === "image") await addImage(s, el, deckDir);
        else if (el.type === "chart") addChart(s, el, theme);
        else if (el.type === "table") addTable(s, el, theme, hex, bg);
        else if (el.type === "math") s.addImage({ data: await rasterizeMath(el, theme), ...box(el), rotate: el.rotation ?? 0 });
        else if (el.type === "embed") addEmbed(s, el, hex);
      } catch (error) {
        report.warnings.push(`スライド ${index + 1} の ${el.id}: ${String(error).replace(/^Error: /, "")}`);
      }
    }
    // 自動のページ番号は普通の文字枠にする(画面と同じ位置・書式)
    const folio = pageNumberBox(deck, index);
    if (folio) s.addText(folio.text, { x: IN(folio.x), y: IN(folio.y), w: IN(folio.w), h: IN(folio.h), align: folio.align, valign: "middle",
      fontSize: folio.fontSize, color: folio.color.replace("#", "").toUpperCase(), fontFace: deck.theme.fonts.body, margin: 0 });
  }
  const base64 = (await pres.write({ outputType: "base64" })) as string;
  return { base64, report };
}

const box = (el: Element) => ({ x: IN(el.x), y: IN(el.y), w: IN(el.w), h: IN(el.h) });
const transparency = (el: Element) => (el.opacity !== undefined && el.opacity < 1 ? Math.round((1 - el.opacity) * 100) : undefined);

function backdrop(s: PptxGenJS.Slide, el: Element, color: string) {
  s.addShape("rect", { ...box(el), fill: { color, transparency: transparency(el) }, line: { type: "none" }, rotate: el.rotation ?? 0 });
}

function addText(s: PptxGenJS.Slide, el: TextElement, theme: Theme, hex: (c: ColorRef | null | undefined, f?: string) => string) {
  const st = el.style ?? {};
  const base = textFontSize(el);
  const runs: PptxGenJS.TextProps[] = [];
  el.paragraphs.forEach((p, pi) => {
    const lastParagraph = pi === el.paragraphs.length - 1;
    const paragraph = {
      align: p.align ?? st.align ?? "left",
      bullet: p.bullet ? true : false,
      indentLevel: p.level ?? 0,
      paraSpaceAfter: lastParagraph ? 0 : PTS(st.paraSpacing ?? 0),
    } as const;
    const pieces = p.runs.length ? p.runs : [{ text: "" }];
    pieces.forEach((r, ri) => {
      // Shift+Enter の改行(段落内)は PowerPoint の行区切りにする
      r.text.split("\n").forEach((part, k, parts) => runs.push({ text: part, options: {
        ...paragraph,
        bold: r.bold ?? st.bold ?? false,
        italic: r.italic ?? st.italic ?? false,
        color: hex(r.color ?? st.color ?? "dk1"),
        fontSize: r.fontSize ?? base,
        softBreakBefore: k > 0 || undefined,
        breakLine: (!lastParagraph && ri === pieces.length - 1 && k === parts.length - 1) || undefined,
      } }));
    });
  });
  s.addText(runs, {
    ...box(el), margin: 0, valign: st.valign ?? "top", fontFace: theme.fonts[st.font ?? (el.role === "title" ? "head" : "body")],
    lineSpacingMultiple: st.lineHeight ?? DEFAULT_LINE_HEIGHT, rotate: el.rotation ?? 0, wrap: true,
    fill: el.background ? { color: hex(el.background), transparency: transparency(el) } : undefined,
  });
}

// PowerPoint の図形にそのまま置き換えられるもの(編集しやすさ優先)。矢印・山形・吹き出し・自由な図形は形を合わせるため頂点で描く
const NATIVE: Partial<Record<ShapeElement["shape"], string>> = {
  rect: "rect", roundRect: "roundRect", ellipse: "ellipse", triangle: "triangle", diamond: "diamond", parallelogram: "parallelogram",
  trapezoid: "trapezoid", pentagon: "pentagon", hexagon: "hexagon", star: "star5", cylinder: "can", heart: "heart",
};

function addShape(s: PptxGenJS.Slide, el: ShapeElement, hex: (c: ColorRef | null | undefined, f?: string) => string) {
  const t = transparency(el), rotate = el.rotation ?? 0;
  if (isLineShape(el.shape)) {
    // 線は枠の高さの中央を通る(ShapeEl と同じ)。回転は枠の中心まわりなので、高さ 0 の枠でも同じ位置になる
    const line = el.line === null ? null : { color: hex(el.line?.color ?? SHAPE_DEFAULTS.lineColor), width: PTS(el.line?.width ?? SHAPE_DEFAULTS.lineWidth), transparency: t };
    if (!line) return;
    s.addShape("line", { x: IN(el.x), y: IN(el.y + el.h / 2), w: IN(el.w), h: 0, rotate, line: { ...line, endArrowType: el.shape === "arrow" ? "triangle" : undefined } });
    return;
  }
  const fill = el.fill === null ? { type: "none" as const } : { color: hex(el.fill ?? SHAPE_DEFAULTS.fill), transparency: t };
  const line = el.line ? { color: hex(el.line.color), width: PTS(el.line.width), transparency: t } : { type: "none" as const };
  const native = NATIVE[el.shape];
  if (native) {
    s.addShape(native as PptxGenJS.SHAPE_NAME, { ...box(el), fill, line, rotate,
      rectRadius: el.shape === "roundRect" ? IN(Math.min(el.radius ?? SHAPE_DEFAULTS.radius, el.w / 2, el.h / 2)) : undefined });
    return;
  }
  const points = shapePoints(el);
  if (!points) throw new Error(`図形「${el.shape}」を書き出せません`);
  s.addShape("custGeom" as PptxGenJS.SHAPE_NAME, { ...box(el), fill, line, rotate,
    points: [...points.map((p, i) => ({ x: IN(p.x * el.w), y: IN(p.y * el.h), moveTo: i === 0 || undefined })), { close: true as const }] });
}

async function imageData(src: string, deckDir: string | null): Promise<string> {
  if (src.startsWith("data:")) return src;
  const abs = deckDir ? joinPath(deckDir, src) : src;
  if (inTauri()) return readAsset(abs);
  const blob = await (await fetch(abs)).blob();
  return readDataUrl(blob);
}

const naturalSize = (url: string) => sizeOf(url, { w: 1, h: 1 });

async function addImage(s: PptxGenJS.Slide, el: ImageElement, deckDir: string | null) {
  const data = await imageData(el.src, deckDir);
  const n = await naturalSize(data), fit = el.fit ?? "contain", rotate = el.rotation ?? 0, t = transparency(el);
  if (fit === "fill") { s.addImage({ data, ...box(el), rotate, transparency: t }); return; }
  if (fit === "cover") {
    // 元の縦横比の大きさを渡すと、PowerPoint 側で枠に合わせて切り取る
    const k = Math.max(el.w / n.w, el.h / n.h);
    s.addImage({ data, x: IN(el.x), y: IN(el.y), w: IN(n.w * k), h: IN(n.h * k), rotate, transparency: t, sizing: { type: "cover", w: IN(el.w), h: IN(el.h) } });
    return;
  }
  const k = Math.min(el.w / n.w, el.h / n.h), w = n.w * k, h = n.h * k;
  s.addImage({ data, x: IN(el.x + (el.w - w) / 2), y: IN(el.y + (el.h - h) / 2), w: IN(w), h: IN(h), rotate, transparency: t });
}

function addChart(s: PptxGenJS.Slide, el: ChartElement, theme: Theme) {
  const spec = el.chart, opt = spec.options ?? {};
  const isPie = spec.kind === "pie" || spec.kind === "doughnut";
  const types: Record<ChartElement["chart"]["kind"], PptxGenJS.CHART_NAME> = { bar: "bar", hbar: "bar", line: "line", pie: "pie", doughnut: "doughnut", area: "area" };
  const series = (isPie ? spec.series.slice(0, 1) : spec.series).map((x) => ({ name: x.name, labels: spec.labels, values: x.values }));
  const legend = opt.legend ?? (isPie || spec.series.length > 1 ? "bottom" : "none");
  const fg = resolveColor("dk1", theme, "#000000").replace("#", "");
  s.addChart(types[spec.kind], series, {
    ...box(el),
    barDir: spec.kind === "hbar" ? "bar" : "col",
    barGrouping: opt.stacked ? "stacked" : "clustered",
    chartColors: chartPalette(theme, isPie ? spec.labels.length : spec.series.length, opt.colors).map((c) => c.replace("#", "")),
    showValue: opt.showValues ?? true,
    showLegend: legend !== "none", legendPos: legend === "right" ? "r" : "b",
    showTitle: !!spec.title, title: spec.title, titleFontSize: 14, titleColor: fg,
    catAxisLabelColor: fg, valAxisLabelColor: fg, dataLabelColor: fg, legendColor: fg,
    catAxisLabelFontSize: 11, valAxisLabelFontSize: 11, dataLabelFontSize: 10, legendFontSize: 11,
    catAxisLabelFontFace: theme.fonts.body, valAxisLabelFontFace: theme.fonts.body,
  });
}

function addTable(s: PptxGenJS.Slide, el: TableElement, theme: Theme, hex: (c: ColorRef | null | undefined, f?: string) => string, slideBg: string) {
  // 色は TableEl と同じ: 見出し行 accent1 / lt1、縞 lt2、地の行はスライドの背景色(要素の背景色があればそれ)
  const rows = el.rows.length ? el.rows : [[{ text: "" }]];
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const header = el.header ?? true;
  const raw = el.colW && el.colW.length === cols ? el.colW.map((w) => Math.max(1, w)) : Array(cols).fill(1);
  const total = raw.reduce((a, b) => a + b, 0);
  const grid = gridColor(theme).replace("#", "");
  const base = el.background ? hex(el.background) : slideBg;
  s.addTable(rows.map((row, ri) => Array.from({ length: cols }, (_, ci) => {
    const c = row[ci] ?? { text: "" };
    const head = header && ri === 0;
    const striped = !head && (header ? ri - 1 : ri) % 2 === 1;
    return { text: c.text, options: {
      bold: head || !!c.bold, align: c.align ?? "left", valign: "middle" as const,
      color: c.color ? hex(c.color) : head ? hex("lt1", "FFFFFF") : hex("dk1"),
      fill: { color: c.fill ? hex(c.fill) : head ? hex("accent1", "333333") : striped ? hex("lt2", "F3F3F3") : base },
    } };
  })), {
    x: IN(el.x), y: IN(el.y), w: IN(el.w), colW: raw.map((w) => IN(el.w * w / total)), rowH: IN(el.h / rows.length),
    fontSize: el.fontSize ?? TABLE_FONT_SIZE, fontFace: theme.fonts.body, margin: [3, 6, 3, 6], border: { type: "solid", pt: 0.75, color: grid },
  });
}

function addEmbed(s: PptxGenJS.Slide, el: EmbedElement, hex: (c: ColorRef | null | undefined, f?: string) => string) {
  // 動く要素は pptx に入らないので、場所が分かるよう題名入りの枠を置く
  s.addShape("rect", { ...box(el), fill: { color: hex("lt2", "EEEEEE") }, line: { color: hex("accent5", "888888"), width: 1, dashType: "dash" } });
  s.addText([
    { text: el.title ?? el.src, options: { bold: true, fontSize: 18, color: hex("dk1"), breakLine: true } },
    { text: "インタラクティブな要素(Lumifold で操作できます)", options: { fontSize: 12, color: hex("accent5", "666666") } },
  ], { ...box(el), align: "center", valign: "middle", margin: 6 });
}
