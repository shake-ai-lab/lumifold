# deck-studio(製品名 Lumifold)

「メモを渡すと、ドラッグで自由に直せるスライドが出てきて、必要なら pptx にもなる」デスクトップアプリ。
Tauri v2(Rust)+ React。設計は `docs/DESIGN.md`、データ形式は `ai/schema.json`。ライセンスは MIT(`LICENSE`)。
製品名は Lumifold(画面の題名・インストーラ・実行ファイル lumifold.exe・識別子 io.github.shake-ai-lab.lumifold・crate 名 lumifold)。
フォルダ名と内部のキー(localStorage の `deck-studio.*` / `deck-studio:lastPath`、ウィジェットとの `deck-studio:*` メッセージ、環境変数 DECK_STUDIO_OPEN)は
旧名のまま(変えると保存済みの設定や既存のウィジェットが動かなくなる)。

## 進捗(2026-10-18)

- 配布の準備(2026-10-18): 第三者のライセンス文は `THIRD_PARTY_LICENSES.txt`(`npm run licenses` で作る。依存を足したら作り直す)。
  インストーラに LICENSE と一緒に入る(tauri.conf の bundle.resources)。見本の資料は decks/neural-network と decks/sd-lora、ノートの教材 decks/electrical-drawings。
  テスト用の資料は tools/fixtures/。開発者向けの準備と起動の手順は README.md
- ノート教材「はじめての電気図面」(2026-10-18): decks/electrical-drawings(42 ページ、さわれる図 5 つ: 懐中電灯・つながりを光らせる・記号図鑑とクイズ・LED と抵抗・シーケンス回路)。
  目次は外国語を学ぶ順: 地図(図面の種類)→ 文法(線と点・名前・図枠)→ 単語(記号)→ 文章(回路図・シーケンス図)→ 実務(配線図・部品表・改訂)→ まとめ。章の扉は右ページ。
  記号は widgets/_sym.js(JIS C 0617 / IEC 60617 に沿った SVG。ウィジェットと図版で共有。a 接点は可動片が上、b 接点は下へ傾いて短い線に触れる)。
  図版は tools/electrical-figures.js → tools/create-electrical-assets.mjs で PNG、本文は tools/create-electrical-deck.py で作る(見積もりで文字あふれを警告)
- Linux(2026-10-18): Debian 12 のコンテナで `npm ci` → `npx tauri build --bundles deb` → Xvfb で起動して、見本 2 つとノートの表示を確認。
  WebKitGTK は選択欄を OS の明るい配色で描くので、入力部品だけ `color-scheme: dark`(ページ全体に付けるとウィジェットの iframe の背景が不透明になる)。
  書体(Meiryo が無い)と文節改行(auto-phrase が効かない)の違いは README の「Linux での違い」

- 本番グラフ描画: `ChartEl.tsx` で Bar/Line/Pie/Doughnut の controller を明示登録。汎用 `<Chart>` は controller を登録しないため、開発時に動いていても本番の tree-shaking で落ちる。`npm run test:production` は最適化済み `dist` を配信してニューラル資料15枚と全6種類のグラフを確認する。リリース更新時はこのチェックと、実際の本番EXEでの資料オープンを確認する。
- 操作アイコン: 共通の `src/editor/Icon.tsx` (Lucide React、角丸の線画・線幅1.75) と短いラベルを併記。配置=四方向矢印、内部操作=カーソル、位置固定=ピン。整列・間隔もラベル付き。狭い画面はグループ単位で折り返し、図解の操作ボタンはアイコンとラベルを縦に並べる。装飾SVGは `aria-hidden` と `pointer-events: none`。
- M1 ビューア: **完了**。deck.json → 描画(text / shape / image / chart / table)、ファイル監視で即再描画、起動引数でデッキ指定
  - 監視は資料フォルダ全体。本文は "deck-changed"、画像・ウィジェットなどは "assets-changed"(パスの一覧。.history/ と .tmp は除く)。
    画面は src/render/assetRevision.ts のファイルごとの版を見て、変わった画像・ウィジェットだけ読み直す(読み込み済みの画像を使い続けない)
