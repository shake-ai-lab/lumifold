import { useEffect, useRef, useState } from "react";
import { basename, dirname, inTauri, joinPath, pickPackageFile, pickSaveFile, safeFileName, samePath } from "../tauri";
import { useStore } from "../store";
import type { DeckFormat } from "../model/deck";
import { Icon } from "./Icon";

type Mode = "new" | "save" | "pack";
const TITLES: Record<Mode, string> = { new: "新しい資料を作成", save: "名前を付けて保存", pack: "1ファイルにまとめる" };

/** まとめたファイルの既定の保存先。資料名のフォルダ(資料名/資料名.deck、旧形式の資料名/deck.json)ならその隣、それ以外は同じ場所 */
function packageDefaultPath(deckPath: string): string {
  const dir = dirname(deckPath);
  const folder = basename(dir);
  const stem = basename(deckPath).replace(/\.(deck|json)$/i, "");
  const name = stem.toLowerCase() === "deck" && folder ? folder : stem || "資料";
  if (folder === name) return joinPath(dirname(dir), `${name}.deck`);
  const path = joinPath(dir, `${name}.deck`);
  return samePath(path, deckPath) ? joinPath(dir, `${name}-まとめ.deck`) : path;
}

export function FileActions() {
  const hasDeck = useStore((s) => !!s.deck);
  const deckPath = useStore((s) => s.deckPath);
  const { createDocument, saveAs, packTo, flash } = useStore.getState();
  const [mode, setMode] = useState<Mode | null>(null);
  const [title, setTitle] = useState("新しい資料");
  const [layout, setLayout] = useState(true);
  const [format, setFormat] = useState<DeckFormat>("slides");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (mode) dialog.current?.showModal(); }, [mode]);
  const begin = (kind: Mode) => { setError(""); setDone(""); setTitle("新しい資料"); setFormat("slides"); setMode(kind); };
  const close = () => { if (!busy) { dialog.current?.close(); setMode(null); } };
  const submit = async () => {
    if (done) { close(); return; }
    if (!inTauri()) { setError("保存先の選択はデスクトップ版で利用できます。"); return; }
    setBusy(true); setError("");
    try {
      if (mode === "pack") {
        const path = deckPath && await pickPackageFile(packageDefaultPath(deckPath));
        if (!path) { setBusy(false); close(); return; }
        const missing = await packTo(path);
        const file = basename(path);
        if (missing.length) { setDone(`「${file}」にまとめました。次のファイルは見つからなかったため入っていません。\n${missing.join("\n")}`); return; }
        flash(`「${file}」にまとめました`, 4000);
        dialog.current?.close(); setMode(null);
        return;
      }
      const name = safeFileName(title.trim());
      const path = await pickSaveFile(mode === "new" ? `${name || "資料"}.deck` : deckPath?.replace(/\.(json|deck)$/i, "-copy.deck"));
      if (!path) { setBusy(false); close(); return; }
      if (mode === "new") await createDocument(title.trim() || "新しい資料", path, layout, format);
      else await saveAs(path);
      dialog.current?.close(); setMode(null);
    } catch (e) {
      setError(`${mode === "pack" ? "まとめられませんでした" : "保存できませんでした"}。保存先やアクセス権を確認してください。\n${String(e).replace(/^Error: /, "")}`);
    }
    finally { setBusy(false); }
  };
  return <>
    <button onClick={() => begin("new")}><Icon name="new" />新規資料</button>
    <button disabled={!hasDeck} onClick={() => begin("save")}><Icon name="save" />名前を付けて保存</button>
    <button disabled={!hasDeck} onClick={() => begin("pack")} title="画像・ウィジェットを含めて .deck ファイル1つにまとめます(人に渡すとき用)"><Icon name="package" />1ファイルにまとめる</button>
    {mode && <dialog ref={dialog} className="file-dialog" onCancel={(e) => { e.preventDefault(); close(); }} aria-labelledby="file-dialog-title">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <h2 id="file-dialog-title">{TITLES[mode]}</h2>
        {mode === "new" ? <>
          <label>資料の題名<input autoFocus value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} /></label>
          <label>種類<select value={format} disabled={busy} onChange={(e) => setFormat(e.target.value as DeckFormat)}>
            <option value="slides">スライド(横 16:9・発表用)</option><option value="note">ノート(縦 3:4・本のように読む)</option>
          </select></label>
          <label>最初の{format === "note" ? "ページ" : "スライド"}<select value={layout ? "title" : "blank"} disabled={busy} onChange={(e) => setLayout(e.target.value === "title")}>
            <option value="title">見出しと本文</option><option value="blank">空白</option>
          </select></label>
        </> : mode === "pack" ? <>
          <p>画像とウィジェットを含めて、.deck ファイル1つにまとめます。人に渡すときに使います。</p>
          <p>作業中の資料はこのまま編集を続けられます。まとめたファイルを開くと、隣に同じ名前のフォルダを作って展開します。</p>
        </> : <p>画像・ウィジェットも保存先へコピーします。</p>}
        {error && <p role="alert">{error}</p>}
        {done && <p role="status" className="file-dialog-result">{done}</p>}
        <div className="file-dialog-actions">
          {!done && <button type="button" className="secondary" disabled={busy} onClick={close}>キャンセル</button>}
          <button className="primary" disabled={busy || (mode === "new" && !title.trim())}>
            {done ? "閉じる" : busy ? (mode === "pack" ? "まとめています…" : "保存中…") : "保存先を選ぶ"}</button></div>
      </form>
    </dialog>}
  </>;
}
