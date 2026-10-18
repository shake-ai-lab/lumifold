import { useCallback, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { canvasSize, deckFormat, unitName, type Element, type ShapeKind } from "../model/deck";
import { isLineShape, SHAPE_DEFAULTS } from "../model/defaults";
import { newId } from "../model/ids";
import { redo, undo, useStore, type SaveState } from "../store";
import { ContextMenu, type MenuState } from "./ContextMenu";
import { SHAPES } from "../model/shapes";
import { ShapeEl } from "../render/elements/ShapeEl";
import { SelectionToolbar } from "./SelectionToolbar";
import { FileActions } from "./FileActions";
import { ExportActions } from "./ExportActions";
import { textPreset } from "./presets";
import { WidgetFileButton } from "./WidgetFileButton";
import { layoutsFor } from "./layouts";
import { insertImageFiles, insertImagePath } from "./images";
import { basename, inTauri, pickImageFile } from "../tauri";
import { Slide } from "../render/Slide";
import { Icon } from "./Icon";

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "",
  dirty: "未保存",
  saving: "保存中…",
  saved: "保存済み",
  error: "保存エラー",
};

export function Toolbar({ onOpen, onPresent, showSlides, showProperties, onToggleSlides, onToggleProperties }: {
  onOpen: () => void; onPresent: () => void; showSlides: boolean; showProperties: boolean;
  onToggleSlides: () => void; onToggleProperties: () => void;
}) {
  const { deck, deckPath, current, saveState, pendingMath } = useStore(useShallow((s) => ({
    deck: s.deck, deckPath: s.deckPath, current: s.current, saveState: s.saveState, pendingMath: s.pendingMath })));
  const { addElement, insertSlide, duplicateSlide, removeSlide, moveSlide } = useStore.getState();
  // 図形と型の一覧は同じ場所に出す。どちらを開いているかで aria-expanded を分ける
  const [menu, setMenu] = useState<(MenuState & { kind: "shapes" | "layouts" }) | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const imageInput = useRef<HTMLInputElement>(null);

  const format = deckFormat(deck);
  const canvas = canvasSize(deck);
  const unit = unitName(deck);
  const addText = () => addElement(textPreset("body", format), { edit: true });

  const addShape = (shape: ShapeKind) => {
    const isLine = isLineShape(shape);
    const el: Element = {
      id: newId("shape"),
      type: "shape",
      shape,
      x: Math.round((canvas.w - 300) / 2),
      y: Math.round((canvas.h - (isLine ? 20 : 200)) / 2),
      w: 300,
      h: isLine ? 20 : 200,
      fill: isLine ? undefined : SHAPE_DEFAULTS.fill,
      line: isLine ? { color: SHAPE_DEFAULTS.lineColor, width: 2 } : null,
      radius: shape === "roundRect" ? SHAPE_DEFAULTS.radius : undefined,
    };
    addElement(el);
  };

  /** 論理キャンバスの中央に置く枠 */
  const centered = (w: number, h: number) => ({ x: Math.round((canvas.w - w) / 2), y: Math.round((canvas.h - h) / 2), w, h });

  return (
    <header className="toolbar">
      <div className="toolbar-header">
      <span className="mode-label">編集モード</span>
      <FileActions />
      <ExportActions />
      <button onClick={onOpen}><Icon name="open" />開く</button>
      <span className="path" title={deckPath ?? ""}>
        {deck?.meta.title || (deckPath && basename(deckPath)) || "デッキが開かれていません"}
      </span>
      {deck && <>
        <span className="meta">{current + 1} / {deck.slides.length}<span className={`save ${saveState}`}>{SAVE_LABEL[saveState]}</span></span>
      </>}
      </div>
      {deck && (
        <div className="toolbar-actions">
          <span className="group" aria-label="挿入">
            <span className="group-label">挿入</span>
            <button onClick={addText} title="テキストボックスを追加">
              <Icon name="text" />テキスト
            </button>
            <button onClick={() => addElement(textPreset("title", format), { edit: true })}><Icon name="heading" />見出し</button>
            <button aria-pressed={pendingMath} onClick={() => {
              useStore.setState({ pendingMath: !pendingMath, selection: [], editingId: null });
            }}><Icon name="math" />数式</button>
            <button aria-haspopup="dialog" aria-expanded={menu?.kind === "shapes"} onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setMenu({ kind: "shapes", x: rect.left, y: rect.bottom + 6, items: [], content: <div className="shape-gallery">
                {SHAPES.map(([kind, label]) => <button key={kind} onClick={() => { addShape(kind); closeMenu(); }}>
                  <ShapeEl el={{ id: `gallery-${kind}`, type: "shape", shape: kind, x: 0, y: 0, w: 44, h: 28, fill: "accent1", line: { color: "D8DEE6", width: 2 } }} theme={deck.theme} />
                  <span>{label}</span>
                </button>)}
              </div> });
            }}><Icon name="shapes" />図形<Icon name="chevron" className="control-chevron" /></button>
            <button title="画像を追加(貼り付け・ドロップでも入れられます)" onClick={async () => {
              if (!inTauri()) { imageInput.current?.click(); return; }
              const path = await pickImageFile();
              if (path) await insertImagePath(path);
            }}><Icon name="image" />画像</button>
            <input ref={imageInput} type="file" accept="image/*" multiple hidden aria-hidden tabIndex={-1}
              onChange={(e) => { void insertImageFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
            <button title="表を追加" onClick={() => addElement({ id: newId("table"), type: "table", ...centered(Math.min(640, canvas.w - 128), 240),
              fontSize: format === "note" ? 14 : 24, rows: [[{ text: "項目" }, { text: "内容" }], [{ text: "" }, { text: "" }], [{ text: "" }, { text: "" }]] }, { edit: true })}>
              <Icon name="table" />表
            </button>
          </span>
          <span className="group" aria-label="履歴">
            <button onClick={undo} title="元に戻す (Ctrl+Z)">
              <Icon name="undo" />元に戻す
            </button>
            <button onClick={redo} title="やり直す (Ctrl+Y)">
              <Icon name="redo" />やり直す
            </button>
          </span>
          <WidgetFileButton />
          <span className="group" aria-label={`${unit}操作`}>
            <span className="group-label">{unit}</span>
            <button aria-haspopup="dialog" aria-expanded={menu?.kind === "layouts"} title={`この後に${unit}を追加(型を選ぶ)`} onClick={(e) => {
              // 型の一覧。見本は今の資料のテーマ色で描く
              const rect = e.currentTarget.getBoundingClientRect();
              setMenu({ kind: "layouts", x: rect.left, y: rect.bottom + 6, items: [], content: <div className={`layout-gallery ${format}`} role="group" aria-label={`${unit}の型`}>
                {layoutsFor(format).map((layout) => <button key={layout.key} onClick={() => { insertSlide(layout.build()); closeMenu(); }}>
                  <Slide deck={deck} slide={{ id: `layout-${layout.key}`, ...layout.build() }} scale={0.1} static />
                  <span>{layout.label}</span>
                </button>)}
              </div> });
            }}>
              <Icon name="addSlide" />追加<Icon name="chevron" className="control-chevron" />
            </button>
            <button onClick={() => duplicateSlide()} title={`この${unit}を複製`}><Icon name="duplicate" />複製</button>
            <button onClick={() => removeSlide()} title={`この${unit}を削除`} disabled={deck.slides.length <= 1}>
              <Icon name="delete" />削除
            </button>
            <button onClick={() => moveSlide(-1)} title="前へ" aria-label={`${unit}を前へ`} disabled={current === 0}>
              <Icon name="up" />前へ
            </button>
            <button onClick={() => moveSlide(1)} title="後ろへ" aria-label={`${unit}を後ろへ`} disabled={current >= deck.slides.length - 1}>
              <Icon name="down" />後ろへ
            </button>
          </span>
          <span className="group view-controls" aria-label="パネルの表示">
            <span className="group-label">表示</span>
            <button aria-pressed={showSlides} title={`${unit}一覧の表示切替`} onClick={onToggleSlides}><Icon name="slides" />一覧</button>
            <button aria-pressed={showProperties} title="設定パネルの表示切替" onClick={onToggleProperties}><Icon name="properties" />設定</button>
          </span>
          {format === "note"
            ? <button onClick={onPresent} className="present-button" title="現在のページから本のように読む(見開き・めくり)"><Icon name="read" />読む</button>
            : <button onClick={onPresent} className="present-button" title="現在のスライドからプレゼンを開始"><Icon name="present" />プレゼン開始</button>}
        </div>
      )}
      {deck && <SelectionToolbar />}
      <ContextMenu menu={menu} onClose={closeMenu} />
    </header>
  );
}
