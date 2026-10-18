import { useId } from "react";
import { resolveColor, type ShapeElement, type Theme } from "../../model/deck";
import { shapePoints } from "../../model/shapes";
import { SHAPE_DEFAULTS } from "../../model/defaults";

/** 図形は SVG で描く。要素の w/h をそのまま viewBox にして、線幅は px のまま保つ */
export function ShapeEl({ el, theme }: { el: ShapeElement; theme: Theme }) {
  const { w, h } = el;
  const fill = el.fill === null ? "none" : resolveColor(el.fill ?? SHAPE_DEFAULTS.fill, theme, "none");
  const stroke = el.line ? resolveColor(el.line.color, theme, "#000000") : "none";
  const sw = el.line ? el.line.width : 0;
  const common = { fill, stroke, strokeWidth: sw };
  const id = `arrow-${useId().replace(/:/g, "")}`;

  let body: React.ReactNode;
  switch (el.shape) {
    case "rect":
      body = <rect x={sw / 2} y={sw / 2} width={w - sw} height={h - sw} {...common} />;
      break;
    case "roundRect":
      body = <rect x={sw / 2} y={sw / 2} width={w - sw} height={h - sw} rx={el.radius ?? SHAPE_DEFAULTS.radius} {...common} />;
      break;
    case "ellipse":
      body = <ellipse cx={w / 2} cy={h / 2} rx={(w - sw) / 2} ry={(h - sw) / 2} {...common} />;
      break;
    case "triangle":
      body = <polygon points={`${w / 2},${sw} ${w - sw},${h - sw} ${sw},${h - sw}`} {...common} />;
      break;
    case "line":
    case "arrow": {
      // 線は fill ではなく line の色で描く。line 未指定なら既定の線
      const lc = el.line === null ? "none" : el.line ? stroke : resolveColor(SHAPE_DEFAULTS.lineColor, theme, "#888888");
      const lw = el.line ? sw : SHAPE_DEFAULTS.lineWidth;
      const headLength = el.arrowHeadLength ?? 8 * lw;
      const headWidth = el.arrowHeadWidth ?? 8 * lw;
      body = (
        <>
          {el.shape === "arrow" && (
            <defs>
              <marker id={id} markerWidth={headLength} markerHeight={headWidth} refX={headLength} refY={headWidth / 2} orient="auto" markerUnits="userSpaceOnUse">
                <path d={`M0,0 L${headLength},${headWidth / 2} L0,${headWidth} z`} fill={lc} />
              </marker>
            </defs>
          )}
          <line
            x1={0}
            y1={h / 2}
            x2={w}
            y2={h / 2}
            stroke={lc}
            strokeWidth={lw}
            markerEnd={el.shape === "arrow" ? `url(#${id})` : undefined}
          />
        </>
      );
      break;
    }
    case "cylinder": {
      const ry = Math.min(h / 6, w / 4);
      body = <><path d={`M0,${ry} A${w / 2},${ry} 0 0 1 ${w},${ry} V${h - ry} A${w / 2},${ry} 0 0 1 0,${h - ry} Z`} {...common} />
        <ellipse cx={w / 2} cy={ry} rx={w / 2} ry={ry} {...common} /></>;
      break;
    }
    case "heart":
      body = <path d={`M${w / 2},${h} C${-w * .4},${h * .35} 0,${-h * .3} ${w / 2},${h * .2} C${w},${-h * .3} ${w * 1.4},${h * .35} ${w / 2},${h} Z`} {...common} />;
      break;
    default: {
      const points = shapePoints(el);
      body = points && <polygon points={points.map((p) => `${p.x * w},${p.y * h}`).join(" ")} {...common} strokeLinejoin={el.lineJoin ?? "round"} />;
    }
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }}>
      {body}
    </svg>
  );
}
