import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Moveable, { type OnDrag, type OnResize, type OnResizeGroup, type OnRotate } from "react-moveable";
import Selecto from "react-selecto";
import { canvasSize, type Deck, type Element, type ShapeElement } from "../model/deck";
import { LineHandles } from "./LineHandles";
import { Slide } from "../render/Slide";
import { UiScaleContext } from "../render/uiScale";
import { hasClipboard, useStore } from "../store";
import { isLineShape, MATH_FONT_SIZE } from "../model/defaults";
import { newId } from "../model/ids";
import { expandToGroups } from "../model/selection";
import { ContextMenu, type MenuState } from "./ContextMenu";
import { caretOffsetAt } from "./runs";
import { insertImageFiles, isImageFile } from "./images";
import { outerBox, scaleInto, type Box } from "./scale";
import { useEditorKeys } from "./useEditorKeys";
import { editOverlayFor } from "./editOverlay";
import { elementMenu } from "./elementMenu";

interface Props {
  deck: Deck;
  slideIdx: number;
  scale: number;
}

/** ドラッグ・リサイズ・回転・選択。見た目の更新は DOM に直接書き、確定時だけストアへ入れる */
export function Editor({ deck, slideIdx, scale }: Props) {
  const slide = deck.slides[slideIdx];
  // Moveable / Selecto はコンテナ要素が必要なので、マウント後に state 経由で渡す(初回レンダーの null を渡さない)
  const [slideEl, setSlideEl] = useState<HTMLDivElement | null>(null);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const moveableRef = useRef<Moveable>(null);
  const selectoRef = useRef<Selecto>(null);
  const selection = useStore((s) => s.selection);
  const editingId = useStore((s) => s.editingId);
  const pendingMath = useStore((s) => s.pendingMath);
  const interactingId = useStore((s) => s.interactingId);
  useEffect(() => {
    if (interactingId && (selection.length !== 1 || selection[0] !== interactingId || !slide.elements.some(el => el.id === interactingId))) useStore.getState().setInteracting(null);
  }, [interactingId, selection, slide]);
  const { select, setEditing, patchElements } = useStore.getState();
  const [targets, setTargets] = useState<HTMLElement[]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  /** ドラッグ・リサイズ中。iframe(embed)の上をポインタが通ってもイベントを奪われないよう pointer-events を切る */
  const [dragging, setDragging] = useState(false);
  const [resizePreview, setResizePreview] = useState<Record<string, Partial<Element>>>({});
  // Resize the content along with its selection box, without saving every pointer move.
  const previewSlide = Object.keys(resizePreview).length ? { ...slide,
    elements: slide.elements.map((el) => ({ ...el, ...resizePreview[el.id] } as Element)) } : slide;
  useLayoutEffect(() => { moveableRef.current?.updateRect(); }, [scale, slide]);
  /**
   * ボタンが押されたままか。Selecto で選択 → Moveable の dragStart は React の再描画を待ってから呼ぶので、
   * 素早いクリックだと mouseup の後に dragStart してしまい、終わらないドラッグが残る(次のドラッグが前回の位置から計算される)。
   */
  const buttonDown = useRef(false);
  /** 押した時点でグループ 1 つを丸ごと選んでいたか。そのときのクリックだけ中の要素へ入る(選んだのと同じクリックでは入らない) */
  const wholeGroup = useRef<string | undefined>(undefined);
  const groupAtDown = useRef<string | undefined>(undefined);
  useEffect(() => {
    const down = () => {
      buttonDown.current = true;
      groupAtDown.current = wholeGroup.current;
    };
    const up = () => {
      buttonDown.current = false;
      setDragging(false);
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
    };
  }, []);
  /** ドラッグ開始時の位置(要素 id → x,y,w,h) */
  const startRef = useRef<Record<string, { x: number; y: number; w: number; h: number }>>({});
  /** グループの拡大縮小: 開始時の外接矩形と要素、ドラッグ中の各要素の位置と大きさ */
  const groupStart = useRef<{ box: Box; els: Element[] } | null>(null);
  const groupPatches = useRef<Record<string, Partial<Element>>>({});
  /** Moveable は移動のたびに keepRatio を読むので、つまみと Shift に合わせてその場で切り替える */
  const [keepRatio, setKeepRatio] = useState(false);
  const keepRatioRef = useRef(false);

  const byId = useMemo(() => new Map(slide.elements.map((e) => [e.id, e])), [slide]);

  // 選択 id → DOM ノード
  useEffect(() => {
    if (!slideEl) return;
    const nodes = selection
      .map((id) => slideEl.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`))
      .filter((n): n is HTMLElement => !!n);
    setTargets(nodes);
    // Shift で足し引きするときの元を、グループで広げた後の選択にそろえる
    selectoRef.current?.setSelectedTargets(nodes);
  }, [selection, slide, slideIdx, slideEl]);

  // 選択していない要素をスナップのガイドラインに使う
  const guidelines = useMemo(() => {
    if (!slideEl) return [];
    const sel = new Set(selection);
    return Array.from(slideEl.querySelectorAll<HTMLElement>("[data-id]")).filter((n) => !sel.has(n.dataset.id ?? ""));
  }, [selection, slide, slideIdx, slideEl]);

  const idOf = (t: HTMLElement | SVGElement) => (t as HTMLElement).dataset.id ?? "";

  const rememberStart = useCallback(
    (nodes: (HTMLElement | SVGElement)[]) => {
      // ウィジェット(iframe)にフォーカスが残っていると、以後の Ctrl+Z や矢印キーが親に届かない
      if (document.activeElement instanceof HTMLIFrameElement) document.activeElement.blur();
      startRef.current = {};
      for (const n of nodes) {
        const el = byId.get(idOf(n));
        if (el) startRef.current[el.id] = { x: el.x, y: el.y, w: el.w, h: el.h };
      }
    },
    [byId],
  );

  const applyDrag = (e: OnDrag) => {
    const st = startRef.current[idOf(e.target)];
    if (!st) return;
    e.target.style.left = `${st.x + e.dist[0]}px`;
    e.target.style.top = `${st.y + e.dist[1]}px`;
  };

  const commitDrag = (nodes: (HTMLElement | SVGElement)[]) => {
    const patches: Record<string, Partial<Element>> = {};
    for (const n of nodes) {
      const id = idOf(n);
      const st = startRef.current[id];
      if (!st) continue;
      const x = Math.round(parseFloat((n as HTMLElement).style.left));
      const y = Math.round(parseFloat((n as HTMLElement).style.top));
      if (x !== st.x || y !== st.y) patches[id] = { x, y };
    }
    if (Object.keys(patches).length) patchElements(patches);
  };

  const applyResize = (e: OnResize) => {
    const st = startRef.current[idOf(e.target)];
    if (!st) return;
    const [dx, dy] = e.drag.beforeTranslate;
    e.target.style.width = `${e.width}px`;
    e.target.style.height = `${e.height}px`;
    e.target.style.left = `${st.x + dx}px`;
    e.target.style.top = `${st.y + dy}px`;
    setResizePreview({ [idOf(e.target)]: { x: st.x + dx, y: st.y + dy, w: e.width, h: e.height } });
  };

  const commitResize = (n: HTMLElement | SVGElement) => {
    const id = idOf(n);
    const s = (n as HTMLElement).style;
    patchElements({
      [id]: {
        x: Math.round(parseFloat(s.left)),
        y: Math.round(parseFloat(s.top)),
        w: Math.round(parseFloat(s.width)),
        h: Math.round(parseFloat(s.height)),
      },
    });
    setResizePreview({});
  };

  const applyResizeGroup = (e: OnResizeGroup) => {
    const g = groupStart.current;
    if (!g) return;
    // つまみの反対側(辺なら反対の辺の中央)を止めて伸縮する
    const at = (start: number, size: number, next: number, d: number) => d > 0 ? start : d < 0 ? start + size - next : start + (size - next) / 2;
    const patches = scaleInto(g.els, g.box, {
      x: at(g.box.x, g.box.w, e.width, e.direction[0]), y: at(g.box.y, g.box.h, e.height, e.direction[1]), w: e.width, h: e.height,
    });
    for (const ev of e.events) {
      const p = patches[idOf(ev.target)];
      if (!p) continue;
      const s = (ev.target as HTMLElement).style;
      s.left = `${p.x}px`;
      s.top = `${p.y}px`;
      s.width = `${p.w}px`;
      s.height = `${p.h}px`;
      s.transform = p.rotation ? `rotate(${p.rotation}deg)` : "";
    }
    groupPatches.current = patches;
    setResizePreview(patches);
  };

  const commitResizeGroup = () => {
    const patches = groupPatches.current;
    groupStart.current = null;
    groupPatches.current = {};
    if (Object.keys(patches).length) patchElements(patches);
    setResizePreview({});
  };

  const applyRotate = (e: OnRotate) => {
    e.target.style.transform = `rotate(${e.rotate}deg)`;
  };

  const commitRotate = (n: HTMLElement | SVGElement, rotate: number) => {
    const r = Math.round(rotate * 10) / 10;
    const norm = ((r % 360) + 360) % 360;
    patchElements({ [idOf(n)]: { rotation: norm === 0 ? undefined : norm } });
  };

  useEditorKeys(selection, byId);

  // ダブルクリックでテキスト編集。Moveable の枠が上に重なっていても、座標から要素を引く
  const onStageDoubleClick = (e: React.MouseEvent) => {
    if (!slideEl) return;
    const hit = document
      .elementsFromPoint(e.clientX, e.clientY)
      .map((n) => (n as HTMLElement).closest?.("[data-id]") as HTMLElement | null)
      .find((n): n is HTMLElement => !!n && slideEl.contains(n));
    if (!hit) return;
    const el = byId.get(hit.dataset.id ?? "");
    // 位置を固定した要素も中身は編集できる
    if (el?.type === "text") setEditing(el.id, caretOffsetAt(hit, e.clientX, e.clientY));
    if (el?.type === "math") setEditing(el.id);
    if (el?.type === "chart") useStore.getState().openDialog({ kind: "chart", id: el.id });
    if (el?.type === "table") {
      const cell = document.elementsFromPoint(e.clientX, e.clientY)
        .map((node) => node.closest("td"))
        .find((node) => node && hit.contains(node));
      const cols = Math.max(1, ...el.rows.map((row) => row.length));
      setEditing(el.id, cell ? (cell.parentElement as HTMLTableRowElement).rowIndex * cols + cell.cellIndex : 0);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    if (editingId || !slideEl) return;
    const hit = document.elementsFromPoint(e.clientX, e.clientY)
      .map((node) => node.closest<HTMLElement>("[data-id]"))
      .find((node) => node && slideEl.contains(node));
    const el = hit ? byId.get(hit.dataset.id ?? "") : undefined;
    e.preventDefault();
    const state = useStore.getState();
    if (!el) {
      select([]);
      setMenu({ x: e.clientX, y: e.clientY, items: [
        { icon: "paste", label: "貼り付け", shortcut: "Ctrl+V", disabled: !hasClipboard(), onClick: () => state.paste() },
        { label: "すべて選択", shortcut: "Ctrl+A", onClick: state.selectAll },
      ] });
      return;
    }
    const ids = selection.includes(el.id) ? selection : [el.id];
    select(ids);
    const locked = ids.some((id) => byId.get(id)?.locked);
    setMenu({ x: e.clientX, y: e.clientY, ...elementMenu(el, ids, locked, deck.theme, e.timeStamp) });
  };

  const selected = targets.map((n) => byId.get(idOf(n))).filter((e): e is Element => !!e);
  const anyLocked = selected.some((e) => e.locked);
  const single = selected.length === 1 ? selected[0] : undefined;
  // グループ 1 つを丸ごと選んでいるときは、PowerPoint と同じくまとめて拡大縮小できる
  const oneGroup = selected.length > 1 && !!selected[0].group && selected.every((e) => e.group === selected[0].group)
    && slide.elements.every((e) => e.group !== selected[0].group || e.locked || selection.includes(e.id));
  const resizable = (!!single || oneGroup) && !anyLocked;
  wholeGroup.current = oneGroup ? selected[0].group : undefined;
  // 外部で変更・追加された要素(バナーを閉じるか、変更前に戻るまで)
  const externalChange = useStore((st) => st.externalChange);
  const changedIds = externalChange && deck !== externalChange.before ? externalChange.diff.elements[slide.id] : undefined;
  const changedHere = changedIds ? [...changedIds.changed, ...changedIds.added].map((id) => byId.get(id)).filter((el): el is Element => !!el) : [];
  const isLine = single?.type === "shape" && isLineShape(single.shape);
  /** 角のつまみで縦横比を保つか。画像(を含むグループ)は PowerPoint の図と同じく保ち、Shift で外す。ほかは Shift で保つ */
  const syncRatio = (e: { direction: number[]; inputEvent?: { shiftKey?: boolean } | null }) => {
    const corner = !!e.direction[0] && !!e.direction[1];
    const next = corner && selected.some((el) => el.type === "image") !== !!e.inputEvent?.shiftKey;
    if (next === keepRatioRef.current) return;
    keepRatioRef.current = next;
    flushSync(() => setKeepRatio(next));
  };

  return (
    <div className={`editor-stage${dragging ? " dragging" : ""}`} ref={setStageEl} onDoubleClick={onStageDoubleClick} onContextMenu={onContextMenu}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
      onDrop={(e) => {
        const files = [...e.dataTransfer.files].filter(isImageFile);
        if (!files.length || !slideEl) return;
        e.preventDefault(); e.stopPropagation();
        const r = slideEl.getBoundingClientRect(); // 落とした位置(スライド座標)を画像の中心にする
        void insertImageFiles(files, { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale });
      }}
      style={{ "--ui-scale": 1 / scale } as React.CSSProperties}>
      <UiScaleContext.Provider value={1 / scale}>
      <Slide deck={deck} slide={previewSlide} scale={scale} innerRef={setSlideEl} editingId={editingId} pageIndex={slideIdx}
        editingContent={editOverlayFor(editingId ? byId.get(editingId) : undefined, slide.id, deck.theme, scale)}>
        {changedHere.map((el) => <div key={`change-${el.id}`} className="change-mark" aria-hidden
          style={{ left: el.x, top: el.y, width: el.w, height: el.h, transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }} />)}
        {pendingMath && <div className="insert-position" onMouseDown={e => e.stopPropagation()} onClick={e => {
          e.stopPropagation();
          const rect = slideEl!.getBoundingClientRect();
          useStore.setState({ pendingMath: false });
          // 枠がページからはみ出さない範囲で、クリックした所を左上にする(ノートの縦のページでも)
          const page = canvasSize(deck);
          const w = Math.min(640, page.w), h = 80;
          useStore.getState().addElement({ id: newId("math"), type: "math",
            x: Math.max(0, Math.min(page.w - w, Math.round((e.clientX - rect.left) / scale))),
            y: Math.max(0, Math.min(page.h - h, Math.round((e.clientY - rect.top) / scale))),
            w, h, latex: String.raw`y = \sum_{i=1}^{n} w_i x_i`, fontSize: MATH_FONT_SIZE }, { edit: true });
        }}><span>数式の左上をクリックして配置 · Escで取消</span></div>}
        {!editingId && isLine && !anyLocked && <LineHandles el={{ ...single, ...resizePreview[single.id] } as ShapeElement} scale={scale}
          onPreview={(patch) => setResizePreview(patch ? { [single.id]: patch } : {})} />}
        {!editingId && !interactingId && !(single?.type === "embed" && single.locked) && slideEl && stageEl && (
          <Moveable
            ref={moveableRef}
            target={targets}
            container={slideEl}
            rootContainer={stageEl}
            zoom={1 / scale}
            origin={false}
            draggable={!anyLocked}
            resizable={resizable && !isLine}
            rotatable={!!single && resizable && !isLine}
            keepRatio={keepRatio}
            throttleDrag={0}
            throttleResize={0}
            throttleRotate={0}
            snappable
            isDisplaySnapDigit={false}
            isDisplayInnerSnapDigit={false}
            snapThreshold={6}
            elementGuidelines={guidelines}
            verticalGuidelines={[0, canvasSize(deck).w / 2, canvasSize(deck).w]}
            horizontalGuidelines={[0, canvasSize(deck).h / 2, canvasSize(deck).h]}
            snapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
            elementSnapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
            renderDirections={isLine ? ["w", "e"] : ["nw", "n", "ne", "w", "e", "sw", "s", "se"]}
            hideDefaultLines={isLine}
            onDragStart={(e) => {
              setDragging(true);
              rememberStart([e.target]);
            }}
            onDrag={applyDrag}
            onDragEnd={(e) => {
              setDragging(false);
              commitDrag([e.target]);
            }}
            onDragGroupStart={(e) => {
              setDragging(true);
              rememberStart(e.targets);
            }}
            onDragGroup={(e) => e.events.forEach(applyDrag)}
            onDragGroupEnd={(e) => {
              setDragging(false);
              commitDrag(e.targets);
            }}
            onResizeStart={(e) => {
              setDragging(true);
              rememberStart([e.target]);
              syncRatio(e);
              e.setOrigin(["%", "%"]);
              e.dragStart && e.dragStart.set([0, 0]);
            }}
            onResize={(e) => {
              syncRatio(e);
              applyResize(e);
            }}
            onResizeEnd={(e) => {
              setDragging(false);
              commitResize(e.target);
            }}
            onResizeGroupStart={(e) => {
              setDragging(true);
              rememberStart(e.targets);
              syncRatio(e);
              groupStart.current = { box: outerBox(selected), els: selected };
              groupPatches.current = {};
            }}
            onResizeGroup={(e) => {
              syncRatio(e);
              applyResizeGroup(e);
            }}
            onResizeGroupEnd={() => {
              setDragging(false);
              commitResizeGroup();
            }}
            onClickGroup={(e) => {
              const id = e.targetIndex >= 0 ? idOf(e.targets[e.targetIndex] as HTMLElement) : "";
              if (!id) return;
              if (e.inputEvent?.shiftKey) {
                // Shift+クリックで選択から外す(グループの要素ならグループごと)
                const group = byId.get(id)?.group;
                select(selection.filter((s) => s !== id && (!group || byId.get(s)?.group !== group)));
              } else if (groupAtDown.current && groupAtDown.current === wholeGroup.current) {
                // グループを選んだ状態でもう一度クリックすると、中の要素だけを選ぶ(PowerPoint と同じ)
                select([id]);
              }
            }}
            onRotateStart={(e) => {
              setDragging(true);
              e.set(single?.rotation ?? 0);
            }}
            onRotate={applyRotate}
            onRotateEnd={(e) => {
              setDragging(false);
              e.lastEvent && commitRotate(e.target, e.lastEvent.rotate);
            }}
          />
        )}
      </Slide>
      </UiScaleContext.Provider>
      {stageEl && (
        <Selecto
          ref={selectoRef}
          // スライドの周りの灰色部分をクリックしても選択解除できるよう、親の .stage 全体を操作領域にする
          dragContainer={stageEl.closest<HTMLElement>(".stage") ?? stageEl}
          // 編集中のスライドの要素だけ(一覧のサムネイルの要素は同じ data-id を持つので含めない)
          selectableTargets={[".editor-stage .slide .el:not(.locked)"]}
          hitRate={100}
          selectByClick
          selectFromInside={false}
          continueSelect={false}
          toggleContinueSelect={["shift"]}
          ratio={0}
          onDragStart={(e) => {
            if (pendingMath || e.inputEvent.button === 2 || (e.inputEvent.target as HTMLElement).closest(".context-menu, .shape-point, .embed-interacting, .widget-controls, .embed-unlock, .text-overflow-badge")) { e.stop(); return; }
            if (editingId) {
              e.stop();
              return;
            }
            if (document.activeElement instanceof HTMLIFrameElement) document.activeElement.blur();
            const m = moveableRef.current;
            const t = e.inputEvent.target as HTMLElement;
            if (m?.isMoveableElement(t) || targets.some((n) => n === t || n.contains(t))) e.stop();
          }}
          onSelectEnd={(e) => {
            const picked = e.selected.map((n) => (n as HTMLElement).dataset.id ?? "").filter(Boolean);
            // グループの要素を選んだらグループ全体(PowerPoint と同じ)。中の要素を選んでいるときは、同じグループの別の要素へそのまま移る。
            // Shift で外した要素のグループは丸ごと外す
            const groupOf = (id: string) => byId.get(id)?.group;
            const inside = selection.length && selection.every((id) => groupOf(id) && groupOf(id) === groupOf(selection[0])) && !wholeGroup.current ? groupOf(selection[0]) : undefined;
            const dropped = new Set(e.inputEvent?.shiftKey ? e.removed.map((n) => groupOf((n as HTMLElement).dataset.id ?? "")).filter(Boolean) : []);
            const ids = expandToGroups(slide.elements, picked.filter((id) => !dropped.has(groupOf(id))), inside);
            select(ids);
            if (e.isDragStart) {
              e.inputEvent.preventDefault();
              void moveableRef.current?.waitToChangeTarget().then(() => {
                if (buttonDown.current) moveableRef.current?.dragStart(e.inputEvent);
              });
            }
          }}
        />
      )}
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
