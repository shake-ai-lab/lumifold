import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "./editor/Icon";
import { canvasSize, resolveColor, type Deck, type Slide as SlideModel } from "./model/deck";
import { Slide } from "./render/Slide";
import {
  arcPoint, cornerPoint, cssMatrix, cssPolygon, foldPage, stripTransform, turnedPoint, type Corner, type Fold, type Pt, type Side,
} from "./render/pageTurn";
import { playPageLift, playPageTurn } from "./render/paperSound";
import { useStore } from "./store";
import { isTypingTarget } from "./keyboard";
import { readStored, writeStored } from "./storage";

/**
 * ノートを本のように読む画面。単ページ / 見開き(表紙は右に 1 枚、以降 2-3, 4-5 …)を切り替え、
 * 紙をつまんでドラッグ、またはページの外側の端のクリック・← →・ホイールでめくる。めくる紙は折り目で折り返し、
 * 裏・折り目の陰・下のページに落ちる影・とじ目の陰を付ける(形の計算は render/pageTurn.ts)。めくる音は render/paperSound.ts。
 * 右綴じ(deck.binding = "right")は左右を入れ替える: 表紙は左に 1 枚、左ページをめくって読み進め、← で次へ。
 */
const SPREAD_KEY = "deck-studio.reader.spread";
const SOUND_KEY = "deck-studio.reader.sound";
const readFlag = (key: string): boolean | null => {
  const v = readStored(key);
  return v === null ? null : v === "1";
};
const saveFlag = (key: string, on: boolean) => writeStored(key, on ? "1" : "0");
const TURN_MS = 720;
const PAD = 28;
/** クリックでめくるのは、ページの外側の端(幅のこの割合)と本の外だけ。本文の上のクリックではめくらない(つまんでめくる邪魔をしない) */
const CLICK_EDGE = 0.2;

/** クリックした点(本の座標)でめくる向き。端でなければ null */
function clickTurn(p: Pt, W: number, spread: boolean, rtl: boolean): 1 | -1 | null {
  if (spread) {
    if (p.x < -W * (1 - CLICK_EDGE)) return rtl ? 1 : -1;
    if (p.x > W * (1 - CLICK_EDGE)) return rtl ? -1 : 1;
    return null;
  }
  // 単ページはとじ目の側の端で戻り、反対の端で進む(右綴じはとじ目が右端で、ページは x = -W〜0)
  const u = (p.x - (rtl ? -W : 0)) / W;
  const binding = rtl ? u > 1 - CLICK_EDGE : u < CLICK_EDGE;
  const outer = rtl ? u < CLICK_EDGE : u > 1 - CLICK_EDGE;
  return binding ? -1 : outer ? 1 : null;
}

/** 見開きの番号 k のページ。0 は表紙だけ(右)、以降は [2k-1, 2k] */
const spreadOf = (i: number) => (i <= 0 ? 0 : Math.floor((i + 1) / 2));
const spreadPages = (k: number, n: number) => ({ left: k > 0 && 2 * k - 1 < n ? 2 * k - 1 : null, right: 2 * k < n ? 2 * k : null });
const firstOf = (k: number) => (k <= 0 ? 0 : 2 * k - 1);

/** 1 回のめくりで、どのページがどこに出るか */
interface Plan {
  dir: 1 | -1;
  /** めくる紙が最初にある側(形の計算の向き) */
  side: Side;
  /** 反対側でそのまま(上にめくった紙が降りてくる) */
  stationary: number | null;
  /** めくった下から出てくる */
  under: number | null;
  /** めくる紙の表 */
  front: number | null;
  /** めくる紙の裏(反対側に着くと上を向く) */
  back: number;
  /** 単ページでは紙の裏に同じページが透けて見える */
  backMirrored: boolean;
  /** true: 紙を反対側まで返すと target を開く。false: 返した状態から元へ戻すと開く(単ページで前へ戻るとき) */
  goalTurned: boolean;
  target: number;
}

const flipSide = (s: Side): Side => (s === "right" ? "left" : "right");

