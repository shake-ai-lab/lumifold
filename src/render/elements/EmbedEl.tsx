import { Icon } from "../../editor/Icon";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { EmbedElement } from "../../model/deck";
import { useStore } from "../../store";
import { inTauri, joinPath, readTextFile } from "../../tauri";
import { readWidgetSession, saveWidgetSession, widgetSessionKey } from "../widgetSession";
import { UiScaleContext } from "../uiScale";
import { useAssetRevision } from "../assetRevision";

/**
 * デッキフォルダ内の HTML を sandbox 付き iframe で動かす。
 * 配置時はカバーで移動操作を受け、操作モード・固定時・プレゼン中は iframe を操作できる。
 */
export function EmbedEl({ el, isStatic, presenting = false }: { el: EmbedElement; isStatic: boolean; presenting?: boolean }) {
  const deckDir = useStore((s) => s.deckDir);
  const deckPath = useStore((s) => s.deckPath);
  const selected = useStore((s) => s.selection.includes(el.id));
  const interactionRequested = useStore((s) => s.interactingId === el.id);
  const interacting = (!!el.locked || interactionRequested) && !isStatic && !presenting;
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [source, setSource] = useState<{ path: string; html?: string; error?: string } | null>(null);
  const path = deckDir ? joinPath(deckDir, el.src) : el.src;
  // HTML が書き換わったら読み直す(読み終わるまでは前の版を見せる)。状態は widget-ready で戻す
  const rev = useAssetRevision(path);
  const loadKey = `${path}#${rev}`;
  const active = !isStatic || visible;
  const sessionKey = widgetSessionKey(deckPath, el.id, el.src);
  // 操作ボタンはスライドの拡縮を打ち消して画面上で一定の大きさにする。上に置く余白が無ければ下へ。
  // 狭い図解ではアイコンと短いラベルを縦に並べ、回転のつまみを避ける。
  const uiScale = useContext(UiScaleContext);
  const compactControls = el.w / uiScale < 360;
  const controlsBelow = el.y < (compactControls ? 64 : 48) * uiScale;
  useEffect(() => {
    if (isStatic) return;
    const onState = (event: MessageEvent) => {
      const frame = root.current?.querySelector("iframe")?.contentWindow;
      if (!frame || event.source !== frame) return;
      if (event.data?.type === "deck-studio:widget-ready") {
        frame.postMessage({ type: "deck-studio:widget-restore", state: readWidgetSession(sessionKey) ?? null }, "*");
      } else if (event.data?.type === "deck-studio:widget-state") {
        saveWidgetSession(sessionKey, event.data.state);
      }
    };
    window.addEventListener("message", onState);
    return () => window.removeEventListener("message", onState);
  }, [isStatic, sessionKey]);
  useEffect(() => {
    if (!interacting) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source === root.current?.querySelector("iframe")?.contentWindow && event.data?.type === "deck-studio:widget-exit") useStore.getState().setInteracting(null);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [interacting]);

  useEffect(() => {
    if (!isStatic || !root.current) return;
    // Only visible thumbnails own a browsing/WebGL context. Scrolling away releases it.
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: root.current.closest(".slide-list"), rootMargin: "80px 0px",
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [isStatic]);

  useEffect(() => {
    if (!active || source?.path === loadKey) return;
    let alive = true;
    // ブラウザモード(vite dev)では .html に vite の開発用スクリプトが注入されるので取り除く。Tauri では Rust が生のファイルを返す
    const stripVite = (t: string) =>
      t.replace(/<script type="module" src="\/@[^"]*"><\/script>\s*/g, "").replace(/<script type="module">[\s\S]*?react-refresh[\s\S]*?<\/script>\s*/g, "");
    const load = inTauri()
      ? readTextFile(path)
      : fetch(rev ? `${path}?v=${rev}` : path).then((r) => (r.ok ? r.text().then(stripVite) : Promise.reject(new Error(String(r.status)))));
    load.then((html) => alive && setSource({ path: loadKey, html })).catch((error) => alive && setSource({ path: loadKey, error: String(error) }));
    return () => {
      alive = false;
    };
  }, [active, path, rev, loadKey, source?.path]);

  const current = source?.path.startsWith(`${path}#`) ? source : undefined;
  const html = current?.html;
  const error = current?.error;
  const srcDoc = useMemo(() => {
    if (!html) return undefined;
    if (isStatic) {
      // Install before widget scripts, while preserving the document's doctype.
      return /<head(?:\s[^>]*)?>/i.test(html)
        ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => head + PREVIEW_RUNTIME)
        : html.replace(/^(\s*<!doctype[^>]*>)?/i, (doctype) => doctype + PREVIEW_RUNTIME);
    }
    return html + (presenting ? PRESENTATION_KEYS : EDITING_KEYS);
  }, [html, isStatic, presenting]);

  return (
    <>
    <div ref={root} className={`embed${isStatic ? " embed-preview" : ""}${interacting ? " embed-interacting" : ""}${el.locked ? " embed-locked" : ""}`}>
      {error ? <div className="embed-preview-message">ウィジェットを読めません<br />{el.title ?? el.src}</div> :
        active && srcDoc ? <iframe key={current?.path} srcDoc={srcDoc} sandbox="allow-scripts" title={el.title ?? el.src}
          aria-hidden={isStatic || undefined} tabIndex={(presenting || interacting) && !isStatic ? 0 : -1}
          style={{ pointerEvents: (presenting || interacting) && !isStatic ? "auto" : "none" }} /> :
          <div className="embed-preview-message">{active ? "プレビューを読み込み中…" : el.title ?? "ウィジェット"}</div>}
      {!presenting && !isStatic && !interacting && (
        <div className="embed-cover" />
      )}
    </div>
    {el.locked && !presenting && !isStatic && <button className="embed-unlock" aria-label="ウィジェットの固定を解除" title="固定を解除して配置を編集"
      onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
      onClick={() => { useStore.getState().patchElement(el.id, { locked: undefined }); useStore.getState().setInteracting(null); useStore.getState().select([el.id]); }}>
      <Icon name="unpin" />
    </button>}
    {!el.locked && !presenting && !isStatic && <div className={`widget-controls${selected || interacting ? " visible" : ""}${controlsBelow ? " below" : ""}${compactControls ? " compact" : ""}`}
      role="group" aria-label="ウィジェットのモード" style={{ transform: `scale(${uiScale})` }}>
        <button aria-label="配置" aria-pressed={!interacting} title="配置：ドラッグで移動" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); useStore.getState().setInteracting(null); useStore.getState().select([el.id]); }}>
          <Icon name="move" /><span>配置</span>
        </button>
        <button aria-label="操作" aria-pressed={interacting} title="操作：ウィジェットを操作（Esc で配置に戻る）" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); useStore.getState().setInteracting(el.id); }}>
          <Icon name="interact" /><span>操作</span>
        </button>
        <button aria-label="ウィジェットの位置を固定" title="固定：位置を固定して内部を操作" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
          onClick={() => { useStore.getState().patchElement(el.id, { locked: true }); useStore.getState().setInteracting(null); useStore.getState().select([el.id]); }}>
          <Icon name="pin" /><span>固定</span>
        </button>
    </div>}
    </>
  );
}

