import { Icon } from "./Icon";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Element, ObjectComment } from "../model/deck";
import { ImageEl } from "../render/elements/ImageEl";
import { newId } from "../model/ids";
import { useStore } from "../store";
import { readDataUrl } from "../imageData";
import { isImageFile, storeImage } from "./images";

export function ObjectComments({ el }: { el: Element }) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<NonNullable<ObjectComment["images"]>>([]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setExpanded(null); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [expanded]);
  const comments = el.comments ?? [];
  const save = (next: ObjectComment[]) => useStore.getState().patchElement(el.id, { comments: next });
  const attach = async (files: File[]) => {
    const state = useStore.getState();
    const path = state.deckPath;
    const supported = files.filter(isImageFile);
    if (!supported.length || busy) return;
    setBusy(true);
    try {
      const attached: NonNullable<ObjectComment["images"]> = [];
      for (const file of supported) {
        const data = await readDataUrl(file);
        const name = file.name || `reference-${Date.now()}.png`;
        const src = await storeImage(state.deckDir, name, data);
        attached.push({ src, name });
      }
      if (useStore.getState().deckPath === path) setImages(prev => [...prev, ...attached]);
    } catch (error) { useStore.getState().flash(`画像を追加できませんでした: ${String(error)}`); }
    finally { setBusy(false); }
  };
  const copyRequest = async () => {
    const s = useStore.getState();
    const requests = s.deck?.slides.flatMap(slide => slide.elements.flatMap(element => (element.comments ?? []).filter(c => !c.resolved).map(comment => ({
      slideId: slide.id, elementId: element.id, elementType: element.type, comment,
    }))));
    const prompt = `このデッキの未解決コメントに沿って修正してください。対象は slideId / elementId で特定してください。画像の src はデッキフォルダからの相対パスです（data URL は埋め込み画像）。画像も確認してください。既存の ID と無関係の編集を保ち、対応したコメントだけ resolved: true にしてください。\nデッキ: ${s.deckPath}\n\n${JSON.stringify(requests, null, 2)}`;
    try { await navigator.clipboard.writeText(prompt); s.flash("AIへの修正依頼をコピーしました"); }
    catch { s.flash("コピーできませんでした。コメントは deck.json に保存されています"); }
  };
  const picture = (image: { src: string; name: string }, index: number) => <ImageEl el={{ id: `comment-image-${index}`, type: "image", src: image.src, name: image.name, x: 0, y: 0, w: 200, h: 120 }} />;
  return <section className="object-comments" aria-label="オブジェクトのコメント"
    onPaste={(e) => { const files = [...e.clipboardData.files]; if (files.length) { e.preventDefault(); e.stopPropagation(); void attach(files); } }}
    onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) e.preventDefault(); }}
    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); void attach([...e.dataTransfer.files]); }}>
    <h4><Icon name="comment" />コメント <span>{comments.filter(c => !c.resolved).length}</span></h4>
    {comments.map(comment => <article key={comment.id} className={comment.resolved ? "resolved" : ""}>
      <textarea aria-label="保存済みコメント" defaultValue={comment.text} key={`${comment.id}-${comment.text}`}
        onBlur={(e) => { if (e.target.value !== comment.text) save(comments.map(c => c.id === comment.id ? { ...c, text: e.target.value } : c)); }} />
      {!!comment.images?.length && <div className="comment-images">{comment.images.map((image, i) => <button key={i} title={image.name} onClick={() => setExpanded(image.src)}>{picture(image, i)}</button>)}</div>}
      <div className="comment-actions"><button onClick={() => save(comments.map(c => c.id === comment.id ? { ...c, resolved: !c.resolved } : c))}><Icon name={comment.resolved ? "reset" : "check"} />{comment.resolved ? "再開" : "解決済みにする"}</button>
        <button onClick={() => save(comments.filter(c => c.id !== comment.id))}><Icon name="delete" />削除</button></div>
    </article>)}
    <textarea aria-label="新しいコメント" placeholder="このオブジェクトへの修正指示…" value={text} onChange={(e) => setText(e.target.value)} />
    {!!images.length && <div className="comment-images">{images.map((image, i) => <div key={i}>{picture(image, i)}<button aria-label={`添付 ${i + 1} を削除`} onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}>×</button></div>)}</div>}
    <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { void attach([...(e.target.files ?? [])]); e.target.value = ""; }} />
    <div className="btns"><button disabled={busy} onClick={() => fileInput.current?.click()}><Icon name="attach" />{busy ? "画像を保存中…" : "画像を添付"}</button>
      <button disabled={busy || (!text.trim() && !images.length)} onClick={() => {
        save([...comments, { id: newId("comment"), text: text.trim(), images: images.length ? images : undefined, createdAt: new Date().toISOString() }]); setText(""); setImages([]);
      }}><Icon name="comment" />コメントを追加</button></div>
    <p className="hint">画像は貼り付け・ドロップでも添付できます。</p>
    <div className="btns"><button onClick={() => void copyRequest()}><Icon name="copy" />AIへの修正依頼をコピー</button></div>
    {expanded && createPortal(<div className="comment-image-preview" role="dialog" aria-modal="true" aria-label="参考画像" onClick={() => setExpanded(null)}>
      <button autoFocus onClick={() => setExpanded(null)}>閉じる <kbd>Esc</kbd></button>
      <div className="comment-image-frame" onClick={(e) => e.stopPropagation()}>{picture({ src: expanded, name: "参考画像" }, 0)}</div>
    </div>, document.body)}
  </section>;
}
