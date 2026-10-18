// Tauri(Rust 側)との境界。OS・ファイルに触るのはここだけ。
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Deck } from "./model/deck";

// 作業中の資料はテキストの .deck(中身は deck.json と同じ)。旧来の deck.json も開ける
const DECK_FILTERS = [{ name: "Lumifold 資料", extensions: ["deck"] }, { name: "deck.json(旧形式)", extensions: ["json"] }];

export async function pickSaveFile(defaultPath = "資料.deck"): Promise<string | null> {
  return save({ title: "資料の保存先", defaultPath, filters: DECK_FILTERS });
}

export async function pickPackageFile(defaultPath: string): Promise<string | null> {
  return save({ title: "まとめたファイルの保存先", defaultPath, filters: [{ name: "Lumifold 資料(1ファイル)", extensions: ["deck"] }] });
}

/** 資料がファイルとして参照しているもの(画像・ウィジェット・コメントの画像)の src を置き換えたコピーを返す */
async function mapFileSources(deck: Deck, map: (src: string) => string | Promise<string>): Promise<Deck> {
  const copy = structuredClone(deck);
  const file = async (src: string) => (/^(data:|https?:)/i.test(src) ? src : map(src));
  for (const slide of copy.slides) for (const el of slide.elements) {
    if (el.type === "image" || el.type === "embed") el.src = await file(el.src);
    for (const comment of el.comments ?? []) for (const image of comment.images ?? []) image.src = await file(image.src);
  }
  return copy;
}

/** Copy only assets referenced by this document; embedded HTML is self-contained. */
export async function copyDeckAssets(deck: Deck, from: string, to: string): Promise<Deck> {
  if (samePath(from, to)) return structuredClone(deck);
  const copied = new Map<string, string>();
  return mapFileSources(deck, async (src) => {
    if (!copied.has(src)) copied.set(src, await importAsset(to, joinPath(from, src)));
    return copied.get(src)!;
  });
}

/**
 * 資料を 1 ファイル(中身が zip の .deck)にまとめる。参照している画像・ウィジェットだけを入れ、
 * フォルダの外を指すもの(../ や絶対パス)は assets/ に入れ直して参照を書き換える。
 * 戻り値は見つからずに入れられなかったファイル(資料からの相対パス)。
 */
export async function packDeck(deck: Deck, deckPath: string, out: string): Promise<string[]> {
  const deckDir = dirname(deckPath);
  const entries: { name: string; src: string }[] = [];
  const names = new Map<string, string>(); // 正規化した参照 → zip の中の名前
  const used = new Set<string>();
  const packed = await mapFileSources(deck, (src) => {
    const rel = src.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
    const key = rel.toLowerCase();
    if (names.has(key)) return names.get(key)!;
    const inside = !/^(?:[a-z]:|\/)/i.test(rel) && rel.split("/").every((p) => p && p !== "." && p !== "..");
    let name = rel;
    if (!inside || used.has(key)) {
      const base = rel.split("/").pop() || "file";
      const dot = base.lastIndexOf(".");
      const [stem, ext] = dot > 0 ? [base.slice(0, dot), base.slice(dot)] : [base, ""];
      name = `assets/${base}`;
      for (let i = 1; used.has(name.toLowerCase()); i++) name = `assets/${stem}-${i}${ext}`;
    }
    used.add(name.toLowerCase());
    names.set(key, name);
    entries.push({ name, src: joinPath(deckDir, src) });
    return name;
  });
  const text = JSON.stringify(packed, null, 2) + "\n";
  return invoke<string[]>("pack_deck", { out, text, entries, deckPath });
}

/** 開く前の下ごしらえ。まとめたファイル(zip)なら隣のフォルダに展開し、展開した本文のパスを返す */
export async function prepareDeck(path: string): Promise<{ path: string; unpacked: boolean }> {
  if (!inTauri()) return { path, unpacked: false };
  return invoke<{ path: string; unpacked: boolean }>("prepare_deck", { path });
}

export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function pickDeckFile(): Promise<string | null> {
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Lumifold 資料", extensions: ["deck", "json"] }],
  });
  return typeof picked === "string" ? picked : null;
}

export async function pickWidgetFile(): Promise<string | null> {
  const picked = await open({ title: "ウィジェットのHTMLを選ぶ", multiple: false, directory: false,
    filters: [{ name: "自己完結したHTML", extensions: ["html", "htm"] }] });
  return typeof picked === "string" ? picked : null;
}

