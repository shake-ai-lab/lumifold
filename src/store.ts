import { create } from "zustand";
import { temporal } from "zundo";
import { canvasSize, parseDeck, unitName, type Binding, type ColorRef, type Deck, type DeckFormat, type Element, type PageNumbers, type Slide } from "./model/deck";
import { convertDeckFormat } from "./model/format";
import { newId } from "./model/ids";
import { cloneElements, unitsOf, type Unit } from "./model/selection";
import { backupDeck, basename, copyDeckAssets, dirname, packDeck, prepareDeck, readDeck, samePath, watchDeck, writeDeck } from "./tauri";
import { diffDecks, isEmptyDiff, type DeckDiff } from "./model/diff";
import { blankDeck } from "./editor/presets";
import { readStored, writeStored } from "./storage";

const LAST_PATH_KEY = "deck-studio:lastPath";
const SAVE_DELAY_MS = 400;

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
export type ZOrder = "front" | "back" | "forward" | "backward";
export type AlignKind = "left" | "hcenter" | "right" | "top" | "vmiddle" | "bottom";
export type Dialog = { kind: "chart"; id: string } | null;
/** 外(Claude Code など)で書き換えられた変更。before は最初の外部変更の直前の状態(続けて書き換えられたらまとめる) */
export interface ExternalChange { before: Deck; after: Deck; diff: DeckDiff; backup: string | null }

interface State {
  deck: Deck | null;
  deckPath: string | null;
  deckDir: string | null;
  current: number;
  error: string | null;
  /** 外部変更を取り込んだ回数 */
  reloads: number;
  selection: string[];
  editingId: string | null;
  interactingId: string | null;
  /** 編集開始時のキャレット位置(文字数)。-1 なら全選択 */
  editingCaret: number | null;
  saveState: SaveState;
  dialog: Dialog;
  /** 画面下に一瞬出す短いお知らせ */
  toast: string | null;
  pendingMath: boolean;
  externalChange: ExternalChange | null;

  openDeck(path: string): Promise<void>;
  createDocument(title: string, path: string, layout: boolean, format?: DeckFormat): Promise<void>;
  saveAs(path: string): Promise<void>;
  /** 画像・ウィジェットを含めて 1 ファイル(.deck)にまとめる。作業中の資料はそのまま。見つからなかったファイルを返す */
  packTo(path: string): Promise<string[]>;
  reload(): Promise<void>;
  /** 外部の変更をすべて取り消して before に戻す(その後に編集していなければ) */
  revertExternalChange(): void;
  dismissExternalChange(): void;
  setCurrent(i: number): void;
  select(ids: string[]): void;
  selectAll(): void;
  setEditing(id: string | null, caret?: number | null): void;
  setInteracting(id: string | null): void;
  openDialog(d: Dialog): void;
  flash(msg: string, ms?: number): void;

  patchElement(id: string, patch: Partial<Element>): void;
  patchElements(patches: Record<string, Partial<Element>>): void;
  addElement(el: Element, opts?: { edit?: boolean }): void;
  addElements(els: Element[]): void;
  removeSelected(): void;
  duplicateSelected(): void;
  copySelected(): Element[];
  cutSelected(): void;
  paste(): void;
  groupSelected(): void;
  ungroupSelected(): void;
  align(how: AlignKind): void;
  distribute(axis: "h" | "v"): void;
  reorderSelected(how: ZOrder): void;
  setLocked(ids: string[], locked: boolean): void;
  setSlideBackground(color: ColorRef | null): void;
  /** 資料の種類を変える(中身は新しい大きさに収まるよう縮めて中央へ。1 回の Ctrl+Z で戻る) */
  setFormat(format: DeckFormat): void;
  /** 綴じ方・ページ番号(資料全体)。null で既定(左綴じ・番号なし)に戻す */
  setBookOptions(options: { binding?: Binding | null; pageNumbers?: PageNumbers | null }): void;
  /** 現在のページにページ番号を付けない */
  setHidePageNumber(hide: boolean): void;
  /** 現在スライドの発表者ノート。空文字なら消す */
  setSlideNotes(notes: string): void;
  addSlide(): void;
  /** 中身を指定してスライドを現在の後ろに入れる(型から追加)。id は振る */
  insertSlide(slide: Omit<Slide, "id">): void;
  duplicateSlide(i?: number): void;
  removeSlide(i?: number): void;
  moveSlide(dir: -1 | 1): void;
  moveSlideTo(from: number, to: number): void;
}

