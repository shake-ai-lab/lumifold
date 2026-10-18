// deck.json のデータモデル(v1)。docs/DESIGN.md 3 章と ai/schema.json に対応する。
// 座標は論理キャンバスの px(スライドは 1280x720、ノートは 768x1024)。フォントサイズは pt。

/** スライド(横 16:9)の大きさ。ノートの大きさは canvasSize() で引く */
export const CANVAS_W = 1280;
export const CANVAS_H = 720;

/** 資料の種類。slides = 横長のスライド(発表する)、note = 縦長のページ(本のように読む。単ページ・見開き) */
export type DeckFormat = "slides" | "note";

/** 種類ごとの論理キャンバス。ノートは Kindle の画面と同じ 3:4(見開きで 3:2 になり、横長の画面に収まりやすい) */
export const CANVAS_SIZES: Record<DeckFormat, { w: number; h: number }> = {
  slides: { w: CANVAS_W, h: CANVAS_H },
  note: { w: 768, h: 1024 },
};

export const deckFormat = (deck: Pick<Deck, "format"> | null | undefined): DeckFormat => (deck?.format === "note" ? "note" : "slides");
export const canvasSize = (deck: Pick<Deck, "format"> | null | undefined) => CANVAS_SIZES[deckFormat(deck)];
/** 画面の言葉: スライド / ページ */
export const unitName = (deck: Pick<Deck, "format"> | null | undefined) => (deckFormat(deck) === "note" ? "ページ" : "スライド");

/** pt → 画面 px(96dpi) */
export const PT = 96 / 72;

export type SchemeColorName =
  | "dk1" | "lt1" | "dk2" | "lt2"
  | "accent1" | "accent2" | "accent3" | "accent4" | "accent5" | "accent6";

/** スキーム色名("accent1")か 6 桁 hex("1F2933") */
export type ColorRef = string;

export interface Theme {
  fonts: { head: string; body: string };
  colors: Record<SchemeColorName, string> & Record<string, string>;
}

export type HAlign = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: ColorRef;
  fontSize?: number;
}

export interface Paragraph {
  runs: Run[];
  bullet?: boolean;
  level?: number;
  align?: HAlign;
}

export interface TextStyle {
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: ColorRef;
  align?: HAlign;
  valign?: VAlign;
  font?: "head" | "body";
  /** 行間(倍率) */
  lineHeight?: number;
  /** 段落後の余白 px */
  paraSpacing?: number;
}

export interface ObjectComment {
  id: string;
  text: string;
  createdAt: string;
  resolved?: boolean;
  images?: { src: string; name: string }[];
}

interface ElementBase {
  id: string;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  locked?: boolean;
  /** 不透明度 0〜1(省略時 1)。薄い装飾線や背景グリッドに使う */
  opacity?: number;
  /** 同じ値を持つ要素は 1 つのまとまり(グループ)として選択・移動される */
  group?: string;
  background?: ColorRef | null;
  comments?: ObjectComment[];
}

export interface TextElement extends ElementBase {
  type: "text";
  role?: "title" | "body" | "caption" | null;
  style?: TextStyle;
  paragraphs: Paragraph[];
}

export type ShapeKind = "rect" | "roundRect" | "ellipse" | "line" | "arrow" | "triangle"
  | "diamond" | "parallelogram" | "trapezoid" | "pentagon" | "hexagon" | "star"
  | "rightArrow" | "leftArrow" | "upArrow" | "downArrow" | "doubleArrow" | "chevron"
  | "callout" | "cylinder" | "heart" | "polygon";
export type ShapePoint = { x: number; y: number };

export interface ShapeElement extends ElementBase {
  type: "shape";
  shape: ShapeKind;
  fill?: ColorRef | null;
  line?: { color: ColorRef; width: number } | null;
  /** roundRect の角半径 px */
  radius?: number;
  /** Arrowhead dimensions in slide px, independent of line width. */
  arrowHeadLength?: number;
  arrowHeadWidth?: number;
  /** Block arrow shaft thickness as a fraction of its height. */
  shaftRatio?: number;
  /** Block arrow head length as a fraction of its width. */
  headRatio?: number;
  /** Editable polygon vertices relative to the element box. */
  points?: ShapePoint[];
  /** 直線で囲む図形の角の形。既定は round（rect と triangle は miter） */
  lineJoin?: "miter" | "round";
}

export interface ImageElement extends ElementBase {
  type: "image";
  /** デッキフォルダからの相対パス */
  src: string;
  fit?: "contain" | "cover" | "fill";
}

export type ChartKind = "bar" | "hbar" | "line" | "pie" | "doughnut" | "area";

export interface ChartSpec {
  kind: ChartKind;
  labels: string[];
  series: { name: string; values: number[] }[];
  title?: string;
  options?: {
    stacked?: boolean;
    showValues?: boolean;
    legend?: "none" | "bottom" | "right";
    colors?: ColorRef[];
  };
}

export interface ChartElement extends ElementBase {
  type: "chart";
  chart: ChartSpec;
}

export interface TableCell {
  text: string;
  bold?: boolean;
  color?: ColorRef;
  fill?: ColorRef;
  align?: HAlign;
}

export interface TableElement extends ElementBase {
  type: "table";
  colW?: number[];
  header?: boolean;
  fontSize?: number;
  rows: TableCell[][];
}

