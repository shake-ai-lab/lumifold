import { createContext } from "react";

/**
 * スライドの拡縮(論理キャンバス 1280x720、ノートは 768x1024 → 画面)を打ち消す倍率 = 1 / scale。
 * スライドの中に置く編集用の部品(ウィジェットの操作ボタンなど)を、画面上で一定の大きさにするのに使う。
 * CSS からは編集画面に設定した --ui-scale で同じ値を参照できる。編集画面の外(サムネイル・プレゼン)では 1。
 */
export const UiScaleContext = createContext(1);
