import { Icon } from "./Icon";
import { useEffect, useRef, useState } from "react";
import type { Binding, ChartKind, ColorRef, Deck, DeckFormat, Element, HAlign, PageNumbers, ShapeKind, TextElement, VAlign } from "../model/deck";
import { deckFormat, resolveColor, unitName } from "../model/deck";
import { isLineElement, isLineShape, MATH_FONT_SIZE, SCHEME_COLOR_NAMES, SHAPE_DEFAULTS, TABLE_FONT_SIZE, textFontSize } from "../model/defaults";
import { useStore } from "../store";
import { formatParagraphs, type RunFormat } from "./richText";
import { NumberField } from "./NumberField";
import { BLOCK_ARROWS, SHAPES, shapePoints } from "../model/shapes";
import { ColorPicker } from "./ColorPicker";
import { ObjectComments } from "./ObjectComments";
import { TextFit } from "./TextFit";
import { WidgetFileButton } from "./WidgetFileButton";

const CHARTS: ChartKind[] = ["bar", "hbar", "line", "pie", "doughnut", "area"];

export function PropertiesPanel({ deck }: { deck: Deck }) {
  const current = useStore((s) => s.current);
  const selection = useStore((s) => s.selection);
  const { patchElement, setSlideBackground } = useStore.getState();
  const slide = deck.slides[current];
  const el = selection.length === 1 ? slide.elements.find((e) => e.id === selection[0]) : undefined;

  if (selection.length > 1) return <MultiProps deck={deck} elements={slide.elements.filter((e) => selection.includes(e.id))} />;
  if (!el) {
    const note = deckFormat(deck) === "note";
    return (
      <aside className="props">
        <h3>{`${unitName(deck)} ${current + 1}`}</h3>
        <Row label="背景">
          <ColorSelect deck={deck} value={slide.background?.color ?? "lt1"} onChange={(c) => setSlideBackground(c)} />
        </Row>
        <p className="hint">要素をクリックすると、ここに属性が出ます。ダブルクリックで文字編集。</p>
        <h4>{note ? "メモ" : "発表者ノート"}</h4>
        <NotesField key={slide.id} value={slide.notes ?? ""} label={note ? "ページのメモ" : "発表者ノート"} placeholder={note ? "このページについてのメモ…" : "このスライドで話すこと…"}
          onCommit={(notes) => useStore.getState().setSlideNotes(notes)} />
        <p className="hint">{note ? "読む画面には出ない自分用のメモ。PowerPoint に書き出すとノートに入ります。"
          : "話すことのメモ。プレゼン中に P キー(または「発表者ビュー」)で、次のスライドや経過時間と一緒に表示されます。"}</p>
        <h4>資料の種類</h4>
        <Row label="種類">
          <select aria-label="資料の種類" value={deckFormat(deck)} onChange={(e) => useStore.getState().setFormat(e.target.value as DeckFormat)}>
            <option value="slides">スライド(横 16:9)</option>
            <option value="note">ノート(縦 3:4・本のように読む)</option>
          </select>
        </Row>
        <p className="hint">{note ? "「読む」で単ページ・見開きにして、本のようにめくって読めます。" : "ノートにすると縦のページになり、本のように見開きでめくって読めます。"}
          切り替えると中身を新しい大きさに合わせて中央に置きます。元の種類に戻すと縮尺も戻ります(Ctrl+Z でも戻せます)。</p>
        {note && <Row label="綴じ方">
          <select aria-label="綴じ方" value={deck.binding ?? "left"} onChange={(e) => useStore.getState().setBookOptions({ binding: e.target.value as Binding })}>
            <option value="left">左綴じ(左から右へ読む・横書き)</option>
            <option value="right">右綴じ(右から左へ読む・縦書きや漫画)</option>
          </select>
        </Row>}
        <Row label="ページ番号">
          <select aria-label="ページ番号" value={deck.pageNumbers ?? ""} onChange={(e) => useStore.getState().setBookOptions({ pageNumbers: (e.target.value || null) as PageNumbers | null })}>
            <option value="">付けない</option>
            <option value="center">下の中央</option>
            <option value="outside">{note ? "下の外側(見開きの外の角)" : "右下"}</option>
          </select>
        </Row>
        {deck.pageNumbers && current > 0 && <label className="row check-row">
          <input type="checkbox" checked={!!slide.hidePageNumber} onChange={(e) => useStore.getState().setHidePageNumber(e.target.checked)} />
          <span>この{unitName(deck)}には番号を付けない</span>
        </label>}
        {deck.pageNumbers && <p className="hint">番号は 1 枚目(表紙)には付きません。章の扉や全面の絵のページは、上の欄で外せます。</p>}
      </aside>
    );
  }

  const num = (key: "x" | "y" | "w" | "h" | "rotation") => (
    <NumberField
      key={`${el.id}-${key}`}
      value={Math.round((el[key] ?? 0) as number)}
      min={key === "w" || key === "h" ? 1 : undefined}
      disabled={!!el.locked}
      onCommit={(value) => patchElement(el.id, { [key]: value } as Partial<Element>)}
    />
  );

  return (
    <aside className="props">
      <h3>
        {labelOf(el)} {el.name && <small title={el.id}>{el.name}</small>}
      </h3>
      <details className="position-details" key={`geometry-${el.id}`}>
        <summary>位置・サイズの詳細</summary>
        <div className="grid2">
          <Row label="X">{num("x")}</Row>
          <Row label="Y">{num("y")}</Row>
          <Row label="幅">{num("w")}</Row>
          <Row label="高さ">{num("h")}</Row>
          <Row label="回転">{num("rotation")}</Row>
        </div>
        {/* 2 列の外に置く(2 列のラベル幅では「位置を固定」が切れる) */}
        <Row label="位置を固定">
          <input type="checkbox" checked={!!el.locked} onChange={(e) => patchElement(el.id, { locked: e.target.checked || undefined })} />
        </Row>
      </details>
      {el.locked && el.type !== "embed" && <p className="hint locked-hint">位置を固定中: 移動・大きさの変更・削除はできません。中身と書式は編集できます。</p>}
      <Row label="背景色"><ColorSelect deck={deck} value={el.background ?? null} allowNone onChange={(background) => patchElement(el.id, { background })} /></Row>

      {el.type === "text" && <><TextProps el={el} deck={deck} /><TextFit el={el} theme={deck.theme} /></>}
      {el.type === "shape" && <ShapeProps el={el} deck={deck} />}
      {el.type === "math" && <>
        <Row label="文字 pt"><NumberField value={el.fontSize ?? MATH_FONT_SIZE} min={6} max={200} onCommit={(fontSize) => patchElement(el.id, { fontSize })} /></Row>
        <Row label="文字色"><ColorSelect deck={deck} value={el.color ?? "dk1"} onChange={(color) => patchElement(el.id, { color: color ?? "dk1" })} /></Row>
        <div className="btns"><button onClick={() => useStore.getState().setEditing(el.id)}><Icon name="math" />数式を編集</button></div>
        <p className="hint">TeX の数式を入力できます。ダブルクリックでも編集できます。</p>
      </>}
      {el.type === "chart" && <ChartProps el={el} />}
      {el.type === "table" && (
        <>
        <Row label="文字 pt">
          <NumberField key={el.id} value={el.fontSize ?? TABLE_FONT_SIZE} min={1} max={400} onCommit={(fontSize) => patchElement(el.id, { fontSize })} />
        </Row>
        <div className="btns"><button onClick={() => useStore.getState().setEditing(el.id, 0)}><Icon name="table" />セルを編集</button></div>
        <p className="hint">セルをダブルクリックして編集。Tab で次のセル、Ctrl+Enter で確定、Esc で取り消せます。</p>
        </>
      )}
      {el.type === "embed" && (
        <>
          <Row label="ファイル">
            <input type="text" value={el.src} readOnly />
          </Row>
          <Row label="名前">
            <input type="text" value={el.title ?? ""} onChange={(e) => patchElement(el.id, { title: e.target.value || undefined })} />
          </Row>
          <WidgetFileButton key={el.id} elementId={el.id} />
          <div className="widget-mode-actions">
            <button onClick={() => useStore.getState().setInteracting(el.id)}><Icon name="interact" />中身を操作</button>
            <button onClick={() => { patchElement(el.id, { locked: undefined }); useStore.getState().setInteracting(null); }}><Icon name="move" />配置を編集</button>
          </div>
          <p className="hint">「中身を操作」でスライダーなどを使えます。Escで配置に戻ります。固定すると常に内部を操作できます。</p>
          <p className="hint">対応する教材の実験値は、アプリ起動中のページ移動と編集・発表の切替で保持します。資料ファイルには保存しません。一覧は初期状態のプレビューです。</p>
        </>
      )}
      {el.type === "image" && (
        <Row label="収め方">
          <select value={el.fit ?? "contain"} onChange={(e) => patchElement(el.id, { fit: e.target.value as "contain" | "cover" | "fill" })}>
            <option value="contain">全体を収める</option>
            <option value="cover">埋める</option>
            <option value="fill">引き伸ばす</option>
          </select>
        </Row>
      )}

      <ObjectComments key={`comments-${el.id}`} el={el} />
    </aside>
  );
}

