import { useSyncExternalStore } from "react";

/**
 * 資料フォルダの中で書き換わったファイル(画像・ウィジェット)の版。Rust の "assets-changed" で上がる。
 * 描画側はファイルごとの版を見て、上がったものだけ読み直す(読み込み済みの画像を使い続けないように)
 */
const revisions = new Map<string, number>();
const listeners = new Set<() => void>();

/** 区切り文字と大文字小文字の違いを無視して比べる(Windows のパス) */
const key = (path: string) => path.replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase();

export function assetsChanged(paths: string[]): void {
  for (const p of paths) revisions.set(key(p), (revisions.get(key(p)) ?? 0) + 1);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** そのファイルの版。書き換わるたびに 1 つ上がる */
export function useAssetRevision(path: string): number {
  return useSyncExternalStore(subscribe, () => revisions.get(key(path)) ?? 0);
}