- M2.5 インタラクティブ要素(`embed`): **完了**。デッキフォルダ内の自己完結 HTML を sandbox iframe で動かす。編集時は右上の小さなアイコンで配置・操作・固定を切り替える（ホバー時のみ表示、タイトルバーなし）。固定すると内部操作へ自動移行し枠を隠す。サムネイルにも実際の内容を表示し、画面外の iframe は解除、プレビューのアニメーションは低頻度に制限。pptx では静止画にする予定
- M2 ドラッグ編集: **完了**。選択(クリック / Shift / マーキー)、移動・リサイズ・回転、スナップ、ダブルクリックで文字編集、
  undo / redo、矢印キー微調整、複製・削除、前面/背面、要素追加(テキスト・図形)、スライド追加/削除/並べ替え、
  右パネルで属性編集、400ms 後に deck.json へ自動保存(atomic rename)。自分の書き込みは再読込しない(本文一致で判定)
  - 外部(Claude Code など)の書き換えは、上部の帯で要約(スライド・要素の変更/追加/削除)し、一覧に「更新」「追加」、スライド上の変わった要素に点線枠を出す。
    「変更箇所へ」で順に移動、「元に戻す」で最初の書き換えの前へ(続けて書き換えられたらまとめる。その後に人が編集したら Ctrl+Z で順に戻す)。
    取り込む直前の版は Rust の backup_deck で同じフォルダの .history/ に残す(30 世代)。差分は src/model/diff.ts
  - 文字編集は表示と同じ書式・背景を維持。右クリックからサイズ・色・太字・斜体を全体または選択文字に適用。座標欄は「位置・サイズの詳細」に折りたたみ。
  - プレゼン開始で編集 UI を隠す。矢印/PageUp/PageDown・画面下のボタンで移動、Esc で編集に戻る。全画面表示にも対応。
  - 表はセルのダブルクリック、右クリック、右パネルから直接編集。表示書式を維持し、Tab 移動、行列追加・削除、確定・取消に対応。
  - 上部は挿入・履歴・スライド操作に整理。「一覧」「設定」で左右パネルを切替可能。全要素の右クリックにコピー・貼り付け・複製・重なり順・固定を用意し、サムネイルの右クリックでスライドを操作。
  - 「位置を固定」は位置・大きさ・削除を守る(クリックで選ばれない、右パネルの位置欄も無効)。文字・表・数式の中身と書式は編集できる(固定ウィジェットの中身を操作できるのと同じ考え)。
  - 複数選択の右パネルで、背景色・不透明度・文字サイズ/太字/文字色・塗り/線・位置を固定をまとめて変える。そろっていない値は「混在」。1 回の Ctrl+Z で戻る。
  - スライド一覧の番号はサムネイルの外(左)に置く(THUMB_GUTTER)
  - 上部の要素ツールバーから整列・等間隔配置・重なり順・複製・削除(共通のアイコンと短いラベル、ツールチップと読み上げ名)。右パネルを閉じても操作可能。表示切替とプレゼン開始は操作列の右側、狭い画面ではラベルを保って折り返す。起動時の幅が 1100px 未満ならスライド一覧は閉じて始める。複数選択の重なり順は相対順を保ち、1回の undo で戻る。右パネルの数値は Enter / blur で確定、Esc で取消。Ctrl+C/X/V/A と F2 に対応し、操作案内は下部に表示。
  - 左右パネルは境界をドラッグして幅を変更（保存、ダブルクリックで初期幅）。空の箇条書きで Enter、行頭で Backspace は箇条書き解除。Shift+Enter は同じ段落内の改行。
  - 図形ギャラリー、矢印の線幅・先端寸法、端点ドラッグ、直線で構成される図形の編集点（移動・追加・削除）。サイズ変更中も中身を描画し、スナップ数値は非表示。
    編集点の編集は表示と同じ線の位置・角の形で始まり、確定すると多角形（points、角の形は lineJoin）になっても見た目は変わらない。
  - 文字の編集枠は表示と同じ上下位置から始まる（はみ出していれば表示と同じ部分を見せてスクロール可）。「はみ出し」判定と「枠を内容に合わせる」は段落の並びの高さで測る。
  - 表は列幅を全幅に比例させて枠に収める。編集中の列境界ドラッグ、TSV 貼り付け、文字を収める操作に対応。
  - 自由な色・カラーコード・スポイト、全要素の背景色。スポイトは Chromium の EyeDropper API を使用し、未対応環境では無効化。
  - オブジェクトごとの画像付きコメントを elements[].comments に保存。AI 用の読み方と修正手順は `ai/COMMENTS.md`。アプリ内から AI への自動送信はせず、未解決コメントを修正依頼としてコピー可能。
  - `math` 要素に TeX 数式を保存、KaTeX でリアルタイム表示。ダブルクリック/F2 で編集、Ctrl+Enter 確定、Esc 取消。一般の LaTeX 文書コンパイルではなく数式表示。
    編集パネルは数式のすぐ下(入らなければ上)にスライド領域内で出し、右パネルに重ねない。挿入ボタンはカーソル位置に入れ(選択中の文字は中身になる)、書き方の誤りは日本語で出す。
  - 文字と表の改行は日本語の文節単位(`TEXT_WRAP`: `word-break: auto-phrase` + `line-break: strict`。WebView2 / Edge 119+)。pptx では PowerPoint の改行規則になるので M3 で扱いを決める。
  - 発表者ノート(右パネル、スライドを選んでいないとき。欄を離れたときに 1 回保存)。プレゼン中に P で発表者ビュー(今のスライド・次のスライド・ノート・経過時間・時計)。
  - スライドの型(＋追加 ▾): 空白・表紙・区切り・見出しと本文・2 カラム・カード 3 枚・手順 4 つ・グラフと結論・表・数字 3 つ。定義は src/editor/layouts.ts(テーマ色名だけで書く)。
  - 画像の追加: 挿入の「画像」(デスクトップ版は assets/ にコピー、ブラウザは data URL)、貼り付け(システムのクリップボードに画像があれば優先)、ドロップ(落とした位置が中心)。
    tauri.conf の dragDropEnabled は false(Tauri にファイルのドロップを横取りさせず、画面の drop イベントで受ける)。縦横比を保ち最大 640x405。
  - グラフのデータ編集(ChartDataDialog): 右パネル「データを編集」・右クリック・ダブルクリック。Excel の表を貼れる、全角数字も読む、数値でないセルは赤枠で適用不可。
  - 拡大縮小は PowerPoint と同じ: 画像(と画像を含むグループ)は角のつまみで縦横比を保ち、Shift で外す。ほかの要素は角で自由、Shift で保つ。辺のつまみは片方向だけ。
    新しく入れる画像の収め方は「引き伸ばす」(fill)。グループの要素をクリックするとグループ全体を選び、もう一度クリックで中の要素(同じグループ内の別の要素へはそのまま移る)。
    Shift+クリックの追加・解除はグループ単位。グループはまとめて伸縮する(文字の大きさ・線幅は変えない、回転した直線は両端を写す。src/editor/scale.ts)。回転はグループでは不可
  - 未対応: グループ化・解除の操作(store の groupSelected / ungroupSelected はあるが UI が無い)