/** 右綴じは左綴じの形を左右反転したもの。ページの役割はそのままで、紙のある側だけ入れ替える */
function planTurn(dir: 1 | -1, spread: boolean, current: number, n: number, rtl: boolean): Plan | null {
  const plan = planLeftBound(dir, spread, current, n);
  return plan && rtl ? { ...plan, side: flipSide(plan.side) } : plan;
}

function planLeftBound(dir: 1 | -1, spread: boolean, current: number, n: number): Plan | null {
  if (spread) {
    const k = spreadOf(current), cur = spreadPages(k, n);
    if (dir === 1) {
      const next = spreadPages(k + 1, n);
      if (cur.right === null || next.left === null) return null;
      return { dir, side: "right", stationary: cur.left, under: next.right, front: cur.right, back: next.left, backMirrored: false, goalTurned: true, target: firstOf(k + 1) };
    }
    if (k <= 0 || cur.left === null) return null;
    const prev = spreadPages(k - 1, n);
    if (prev.right === null) return null;
    return { dir, side: "left", stationary: cur.right, under: prev.left, front: cur.left, back: prev.right, backMirrored: false, goalTurned: true, target: firstOf(k - 1) };
  }
  if (dir === 1) return current < n - 1
    ? { dir, side: "right", stationary: null, under: current + 1, front: current, back: current, backMirrored: true, goalTurned: true, target: current + 1 } : null;
  // とじ目は画面の左端。前のページを「めくり終えた状態」から元に返す
  return current > 0
    ? { dir, side: "right", stationary: null, under: current, front: current - 1, back: current - 1, backMirrored: true, goalTurned: false, target: current - 1 } : null;
}

interface Turn { plan: Plan; corner: Corner; pointer: Pt; mode: "auto" | "drag" | "peek" }

/** ページの中身。めくっている間も作り直さない(グラフやウィジェットを読み込み直さない) */
const PageContent = memo(function PageContent({ deck, slide, index, scale, mirrored }: { deck: Deck; slide: SlideModel; index: number; scale: number; mirrored: boolean }) {
  return <div className="reader-page-content" style={mirrored ? { transform: "scaleX(-1)" } : undefined}>
    <Slide deck={deck} slide={slide} scale={scale} presenting={!mirrored} static={mirrored} pageIndex={index} />
  </div>;
});

const reducedMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

