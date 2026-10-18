// 資料に書いていない属性の既定値。画面(render/)・書き出し(export/)・種類の切り替え(model/format.ts)・右パネルで同じ値を使う。
// 別々に書くと、1 か所だけ変えたときに画面と pptx の見た目がずれる
import type { ColorRef, Element, ShapeKind, TextElement } from "./deck";

/** 文字の大きさ(pt)の既定。役割(見出し・本文・注記)ごと */
export function defaultFontSize(role: TextElement["role"]): number {
  return role === "title" ? 30 : role === "caption" ? 11 : 16;
}

/** 文字要素の大きさ(pt)。書式に無ければ役割の既定 */
export function textFontSize(el: TextElement): number {
  return el.style?.fontSize ?? defaultFontSize(el.role);
}

/** 文字の行間(文字の大きさに対する倍率) */
export const DEFAULT_LINE_HEIGHT = 1.35;
/** 表の文字の大きさ(pt) */
export const TABLE_FONT_SIZE = 13;
/** 数式の文字の大きさ(pt) */
export const MATH_FONT_SIZE = 26;

/** 図形の塗り・線・角丸。線の幅は px */
export const SHAPE_DEFAULTS = { fill: "lt2", lineColor: "accent5", lineWidth: 1.5, radius: 12 } as const;

/** 直線・矢印(端点で編集する図形)か */
export const isLineShape = (shape: ShapeKind): boolean => shape === "line" || shape === "arrow";
export const isLineElement = (el: Element): boolean => el.type === "shape" && isLineShape(el.shape);

/** 左右の余白(px)。見出し・本文・新しく入れる要素をこの内側に置く */
export const PAGE_MARGIN = { slides: 60, note: 64 } as const;

/** 色を選ぶ欄に並べるテーマ色の名前 */
export const SCHEME_COLOR_NAMES: ColorRef[] = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"];