- 資料ファイル `.deck`(2026-10-17): **完了**。作業中は `資料名/資料名.deck`(中身は deck.json と同じテキストの JSON。旧名 `deck.json` も開ける)+ assets/ + widgets/。
  人に渡すときは上部の「1ファイルにまとめる」で、参照している画像・ウィジェット(コメントの画像も)だけを zip 1 つ(拡張子 `.deck`、本文は中で `deck.json`)に入れる。フォルダの外を指す画像は assets/ に入れ直す。
  まとめたファイルを開くと隣の `資料名/`(あれば `資料名 (2)/` …)に展開して開く。同じファイル(場所・大きさ・更新時刻が同じ)なら展開済みのフォルダを開く(印は `.deck-source.json`)。
  作業中のフォルダの隣にまとめたとき(`decks/x/` → `decks/x.deck`)は元のフォルダに印を付け、そのファイルを開くと元の本文(旧名 deck.json でも)を開く。
  テキストか zip かは先頭 4 バイト(`PK\x03\x04`)で判別。Rust の prepare_deck / pack_deck、展開は ../ や絶対パスの名前を拒否し 2 GB・1 万ファイルが上限
- ノート形式(2026-10-17): **初版**。資料の種類 `format: "note"`(省略時 `slides`)で、縦 3:4 の 768x1024 のページになる(Kindle の画面と同じ比率、見開きで 3:2)。
  大きさは `canvasSize(deck)`(src/model/deck.ts)で引く。CANVAS_W/H はスライドの既定値としてだけ残す。画面の言葉は `unitName(deck)`(スライド / ページ)。
  - 編集は今までと同じ。右パネル(何も選んでいないとき)の「資料の種類」か「新規資料」で選ぶ。切り替えは PowerPoint の「サイズに合わせて調整」と同じく、
    全ページの中身を縦横比を保って縮めて中央へ(文字・線幅も同じ倍率。src/model/format.ts)。1 回の Ctrl+Z で戻る。
    元の種類に戻すと縮尺と余白も戻る(変換前の種類を `formatOrigin` に残す)。ノートの型は layouts.ts の NOTE_LAYOUTS
  - 「読む」(src/Reader.tsx): 単ページ / 見開き(表紙は右に 1 枚、以降 2-3, 4-5 …。選んだ表示は記憶、初回は画面が横長なら見開き)。
    紙の角をつまんでドラッグ(3 割引くか払えばめくる、足りなければ戻る)、ページの外側の端(幅の 2 割)と本の外のクリック(見開きは押したページの側、単ページはとじ目側の端で戻る。本文の上のクリックではめくらない。src/Reader.tsx の clickTurn)、← → / PgUp / PgDn / Space、ホイール。
    角にマウスを近づけると少しめくれる。めくりの途中で次を押すと前のめくりを終えて次へ、Esc もめくり終えてから戻る。動きを減らす設定ではめくらずに切り替える
  - めくりの形は src/render/pageTurn.ts: 角 C を P まで引くと折り目は CP の垂直二等分線。表は clip-path、裏は折り目での鏡映の matrix。
    陰は 4 つ(表の折り目付近・裏の丸み・下のページに落ちる影・裏の drop-shadow)と、見開きのとじ目の陰・紙の束の厚み。
    単ページの紙の裏は同じページを左右反転して紙の色(lt1)を 86% 重ねる(裏写り)。単ページで戻るときは、前のページを「めくり終えた状態」から返す
  - ページの DOM はページ順に並べ、役割(表・裏・下)は style だけで変える(並べ替えると iframe が読み込み直される)。PageContent は memo
  - pptx は 8 x 10.667 inch、PDF は 768x1024 px の紙。発表者ノート欄はノートでは「メモ」(読む画面には出ない)
  - 試験用の資料: tools/fixtures/note-demo(tools/create-note-demo-deck.py で生成)。テスト: tools/e2e-note.mjs(途中の画面は tools/shots-note/)
  - 右綴じ(2026-10-18): `binding: "right"`(右パネル「綴じ方」)。表紙は左に 1 枚、左ページをめくって読み進め、← が次へ、単ページのとじ目は右端。
    Reader の planTurn は左綴じで役割(表・裏・下・反対側)を決め、紙のある側だけ反転する(めくりの計算は共通)
  - ページ番号(2026-10-18): `pageNumbers: "center" | "outside"`(外側 = 見開きの外の角、スライドでは右下)、ページごとに `hidePageNumber`。
    位置と色は src/model/pageNumber.ts(画面の Slide と pptx で共有)。表紙(1 枚目)には付かない。Slide に `pageIndex` を渡したときだけ描く
  - めくる音(2026-10-18): src/render/paperSound.ts。録音ではなく Web Audio でノイズを削って作る(つまむ「カサッ」・めくる「ふぁさっ」・着地の「ぱさっ」、毎回少し揺らぐ)。
    読む画面の「めくる音」で切り替え、選択は localStorage に記憶(既定は鳴らす)。テストは AudioBufferSourceNode.start の呼び出しを数える
  - 未対応: 縦書きの文字(右綴じの本で本文を縦に組む)
