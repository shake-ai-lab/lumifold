import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { canvasSize, type Deck } from "../model/deck";
import { Slide } from "../render/Slide";
import { useStore } from "../store";
import { basename, dirname, inTauri, joinPath, pickExportFile, safeFileName, writeBinaryFile } from "../tauri";
import { ContextMenu, type MenuState } from "./ContextMenu";
import { Icon } from "./Icon";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** ブラウザ(描画確認用)ではダウンロードで渡す */
function download(name: string, base64: string, type: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.style.display = "none";
  document.body.append(a); // ページに無いリンクのクリックではダウンロードが始まらない環境がある
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * 書き出し: PowerPoint(.pptx、文字・図形・表・グラフは編集できる形)と PDF(印刷ダイアログの「PDF に保存」)。
 * PDF は全スライドを論理キャンバスの大きさ(1280x720、ノートは 768x1024)で 1 ページずつ並べた印刷用の面を作ってから印刷する。
 */
export function ExportActions() {
  const deck = useStore((s) => s.deck);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);

  const exportPptx = async () => {
    const { deck, deckDir, deckPath, flash } = useStore.getState();
    if (!deck) return;
    const name = safeFileName(deck.meta?.title || (deckPath && basename(deckPath).replace(/\.(deck|json)$/i, "")) || "資料");
    setBusy(true);
    try {
      const target = inTauri() ? await pickExportFile(deckPath ? joinPath(dirname(deckPath), `${name}.pptx`) : `${name}.pptx`, "PowerPoint", "pptx") : null;
      if (inTauri() && !target) return;
      const { buildPptx } = await import("../export/pptx"); // 書き出すときだけ読み込む(pptxgenjs は大きい)
      const { base64, report } = await buildPptx(deck, deckDir);
      if (target) await writeBinaryFile(target, base64);
      else download(`${name}.pptx`, base64, PPTX_MIME);
      if (report.warnings.length) console.warn("pptx 書き出しの警告", report.warnings);
      flash(report.warnings.length ? `PowerPoint に書き出しました(書き出せなかった要素 ${report.warnings.length} 個。詳細は開発者ツール)` : "PowerPoint に書き出しました", 5000);
    } catch (error) {
      flash(`書き出せませんでした: ${String(error).replace(/^Error: /, "")}`, 6000);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!printing) return;
    const finish = () => setPrinting(false);
    window.addEventListener("afterprint", finish, { once: true });
    // グラフ・数式・画像の描画を待ってから印刷する
    const timer = window.setTimeout(() => { void document.fonts.ready.then(() => window.print()); }, 800);
    return () => { window.clearTimeout(timer); window.removeEventListener("afterprint", finish); };
  }, [printing]);

  return <>
    <button disabled={!deck || busy || printing} aria-haspopup="menu" aria-expanded={!!menu} title="PowerPoint や PDF に書き出す"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setMenu({ x: r.left, y: r.bottom + 6, items: [
          { label: "PowerPoint(.pptx)", onClick: () => void exportPptx() },
          { label: "PDF(印刷から保存)", onClick: () => setPrinting(true) },
        ] });
      }}><Icon name="export" />{busy ? "書き出し中…" : printing ? "印刷の準備中…" : "書き出し"}<Icon name="chevron" className="control-chevron" /></button>
    <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    {printing && deck && <PrintDeck deck={deck} />}
  </>;
}

/** 印刷用: 全スライドを論理キャンバスの大きさで 1 ページずつ。画面では見えない場所に置き、印刷のときだけ出す */
function PrintDeck({ deck }: { deck: Deck }) {
  const { w, h } = canvasSize(deck);
  return createPortal(<div className="print-root" aria-hidden>
    <style>{`@page { size: ${w}px ${h}px; margin: 0; }`}</style>
    {deck.slides.map((slide, i) => <div key={slide.id} className="print-page" style={{ width: w, height: h }}><Slide deck={deck} slide={slide} scale={1} static pageIndex={i} /></div>)}
  </div>, document.body);
}
