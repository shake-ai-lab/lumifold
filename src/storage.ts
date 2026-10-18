// 画面の設定(パネル幅・表示の選択・最後に開いた資料)の記憶。
// localStorage が使えない環境(プライベートモードなど)では記憶しないだけで、動作は続ける。

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 記憶できなくても動作は続ける */
  }
}