- M3 pptx / PDF 書き出し: **初版**。ヘッダーの「書き出し ▾」。src/export/pptx.ts(pptxgenjs、書き出すときだけ読み込む)
  - 文字(段落・書式・箇条書き・行間)・図形(PowerPoint の図形、矢印・山形・吹き出し・自由な図形は頂点で)・表・グラフはネイティブ要素。数式は画像(src/export/rasterize.ts、KaTeX を SVG→PNG)。
    ウィジェットは題名入りの枠。発表者ノートも入る。座標は 96px = 1inch、線幅・余白は px×0.75 pt。
  - PDF は全スライドを 1280x720 で並べた印刷用の面(.print-root)を作り、印刷ダイアログの「PDF に保存」で出す。
  - pptx の見た目は python-pptx での中身の突き合わせ(tools/check-pptx.py)までしか確かめていない。PowerPoint で開いての確認が必要。
    PowerPoint では日本語の改行規則が違う(文節改行は無い)ので、枠ぎりぎりの文はあふれることがある。
- M4 Claude Code 連携(レイアウト型・スキル): 未着手
- M5 アプリ内 AI(API キー): 未着手
- M6 パッケージング: 未着手(`.deck` のダブルクリックで開く関連付け `bundle.fileAssociations` もここで。起動引数 1 つ目で受け取る作りは済み)

## 構成