/** 起動引数または環境変数で指定されたデッキ(無ければ null) */
export async function initialDeck(): Promise<string | null> {
  if (!inTauri()) return null;
  return (await invoke<string | null>("initial_deck")) ?? null;
}

export async function readDeck(path: string): Promise<string> {
  if (!inTauri()) {
    // ブラウザで vite dev を直接開いたとき(描画確認用)。vite がプロジェクト直下のファイルを配信する
    const res = await fetch(path, { cache: "no-store" }); // 再読込で古い内容をつかまない
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.text();
  }
  return invoke<string>("read_deck", { path });
}

/** デッキフォルダ内のテキストファイル(ウィジェットの HTML など)を読む */
export function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_deck", { path });
}

export async function writeDeck(path: string, text: string): Promise<void> {
  if (!inTauri()) {
    console.info("[browser mode] write skipped:", path, `${text.length} bytes`);
    return;
  }
  return invoke<void>("write_deck", { path, text });
}

export function readAsset(path: string): Promise<string> {
  return invoke<string>("read_asset", { path });
}

/** 画像ファイルを選ぶ(Tauri のみ)。ブラウザでは null */
export async function pickImageFile(): Promise<string | null> {
  if (!inTauri()) return null;
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "画像", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
  });
  return typeof picked === "string" ? picked : null;
}

/** 手元の画像をデッキの assets/ にコピーし、デッキからの相対パスを返す */
export function importAsset(deckDir: string, src: string): Promise<string> {
  return invoke<string>("import_asset", { deckDir, src });
}

/** 貼り付けた画像などのバイト列を assets/ に書き、相対パスを返す */
export function writeAsset(deckDir: string, name: string, dataBase64: string): Promise<string> {
  return invoke<string>("write_asset", { deckDir, name, dataBase64 });
}

/** 外から書き換えられる直前の本文を deck と同じフォルダの .history/ に残し、そのパスを返す。ブラウザでは残さない */
export async function backupDeck(path: string, text: string): Promise<string | null> {
  if (!inTauri()) return null;
  return invoke<string>("backup_deck", { path, text });
}

export async function watchDeck(path: string): Promise<void> {
  if (!inTauri()) return;
  return invoke<void>("watch_deck", { path });
}

export function onDeckChanged(handler: (path: string) => void): Promise<UnlistenFn> {
  return listen<string>("deck-changed", (e) => handler(e.payload));
}

/** 資料フォルダの中の画像・ウィジェットなどが書き換わった(本文と .history/ は除く) */
export function onAssetsChanged(handler: (paths: string[]) => void): Promise<UnlistenFn> {
  return listen<string[]>("assets-changed", (e) => handler(e.payload));
}

/**
 * listen の登録を effect の後始末で外す関数を返す。登録は非同期なので、終わる前に後始末が来たとき
 * (開発版の StrictMode の付け外しなど)は、登録が終わった時点で外す。残すと 1 回の変更を 2 回処理する
 */
export function unlistenLater(registration: Promise<UnlistenFn>): () => void {
  let disposed = false;
  let unlisten: UnlistenFn | undefined;
  void registration.then((u) => (disposed ? u() : (unlisten = u)));
  return () => {
    disposed = true;
    unlisten?.();
  };
}

/** Windows / POSIX どちらの区切りでも親ディレクトリを返す */
export function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i < 0 ? "." : path.slice(0, i);
}

/** Windows / POSIX どちらの区切りでもファイル名(最後の部分)を返す */
export function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? "";
}

/** ファイル名に使えない文字(Windows)を _ に置き換える */
export function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_");
}

/** 同じファイルを指すか。区切り文字と大文字・小文字の違いは無視する(Windows のパス) */
export function samePath(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
  return norm(a) === norm(b);
}

export function joinPath(dir: string, rel: string): string {
  if (/^(?:[a-z]:[\\/]|[\\/]{2}|\/)/i.test(rel)) return rel;
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.replace(/[\\/]+$/, "") + sep + rel.replace(/^[\\/]+/, "").replace(/\//g, sep);
}

/** 書き出し(pptx など)の保存先を選ぶ。ブラウザでは null(ダウンロードで渡す) */
export async function pickExportFile(defaultPath: string, label: string, ext: string): Promise<string | null> {
  if (!inTauri()) return null;
  return save({ title: "書き出し先", defaultPath, filters: [{ name: label, extensions: [ext] }] });
}

/** 書き出したファイル(base64)を書く。一時ファイルに書いてから置き換える */
export async function writeBinaryFile(path: string, dataBase64: string): Promise<void> {
  return invoke<void>("write_binary", { path, dataBase64 });
}