/** すべて同じ値ならその値、違えば MIXED */
const MIXED = Symbol("mixed");
function common<T>(values: T[]): T | typeof MIXED {
  return values.every((v) => JSON.stringify(v) === JSON.stringify(values[0])) ? values[0] : MIXED;
}

/** 複数選択: 共通の色・文字サイズ・不透明度・固定をまとめて変える(1 回の undo で戻る) */
function MultiProps({ deck, elements }: { deck: Deck; elements: Element[] }) {
  const ids = elements.map((e) => e.id);
  const texts = elements.filter((e): e is TextElement => e.type === "text");
  const shapes = elements.filter((e): e is Extract<Element, { type: "shape" }> => e.type === "shape");
  const filled = shapes.filter((e) => !isLineElement(e));
  const apply = (fn: (el: Element) => Partial<Element> | null) => {
    const st = useStore.getState();
    const patches: Record<string, Partial<Element>> = {};
    for (const el of st.deck?.slides[st.current].elements ?? []) {
      if (!ids.includes(el.id)) continue;
      const patch = fn(el);
      if (patch) patches[el.id] = patch;
    }
    if (Object.keys(patches).length) st.patchElements(patches);
  };
  const tally = elements.reduce<Record<string, number>>((n, e) => ({ ...n, [labelOf(e)]: (n[labelOf(e)] ?? 0) + 1 }), {});
  const kinds = Object.entries(tally).map(([label, n]) => label + " " + n).join("・");
  const background = common(elements.map((e) => e.background ?? null));
  const opacity = common(elements.map((e) => Math.round((e.opacity ?? 1) * 100)));
  const fontSize = common(texts.map(textFontSize));
  const textColor = common(texts.map((e) => e.style?.color ?? "dk1"));
  const bold = common(texts.map((e) => !!e.style?.bold));
  const fill = common(filled.map((e) => (e.fill === null ? null : e.fill ?? SHAPE_DEFAULTS.fill)));
  const line = common(shapes.map((e) => (isLineElement(e) && e.line === undefined ? SHAPE_DEFAULTS.lineColor : e.line?.color ?? null)));
  const locked = common(elements.map((e) => !!e.locked));
  return (
    <aside className="props">
      <h3>{elements.length} 個を選択中 <small>{kinds}</small></h3>
      <Row label="背景色"><ColorSelect deck={deck} allowNone mixed={background === MIXED} value={background === MIXED ? null : background}
        onChange={(c) => apply(() => ({ background: c }))} /></Row>
      <Row label="不透明度 %"><NumberField value={opacity === MIXED ? null : opacity} min={0} max={100}
        onCommit={(v) => apply(() => ({ opacity: v >= 100 ? undefined : v / 100 }))} /></Row>
      {texts.length > 0 && <>
        <h4>文字 <small>{texts.length} 個</small></h4>
        <div className="grid2">
          <Row label="文字 pt"><NumberField value={fontSize === MIXED ? null : fontSize} min={1} max={400}
            onCommit={(size) => apply((el) => (el.type === "text" ? textStylePatch(el, { fontSize: size }) : null))} /></Row>
          <Row label="太字"><TriCheckbox value={bold === MIXED ? null : bold} onChange={(b) => apply((el) => (el.type === "text" ? textStylePatch(el, { bold: b }) : null))} /></Row>
        </div>
        <Row label="文字色"><ColorSelect deck={deck} mixed={textColor === MIXED} value={textColor === MIXED ? null : textColor}
          onChange={(c) => apply((el) => (el.type === "text" ? textStylePatch(el, { color: c ?? "dk1" }) : null))} /></Row>
      </>}
      {shapes.length > 0 && <>
        <h4>図形 <small>{shapes.length} 個</small></h4>
        {filled.length > 0 && <Row label="塗り"><ColorSelect deck={deck} allowNone mixed={fill === MIXED} value={fill === MIXED ? null : fill}
          onChange={(c) => apply((el) => (el.type === "shape" && !isLineElement(el) ? { fill: c } : null))} /></Row>}
        <Row label="線"><ColorSelect deck={deck} allowNone mixed={line === MIXED} value={line === MIXED ? null : line}
          onChange={(c) => apply((el) => (el.type === "shape" ? { line: c ? { color: c, width: el.line?.width ?? SHAPE_DEFAULTS.lineWidth } : null } : null))} /></Row>
      </>}
      <Row label="位置を固定"><TriCheckbox value={locked === MIXED ? null : locked} onChange={(v) => useStore.getState().setLocked(ids, v)} /></Row>
      <p className="hint">そろっていない値は「混在」と出ます。変えると選択中のすべてに同じ値が入ります(Ctrl+Z で 1 回で戻せます)。</p>
      <p className="hint">整列・間隔・重なり順は上部の要素ツールバーで操作できます。Shift＋クリックで選択を追加、Esc で解除。</p>
    </aside>
  );
}