```
src/                 React フロント(画面)
  model/deck.ts      データモデルと色解決。ai/schema.json と対応を保つ
  model/format.ts    資料の種類の切り替え(スライド ⇔ ノート。中身を縮めて中央へ)
  model/defaults.ts  書いていない属性の既定値(文字の大きさ・行間・表と数式の文字・図形の塗りと線・左右の余白)。画面・pptx・種類の切り替え・右パネルで共有する
  model/selection.ts グループへの選択の広げ方・複製・整列の単位(純粋な関数)。model/ids.ts は id の採番
  render/            Slide.tsx + elements/*  描画。論理キャンバス(1280x720、ノートは 768x1024)を CSS transform で拡縮
                     pageTurn.ts はノートのページめくりの形(折り目・表と裏の切り抜き・裏の写し方)、paperSound.ts はめくる音
  model/pageNumber.ts 自動のページ番号の位置・色(画面と pptx で共有)
  store.ts           zustand。開く / 再読込 / 現在スライド / 自動保存。undo・redo は store の undo() / redo() から(戻した後に表示中のスライドと選択を合わせる)
  storage.ts         localStorage の読み書き(使えない環境では記憶しないだけ)。keyboard.ts は「文字入力中か」の判定、imageData.ts は data URL と画像の大きさ
  Presentation.tsx   スライドのプレゼン画面。Reader.tsx はノートの読む画面(単ページ / 見開き、ページめくり)
  tauri.ts           Rust との境界。OS・ファイルに触るのはここだけ
src-tauri/           Rust(ファイル読み書き、監視、起動引数)。画面の都合は知らない。lib.rs(読み書き・画像・控え)、package.rs(1 ファイルにまとめる・展開)、watch.rs(監視)
ai/schema.json       deck.json の JSON Schema(AI 生成と検証で共有)
decks/<name>/<name>.deck  デッキ(中身は JSON。既存のデッキは旧名 deck.json のまま)。画像は同じフォルダの assets/ に置き相対パスで参照
                     見本は neural-network(15 枚)と sd-lora(5 枚)、ノートの教材 electrical-drawings(42 ページ)、
                     このアプリ自身の技術解説ノート lumifold-codex(60 ページ。版・依存の数・コマンド名を本文に書いているので、変えたら作り直す)
tools/fixtures/      テスト用の資料: demo(ほとんどのテストの土台)・note-demo・coffee-extraction(数式とウィジェット)・authoring-review・_e2e(本物のアプリ用)。
                     external/ と consistency/ はテストが毎回作り直す。tools/e2e-export と ui-audit は名前を fixtures → decks の順に探す
  editor/            Editor.tsx(Moveable + Selecto)、useEditorKeys.ts(キー操作・貼り付け)、elementMenu.tsx(要素の右クリック)、
                     editOverlay.tsx(編集中の面の選び分け)、TextEditOverlay、PropertiesPanel、Toolbar
tools/shot.mjs       描画確認: vite dev を Edge(Playwright)で開いて各スライドを PNG に撮る
tools/e2e-editor.mjs 編集操作の自動テスト(ブラウザモード。ドラッグ量・undo・文字編集・グループ移動などを検証)
tools/e2e-editor-ux.mjs メニュー、数値確定、複数選択整列、スライド複製、狭い画面とパネル切替の確認
tools/e2e-thumbnails.mjs ウィジェットの縮小描画、一覧からの選択、画面外の停止、再表示、読込エラーの確認
tools/e2e-editing-expansion.mjs 箇条書き、図形のライブリサイズ・編集点・端点、パネル幅、ウィジェット固定、色、表、画像付きコメント、TeX
tools/e2e-math-edit.mjs 数式の編集パネル(右パネル・数式・画面外に重ならない置き場所、挿入と Ctrl+Z、日本語のエラー、確定・取消、狭い画面)
tools/e2e-external-change.mjs 外部の書き換えの帯・一覧の印・点線枠・まとめ・元に戻す(tools/fixtures/external/ を毎回作り直す)
tools/e2e-multi-lock.mjs 複数選択の右パネル、位置を固定(中身は編集できる・位置は守る)、一覧の番号
tools/e2e-resize.mjs 画像の角は縦横比を保つ・Shift・辺、図形の Shift、グループの選択(1 回目は全体・2 回目は中)とまとめての伸縮・1 回の undo、回転した直線を含むグループ
tools/e2e-authoring-tools.mjs 発表者ノート・発表者ビュー、スライドの型、画像(選択・貼り付け・ドロップ)、グラフのデータ編集
tools/e2e-export.mjs [デッキ名…]  pptx(ダウンロード → tools/check-pptx.py で deck.json と突き合わせ、数式画像を取り出す)と PDF(ページ数)。出力は tools/out-export/
tools/ui-audit.mjs   編集画面の 68 状態(要素種別ごとの選択・各エディタ・メニュー・ダイアログ・プレゼン・パネル幅・3 つの画面幅)を巡回し、操作部品が他に隠れる・浮いた UI のはみ出し・文字切れ・ページのはみ出しを検出。
                     画像は tools/shots-ui-audit/。`node tools/ui-audit.mjs [状態名の一部…] [--strict]`。画面を変えたら回し、FAIL 0 を保つ
tools/e2e-bugs.mjs   バグ再現テスト 1(未選択テキストの dblclick、固定要素、undo 後の保存、hex 色、パネル上のドラッグ)
tools/e2e-bugs2.mjs  バグ再現テスト 2(回転要素の操作、グラフ種類切替、スライド操作、要素追加、複数段落、画像)
tools/e2e-embed.mjs  embed 要素の編集操作(選択→操作、バーで移動、undo)
tools/e2e-widgets.mjs <deck dir>  ウィジェット HTML 単体の動作(スライダー、学習が進む、発散、過学習)
tools/e2e-tauri.mjs  本物の Tauri ウィンドウに CDP で接続し、書き戻しと外部変更の取り込みを検証
tools/e2e-tauri-assets.mjs 本物の Tauri ウィンドウで、資料フォルダの画像・ウィジェットを外から書き換えたら読み直すこと(本文→画像の順でも)、.history では読み直さないことを検証(資料は一時フォルダに毎回作る)
tools/e2e-package.mjs 本物の Tauri ウィンドウで「1ファイルにまとめる」と展開を検証(参照の書き換え・展開済みフォルダの再利用・隣にまとめたときの元フォルダ・欠けたファイルの通知など。資料は一時フォルダに毎回作る)
tools/e2e-note.mjs   ノート形式: 編集画面の大きさ・ノートの型・種類の切り替えと Ctrl+Z、読む画面の見開き / 単ページ、ドラッグ・クリック・キー・ホイールのめくり、
                     ページ番号(外側・中央・ページごとに外す)、右綴じ、めくる音、
                     少しだけ引いたら戻る、角のめくれ、動きを減らす設定。途中の画面は tools/shots-note/
tools/create-note-demo-deck.py  tools/fixtures/note-demo(ノート形式の試験用の資料「よく眠るためのノート」、10 ページ)の生成
tools/e2e-presentation / e2e-rich-text / e2e-rich-text-edge / e2e-selection-toolbar / e2e-table-edit / e2e-zoom-format / e2e-authoring-review
                     プレゼン・文字の書式・上部の要素ツールバー・表・拡大縮小・新規資料と保存先(ブラウザモード)
tools/e2e-production.mjs  最適化済みの dist でニューラル資料とグラフを確認(`npm run test:production`)。e2e-release-smoke.mjs は release の EXE を別の WebView の場所で起動
tools/third-party-licenses.mjs  THIRD_PARTY_LICENSES.txt を作る(npm の本番依存と、本体にリンクされる Rust のクレート)。`npm run licenses`
tools/check-text-overflow.mjs <資料>  全スライドで「文字がはみ出しています」の要素を一覧にする（vite dev 起動中）
tools/e2e-state-consistency.mjs [資料…]  状態を切り替えたときの見た目のずれを全要素で検査（編集に入る・取り消す・変更なしで確定・選択・プレゼン(ノートは読む画面の単ページ)・枠合わせ・図形の確定）。
                     引数なしで試験用デッキ（tools/fixtures/consistency/、毎回作り直す）と decks/* 全部。違いは tools/shots-consistency/ に前後の画像で残る。画面を変えたら回す
tools/create-sd-lora-assets.py / create-sd-lora-deck.py / e2e-sd-lora-widgets.mjs  decks/sd-lora（Stable Diffusion と LoRA、5 枚。暗い地の「暗室」テーマ）の画像・生成・ウィジェット 4 つ
                     （noise / cfg / lora / planner）の単体テスト。cfg は 2 次元の混合ガウスで厳密なスコアを使う玩具モデル、lora は B·A をその場で勾配降下。共通は widgets/_dr.js・_darkroom.css
tools/electrical-figures.js / create-electrical-assets.mjs / create-electrical-deck.py / e2e-electrical-widgets.mjs  decks/electrical-drawings(ノート教材「はじめての電気図面」)の図版・本文の生成と、
                     ウィジェット 5 つ(flashlight / nets / symbols / led / sequence)の単体テスト。--reader を付けると vite dev 起動中に読む画面でも操作を確かめる
                     (iframe はページの拡大縮小の中にあるので、押す位置は拡大率を掛けて計算する。frameLocator の位置は親の transform を考えない)。共通は widgets/_ed.js・_ed.css・_sym.js
tools/codex-art.js / create-codex-assets.mjs / create-codex-deck.py / e2e-codex-widgets.mjs  decks/lumifold-codex(技術解説ノート「Lumifold の書庫」。羊皮紙と革の古い書庫の見た目)の
                     絵(SVG → PNG / JPEG)・本文の生成と、さわれる図 6 つ(library3d / anatomy3d は three.js、courier / desk / fold / sound)の単体テスト(--reader も)。
                     fold は src/render/pageTurn.ts、sound は src/render/paperSound.ts の計算を写している。共通は widgets/_lib.css・_lib.js・_lib3d.js
```

