import { useState } from "react";
import { canvasSize, deckFormat, unitName } from "../model/deck";
import { PAGE_MARGIN } from "../model/defaults";
import { newId } from "../model/ids";
import { useStore } from "../store";
import { basename, importAsset, inTauri, pickWidgetFile } from "../tauri";
import { Icon } from "./Icon";

/** The OS picker imports a self-contained HTML file into the document's assets. */
export function WidgetFileButton({ elementId }: { elementId?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <span className="widget-file-action">
    <button disabled={busy} title="自己完結したHTMLファイルを選び、資料へコピーします" onClick={async () => {
      setError("");
      if (!inTauri()) { setError("HTMLの追加・差し替えはデスクトップ版で利用できます。"); return; }
      const start = useStore.getState();
      if (!start.deckDir || !start.deck) { setError("資料を保存してからHTMLを追加してください。"); return; }
      const slideId = start.deck.slides[start.current].id;
      const stillHere = () => { const now = useStore.getState(); return now.deckPath === start.deckPath && now.deck?.slides[now.current]?.id === slideId; };
      setBusy(true);
      try {
        const file = await pickWidgetFile();
        if (!file) return;
        if (!stillHere()) { setError(`資料が切り替わりました。追加先の${unitName(start.deck)}でもう一度選んでください。`); return; }
        const src = await importAsset(start.deckDir, file);
        if (!stillHere()) { setError("資料が切り替わったため、配置を中止しました。"); return; }
        if (elementId) useStore.getState().patchElement(elementId, { src });
        else {
          // 本文の幅いっぱい(左右の余白の内側)に置く。スライドは (60, 180, 1160, 440)
          const format = deckFormat(start.deck), margin = PAGE_MARGIN[format];
          useStore.getState().addElement({ id: newId("widget"), type: "embed", src, title: basename(file).replace(/\.html?$/i, ""),
            x: margin, y: format === "note" ? 188 : 180, w: canvasSize(start.deck).w - margin * 2, h: 440 });
        }
      } catch { setError("HTMLを追加できませんでした。ファイルと資料の保存先を確認して、もう一度選んでください。"); }
      finally { setBusy(false); }
    }}><Icon name="widget" />{busy ? "読み込み中…" : elementId ? "HTMLを差し替える" : "動く図解"}</button>
    {error && <span className="widget-file-error" role="alert">{error}<button onClick={() => setError("")} aria-label="HTML追加の案内を閉じる">×</button></span>}
  </span>;
}