export function Reader({ deck, current, onExit }: { deck: Deck; current: number; onExit: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const book = useRef<HTMLDivElement>(null);
  const setCurrent = useStore((s) => s.setCurrent);
  const n = deck.slides.length;
  const rtl = deck.binding === "right";
  const canvas = canvasSize(deck);
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);
  // 既定: 横長の画面なら見開き。切り替えたら次も同じ表示で始める
  const [spread, setSpreadState] = useState(() => readFlag(SPREAD_KEY) ?? window.innerWidth / Math.max(1, window.innerHeight - 60) >= 1.15);
  const [sound, setSoundState] = useState(() => readFlag(SOUND_KEY) ?? true);
  const soundOn = useRef(sound);
  soundOn.current = sound;
  const [fullscreen, setFullscreen] = useState(false);
  const [message, setMessage] = useState("");
  const [turn, setTurnState] = useState<Turn | null>(null);
  const turnRef = useRef<Turn | null>(null);
  const setTurn = useCallback((t: Turn | null) => { turnRef.current = t; setTurnState(t); }, []);
  const anim = useRef<{ raf: number; finish: () => void } | null>(null);
  const drag = useRef<{ id: number; start: Pt; dir: 1 | -1; moved: boolean; base: Pt | null; gain: number; samples: { t: number; x: number }[] } | null>(null);
  const peekKey = useRef<string | null>(null);
  const lastWheel = useRef(0);

  useEffect(() => {
    root.current?.focus();
    const node = stage.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setStageSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // 表示の大きさ: 見開きは 2 ページ分の幅で収める
  const scale = stageSize ? Math.max(0.05, Math.min((stageSize.w - PAD * 2) / (canvas.w * (spread ? 2 : 1)), (stageSize.h - PAD * 2) / canvas.h)) : 0;
  const W = canvas.w * scale, H = canvas.h * scale;
  // とじ目の位置(本の箱の左端から)。単ページでは画面の左端(右綴じは右端)がとじ目
  const spineX = spread || rtl ? W : 0;
  const geo = useRef({ W, H, spineX, spread, n, rtl });
  geo.current = { W, H, spineX, spread, n, rtl };

  const stopAnimation = useCallback(() => {
    if (anim.current) cancelAnimationFrame(anim.current.raf);
    anim.current = null;
  }, []);

  /** 角を from(今の位置)から to へ動かす。終わったら、to がめくり終えた位置なら target を開き、元の位置なら閉じる */
  const animateTo = useCallback((t: Turn, to: Pt, ms: number, lift: number, onEnd?: (t: Turn) => void) => {
    stopAnimation();
    const from = t.pointer, t0 = performance.now();
    // 開くかどうかは始める時点の座標で決める(途中で画面の大きさが変わっても判定がずれない)
    const { W, H } = geo.current, { plan } = t;
    const goal = plan.goalTurned ? turnedPoint(W, H, plan.side, t.corner) : cornerPoint(W, H, plan.side, t.corner);
    const toGoal = Math.hypot(to.x - goal.x, to.y - goal.y) < 1;
    const end = (last: Turn) => {
      anim.current = null;
      if (onEnd) { onEnd(last); return; }
      if (toGoal) setCurrent(plan.target);
      setTurn(null);
    };
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const next = { ...(turnRef.current ?? t), pointer: arcPoint(from, to, t.corner, lift, p) };
      setTurn(next);
      if (p < 1) { if (anim.current) anim.current.raf = requestAnimationFrame(step); }
      else end(next);
    };
    anim.current = { raf: requestAnimationFrame(step), finish: () => {
      if (anim.current) cancelAnimationFrame(anim.current.raf);
      end({ ...(turnRef.current ?? t), pointer: to });
    } };
  }, [setCurrent, setTurn, stopAnimation]);

  /** 自動でめくる(クリック・キー・ホイール・ボタン)。めくっている途中なら、それを終わらせてから次へ */
  const go = useCallback((dir: 1 | -1) => {
    const live = turnRef.current;
    if (live && anim.current && live.mode === "auto") anim.current.finish();
    const { W, H, spread, n, rtl } = geo.current;
    const plan = planTurn(dir, spread, useStore.getState().current, n, rtl);
    if (!plan) { if (turnRef.current?.mode === "peek") { stopAnimation(); setTurn(null); } return; }
    if (reducedMotion() || W <= 0) { stopAnimation(); setTurn(null); setCurrent(plan.target); if (soundOn.current) playPageTurn(260); return; }
    if (soundOn.current) playPageTurn(TURN_MS);
    const peek = turnRef.current;
    const samePeek = peek && peek.mode === "peek" && peek.plan.side === plan.side && peek.plan.target === plan.target;
    const corner: Corner = samePeek ? peek.corner : "bottom";
    const home = plan.goalTurned ? cornerPoint(W, H, plan.side, corner) : turnedPoint(W, H, plan.side, corner);
    const goal = plan.goalTurned ? turnedPoint(W, H, plan.side, corner) : cornerPoint(W, H, plan.side, corner);
    peekKey.current = null;
    const t: Turn = { plan, corner, pointer: samePeek ? peek.pointer : home, mode: "auto" };
    setTurn(t);
    animateTo(t, goal, TURN_MS, H * 0.12);
  }, [animateTo, setCurrent, setTurn, stopAnimation]);

  /** 目次やボタンで飛ぶ(めくらない) */
  const jump = useCallback((i: number) => {
    stopAnimation(); setTurn(null); peekKey.current = null;
    setCurrent(i);
    root.current?.focus();
  }, [setCurrent, setTurn, stopAnimation]);

  const setSpread = (on: boolean) => {
    stopAnimation(); setTurn(null); peekKey.current = null;
    setSpreadState(on);
    saveFlag(SPREAD_KEY, on);
    root.current?.focus();
  };
  const toggleSound = () => {
    setSoundState(!sound);
    saveFlag(SOUND_KEY, !sound);
    if (!sound) playPageLift(); // 鳴ることをその場で確かめられるように
    root.current?.focus();
  };

  const exit = useCallback(() => {
    // めくっている途中なら、そのページまでめくり終えてから戻る(角をのぞかせていただけなら戻さない)
    if (turnRef.current?.mode === "auto") anim.current?.finish();
    stopAnimation();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    onExit();
  }, [onExit, stopAnimation]);

  useEffect(() => {
    const navigate = (key: string) => {
      switch (key) {
        case "Escape": exit(); return true;
        // 右綴じは左へ読み進めるので、← が次
        case "ArrowLeft": go(geo.current.rtl ? 1 : -1); return true;
        case "ArrowRight": go(geo.current.rtl ? -1 : 1); return true;
        case "PageUp": go(-1); return true;
        case "PageDown": case " ": go(1); return true;
        case "Home": jump(0); return true;
        case "End": jump(geo.current.n - 1); return true;
        default: return false;
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      // 入力欄とボタンの上では、そのキーの本来の動き(文字の入力・ボタンを押す)を優先する
      if (!["Escape", "PageUp", "PageDown"].includes(event.key) && (isTypingTarget(event.target) || (event.target as HTMLElement | null)?.closest?.("button"))) return;
      if (navigate(event.key)) event.preventDefault();
    };
    // ウィジェット(iframe)にフォーカスがあるときのキーは、ウィジェットから postMessage で届く
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "deck-studio:presentation-key") return;
      const frames = root.current?.querySelectorAll("iframe");
      if (!frames || !Array.from(frames).some((frame) => frame.contentWindow === event.source)) return;
      navigate(event.data.key);
    };
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onMessage);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("message", onMessage);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [exit, go, jump]);

  useEffect(() => () => stopAnimation(), [stopAnimation]);

  // 画面の大きさが変わったら、めくりの途中の座標が合わなくなるので終える(自動のめくりは最後まで、つまんでいたものは戻す)
  useEffect(() => {
    const live = turnRef.current;
    if (!live) return;
    if (live.mode === "auto") anim.current?.finish();
    else { stopAnimation(); setTurn(null); drag.current = null; peekKey.current = null; }
  }, [scale, setTurn, stopAnimation]);

  /** 画面の点 → 本の座標(原点は背の上端) */
  const bookPoint = (e: { clientX: number; clientY: number }): Pt | null => {
    const r = book.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left - geo.current.spineX, y: e.clientY - r.top } : null;
  };

  /** 角にマウスを近づけると、紙が少しめくれて「つまめる」ことを示す */
  const hover = (p: Pt | null) => {
    const live = turnRef.current;
    if (drag.current || (live && live.mode !== "peek") || reducedMotion()) return;
    const { W, H, spread, n, rtl } = geo.current;
    const zone = Math.min(110, W * 0.2);
    let found: { plan: Plan; corner: Corner } | null = null;
    if (p) for (const dir of [1, -1] as const) {
      if (dir === -1 && !spread) continue; // 単ページで戻るときの紙は画面の外(とじ目の向こう)にある
      const plan = planTurn(dir, spread, useStore.getState().current, n, rtl);
      if (!plan) continue;
      for (const corner of ["top", "bottom"] as const) {
        const c = cornerPoint(W, H, plan.side, corner);
        if (Math.hypot(p.x - c.x, p.y - c.y) < zone) found = { plan, corner };
      }
    }
    const key = found ? `${found.plan.dir}${found.corner}` : null;
    if (key === peekKey.current) return;
    peekKey.current = key;
    if (found) {
      const { plan, corner } = found;
      const c = cornerPoint(W, H, plan.side, corner);
      const sameCorner = live && live.plan.side === plan.side && live.corner === corner;
      const t: Turn = { plan, corner, pointer: sameCorner ? live.pointer : c, mode: "peek" };
      setTurn(t);
      animateTo(t, { x: c.x + (plan.side === "right" ? -1 : 1) * W * 0.11, y: c.y + (corner === "top" ? 1 : -1) * H * 0.045 }, 260, 0, () => {});
    } else if (live) {
      animateTo(live, cornerPoint(W, H, live.plan.side, live.corner), 200, 0, () => setTurn(null));
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button,select,input,textarea")) return;
    const p = bookPoint(e);
    if (!p) return;
    if (turnRef.current?.mode === "auto") anim.current?.finish();
    const { W, spread, rtl } = geo.current;
    // 見開きは押したページの側(左綴じは左、右綴じは右が前のページ)。単ページはとじ目側の 3 分の 1 で戻る
    const back = spread ? (p.x < 0) !== rtl : rtl ? p.x > -W * 0.35 : p.x < W * 0.35;
    const dir: 1 | -1 = back ? -1 : 1;
    drag.current = { id: e.pointerId, start: p, dir, moved: false, base: null, gain: 1, samples: [{ t: e.timeStamp, x: p.x }] };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = bookPoint(e);
    const d = drag.current;
    if (!d) {
      // 端ではクリックでめくれることを、ほかではつまめることをカーソルで示す
      const { W, spread, rtl } = geo.current;
      if (stage.current) stage.current.style.cursor = p && clickTurn(p, W, spread, rtl) ? "pointer" : "grab";
      hover(p);
      return;
    }
    if (e.pointerId === d.id && e.pointerType === "mouse" && e.buttons === 0) {
      // 離した知らせ(pointerup)を取りこぼした(ウィンドウの切り替えなど)。押していないのに紙が付いてきて勝手にめくれないよう、取り消して戻す
      endDrag(e, true);
      return;
    }
    if (stage.current) stage.current.style.cursor = "grabbing";
    if (e.pointerId !== d.id || !p) return;
    const dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      d.moved = true;
      if (reducedMotion()) return;
      const { W, H, spread, n, rtl } = geo.current;
      const plan = planTurn(d.dir, spread, useStore.getState().current, n, rtl);
      if (!plan) return;
      if (soundOn.current) playPageLift();
      const live = turnRef.current;
      const fromPeek = live?.mode === "peek" && live.plan.side === plan.side && live.plan.target === plan.target;
      const corner: Corner = fromPeek ? live.corner : d.start.y < H / 3 ? "top" : "bottom";
      stopAnimation(); peekKey.current = null;
      d.base = fromPeek ? live.pointer : plan.goalTurned ? cornerPoint(W, H, plan.side, corner) : turnedPoint(W, H, plan.side, corner);
      // 単ページで戻るとき、角は画面の外。見えている紙の端(折り目)が指に付いてくるよう 2 倍で動かす
      d.gain = plan.goalTurned ? 1 : 2;
      setTurn({ plan, corner, pointer: d.base, mode: "drag" });
    }
    const live = turnRef.current;
    if (live?.mode === "drag" && d.base) {
      setTurn({ ...live, pointer: { x: d.base.x + dx * d.gain, y: d.base.y + dy } });
      d.samples.push({ t: e.timeStamp, x: p.x });
      if (d.samples.length > 6) d.samples.shift();
    }
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (stage.current) stage.current.style.cursor = "";
    if (!d.moved) {
      const { W, spread, rtl } = geo.current;
      const dir = cancelled ? null : clickTurn(d.start, W, spread, rtl);
      if (dir) go(dir);
      return;
    }
    const live = turnRef.current;
    const p = bookPoint(e);
    if (!live || live.mode !== "drag") {
      // 動きを減らす設定のときは、払った向きにそのまま移る
      if (!cancelled && reducedMotion() && p && Math.abs(p.x - d.start.x) > 30) go(p.x < d.start.x ? 1 : -1);
      return;
    }
    const { W, H } = geo.current, { plan, corner } = live;
    const home = plan.goalTurned ? cornerPoint(W, H, plan.side, corner) : turnedPoint(W, H, plan.side, corner);
    const goal = plan.goalTurned ? turnedPoint(W, H, plan.side, corner) : cornerPoint(W, H, plan.side, corner);
    const fold = foldPage(W, H, plan.side, corner, live.pointer);
    const done = plan.goalTurned ? fold.progress : 1 - fold.progress;
    const first = d.samples[0], last = d.samples[d.samples.length - 1];
    const v = last.t > first.t ? ((last.x - first.x) / (last.t - first.t)) * Math.sign(goal.x - home.x) * d.gain : 0;
    // 3 割ほど引くか、目標へ向けて払えばめくる。それ以外は元に戻す
    const complete = !cancelled && (done > 0.3 || v > 0.45) && v > -0.2;
    const to = complete ? goal : home;
    const t: Turn = { ...live, mode: "auto" };
    setTurn(t);
    const remaining = Math.abs(to.x - live.pointer.x) / (2 * W);
    const ms = Math.max(160, TURN_MS * remaining);
    if (complete && soundOn.current) playPageTurn(ms, false);
    animateTo(t, to, ms, H * 0.06 * remaining);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaY) < 4 || drag.current) return;
    const now = performance.now();
    if (now - lastWheel.current < 420) return;
    lastWheel.current = now;
    go(e.deltaY > 0 ? 1 : -1);
  };

  // ---- 描画 ----
  const fold: Fold | null = turn && W > 0 ? foldPage(W, H, turn.plan.side, turn.corner, turn.pointer) : null;
  const k = spreadOf(current);
  const leftBound = spread ? spreadPages(k, n) : { left: null, right: current }; // 左綴じでの並び
  const idle = rtl ? { left: leftBound.right, right: leftBound.left } : leftBound;
  const D = Math.hypot(W, H);

  type Face = { page: number; mirrored: boolean; role: "flat" | "front" | "back"; side: Side; z: number };
  const faces: Face[] = [];
  if (turn && fold) {
    const { plan } = turn, other: Side = plan.side === "right" ? "left" : "right";
    if (plan.stationary !== null) faces.push({ page: plan.stationary, mirrored: false, role: "flat", side: other, z: 1 });
    if (plan.under !== null) faces.push({ page: plan.under, mirrored: false, role: "flat", side: plan.side, z: 1 });
    if (plan.front !== null) faces.push({ page: plan.front, mirrored: false, role: "front", side: plan.side, z: 3 });
    if (fold.back.length >= 3) faces.push({ page: plan.back, mirrored: plan.backMirrored, role: "back", side: other, z: 4 });
  } else {
    if (idle.left !== null) faces.push({ page: idle.left, mirrored: false, role: "flat", side: "left", z: 1 });
    if (idle.right !== null) faces.push({ page: idle.right, mirrored: false, role: "flat", side: "right", z: 1 });
  }
  // DOM の並びはページ順で固定する(並べ替えると iframe が読み込み直される)
  faces.sort((a, b) => a.page - b.page || Number(a.mirrored) - Number(b.mirrored));

  // 机に置いた本の影と、紙の束の厚み(見開きのみ)
  const occupied = new Set(faces.filter((f) => f.role !== "back").map((f) => f.side));
  const visibleLeft = turn ? (turn.plan.side === "left" ? turn.plan.under : turn.plan.stationary) : idle.left;
  const visibleRight = turn ? (turn.plan.side === "right" ? turn.plan.under : turn.plan.stationary) : idle.right;
  const thickness = (pages: number) => Math.min(8, 1 + Math.floor(pages / 3));
  // 読み終えた側(左綴じは左、右綴じは右)の束は前のページの数、反対側は残りの数で厚くなる
  const before = (i: number) => thickness(i), after = (i: number) => thickness(n - 1 - i);
  const edgeLeft = spread && visibleLeft !== null ? (rtl ? after : before)(visibleLeft) : 0;
  const edgeRight = spread && visibleRight !== null ? (rtl ? before : after)(visibleRight) : 0;

  // 紙の裏の色。ページの地色ではなく資料の紙の色(濃い表紙でも裏は紙で、表がうっすら透ける)
  const paper = resolveColor("lt1", deck.theme, "#FFFFFF");
  // 陰の強さ: 紙が立っている(めくりの半ば)ほど強い
  const k01 = fold ? 0.35 + 0.65 * Math.sin(Math.PI * fold.progress) : 0;

  const renderFace = (f: Face) => {
    const slide = deck.slides[f.page];
    if (!slide) return null;
    const sheet: CSSProperties = { left: spineX, width: W, height: H };
    const wrapper: CSSProperties = { zIndex: f.z };
    let shade: CSSProperties | null = null;
    if (f.role === "flat" || !fold) {
      sheet.transform = `translate(${f.side === "left" ? -W : 0}px, 0)`;
    } else if (f.role === "front") {
      sheet.transform = `translate(${f.side === "left" ? -W : 0}px, 0)`;
      sheet.clipPath = cssPolygon(fold.front);
      const width = Math.min(W * 0.4, fold.depth * 0.5 + 6);
      shade = { width, height: 2 * D, transform: stripTransform(fold.frontLine, width, D, -1),
        background: `linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,${(0.07 * k01).toFixed(3)}) 70%, rgba(0,0,0,${(0.2 * k01).toFixed(3)}) 100%)` };
    } else {
      sheet.transform = cssMatrix(fold.backMatrix);
      sheet.clipPath = cssPolygon(fold.back);
      const width = Math.max(1, fold.depth / 2);
      shade = { width, height: 2 * D, transform: stripTransform(fold.backLine, width, D, 1),
        background: `linear-gradient(to right, rgba(0,0,0,${(0.22 * k01).toFixed(3)}) 0%, rgba(255,255,255,${(0.16 * k01).toFixed(3)}) 14%, rgba(255,255,255,0) 46%, rgba(0,0,0,${(0.07 * k01).toFixed(3)}) 100%)` };
      wrapper.filter = `drop-shadow(0 0 ${(5 + 12 * k01).toFixed(1)}px rgba(0,0,0,${(0.16 + 0.26 * k01).toFixed(3)}))`;
    }
    return <div key={`${slide.id}${f.mirrored ? "~back" : ""}`} className="reader-face" style={wrapper}
      data-page={f.page} data-role={f.mirrored ? "back-mirrored" : f.role}>
      <div className="reader-sheet" style={sheet}>
        <PageContent deck={deck} slide={slide} index={f.page} scale={scale} mirrored={f.mirrored} />
        {f.mirrored && <div className="reader-paper" style={{ background: paper }} />}
        {spread && <div className={`reader-gutter ${f.side}`} />}
        {shade && <div className="reader-fold-shade" style={shade} />}
      </div>
    </div>;
  };

  // めくった紙が下のページに落とす影(折り目から角の側へ)
  let cast: { box: CSSProperties; strip: CSSProperties } | null = null;
  if (turn && fold && fold.depth > 0) {
    const offset = turn.plan.side === "left" ? -W : 0;
    const width = Math.min(W * 0.14, fold.depth * 0.1 + 10);
    const a = 0.3 * k01;
    cast = { box: { left: spineX + offset, width: W, height: H },
      strip: { width, height: 2 * D, transform: stripTransform({ m: { x: fold.line.m.x - offset, y: fold.line.m.y }, n: fold.line.n }, width, D, 1),
        background: `linear-gradient(to right, rgba(0,0,0,${a.toFixed(3)}) 0%, rgba(0,0,0,${(a * 0.3).toFixed(3)}) 35%, rgba(0,0,0,0) 100%)` } };
  }

  const cur = spread ? spreadPages(k, n) : { left: current, right: null };
  const shown = [cur.left, cur.right].filter((v): v is number => v !== null);
  const countLabel = shown.length === 2 ? `${shown[0] + 1}–${shown[1] + 1} / ${n}` : `${(shown[0] ?? current) + 1} / ${n}`;
  const canPrev = !!planTurn(-1, spread, current, n, rtl), canNext = !!planTurn(1, spread, current, n, rtl);
  // 右綴じは読み進める向きが左なので、次へを左に置く
  const prevButton = <button aria-label="前のページ" disabled={!canPrev} onClick={() => { go(-1); root.current?.focus(); }}>
    {rtl ? <>前へ<Icon name="next" /></> : <><Icon name="previous" />前へ</>}</button>;
  const nextButton = <button aria-label="次のページ" disabled={!canNext} onClick={() => { go(1); root.current?.focus(); }}>
    {rtl ? <><Icon name="previous" />次へ</> : <><Icon name="next" />次へ</>}</button>;
  const pageTitle = (slide: SlideModel, index: number) => {
    const title = slide.elements.find((el) => el.type === "text" && el.role === "title");
    return title?.type === "text" ? title.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join(" ") || `ページ ${index + 1}` : `ページ ${index + 1}`;
  };

  return <div className="reader" ref={root} tabIndex={-1} aria-label="読書モード">
    <div className="reader-stage" ref={stage} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, false)} onPointerCancel={(e) => endDrag(e, true)} onLostPointerCapture={(e) => endDrag(e, true)} onPointerLeave={() => { if (!drag.current) hover(null); }}
      onWheel={onWheel}>
      {scale > 0 && <div className={`reader-book ${spread ? "spread" : "single"}${turn && turn.mode !== "peek" ? " turning" : ""}`} ref={book}
        style={{ width: spread ? W * 2 : W, height: H }}>
        {(["left", "right"] as const).filter((s) => occupied.has(s) && (spread || s === (rtl ? "left" : "right"))).map((s) =>
          <div key={s} className="reader-base" style={{ left: spineX + (s === "left" ? -W : 0), width: W, height: H }} />)}
        {edgeLeft > 0 && <div className="reader-edge left" style={{ left: spineX - W - edgeLeft, width: edgeLeft, height: H }} />}
        {edgeRight > 0 && <div className="reader-edge right" style={{ left: spineX + W, width: edgeRight, height: H }} />}
        <div className="reader-pages">
          {faces.map(renderFace)}
          {cast && <div className="reader-cast" style={cast.box}><div className="reader-fold-shade" style={cast.strip} /></div>}
        </div>
      </div>}
    </div>
    <footer className="presentation-controls">
      <span className="mode-label">読書モード</span>
      <span className="presentation-hint">{rtl ? "右綴じ · 紙をつまんでめくる · 端のクリック・← で次へ" : "紙をつまんでめくる · 端のクリック・← → でも"}</span>
      {rtl ? nextButton : prevButton}
      <span className="presentation-count" aria-live="polite">{countLabel}</span>
      <select className="presentation-jump" aria-label="移動するページ" value={current} onChange={(e) => jump(Number(e.target.value))}>
        {deck.slides.map((slide, index) => <option key={slide.id} value={index}>{index + 1}. {pageTitle(slide, index)}</option>)}
      </select>
      {rtl ? prevButton : nextButton}
      <span className="presentation-spacer" />
      <button aria-pressed={sound} onClick={toggleSound} title="めくるときの紙の音"><Icon name={sound ? "sound" : "mute"} />めくる音</button>
      <span className="reader-view-switch" role="group" aria-label="ページの並べ方">
        <button aria-pressed={!spread} onClick={() => setSpread(false)} title="1 ページずつ表示"><Icon name="singlePage" />単ページ</button>
        <button aria-pressed={spread} onClick={() => setSpread(true)} title={`本のように 2 ページを並べて表示(表紙は${rtl ? "左" : "右"}に 1 枚)`}><Icon name="spread" />見開き</button>
      </span>
      {message && <span role="status">{message}</span>}
      <button onClick={() => {
        setMessage("");
        const action = document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen?.();
        if (!action) setMessage("この環境では全画面表示に対応していません");
        else void action.catch(() => setMessage("全画面表示に切り替えられませんでした"));
        root.current?.focus();
      }}><Icon name={fullscreen ? "exitFullscreen" : "fullscreen"} />{fullscreen ? "全画面を解除" : "全画面"}</button>
      <button onClick={exit}><Icon name="edit" />編集に戻る <kbd>Esc</kbd></button>
    </footer>
  </div>;
}

