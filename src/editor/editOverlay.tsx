import type { ReactNode } from "react";
import type { Element, Theme } from "../model/deck";
import { MathEditOverlay } from "./MathEditOverlay";
import { ShapeEditOverlay } from "./ShapeEditOverlay";
import { TableEditOverlay } from "./TableEditOverlay";
import { TextEditOverlay } from "./TextEditOverlay";

/** 編集中の要素の種類に合わせた編集の面(文字・表・図形の編集点・数式)。編集できない種類なら undefined */
export function editOverlayFor(el: Element | undefined, slideId: string, theme: Theme, scale: number): ReactNode {
  if (!el) return undefined;
  const key = `${slideId}-${el.id}`;
  switch (el.type) {
    case "text":
      return <TextEditOverlay key={key} el={el} theme={theme} />;
    case "table":
      return <TableEditOverlay key={key} el={el} theme={theme} scale={scale} />;
    case "shape":
      return <ShapeEditOverlay key={key} el={el} theme={theme} scale={scale} />;
    case "math":
      return <MathEditOverlay key={key} el={el} theme={theme} />;
    default:
      return undefined;
  }
}
