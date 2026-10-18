import { useEffect, useState } from "react";
import type { ImageElement } from "../../model/deck";
import { useStore } from "../../store";
import { inTauri, joinPath, readAsset } from "../../tauri";
import { useAssetRevision } from "../assetRevision";

const cache = new Map<string, string>();

/** デッキフォルダ相対の画像を data URL にして表示する。Rust 側経由で読むのでスコープ設定が不要。
 *  ファイルが書き換わったら(版が上がったら)読み直す */
export function ImageEl({ el }: { el: ImageElement }) {
  const deckDir = useStore((s) => s.deckDir);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const abs = deckDir ? joinPath(deckDir, el.src) : el.src;
  const rev = useAssetRevision(abs);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    if (el.src.startsWith("data:image/")) { setSrc(el.src); return; }
    if (!inTauri()) {
      setSrc(rev ? `${abs}?v=${rev}` : abs);
      return;
    }
    const cacheKey = `${abs}#${rev}`;
    if (rev) cache.delete(`${abs}#${rev - 1}`);
    const hit = cache.get(cacheKey);
    if (hit) {
      setSrc(hit);
      return;
    }
    readAsset(abs)
      .then((url) => {
        cache.set(cacheKey, url);
        if (alive) setSrc(url);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [abs, el.src, rev]);

  if (failed) {
    return (
      <div className="image-missing">
        画像が見つかりません
        <br />
        {el.src}
      </div>
    );
  }
  if (!src) return <div className="image-loading" />;
  return (
    <img
      src={src}
      alt={el.name ?? ""}
      draggable={false}
      style={{ width: "100%", height: "100%", objectFit: el.fit ?? "contain", display: "block" }}
    />
  );
}