/**
 * 次の deck 変更をファイルからの読み込みとして扱い、保存しない。
 * set() は購読者を同期的に呼ぶので、set() の直前に立てれば確実にその 1 回だけ効く。
 * (「読み込んだ deck と同一参照か」で判定すると、undo で読み込み直後の状態に戻ったときに保存されない)
 */
let skipNextSave = false;
/** 自分が最後に書いた本文。監視イベントがこれと同じ内容なら自分の書き込みなので無視する */
let lastSavedText: string | null = null;
let saveTimer: number | undefined;
let toastTimer: number | undefined;

/** アプリ内クリップボード。スライドをまたいで貼れる */
let clipboard: { elements: Element[]; slideId: string; pasteCount: number } | null = null;

function updateSlide(deck: Deck, idx: number, fn: (s: Slide) => Slide): Deck {
  return { ...deck, slides: deck.slides.map((s, i) => (i === idx ? fn(s) : s)) };
}

export const useStore = create<State>()(
  temporal(
    (set, get) => {
      /**
       * 読み込んだ(または書いた)資料を作業中の資料にする。この変更は保存せず、履歴を消し、次回起動時に開く資料として覚える。
       * text はファイルの本文(監視イベントが自分の書き込みかを見分けるのに使う)
       */
      const adopt = (deck: Deck, path: string, text: string, rest: Partial<State>) => {
        lastSavedText = text;
        window.clearTimeout(saveTimer);
        skipNextSave = true;
        set({ deck, deckPath: path, deckDir: dirname(path), pendingMath: false, error: null, externalChange: null, ...rest });
        useStore.temporal.getState().clear();
        writeStored(LAST_PATH_KEY, path);
      };

      /** 外部の書き換えの監視を始める。失敗しても資料は開いたままにして、短く知らせる */
      const startWatching = async (path: string, done: string) => {
        try {
          await watchDeck(path);
        } catch {
          get().flash(`${done}外部変更の監視は開始できませんでした。`);
        }
      };

      /** 現在スライドの要素を、選択を考慮して移動量で動かす */
      const shiftUnits = (moves: { unit: Unit; dx: number; dy: number }[]) => {
        const patches: Record<string, Partial<Element>> = {};
        const { deck, current } = get();
        if (!deck) return;
        const byId = new Map(deck.slides[current].elements.map((e) => [e.id, e]));
        for (const { unit, dx, dy } of moves) {
          if (!dx && !dy) continue;
          for (const id of unit.ids) {
            const e = byId.get(id);
            if (e && !e.locked) patches[id] = { x: Math.round(e.x + dx), y: Math.round(e.y + dy) };
          }
        }
        if (Object.keys(patches).length) get().patchElements(patches);
      };

      return {
        deck: null,
        deckPath: null,
        deckDir: null,
        current: 0,
        error: null,
        reloads: 0,
        selection: [],
        editingId: null,
        interactingId: null,
        editingCaret: null,
        saveState: "idle",
        dialog: null,
        toast: null,
        pendingMath: false,
        externalChange: null,

        async createDocument(title, path, layout, format = "slides") {
          if (get().deckPath && samePath(path, get().deckPath!)) throw new Error("現在の資料とは別のファイル名を選んでください。");
          if (!await flushSave()) throw new Error("現在の資料を保存できません。保存先を確認してください。");
          const deck = blankDeck(title, layout, format);
          const text = JSON.stringify(deck, null, 2) + "\n";
          await writeDeck(path, text);
          adopt(deck, path, text, { current: 0, selection: [], editingId: null, interactingId: null, saveState: "saved" });
          await startWatching(path, "保存しました。");
        },

        async saveAs(path) {
          if (!await flushSave()) throw new Error("現在の資料を保存できません。保存先を確認してください。");
          const { deck, deckDir } = get();
          if (!deck || !deckDir) return;
          const copy = await copyDeckAssets(deck, deckDir, dirname(path));
          const text = JSON.stringify(copy, null, 2) + "\n";
          await writeDeck(path, text);
          // 履歴には前のフォルダからの相対パスが残っているので消す(adopt が消す)
          adopt(copy, path, text, { saveState: "saved" });
          await startWatching(path, "保存しました。");
        },

        async packTo(path) {
          const { deck, deckPath } = get();
          if (!deck || !deckPath) return [];
          if (samePath(path, deckPath)) throw new Error("作業中の資料とは別のファイル名を選んでください。");
          if (!await flushSave()) throw new Error("現在の資料を保存できません。保存先を確認してください。");
          return packDeck(get().deck ?? deck, deckPath, path);
        },

        async openDeck(target) {
          let opened: { path: string; unpacked: boolean };
          try {
            if (!await flushSave()) return;
            // まとめたファイルなら隣のフォルダに展開し、展開した本文を開く
            opened = await prepareDeck(target);
            const text = await readDeck(opened.path);
            adopt(parseDeck(text), opened.path, text, { current: 0, selection: [], editingId: null, interactingId: null, dialog: null, saveState: "idle" });
          } catch (e) {
            set({ error: `「${basename(target)}」を開けませんでした。\n${String(e).replace(/^Error: /, "")}\n現在の資料はそのままです。別の資料を開くか、この案内を閉じて続けられます。` });
            return;
          }
          await startWatching(opened.path, "資料を開きました。");
          if (opened.unpacked) get().flash(`「${basename(target)}」を展開して開きました。編集はフォルダ「${basename(dirname(opened.path))}」に保存されます`, 6000);
        },

        async reload() {
          const { deckPath, current } = get();
          if (!deckPath) return;
          try {
            const text = await readDeck(deckPath);
            if (text === lastSavedText) return; // 自分の書き込みのエコー
            const deck = parseDeck(text);
            // 何が変わったかを見せ、元に戻せるようにする。続けて書き換えられたら最初の状態からの差分にまとめる
            const prev = get().deck, pending = get().externalChange;
            let externalChange: ExternalChange | null = null;
            if (prev) {
              const continuing = !!pending && pending.after === prev;
              const before = continuing ? pending!.before : prev;
              let backup = continuing ? pending!.backup : null;
              try { backup = (await backupDeck(deckPath, lastSavedText ?? JSON.stringify(prev, null, 2) + "\n")) ?? backup; }
              catch { /* 世代が残せなくても取り込みは続ける(その場合は元に戻すのみ) */ }
              const diff = diffDecks(before, deck);
              externalChange = isEmptyDiff(diff) ? null : { before, after: deck, diff, backup };
            }
            lastSavedText = text;
            window.clearTimeout(saveTimer);
            skipNextSave = true;
            const ids = new Set(deck.slides.flatMap((s) => s.elements.map((e) => e.id)));
            set((s) => ({
              deck,
              current: Math.min(current, Math.max(0, deck.slides.length - 1)),
              error: null,
              reloads: s.reloads + 1,
              editingId: null,
              interactingId: null,
              selection: s.selection.filter((id) => ids.has(id)),
              externalChange,
            }));
          } catch (e) {
            // 書き込み途中の読み取りで JSON が壊れていることがある。次のイベントで取り直す
            set({ error: String(e) });
          }
        },

        revertExternalChange() {
          const { externalChange: change, deck } = get();
          if (!change || deck !== change.after) return;
          const ids = new Set(change.before.slides.flatMap((s) => s.elements.map((e) => e.id)));
          // 普通の編集として反映する(自動保存でファイルも戻り、Ctrl+Z で外部の版をやり直せる)
          set((s) => ({ deck: change.before, externalChange: null, editingId: null, interactingId: null,
            current: Math.min(s.current, change.before.slides.length - 1), selection: s.selection.filter((id) => ids.has(id)) }));
          get().flash("外部の変更を取り消しました");
        },

        dismissExternalChange() {
          set({ externalChange: null });
        },

        setCurrent(i) {
          const n = get().deck?.slides.length ?? 0;
          if (n === 0) return;
          const next = Math.max(0, Math.min(n - 1, i));
          if (next !== get().current) set({ current: next, selection: [], editingId: null, interactingId: null, pendingMath: false });
        },

        select(ids) {
          set({ selection: ids, interactingId: ids.length === 1 && ids[0] === get().interactingId ? get().interactingId : null });
        },

        selectAll() {
          const { deck, current } = get();
          if (!deck) return;
          set({ selection: deck.slides[current].elements.filter((e) => !e.locked).map((e) => e.id) });
        },

        setEditing(id, caret = null) {
          set({ editingId: id, interactingId: null, editingCaret: id ? caret : null, selection: id ? [id] : get().selection });
        },
        setInteracting(id) {
          set({ interactingId: id, editingId: null, selection: id ? [id] : get().selection });
        },

        openDialog(d) {
          set({ dialog: d });
        },

        flash(msg, ms = 1600) {
          window.clearTimeout(toastTimer);
          set({ toast: msg });
          toastTimer = window.setTimeout(() => set({ toast: null }), ms);
        },

        patchElement(id, patch) {
          get().patchElements({ [id]: patch });
        },

        patchElements(patches) {
          const { deck, current } = get();
          if (!deck) return;
          set({
            deck: updateSlide(deck, current, (s) => ({
              ...s,
              elements: s.elements.map((el) => {
                const p = patches[el.id];
                if (!p) return el;
                const next = { ...el, ...p } as Element & Record<string, unknown>;
                // undefined を渡したキーは消す(JSON に "key": null を残さない)
                for (const k of Object.keys(p)) if ((p as Record<string, unknown>)[k] === undefined) delete next[k];
                return next as Element;
              }),
            })),
          });
        },

        addElement(el, opts) {
          const { deck, current } = get();
          if (!deck) return;
          set({
            deck: updateSlide(deck, current, (s) => ({ ...s, elements: [...s.elements, el] })),
            selection: [el.id],
            editingId: opts?.edit ? el.id : null,
            editingCaret: opts?.edit ? -1 : null,
          });
        },

        addElements(els) {
          const { deck, current } = get();
          if (!deck || !els.length) return;
          set({
            deck: updateSlide(deck, current, (s) => ({ ...s, elements: [...s.elements, ...els] })),
            selection: els.map((e) => e.id),
            editingId: null,
          });
        },

        removeSelected() {
          const { deck, current, selection } = get();
          if (!deck || selection.length === 0) return;
          const drop = new Set(selection);
          set({
            deck: updateSlide(deck, current, (s) => ({ ...s, elements: s.elements.filter((el) => !drop.has(el.id)) })),
            selection: [],
            editingId: null,
          });
        },

        duplicateSelected() {
          const { deck, current, selection } = get();
          if (!deck || selection.length === 0) return;
          const pick = new Set(selection);
          get().addElements(cloneElements(deck.slides[current].elements.filter((el) => pick.has(el.id)), 20, 20));
        },

        copySelected() {
          const { deck, current, selection } = get();
          if (!deck || selection.length === 0) return [];
          const pick = new Set(selection);
          const els = deck.slides[current].elements.filter((el) => pick.has(el.id)).map((e) => structuredClone(e));
          clipboard = { elements: els, slideId: deck.slides[current].id, pasteCount: 0 };
          get().flash(`${els.length} 個をコピーしました`);
          return els;
        },

        cutSelected() {
          if (get().copySelected().length) get().removeSelected();
        },

        paste() {
          const { deck, current } = get();
          if (!deck || !clipboard?.elements.length) return;
          // 同じスライドに貼るときは少しずらす(重なって見えなくならないように)。別スライドなら同じ位置
          const n = clipboard.slideId === deck.slides[current].id ? ++clipboard.pasteCount : 0;
          get().addElements(cloneElements(clipboard.elements, n * 20, n * 20));
        },

        groupSelected() {
          const { selection } = get();
          if (selection.length < 2) return;
          const g = newId("g");
          const patches: Record<string, Partial<Element>> = {};
          for (const id of selection) patches[id] = { group: g };
          get().patchElements(patches);
          get().flash("グループにしました");
        },

        ungroupSelected() {
          const { deck, current, selection } = get();
          if (!deck) return;
          const patches: Record<string, Partial<Element>> = {};
          for (const e of deck.slides[current].elements) if (selection.includes(e.id) && e.group) patches[e.id] = { group: undefined };
          if (Object.keys(patches).length) {
            get().patchElements(patches);
            get().flash("グループを解除しました");
          }
        },

        align(how) {
          const { deck, current, selection } = get();
          if (!deck || !selection.length) return;
          const units = unitsOf(deck.slides[current].elements, selection);
          // 1 つだけならスライドに対して、複数なら選択範囲に対して揃える
          const box =
            units.length === 1
              ? { x: 0, y: 0, ...canvasSize(deck) }
              : (() => {
                  const x = Math.min(...units.map((u) => u.x)), y = Math.min(...units.map((u) => u.y));
                  return { x, y, w: Math.max(...units.map((u) => u.x + u.w)) - x, h: Math.max(...units.map((u) => u.y + u.h)) - y };
                })();
          shiftUnits(
            units.map((u) => {
              const dx = how === "left" ? box.x - u.x : how === "right" ? box.x + box.w - (u.x + u.w) : how === "hcenter" ? box.x + box.w / 2 - (u.x + u.w / 2) : 0;
              const dy = how === "top" ? box.y - u.y : how === "bottom" ? box.y + box.h - (u.y + u.h) : how === "vmiddle" ? box.y + box.h / 2 - (u.y + u.h / 2) : 0;
              return { unit: u, dx, dy };
            }),
          );
        },

        distribute(axis) {
          const { deck, current, selection } = get();
          if (!deck) return;
          const units = unitsOf(deck.slides[current].elements, selection);
          if (units.length < 3) {
            get().flash("等間隔には 3 つ以上選んでください");
            return;
          }
          const pos = (u: Unit) => (axis === "h" ? u.x : u.y);
          const size = (u: Unit) => (axis === "h" ? u.w : u.h);
          const sorted = [...units].sort((a, b) => pos(a) - pos(b));
          const start = pos(sorted[0]);
          const end = Math.max(...sorted.map((u) => pos(u) + size(u)));
          const gap = (end - start - sorted.reduce((s, u) => s + size(u), 0)) / (sorted.length - 1);
          let cursor = start;
          shiftUnits(
            sorted.map((u) => {
              const d = cursor - pos(u);
              cursor += size(u) + gap;
              return { unit: u, dx: axis === "h" ? d : 0, dy: axis === "v" ? d : 0 };
            }),
          );
        },

        reorderSelected(how) {
          const { deck, current, selection } = get();
          if (!deck || !selection.length) return;
          const ids = new Set(selection);
          if (deck.slides[current].elements.some(el => ids.has(el.id) && el.locked)) return;
          // Move the selected set in one history entry, preserving its relative order.
          set({
            deck: updateSlide(deck, current, (s) => {
              if (how === "front" || how === "back") {
                const sel = s.elements.filter((e) => ids.has(e.id));
                const rest = s.elements.filter((e) => !ids.has(e.id));
                return { ...s, elements: how === "front" ? [...rest, ...sel] : [...sel, ...rest] };
              }
              const elements = [...s.elements];
              if (how === "forward") {
                for (let i = elements.length - 2; i >= 0; i--) {
                  if (ids.has(elements[i].id) && !ids.has(elements[i + 1].id))
                    [elements[i], elements[i + 1]] = [elements[i + 1], elements[i]];
                }
              } else {
                for (let i = 1; i < elements.length; i++) {
                  if (ids.has(elements[i].id) && !ids.has(elements[i - 1].id))
                    [elements[i], elements[i - 1]] = [elements[i - 1], elements[i]];
                }
              }
              return { ...s, elements };
            }),
          });
        },

        setLocked(ids, locked) {
          const patches: Record<string, Partial<Element>> = {};
          for (const id of ids) patches[id] = { locked: locked || undefined };
          get().patchElements(patches);
          // 固定した要素は選択から外す(クリックで選べなくなるので、選択が残ると混乱する)
          if (locked) set({ selection: get().selection.filter((id) => !ids.includes(id)) });
        },

        setSlideBackground(color) {
          const { deck, current } = get();
          if (!deck) return;
          set({
            deck: updateSlide(deck, current, (s) => {
              const next = { ...s };
              if (color) next.background = { color };
              else delete next.background;
              return next;
            }),
          });
        },

        setFormat(format) {
          const { deck } = get();
          if (!deck || (deck.format ?? "slides") === format) return;
          set({ deck: convertDeckFormat(deck, format), selection: [], editingId: null, interactingId: null });
          const label = format === "note" ? "ノート(縦のページ)" : "スライド(横 16:9)";
          get().flash(`${label}にしました。${deck.formatOrigin === format ? "元の縮尺に戻しました" : "中身をページに合わせて配置しました"}`, 5000);
        },

        setBookOptions(options) {
          const { deck } = get();
          if (!deck) return;
          const next: Deck = { ...deck };
          if (options.binding !== undefined) { if (options.binding === "right") next.binding = "right"; else delete next.binding; }
          if (options.pageNumbers !== undefined) { if (options.pageNumbers) next.pageNumbers = options.pageNumbers; else delete next.pageNumbers; }
          if (next.binding !== deck.binding || next.pageNumbers !== deck.pageNumbers) set({ deck: next });
        },

        setHidePageNumber(hide) {
          const { deck, current } = get();
          if (!deck || !!deck.slides[current].hidePageNumber === hide) return;
          set({ deck: updateSlide(deck, current, (s) => {
            const next = { ...s };
            if (hide) next.hidePageNumber = true;
            else delete next.hidePageNumber;
            return next;
          }) });
        },

        setSlideNotes(notes) {
          const { deck, current } = get();
          if (!deck || (deck.slides[current].notes ?? "") === notes) return;
          set({
            deck: updateSlide(deck, current, (s) => {
              const next = { ...s };
              if (notes) next.notes = notes;
              else delete next.notes;
              return next;
            }),
          });
        },

        insertSlide(content) {
          const { deck, current } = get();
          if (!deck) return;
          const slide: Slide = { ...structuredClone(content), id: newId("s") };
          const slides = [...deck.slides];
          slides.splice(current + 1, 0, slide);
          set({ deck: { ...deck, slides }, current: current + 1, selection: [], editingId: null });
        },

        addSlide() {
          get().insertSlide({ elements: [] });
        },

        duplicateSlide(i) {
          const { deck, current } = get();
          if (!deck) return;
          const idx = i ?? current;
          const src = deck.slides[idx];
          const copy: Slide = { ...structuredClone(src), id: newId("s"), elements: cloneElements(src.elements, 0, 0) };
          const slides = [...deck.slides];
          slides.splice(idx + 1, 0, copy);
          set({ deck: { ...deck, slides }, current: idx + 1, selection: [], editingId: null });
          get().flash(`${unitName(deck)}を複製しました`);
        },

        removeSlide(i) {
          const { deck, current } = get();
          if (!deck || deck.slides.length <= 1) return;
          const idx = i ?? current;
          const slides = deck.slides.filter((_, k) => k !== idx);
          const next = idx < current ? current - 1 : Math.min(current, slides.length - 1);
          set({ deck: { ...deck, slides }, current: next, selection: [], editingId: null });
        },

        moveSlide(dir) {
          const { current } = get();
          get().moveSlideTo(current, current + dir);
        },

        moveSlideTo(from, to) {
          const { deck, current } = get();
          if (!deck) return;
          const n = deck.slides.length;
          if (from < 0 || from >= n || to < 0 || to >= n || from === to) return;
          const slides = [...deck.slides];
          const [s] = slides.splice(from, 1);
          slides.splice(to, 0, s);
          const curId = deck.slides[current].id;
          set({ deck: { ...deck, slides }, current: slides.findIndex((x) => x.id === curId) });
        },
      };
    },
    {
      partialize: (s) => ({ deck: s.deck }),
      equality: (a, b) => a.deck === b.deck,
      limit: 200,
    },
  ),
);