## コマンド

```bash
npm run dev                        # vite のみ(ブラウザで http://localhost:1420/?deck=/tools/fixtures/demo/deck.json)
npx tauri dev                      # アプリ起動。DECK_STUDIO_OPEN=<資料(.deck / deck.json)の絶対パス> で起動時に開く
npx tsc --noEmit                   # 型チェック
(cd src-tauri && cargo build)      # Rust コンパイル
(cd src-tauri && cargo test)       # Rust の単体テスト(まとめる・展開・一時ファイル・控えの名前)
npm run licenses                   # THIRD_PARTY_LICENSES.txt を作り直す(依存を変えたとき)
node tools/shot.mjs tools/shots [decks/<name>/deck.json]   # vite dev 起動中に、全スライドを PNG 化して目視確認(パスは先頭スラッシュ無し)
node tools/e2e-editor.mjs          # vite dev 起動中に、編集操作のテスト
node tools/e2e-bugs.mjs && node tools/e2e-bugs2.mjs && node tools/e2e-embed.mjs   # バグ再現テスト。画面を変えたら全部回す
node tools/e2e-widgets.mjs decks/neural-network   # ウィジェット単体(vite 不要、file:// で開く)
# 本物のアプリでのテスト: 下記の環境変数付きで tauri dev を起動してから
#   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
node tools/e2e-tauri.mjs           # 試験用の資料(tools/fixtures/_e2e)を一時フォルダに写して開く(開いている資料は問わない)
node tools/e2e-package.mjs         # 同じ起動状態で(開いている資料は問わない)
node tools/e2e-tauri-assets.mjs    # 同じ起動状態で(開いている資料は問わない)
# 別のアプリ本体が動いているときは WEBVIEW2_USER_DATA_FOLDER を別の場所にし、ポートも変えて CDP_URL=http://localhost:9333 を付ける
# (同じデータフォルダだと既存の WebView2 に相乗りしてポートが開かない。9222 は Chrome が使っていることがある)
```

