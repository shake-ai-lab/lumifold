import { Fragment, type CSSProperties, type ReactNode, type Ref } from "react";
import { PT, canvasSize, resolveColor, type Deck, type Element, type Slide as SlideModel, type Theme } from "../model/deck";
import { MathEl } from "./elements/MathEl";
import { ChartEl } from "./elements/ChartEl";
import { EmbedEl } from "./elements/EmbedEl";
import { ImageEl } from "./elements/ImageEl";
import { ShapeEl } from "./elements/ShapeEl";
import { TableEl } from "./elements/TableEl";
import { TextEl } from "./elements/TextEl";
import { pageNumberBox } from "../model/pageNumber";

interface Props {
  deck: Deck;
  slide: SlideModel;
  /** 表示倍率。1 で論理キャンバスの px(スライドは 1280x720、ノートは 768x1024) */
  scale: number;
  /** サムネイルなど、グラフのアニメーションや操作が不要なとき */
  static?: boolean;
  presenting?: boolean;
  /** 論理キャンバス(拡縮前の div)への ref。エディタが Moveable の container に使う */
  innerRef?: Ref<HTMLDivElement>;
  /** 直接編集中の要素。中身を隠してオーバーレイに任せる */
  editingId?: string | null;
  editingContent?: ReactNode;
  /** エディタが拡縮済みキャンバスの中に重ねるもの(Moveable、編集オーバーレイ) */
  children?: ReactNode;
  /** 資料の中での位置(0 始まり)。ページ番号を付ける資料なら番号を描く */
  pageIndex?: number;
}

/** 1 枚のスライド(ページ)を論理キャンバスで組み、CSS transform で拡縮する */
export function Slide({ deck, slide, scale, static: isStatic, presenting = false, innerRef, editingId, editingContent, children, pageIndex }: Props) {
  const { theme } = deck;
  const size = canvasSize(deck);
  const bg = resolveColor(slide.background?.color ?? "lt1", theme, "#FFFFFF");
  const outer: CSSProperties = {
    width: size.w * scale,
    height: size.h * scale,
    position: "relative",
    overflow: isStatic ? "hidden" : "visible",
    flex: "none",
  };
  const inner: CSSProperties = {
    width: size.w,
    height: size.h,
    transform: `scale(${scale})`,
    transformOrigin: "top left",
    position: "absolute",
    left: 0,
    top: 0,
    background: bg,
    // 表の地の行など「スライドの背景と同じ色で塗る」要素が参照する
    ["--slide-bg" as string]: bg,
    fontFamily: `"${theme.fonts.body}", sans-serif`,
    color: resolveColor("dk1", theme, "#000000"),
  };
  return (
    <div style={outer} className="slide-outer">
      <div style={inner} className="slide" ref={innerRef}>
        {slide.elements.map((el) => (
          <Fragment key={el.id}>
            <ElementBox el={el} theme={theme} editing={el.id === editingId}>
              <ElementView el={el} deck={deck} isStatic={!!isStatic} presenting={presenting} />
            </ElementBox>
            {el.id === editingId && editingContent}
          </Fragment>
        ))}
        <PageNumber deck={deck} index={pageIndex} />
        {children}
      </div>
    </div>
  );
}

/** 自動のページ番号。要素ではないので選べず、クリックも奪わない */
function PageNumber({ deck, index }: { deck: Deck; index?: number }) {
  const box = index === undefined ? null : pageNumberBox(deck, index);
  if (!box) return null;
  return <div className="page-number" aria-hidden style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h,
    display: "flex", alignItems: "center", justifyContent: box.align === "left" ? "flex-start" : box.align === "right" ? "flex-end" : "center",
    fontSize: box.fontSize * PT, color: box.color, fontVariantNumeric: "tabular-nums", letterSpacing: "0.04em", pointerEvents: "none" }}>{box.text}</div>;
}

function ElementBox({ el, theme, editing, children }: { el: Element; theme: Theme; editing: boolean; children: ReactNode }) {
  const style: CSSProperties = {
    position: "absolute",
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    transformOrigin: "center center",
    opacity: el.opacity,
    background: editing ? "transparent" : resolveColor(el.background, theme),
  };
  const cls = ["el", `el-${el.type}`, el.locked ? "locked" : "", editing ? "editing" : ""].filter(Boolean).join(" ");
  return (
    <div className={cls} data-id={el.id} style={style}>
      {children}
    </div>
  );
}

function ElementView({ el, deck, isStatic, presenting }: { el: Element; deck: Deck; isStatic: boolean; presenting: boolean }) {
  switch (el.type) {
    case "text":
      return <TextEl el={el} theme={deck.theme} warn={!isStatic && !presenting} />;
    case "math":
      return <MathEl el={el} theme={deck.theme} />;
    case "shape":
      return <ShapeEl el={el} theme={deck.theme} />;
    case "image":
      return <ImageEl el={el} />;
    case "chart":
      return <ChartEl el={el} theme={deck.theme} isStatic={isStatic} />;
    case "table":
      return <TableEl el={el} theme={deck.theme} />;
    case "embed":
      return <EmbedEl el={el} isStatic={isStatic} presenting={presenting} />;
    default:
      return null;
  }
}