// ---- 自動保存: deck が人の編集で変わったら、少し待ってから書き戻す ----
useStore.subscribe((s, prev) => {
  if (s.deck === prev.deck || !s.deck || !s.deckPath) return;
  if (skipNextSave) {
    skipNextSave = false; // ファイルから読んだだけ
    return;
  }
  window.clearTimeout(saveTimer);
  if (s.saveState !== "dirty") useStore.setState({ saveState: "dirty" });
  saveTimer = window.setTimeout(() => void flushSave(), SAVE_DELAY_MS);
});

let saveQueue: Promise<boolean> = Promise.resolve(true);
export function flushSave(): Promise<boolean> {
  const job = saveQueue.then(saveCurrent);
  saveQueue = job;
  return job;
}
async function saveCurrent(): Promise<boolean> {
  window.clearTimeout(saveTimer);
  const { deck, deckPath, saveState } = useStore.getState();
  if (!deck || !deckPath || saveState === "idle" || saveState === "saved") return true;
  const text = JSON.stringify(deck, null, 2) + "\n";
  if (text === lastSavedText) {
    useStore.setState({ saveState: "saved" });
    return true;
  }
  useStore.setState({ saveState: "saving" });
  try {
    await writeDeck(deckPath, text);
    lastSavedText = text;
    if (useStore.getState().deckPath === deckPath && useStore.getState().deck === deck)
      useStore.setState({ saveState: "saved", error: null });
    return true;
  } catch (e) {
    lastSavedText = null;
    useStore.setState({ saveState: "error", error: String(e) });
    return false;
  }
}