注意: `tauri dev` は自分で vite を 1420 に立てる。別で `npm run dev` を立てたままだと起動に失敗する。
バックグラウンドで起動した vite / tauri を止めるときは、ポート 1420 の node と lumifold.exe を両方止める。

## 開発ルール

- 唯一の正はデッキの本文(`資料名.deck`、旧名 `deck.json`。中身は同じ JSON)。人(アプリ)も AI(Claude Code / API)も同じファイルを読み書きする。
  zip にまとめた `.deck` は渡すための形で、編集は展開したフォルダで行う
- 要素 id は安定させる。修正指示は id で受ける(「s6-chart を折れ線に」)
- 色はスキーム名(`dk1`, `accent1` …)で書く。hex 直書きは避ける
- 座標は 1280x720 の px、フォントは pt。pptx は 96px = 1inch で換算する
- このアプリは MIT。依存は MIT / Apache などの許容型だけにする(Tauri 経由で入る MPL-2.0・Unicode・BSD・Zlib・CC0 は可)。GPL / AGPL は使わない。
  依存を変えたら `npm run licenses` で THIRD_PARTY_LICENSES.txt を作り直す。Anthropic のスキル(~/.claude/skills)のファイルは再配布禁止なので、リポジトリにコピーしない。
  見本の資料に他人の画像を入れるときは、ライセンス(CC BY なら作者・ライセンス名と URL・加工の有無)を資料の中に書く
- アプリに claude.ai ログインは組み込まない(規約)。Pro / Max プランで使うときは Claude Code 経由にする
- 画面を変えたら `tools/shot.mjs` で撮って目視する。Rust を変えたら `cargo build` を通す
- `vite.config.ts` の `server.watch.ignored` に `src-tauri` を入れたままにする(cargo の出力を監視すると EBUSY で落ちる)
- 保存抑止は「次の 1 回だけスキップ」フラグ(`skipNextSave`)で行う。読み込んだ deck との参照比較にしない(undo で戻ったとき保存されなくなる)
- Moveable / Selecto のコンテナは state 経由(callback ref)で渡す。初回レンダーの null を渡すと操作領域が window 全体になる
- Selecto の操作領域は `.stage`(スライドの周りの灰色部分を含む)。クリックで選択解除できるように
- スライドの中に置く編集用 UI(ウィジェットの操作ボタン、はみ出し表示など)は拡縮を打ち消す(CSS は `--ui-scale`、JS は `UiScaleContext`)。そのままだと狭い画面で文字が数 px になる
- 要素に付く操作バー・パネルはスライド内に absolute で置かない(`.fit` の overflow で切れる)。`FloatingBar` か MathEditOverlay と同じく portal + fixed で `.stage` 内に収め、右パネルに重ねない。ボタンは mousedown で preventDefault し、編集中の要素からフォーカスを奪わない
- 要素の外に置く操作部品は、見えていない(opacity 0)間は pointer-events も切る。透明なままだと他の要素のクリックを奪う。
  固定ウィジェットの解除ボタンは例外: 上が iframe で `.el:hover` にならないので、ボタン自身のホバーで出す(要素の内側なので他を奪わない)
- Tauri の listen は登録が非同期。effect の後始末が先に来たとき(開発版の StrictMode の付け外し)は、登録が終わった時点で解除する。
  残すと 1 回の変更を 2 回処理する(再読込と .history の控えが二重になっていた)