/** デッキフォルダ内の自己完結 HTML を iframe で動かす(インタラクティブなデモ用)。pptx では静止画になる */
export interface EmbedElement extends ElementBase {
  type: "embed";
  /** デッキフォルダからの相対パス(widgets/xxx.html) */
  src: string;
  title?: string;
}

export interface MathElement extends ElementBase {
  type: "math";
  latex: string;
  fontSize?: number;
  color?: ColorRef;
  displayMode?: boolean;
}

export type Element = TextElement | ShapeElement | ImageElement | ChartElement | TableElement | EmbedElement | MathElement;

export interface Slide {
  id: string;
  background?: { color: ColorRef };
  notes?: string;
  /** ページ番号を付ける資料でも、このページには付けない(章の扉・全面の絵など) */
  hidePageNumber?: boolean;
  elements: Element[];
}

/** 綴じ方(ノート)。left = 左綴じ(左から右へ読み進める・横書き)、right = 右綴じ(右から左へ・縦書きや漫画) */
export type Binding = "left" | "right";
/** ページ番号の位置。center = 下の中央、outside = 下の外側(本では見開きの外側の角、スライドでは右下) */
export type PageNumbers = "center" | "outside";

export interface Deck {
  version: 1;
  /** 省略時は slides */
  format?: DeckFormat;
  /** 元の形式へ戻す際に、中央配置と縮尺の変換を逆に適用する。 */
  formatOrigin?: DeckFormat;
  /** 綴じ方(ノートのみ。省略時は left) */
  binding?: Binding;
  /** ページ番号を自動で付ける(省略時は付けない)。1 ページ目(表紙)には付けない */
  pageNumbers?: PageNumbers;
  meta: { title?: string; author?: string; created?: string };
  theme: Theme;
  slides: Slide[];
}

export const DEFAULT_THEME: Theme = {
  fonts: { head: "Meiryo", body: "Meiryo" },
  colors: {
    dk1: "1F2933",
    lt1: "FFFFFF",
    dk2: "0B4F6C",
    lt2: "EEF2F5",
    accent1: "0B4F6C",
    accent2: "2A9D8F",
    accent3: "E9C46A",
    accent4: "F4A261",
    accent5: "7A869A",
    accent6: "E76F51",
  },
};

/** 罫線・グリッド線の色。テーマに grid があればそれ、無ければ明るい背景向けの薄い灰 */
export function gridColor(theme: Theme): string {
  const g = theme.colors.grid;
  return g ? "#" + g : "#D9DEE3";
}

const HEX6 = /^[0-9a-fA-F]{6}$/;

/** スキーム色名または hex を CSS の色に解決する */
export function resolveColor(ref: ColorRef | null | undefined, theme: Theme, fallback = "transparent"): string {
  if (!ref) return fallback;
  const fromTheme = theme.colors[ref];
  if (fromTheme) return "#" + fromTheme;
  if (HEX6.test(ref)) return "#" + ref;
  if (ref.startsWith("#")) return ref;
  return fallback;
}

/** グラフの系列色: options.colors が無ければ accent1.. を順に使う */
export function chartPalette(theme: Theme, count: number, override?: ColorRef[]): string[] {
  const names: ColorRef[] = override && override.length
    ? override
    : ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"];
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(resolveColor(names[i % names.length], theme, "#888888"));
  return out;
}

/** 最低限の構造検証。詳細なスキーマ検証は Rust 側(jsonschema)で後から足す */
export function parseDeck(text: string): Deck {
  let raw: Partial<Deck>;
  try { raw = JSON.parse(text.replace(/^\uFEFF/, "")) as Partial<Deck>; }
  catch { throw new Error("JSONの書式が正しくありません。ファイルの内容を確認するか、別の資料を開いてください。"); }
  if (!raw || typeof raw !== "object") throw new Error("資料の形式が正しくありません。");
  if (raw.version !== 1) throw new Error(`未対応の version: ${String(raw.version)}`);
  if (!Array.isArray(raw.slides) || !raw.slides.length) throw new Error("スライドがありません。1枚以上の資料を選んでください。");
  const theme: Theme = {
    fonts: { ...DEFAULT_THEME.fonts, ...(raw.theme?.fonts ?? {}) },
    colors: { ...DEFAULT_THEME.colors, ...(raw.theme?.colors ?? {}) },
  };
  return {
    version: 1,
    ...(raw.format === "note" || raw.format === "slides" ? { format: raw.format } : {}),
    ...(raw.formatOrigin === "note" || raw.formatOrigin === "slides" ? { formatOrigin: raw.formatOrigin } : {}),
    ...(raw.binding === "left" || raw.binding === "right" ? { binding: raw.binding } : {}),
    ...(raw.pageNumbers === "center" || raw.pageNumbers === "outside" ? { pageNumbers: raw.pageNumbers } : {}),
    meta: raw.meta ?? {},
    theme,
    slides: raw.slides.map((s, i) => ({
      id: s.id ?? `s${i + 1}`,
      background: s.background,
      notes: s.notes,
      ...(s.hidePageNumber ? { hidePageNumber: true } : {}),
      elements: Array.isArray(s.elements) ? s.elements : [],
    })),
  };
}