// Thumbnails need a recognizable scene, not a full-rate animation. Keep initialization
// and asynchronous rendering working; the editing/presentation document is untouched.
const PREVIEW_RUNTIME = `<script>
(() => {
  const request = window.requestAnimationFrame.bind(window);
  const cancel = window.cancelAnimationFrame.bind(window);
  const jobs = new Map();
  let sequence = 0;
  window.requestAnimationFrame = callback => {
    const id = ++sequence;
    const job = { timer: 0, frame: 0 };
    jobs.set(id, job);
    job.timer = setTimeout(() => {
      job.frame = request(time => { jobs.delete(id); callback(time); });
    }, 125);
    return id;
  };
  window.cancelAnimationFrame = id => {
    const job = jobs.get(id);
    if (job) { clearTimeout(job.timer); cancel(job.frame); jobs.delete(id); }
  };
})();
<\/script>`;

const EDITING_KEYS = `<script>
window.addEventListener('keydown', function(event) {
  if (event.key === 'Escape' && !event.isComposing) {
    event.preventDefault(); parent.postMessage({ type: 'deck-studio:widget-exit' }, '*');
  }
}, true);
<\/script>`;

// Sandboxed widgets have their own focus. Relay presentation keys without stealing
// arrow/space keys from sliders, inputs or buttons inside the widget.
const PRESENTATION_KEYS = `<script>
window.addEventListener('keydown', function(event) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  var keys = ['Escape', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '];
  if (keys.indexOf(event.key) < 0) return;
  var target = event.target;
  if (!['Escape', 'PageUp', 'PageDown'].includes(event.key) && target && (target.closest('input,textarea,select,button,[role="slider"]') || target.isContentEditable)) return;
  event.preventDefault();
  parent.postMessage({ type: 'deck-studio:presentation-key', key: event.key }, '*');
}, true);
<\/script>`;
