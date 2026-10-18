import { Icon } from "./editor/Icon";
import { useCallback, useEffect, useRef, useState } from "react";
import { CANVAS_H, CANVAS_W, type Deck } from "./model/deck";
import { Slide } from "./render/Slide";
import { useStore } from "./store";
import { isTypingTarget } from "./keyboard";
import { readStored, writeStored } from "./storage";

const PRESENTER_KEY = "deck-studio.presenter";
const readPresenter = () => readStored(PRESENTER_KEY) === "1";
const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** 子要素の幅に 1280px のスライドを収める倍率 */
function useFitWidth(): [(node: HTMLDivElement | null) => void, number] {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.max(0.05, entry.contentRect.width / CANVAS_W)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, scale];
}

export function Presentation({ deck, current, onExit }: { deck: Deck; current: number; onExit: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [fullscreen, setFullscreen] = useState(false);
  const [message, setMessage] = useState("");
  // 発表者ビュー: 今のスライド + 次のスライド・ノート・経過時間(P キーで切り替え、次回も同じ表示で始める)
  const [presenter, setPresenter] = useState(readPresenter);
  const togglePresenter = useCallback(() => setPresenter((on) => {
    writeStored(PRESENTER_KEY, on ? "0" : "1");
    return !on;
  }), []);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const [nextRef, nextScale] = useFitWidth();
  const setCurrent = useStore((s) => s.setCurrent);
  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    onExit();
  }, [onExit]);

  useEffect(() => {
    root.current?.focus();
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.max(0.05, Math.min(entry.contentRect.width / CANVAS_W, entry.contentRect.height / CANVAS_H)));
    });
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const navigate = (key: string) => {
      switch (key) {
        case "Escape": exit(); return true;
        case "ArrowLeft": case "PageUp": setCurrent(current - 1); return true;
        case "ArrowRight": case "PageDown": case " ": setCurrent(current + 1); return true;
        case "Home": setCurrent(0); return true;
        case "End": setCurrent(deck.slides.length - 1); return true;
        case "p": case "P": togglePresenter(); return true;
        default: return false;
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      // 入力欄とボタンの上では、そのキーの本来の動き(文字の入力・ボタンを押す)を優先する
      if (!["Escape", "PageUp", "PageDown"].includes(event.key) && (isTypingTarget(event.target) || (event.target as HTMLElement | null)?.closest?.("button"))) return;
      if (navigate(event.key)) event.preventDefault();
    };
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
  }, [current, deck.slides.length, exit, setCurrent, togglePresenter]);

  const next = deck.slides[current + 1];
  const notes = deck.slides[current].notes?.trim();

  return <div className={`presentation${presenter ? " presenter" : ""}`} ref={root} tabIndex={-1} aria-label="プレゼンモード">
    <div className="presentation-body">
      <div className="presentation-stage" ref={stage}>
        <Slide key={deck.slides[current].id} deck={deck} slide={deck.slides[current]} scale={scale} presenting pageIndex={current} />
      </div>
      {presenter && <aside className="presenter-side" aria-label="発表者ビュー">
        <div className="presenter-timer">
          <span>経過 <strong>{clock(now - startedAt)}</strong></span>
          <button onClick={() => { setStartedAt(Date.now()); setNow(Date.now()); root.current?.focus(); }}><Icon name="reset" />リセット</button>
          <span className="presenter-clock">{new Date(now).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div className="presenter-label">次のスライド</div>
        <div className="presenter-next" ref={nextRef}>
          {next ? <Slide key={next.id} deck={deck} slide={next} scale={nextScale} static pageIndex={current + 1} /> : <p className="presenter-empty">最後のスライドです</p>}
        </div>
        <div className="presenter-label">ノート</div>
        <div className="presenter-notes" aria-label="発表者ノート">{notes || <span className="presenter-empty">このスライドにノートはありません(編集画面の右パネルで書けます)</span>}</div>
      </aside>}
    </div>
    <footer className="presentation-controls">
      <span className="mode-label">プレゼンモード</span>
      <span className="presentation-hint">実験を操作できます · PgUp / PgDnでページ送り</span>
      <button aria-label="前のスライド" disabled={current === 0} onClick={() => { setCurrent(current - 1); root.current?.focus(); }}><Icon name="previous" />前へ</button>
      <span className="presentation-count" aria-live="polite">{current + 1} / {deck.slides.length}</span>
      <select className="presentation-jump" aria-label="移動するスライド" value={current} onChange={(e) => { setCurrent(Number(e.target.value)); root.current?.focus(); }}>
        {deck.slides.map((slide, index) => {
          const title = slide.elements.find((el) => el.type === "text" && el.role === "title");
          const label = title?.type === "text" ? title.paragraphs.map(p => p.runs.map(r => r.text).join("")).join(" ") : `スライド ${index + 1}`;
          return <option key={slide.id} value={index}>{index + 1}. {label}</option>;
        })}
      </select>
      <button aria-label="次のスライド" disabled={current === deck.slides.length - 1} onClick={() => { setCurrent(current + 1); root.current?.focus(); }}><Icon name="next" />次へ</button>
      <span className="presentation-spacer" />
      <button aria-pressed={presenter} onClick={() => { togglePresenter(); root.current?.focus(); }} title="次のスライド・ノート・経過時間を表示(P)"><Icon name="presenter" />発表者ビュー <kbd>P</kbd></button>
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