/** 発表者ノート。入力中は手元にため、欄を離れたときに 1 回だけ保存する(1 文字ごとに元に戻す履歴を作らない)。Esc で取り消し */
function NotesField({ value, label, placeholder, onCommit }: { value: string; label: string; placeholder: string; onCommit: (notes: string) => void }) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);
  return <textarea className="notes-field" aria-label={label} placeholder={placeholder} value={draft}
    onChange={(e) => setDraft(e.target.value)}
    onBlur={() => { if (cancelled.current) { cancelled.current = false; setDraft(value); return; } if (draft !== value) onCommit(draft); }}
    onKeyDown={(e) => {
      e.stopPropagation(); // 矢印キーなどでスライドが移動しないように
      if (e.key === "Escape") { e.preventDefault(); cancelled.current = true; e.currentTarget.blur(); }
    }} />;
}

/** null なら「混在」(一部だけオン)を表示するチェックボックス */
function TriCheckbox({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = value === null; }, [value]);
  return <input ref={ref} type="checkbox" checked={!!value} aria-checked={value === null ? "mixed" : value} onChange={(e) => onChange(e.target.checked)} />;
}

function labelOf(el: Element): string {
  return { text: "テキスト", shape: "図形", image: "画像", chart: "グラフ", table: "表", embed: "ウィジェット", math: "数式" }[el.type];
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="row">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ColorSelect({
  deck,
  value,
  onChange,
  allowNone,
  mixed,
}: {
  deck: Deck;
  value: ColorRef | null | undefined;
  onChange: (c: ColorRef | null) => void;
  allowNone?: boolean;
  /** 複数選択で色がそろっていない */
  mixed?: boolean;
}) {
  const v = mixed ? "" : value ?? (allowNone ? "" : "dk1");
  return (
    <span className="color-select">
      <span className={`swatch${mixed ? " mixed" : ""}`} style={{ background: v ? resolveColor(v, deck.theme, "transparent") : "transparent" }} />
      <select
        value={mixed ? "__mixed" : SCHEME_COLOR_NAMES.includes(v) || v === "" ? v : "__hex"}
        onChange={(e) => {
          if (e.target.value === "__hex" || e.target.value === "__mixed") return; // 表示用。選び直しても変えない
          onChange(e.target.value === "" ? null : e.target.value);
        }}
      >
        {mixed && <option value="__mixed" disabled>（混在）</option>}
        {allowNone && <option value="">なし</option>}
        {SCHEME_COLOR_NAMES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        {!mixed && !SCHEME_COLOR_NAMES.includes(v) && v !== "" && <option value="__hex">#{v}</option>}
      </select>
      <details className="custom-color"><summary title="自由な色・スポイト">＋</summary>
        <ColorPicker value={resolveColor(v || "dk1", deck.theme, "#000000")} onChange={onChange} />
      </details>
    </span>
  );
}

type TextStyle = NonNullable<TextElement["style"]>;

/** 文字全体の書式を変える patch。文字単位の指定(runs)も同じ値にそろえる。不正な値なら null */
function textStylePatch(el: TextElement, patch: Partial<TextStyle>): Partial<Element> | null {
  const runPatch: RunFormat = {};
  if (patch.fontSize !== undefined) {
    if (!Number.isFinite(patch.fontSize) || patch.fontSize < 1 || patch.fontSize > 400) return null;
    runPatch.fontSize = patch.fontSize;
  }
  if (patch.color !== undefined) runPatch.color = patch.color;
  if (patch.bold !== undefined) runPatch.bold = patch.bold;
  if (patch.italic !== undefined) runPatch.italic = patch.italic;
  return { style: { ...el.style, ...patch }, ...(Object.keys(runPatch).length ? { paragraphs: formatParagraphs(el.paragraphs, runPatch) } : {}) };
}

function TextProps({ el, deck }: { el: Extract<Element, { type: "text" }>; deck: Deck }) {
  const { patchElement } = useStore.getState();
  const st = el.style ?? {};
  const setStyle = (patch: Partial<TextStyle>) => {
    const state = useStore.getState();
    const latest = state.deck?.slides[state.current].elements.find((item) => item.id === el.id);
    if (latest?.type !== "text") return;
    const next = textStylePatch(latest, patch);
    if (next) patchElement(el.id, next);
  };
  return (
    <>
      <div className="grid2">
        <Row label="文字 pt">
          <NumberField key={el.id} value={textFontSize(el)} min={1} max={400} onCommit={(fontSize) => setStyle({ fontSize })} />
        </Row>
        <Row label="太字">
          <input type="checkbox" checked={!!st.bold} onChange={(e) => setStyle({ bold: e.target.checked })} />
        </Row>
      </div>
      <Row label="色">
        <ColorSelect deck={deck} value={st.color ?? "dk1"} onChange={(c) => setStyle({ color: c ?? "dk1" })} />
      </Row>
      <Row label="横">
        <Seg<HAlign> value={st.align ?? "left"} items={[["left", "左"], ["center", "中"], ["right", "右"]]} onChange={(v) => setStyle({ align: v })} />
      </Row>
      <Row label="縦">
        <Seg<VAlign> value={st.valign ?? "top"} items={[["top", "上"], ["middle", "中"], ["bottom", "下"]]} onChange={(v) => setStyle({ valign: v })} />
      </Row>
      <Row label="段落間 px">
        <NumberField key={el.id} value={st.paraSpacing ?? 0} min={0} onCommit={(paraSpacing) => setStyle({ paraSpacing })} />
      </Row>
    </>
  );
}

function ShapeProps({ el, deck }: { el: Extract<Element, { type: "shape" }>; deck: Deck }) {
  const { patchElement } = useStore.getState();
  const isLine = isLineShape(el.shape);
  return (
    <>
      <Row label="種類">
        <select value={el.shape} onChange={(e) => patchElement(el.id, { shape: e.target.value as ShapeKind, points: undefined })}>
          {el.shape === "polygon" && <option value="polygon">自由な図形</option>}
          {SHAPES.map(([s, label]) => (
            <option key={s} value={s}>
              {label}
            </option>
          ))}
        </select>
      </Row>
      {!isLine && (
        <Row label="塗り">
          <ColorSelect deck={deck} value={el.fill === null ? null : el.fill ?? SHAPE_DEFAULTS.fill} onChange={(c) => patchElement(el.id, { fill: c })} allowNone />
        </Row>
      )}
      <Row label="線">
        <ColorSelect
          deck={deck}
          value={isLine && el.line === undefined ? SHAPE_DEFAULTS.lineColor : el.line?.color ?? null}
          onChange={(c) => patchElement(el.id, { line: c ? { color: c, width: el.line?.width ?? SHAPE_DEFAULTS.lineWidth } : null })}
          allowNone
        />
      </Row>
      {(el.line || (isLine && el.line === undefined)) && (
        <Row label="線幅">
          <NumberField key={el.id} step={0.5} min={0} value={el.line?.width ?? SHAPE_DEFAULTS.lineWidth} onCommit={(width) => patchElement(el.id, { line: { color: el.line?.color ?? SHAPE_DEFAULTS.lineColor, width } })} />
        </Row>
      )}
      {el.shape === "roundRect" && (
        <Row label="角丸">
          <NumberField key={el.id} min={0} value={el.radius ?? SHAPE_DEFAULTS.radius} onCommit={(radius) => patchElement(el.id, { radius })} />
        </Row>
      )}
      {el.shape === "arrow" && <>
        <Row label="先端の長さ"><NumberField min={1} max={200} value={el.arrowHeadLength ?? 8 * (el.line?.width ?? SHAPE_DEFAULTS.lineWidth)} onCommit={(arrowHeadLength) => patchElement(el.id, { arrowHeadLength })} /></Row>
        <Row label="先端の幅"><NumberField min={1} max={200} value={el.arrowHeadWidth ?? 8 * (el.line?.width ?? SHAPE_DEFAULTS.lineWidth)} onCommit={(arrowHeadWidth) => patchElement(el.id, { arrowHeadWidth })} /></Row>
      </>}
      {BLOCK_ARROWS.includes(el.shape) && <>
        <Row label="胴の太さ %"><NumberField min={5} max={95} value={(el.shaftRatio ?? .4) * 100} onCommit={(value) => patchElement(el.id, { shaftRatio: value / 100 })} /></Row>
        <Row label="先端の長さ %"><NumberField min={5} max={45} value={(el.headRatio ?? .3) * 100} onCommit={(value) => patchElement(el.id, { headRatio: value / 100 })} /></Row>
      </>}
      {shapePoints(el) && <div className="btns"><button disabled={el.locked} onClick={() => useStore.getState().setEditing(el.id)}><Icon name="edit" />編集点を編集</button></div>}
      {isLine && <p className="hint">両端の丸い点をドラッグして、長さと向きを変えられます。</p>}
    </>
  );
}

function ChartProps({ el }: { el: Extract<Element, { type: "chart" }> }) {
  const { patchElement } = useStore.getState();
  const c = el.chart;
  const set = (patch: Partial<typeof c>) => patchElement(el.id, { chart: { ...c, ...patch } });
  const opt = c.options ?? {};
  return (
    <>
      <Row label="種類">
        <select value={c.kind} onChange={(e) => set({ kind: e.target.value as ChartKind })}>
          {CHARTS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </Row>
      <Row label="タイトル">
        <input type="text" value={c.title ?? ""} onChange={(e) => set({ title: e.target.value || undefined })} />
      </Row>
      <div className="grid2">
        <Row label="値を表示">
          <input type="checkbox" checked={opt.showValues ?? true} onChange={(e) => set({ options: { ...opt, showValues: e.target.checked } })} />
        </Row>
        <Row label="積み上げ">
          <input type="checkbox" checked={!!opt.stacked} onChange={(e) => set({ options: { ...opt, stacked: e.target.checked } })} />
        </Row>
      </div>
      <div className="btns"><button onClick={() => useStore.getState().openDialog({ kind: "chart", id: el.id })}><Icon name="table" />データを編集</button></div>
      <p className="hint">ラベルと値を表で直せます。Excel の表をコピーして貼り付けることもできます。グラフのダブルクリックでも開きます。</p>
    </>
  );
}

function Seg<T extends string>({ value, items, onChange }: { value: T; items: [T, string][]; onChange: (v: T) => void }) {
  return (
    <span className="seg">
      {items.map(([v, label]) => (
        <button key={v} className={v === value ? "on" : ""} onClick={() => onChange(v)} type="button">
          {label}
        </button>
      ))}
    </span>
  );
}