- Selecto → Moveable の dragStart は「ボタンがまだ押されているとき」だけ呼ぶ(素早いクリックで終わらないドラッグが残る)
- ドラッグ中は iframe の pointer-events を切る(ポインタが iframe に入ると親が mousemove/mouseup を受け取れない)
- embed のカバーは配置時だけ表示。操作中または固定中は外して iframe を操作可能にし、Moveable と競合させない。プレゼンと編集操作の Esc は source を確認した postMessage で親へ渡す。

## デッキを作る / 直すとき(Claude Code 向け手順、M4 で整備予定)

実例: `decks/neural-network/deck.json`(15 枚。図解は円・線要素の組み合わせ、斜めの線は line 要素に rotation を付けて表す)

1. `tools/fixtures/demo/deck.json`(要素の種類がひととおり入った試験用の資料)を手本に、同じ座標系・同じ id 規則で `decks/<name>/<name>.deck` を書く(中身は JSON。拡張子だけ違う)。
   zip にまとめた `.deck`(先頭が `PK`)を渡されたら、アプリで開いて展開されたフォルダの `.deck` を直す
2. 1 枚 1 メッセージ。レイアウトはカード / ステップ / 表 / グラフ+結論 / 2 カラム / 数値コールアウトを混ぜる
3. タイトル要素は `role: "title"`、位置は (60, 43, 1160, 86) で全スライド共通
4. 本文領域は y=154〜644。左右マージン 60。要素間ギャップ 30
5. 書いたら `tools/shot.mjs` で撮って、文字あふれ・重なり・余白の偏りを確認する。`python -c` で ai/schema.json による検証も通す
6. 斜めの線: 2 点の中点を中心に、長さ w、`rotation = atan2(dy, dx)` の line 要素。円は ellipse + 同サイズの中央揃えテキスト
7. 「動くもの」が要るときは `embed` 要素: `decks/<name>/widgets/xxx.html` に **自己完結**(外部 CDN なし、vanilla JS + canvas)で書き、
   `{"type":"embed","src":"widgets/xxx.html","title":"…"}` で置く。サイズは親に合わせる(ResizeObserver)。
   `tools/e2e-widgets.mjs` の要領で単体テストを書いて、操作で値が変わることと console error が無いことを確認する。
   見本: `decks/neural-network/widgets/`(ニューロン、勾配降下、MLP の学習ライブ、過学習、3D 損失曲面)
8. ウィジェットは `*.template.html` に書き、`python tools/build-widgets.py decks/<name>` で `*.html` を生成する。
   `/*CYBER*/` に `widgets/_cyber.css`(共通配色)、`/*THREE*/` に three.js(MIT、`npm i -D three@0.159.0` 済み)が差し込まれる。
   `/*INC:_name.js*/` は `widgets/_name.js` の中身（共通のデータや描画コード）に置き換わる。
   `*.html` は生成物なので直接編集しない。WebView2 / Edge とも WebGL は動く
9. 画像に枠線や強調の輪を重ねるときは、画像と枠の図形に同じ `group` を付ける(クリックでまとめて選ばれ、一緒に伸縮する)。
   付けないと上の枠だけが選ばれ、画像の大きさを変えられない
10. ノート(縦のページ。本のように読む)を作るときは `"format": "note"` を付け、座標は 768x1024。見出し (64, 72, 640, 80)、
   その下に線 (64, 164, 640)、本文は y=188〜952、左右 64、本文は 14pt・行間 1.8・段落後 12。1 ページ 1 話題。手本は `tools/fixtures/note-demo`。
   本のように仕立てるなら `"pageNumbers": "outside"`(章の扉・表紙・裏表紙は `hidePageNumber`)、ページ数を偶数にして裏表紙が最後に左で 1 枚になるようにし、
   章の扉は右ページ(左綴じでは 0 始まりの偶数番目)に置く。紙の地は最下層に `locked` の画像。
11. 暗い(サイバー調)テーマの作法: theme.colors は lt1 = 背景(暗)、dk1 = 文字(明)、grid = 罫線色を指定。
   各スライドの最下層に `assets/grid.png`(薄いグリッド + 光だまり)を `locked: true` の画像として置く。
   HUD タグ(`// 04  PARTS · NEURON`)、短いアクセント線、ページ番号をひとまとまりにして各スライドに置く。
   要素には `opacity` が使える(0〜1)

## 開発環境

- 必要なものと起動の手順は README.md(Node.js 20 以上、Rust 1.79 以上、OS ごとの Tauri の前提)
- テストの Playwright は channel: msedge(Edge)で動かす。Python 3.10 以上と python-pptx は tools/check-pptx.py で使う