export function hasClipboard(): boolean {
  return !!clipboard?.elements.length;
}

/**
 * undo / redo は deck だけを戻す(表示中のスライドや選択は戻らない)。戻した後に、
 * 表示を変更のあったスライドへ移し(PowerPoint と同じく、戻した所が見える)、無くなった要素の選択・編集を外す。
 * そのままだと、末尾に足したスライドを戻したときに表示中の番号が範囲外を指す
 */
function settleAfterHistory(before: Deck | null): void {
  const s = useStore.getState();
  const deck = s.deck;
  if (!deck || deck === before || !deck.slides.length) return;
  let target = s.current;
  if (before) {
    const changed = deck.slides.findIndex((slide, i) => slide !== before.slides[i]);
    if (changed >= 0) target = changed;
    else if (deck.slides.length < before.slides.length) target = deck.slides.length - 1; // 末尾のスライドが無くなった
  }
  target = Math.max(0, Math.min(target, deck.slides.length - 1));
  if (target !== s.current) {
    useStore.setState({ current: target, selection: [], editingId: null, interactingId: null, pendingMath: false });
    return;
  }
  const ids = new Set(deck.slides[target].elements.map((e) => e.id));
  const patch: Partial<State> = {};
  if (s.selection.some((id) => !ids.has(id))) patch.selection = s.selection.filter((id) => ids.has(id));
  if (s.editingId && !ids.has(s.editingId)) patch.editingId = null;
  if (s.interactingId && !ids.has(s.interactingId)) patch.interactingId = null;
  if (Object.keys(patch).length) useStore.setState(patch);
}

export function undo(): void {
  const before = useStore.getState().deck;
  useStore.temporal.getState().undo();
  settleAfterHistory(before);
}

export function redo(): void {
  const before = useStore.getState().deck;
  useStore.temporal.getState().redo();
  settleAfterHistory(before);
}

export function lastOpenedPath(): string | null {
  return readStored(LAST_PATH_KEY);
}

// 描画確認スクリプト(tools/)からストアを触れるようにする
declare global {
  interface Window {
    __deckStore?: typeof useStore;
  }
}
if (typeof window !== "undefined") window.__deckStore = useStore;
