// 画像のデータの扱い(画像の追加・コメントの画像・pptx の書き出し・数式の画像化で共有)

/** Blob(選んだファイルや取得した画像)を data URL にする */
export function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** 画像の元の大きさ(px)。読めないときや、寸法を持たない SVG は fallback */
export function naturalSize(url: string, fallback: { w: number; h: number }): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || fallback.w, h: img.naturalHeight || fallback.h });
    img.onerror = () => resolve(fallback);
    img.src = url;
  });
}
