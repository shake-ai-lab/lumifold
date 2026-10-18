import { canvasSize, unitName, type ImageElement } from "../model/deck";
import { newId } from "../model/ids";
import { useStore } from "../store";
import { basename, importAsset, inTauri, joinPath, readAsset, writeAsset } from "../tauri";
import { naturalSize as sizeOf, readDataUrl } from "../imageData";

/**
 * 画像を資料に入れる。デスクトップ版はデッキの assets/ にコピーして相対パスで参照する。
 * ブラウザ(描画確認用)はファイルを書けないので data URL で入れる。
 * 大きさは元画像の縦横比のまま、スライドの半分ほど(スライドは最大 640x405、ノートは 384x576)に収め、指定の位置(なければ中央)に置く。
 */
const naturalSize = (url: string) => sizeOf(url, { w: 400, h: 300 }); // 寸法の無い SVG は 400x300

/** 画像を資料に保存して参照(src)を返す。デスクトップ版は deckDir の assets/ に書いた相対パス、ブラウザは data URL のまま */
export async function storeImage(deckDir: string | null, name: string, data: string): Promise<string> {
  return inTauri() && deckDir ? writeAsset(deckDir, name, data.slice(data.indexOf(",") + 1)) : data;
}

function place(size: { w: number; h: number }, at?: { x: number; y: number }) {
  const canvas = canvasSize(useStore.getState().deck);
  const k = Math.min(1, (canvas.w / 2) / size.w, (canvas.h * 0.5625) / size.h);
  const w = Math.max(8, Math.round(size.w * k)), h = Math.max(8, Math.round(size.h * k));
  const cx = at?.x ?? canvas.w / 2, cy = at?.y ?? canvas.h / 2;
  return { x: Math.round(Math.min(Math.max(cx - w / 2, 0), canvas.w - w)), y: Math.round(Math.min(Math.max(cy - h / 2, 0), canvas.h - h)), w, h };
}

export const isImageFile = (file: File) => /^image\//.test(file.type);

async function fromFile(file: File, at?: { x: number; y: number }): Promise<ImageElement> {
  const data = await readDataUrl(file);
  const src = await storeImage(useStore.getState().deckDir, file.name || `image-${Date.now()}.png`, data);
  return { id: newId("image"), type: "image", src, name: file.name || "貼り付けた画像", fit: "fill", ...place(await naturalSize(data), at) };
}

/** 貼り付け・ドロップ・ファイル選択で受け取った画像を、現在のスライドに入れる。入れた数を返す */
export async function insertImageFiles(files: File[], at?: { x: number; y: number }): Promise<number> {
  const images = files.filter(isImageFile);
  if (!images.length) return 0;
  const slideId = useStore.getState().deck?.slides[useStore.getState().current]?.id;
  try {
    const els = [];
    for (const [i, file] of images.entries()) els.push(await fromFile(file, at && { x: at.x + i * 24, y: at.y + i * 24 }));
    const state = useStore.getState();
    if (state.deck?.slides[state.current]?.id !== slideId) { state.flash(`${unitName(state.deck)}が切り替わったため、画像を入れませんでした`); return 0; }
    state.addElements(els); // 入れた画像が選択される
    return els.length;
  } catch (error) {
    useStore.getState().flash(`画像を入れられませんでした: ${String(error).replace(/^Error: /, "")}`);
    return 0;
  }
}

/** デスクトップ版のファイル選択で選んだ画像(絶対パス)を入れる */
export async function insertImagePath(path: string): Promise<void> {
  const { deckDir } = useStore.getState();
  if (!deckDir) { useStore.getState().flash("資料を保存してから画像を入れてください"); return; }
  try {
    const src = await importAsset(deckDir, path);
    const size = await naturalSize(await readAsset(joinPath(deckDir, src)));
    const el: ImageElement = { id: newId("image"), type: "image", src, name: basename(path), fit: "fill", ...place(size) };
    useStore.getState().addElement(el);
  } catch (error) {
    useStore.getState().flash(`画像を入れられませんでした: ${String(error).replace(/^Error: /, "")}`);
  }
}
