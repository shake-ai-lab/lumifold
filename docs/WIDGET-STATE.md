# ウィジェットの一時状態

対応HTMLは、親ウィンドウと次のメッセージで状態を共有できる。sandboxは従来どおり `allow-scripts` のみで、親DOMへのアクセスは許可しない。

1. HTMLが入力初期化後に `{ type: "deck-studio:widget-ready" }` を `parent.postMessage(message, "*")` で送る。
2. 親は同じiframeへ `{ type: "deck-studio:widget-restore", state: objectOrNull }` を返す。
3. HTMLは `event.source === parent` を確認し、数値範囲などを検証して復元する。復元自体は状態更新を送信しない。
4. 利用者が変更したとき、HTMLは `{ type: "deck-studio:widget-state", state: serializableObject }` を送る。

親は送信元が当該iframeである場合だけ受け付ける。サムネイルは参加しない。キーは資料パス・要素ID・HTML参照の組み合わせ。最大100要素、各JSON文字列131072文字までをメモリに保持する。アプリ再起動・ページ再読込後には復元しない。資料JSONへは書かず、Undo履歴にも含めない。

教材側ではリセット操作を用意し、その初期値も状態更新として送る。参照実装は `tools/fixtures/coffee-extraction/widgets/plot.template.html`。

発表時のキーは、入力にフォーカスがある場合もPgUp/PgDnでページ送り、Escで編集へ復帰する。スライダーの矢印・Home/End、ボタンのEnter/Spaceは教材側に残す。
