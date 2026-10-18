import { useCallback, useEffect, useRef, useState } from "react";
import { Editor } from "./editor/Editor";
import { EditorViewport } from "./editor/EditorViewport";
import { PropertiesPanel } from "./editor/PropertiesPanel";
import { Toolbar } from "./editor/Toolbar";
import { ContextMenu, type MenuState } from "./editor/ContextMenu";
import { ExternalChangeBanner } from "./editor/ExternalChangeBanner";
import { ChartDataDialog } from "./editor/ChartDataDialog";
import { Presentation } from "./Presentation";
import { PanelResizeHandle, readPanelWidth } from "./editor/PanelResizeHandle";
import { canvasSize, deckFormat, unitName } from "./model/deck";
import { Reader } from "./Reader";
import { Slide } from "./render/Slide";
import { useShallow } from "zustand/react/shallow";
import { flushSave, lastOpenedPath, useStore } from "./store";
import { initialDeck, inTauri, onAssetsChanged, onDeckChanged, pickDeckFile, unlistenLater } from "./tauri";
import { assetsChanged } from "./render/assetRevision";
import { isTypingTarget } from "./keyboard";
import { writeStored } from "./storage";

export default function App() {
  // 保存状態(saveState)などは購読しない。自動保存のたびに一覧のサムネイルまで描き直さないように
  const { deck, deckPath, current, error, selection, editingId, interactingId, toast, externalChange } = useStore(useShallow((s) => ({
    deck: s.deck, deckPath: s.deckPath, current: s.current, error: s.error, selection: s.selection, editingId: s.editingId,
    interactingId: s.interactingId, toast: s.toast, externalChange: s.externalChange })));
  const { openDeck, reload, setCurrent } = useStore.getState();
  // 外部で変わったスライド(バナーを閉じるか、変更前に戻るまで一覧に印を出す)
  const changeMarks = externalChange && deck !== externalChange.before ? externalChange.diff : null;
  const [presenting, setPresenting] = useState(false);
  const [showSlides, setShowSlides] = useState(() => window.innerWidth >= 1100);
  const [showProperties, setShowProperties] = useState(true);
  const [slidesWidth, setSlidesWidth] = useState(() => readPanelWidth("deck-studio.slidesWidth", 220));
  const [propsWidth, setPropsWidth] = useState(() => readPanelWidth("deck-studio.propsWidth", 260));
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [thumbScale, setThumbScale] = useState(0.14);
  const listRef = useRef<HTMLElement>(null);
  const canvas = canvasSize(deck);
  const unit = unitName(deck);
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    writeStored("deck-studio.slidesWidth", String(slidesWidth));
    writeStored("deck-studio.propsWidth", String(propsWidth));
  }, [slidesWidth, propsWidth]);
  const budget = Math.max(360, viewportWidth - 332);
  const wanted = (showSlides ? slidesWidth : 0) + (showProperties ? propsWidth : 0);
  const ratio = Math.min(1, budget / Math.max(1, wanted));
  const leftWidth = showSlides ? slidesWidth * ratio : 0;
  const rightWidth = showProperties ? propsWidth * ratio : 0;
  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    // 縦長のページ(ノート)は一覧の幅いっぱいにすると 1 画面に数枚しか入らないので、高さを幅の 0.9 倍までにする
    const observer = new ResizeObserver(([entry]) => {
      const room = entry.contentRect.width - 4 - THUMB_GUTTER;
      setThumbScale(Math.max(0.05, Math.min(room / canvas.w, (room * 0.9) / canvas.h)));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [showSlides, presenting, canvas]);
  const [slideMenu, setSlideMenu] = useState<MenuState | null>(null);
  const closeSlideMenu = useCallback(() => setSlideMenu(null), []);

  // 起動時: 引数 → 前回のデッキ。ブラウザ直開き(描画確認)のときは ?deck= か見本の資料
  useEffect(() => {
    if (!inTauri()) {
      const q = new URLSearchParams(window.location.search).get("deck");
      void openDeck(q ?? "/decks/neural-network/deck.json");
      return;
    }
    void initialDeck().then((p) => {
      const target = p ?? lastOpenedPath();
      if (target) void openDeck(target);
    });
  }, [openDeck]);

  // Rust 側からの変更通知。連続イベントはまとめて 1 回だけ読み直す
  useEffect(() => {
    if (!inTauri()) return;
    let timer: number | undefined;
    const stop = unlistenLater(onDeckChanged(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void reload(), 150);
    }));
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, [reload]);

  // 画像・ウィジェットの書き換え。書いている途中のイベントが続くので、落ち着いてから変わったものだけ読み直す
  useEffect(() => {
    if (!inTauri()) return;
    let timer: number | undefined;
    const pending = new Set<string>();
    const stop = unlistenLater(onAssetsChanged((paths) => {
      paths.forEach((p) => pending.add(p));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { assetsChanged([...pending]); pending.clear(); }, 200);
    }));
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, []);

  // 何も選択していないときだけ ←→ / PageUp / PageDown でスライド移動
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (presenting) return;
      if (useStore.getState().interactingId) return;
      if (isTypingTarget(e.target)) return;
      if (editingId) return;
      const nav = selection.length === 0;
      if ((nav && e.key === "ArrowRight") || e.key === "PageDown") setCurrent(current + 1);
      if ((nav && e.key === "ArrowLeft") || e.key === "PageUp") setCurrent(current - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, setCurrent, selection, editingId, presenting]);

  // ファイルを受け付けない場所へ落としたとき、WebView がそのファイルを開いて編集画面から離れないようにする
  useEffect(() => {
    const guard = (e: DragEvent) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); };
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => { window.removeEventListener("dragover", guard); window.removeEventListener("drop", guard); };
  }, []);

  // ウィンドウからフォーカスが外れたとき・閉じる前に、未保存分を書く(閉じる直前の 0.4 秒を失わない)
  useEffect(() => {
    const h = () => void flushSave();
    window.addEventListener("blur", h);
    window.addEventListener("beforeunload", h);
    return () => {
      window.removeEventListener("blur", h);
      window.removeEventListener("beforeunload", h);
    };
  }, []);

  const handleOpen = async () => {
    const path = await pickDeckFile();
    if (path) await openDeck(path);
  };

  if (presenting && deck) return deckFormat(deck) === "note"
    ? <Reader deck={deck} current={current} onExit={() => setPresenting(false)} />
    : <Presentation deck={deck} current={current} onExit={() => setPresenting(false)} />;

  return (
    <div className="app">
      <Toolbar onOpen={handleOpen} showSlides={showSlides} showProperties={showProperties}
        onToggleSlides={() => setShowSlides((shown) => !shown)} onToggleProperties={() => setShowProperties((shown) => !shown)} onPresent={() => {
        // Commit an active text edit before removing the editing surface.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        useStore.getState().select([]);
        setPresenting(true);
      }} />
      <ExternalChangeBanner />
      {error && <div className="error" role="alert">{error} <button onClick={handleOpen}>別の資料を開く</button> <button onClick={() => useStore.setState({ error: null })}>閉じる</button></div>}
      <div className="body" style={{ "--props-width": `${rightWidth}px` } as React.CSSProperties}>
        {showSlides && <aside ref={listRef} className="slide-list" style={{ width: leftWidth }}>
          <div className="slide-list-heading">{unit} <span>{deck?.slides.length ?? 0} 枚</span></div>
          {deck?.slides.map((s, i) => (
            <button key={s.id} className={`thumb ${i === current ? "active" : ""}`} onClick={() => setCurrent(i)} title={s.id}
              aria-label={`${unit} ${i + 1}`} aria-current={i === current ? "true" : undefined}
              onContextMenu={(e) => {
                e.preventDefault();
                if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
                setCurrent(i);
                const state = useStore.getState();
                setSlideMenu({ x: e.clientX, y: e.clientY, items: [
                  { icon: "duplicate", label: `${unit}を複製`, onClick: () => state.duplicateSlide(i) },
                  { icon: "up", label: "前へ移動", disabled: i === 0, onClick: () => state.moveSlideTo(i, i - 1) },
                  { icon: "down", label: "後ろへ移動", disabled: i === deck.slides.length - 1, onClick: () => state.moveSlideTo(i, i + 1) },
                  "sep",
                  { icon: "delete", label: `${unit}を削除`, disabled: deck.slides.length <= 1, danger: true, onClick: () => state.removeSlide(i) },
                ] });
              }}>
              <span className="thumb-no">{i + 1}</span>
              <span className="thumb-frame">
                <Slide deck={deck} slide={s} scale={thumbScale} static pageIndex={i} />
                {changeMarks?.addedSlides.includes(s.id) ? <span className="thumb-badge">追加</span>
                  : changeMarks?.changedSlides.includes(s.id) ? <span className="thumb-badge">更新</span> : null}
              </span>
            </button>
          ))}
        </aside>}
        {showSlides && <PanelResizeHandle label={`${unit}一覧の幅`} side="left" width={leftWidth} min={140}
          max={Math.max(140, Math.min(440, budget - rightWidth))} onChange={setSlidesWidth} onReset={() => setSlidesWidth(220)} />}
        <main className="stage">
          {deck && deck.slides[current] ? (
            <EditorViewport key={`${deckPath}:${deckFormat(deck)}`} canvas={canvas}>{(scale) => <Editor deck={deck} slideIdx={current} scale={scale} />}</EditorViewport>
          ) : (
            <div className="empty">「新規資料」で作成するか、「開く」から資料を選んでください。</div>
          )}
        </main>
        {deck && showProperties && <>
          <PanelResizeHandle label="設定パネルの幅" side="right" width={rightWidth} min={220}
            max={Math.max(220, Math.min(560, budget - leftWidth))} onChange={setPropsWidth} onReset={() => setPropsWidth(260)} />
          <PropertiesPanel deck={deck} />
        </>}
      </div>
      <footer className="editor-status">
        <span role="status" aria-live="polite">{toast ?? (interactingId ? "ウィジェットを操作中 · Esc または配置アイコンで終了" : editingId ? "内容を編集中 · Ctrl+Enter で確定 · Esc で取消" : selection.length ? `${selection.length} 個を選択 · 矢印キーで移動 · 右クリックで操作` : "クリックで選択 · Shift＋クリックで複数選択 · ダブルクリックで内容を編集")}</span>
        <span className="save-location" title={deckPath ?? ""}>自動保存先：{deckPath ?? "未選択"}</span>
      </footer>
      <ContextMenu menu={slideMenu} onClose={closeSlideMenu} />
      <ChartDialogHost />
    </div>
  );
}

/** グラフのデータ編集(右パネル・右クリック・ダブルクリックから開く) */
function ChartDialogHost() {
  const dialog = useStore((s) => s.dialog);
  const el = useStore((s) => (s.dialog?.kind === "chart" ? s.deck?.slides[s.current]?.elements.find((e) => e.id === s.dialog?.id) : undefined));
  if (dialog?.kind !== "chart" || el?.type !== "chart") return null;
  return <ChartDataDialog key={el.id} el={el} />;
}

/** サムネイルの左に置く番号の幅(番号 18 + 間 4) */
const THUMB_GUTTER = 22;

