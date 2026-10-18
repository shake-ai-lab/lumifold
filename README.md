# Lumifold

メモから作ったスライドを、ドラッグで自由に直せるデスクトップアプリです。PowerPoint(.pptx)と PDF にも書き出せます。

- 文字・図形・画像・表・グラフ・数式(TeX)を、PowerPoint と同じ感覚で選んで動かし、伸縮・回転できる
- 縦のページを本のようにめくって読む「ノート」形式
- スライドの中で動く図解(自己完結した HTML のウィジェット)
- 資料は JSON のテキストファイル。Claude Code などの AI と人が同じファイルを直し、AI が書き換えた箇所は画面で分かる

Tauri v2(Rust)+ React + TypeScript。画面は日本語です。いまは開発者向けで、配布用のインストーラは用意していません。

## 必要なもの

- Node.js 20 以上
- Rust 1.79 以上([rustup](https://rustup.rs/) で入れる)
- OS ごとの Tauri の前提([Tauri の Prerequisites](https://v2.tauri.app/start/prerequisites/))
  - **Windows**: Microsoft C++ Build Tools(「C++ によるデスクトップ開発」)と WebView2(Windows 10 / 11 は標準で入っています)
  - **Linux**(Debian / Ubuntu の例):
    ```bash
    sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev \
      libayatana-appindicator3-dev librsvg2-dev
    sudo apt install fonts-noto-cjk   # 日本語の書体
    ```
  - **macOS**: Xcode Command Line Tools(macOS では動作を確かめていません)

## 動かす

```bash
git clone https://github.com/shake-ai-lab/lumifold.git
cd lumifold
npm ci
npx tauri dev
```

初回は Rust の依存のビルドに数分かかります。起動したら「開く」から見本の資料を選んでください。

- `decks/neural-network/deck.json`: ニューラルネットワークの解説(15 枚、動く図解つき)
- `decks/sd-lora/sd-lora.deck`: Stable Diffusion と LoRA の解説(5 枚)

起動時に開く資料は、環境変数 `DECK_STUDIO_OPEN`(資料の絶対パス)でも指定できます。

画面の確認だけなら、Rust なしでブラウザでも動きます(この場合、資料には保存されません)。

```bash
npm run dev
# http://localhost:1420/?deck=/decks/neural-network/deck.json を開く
```

## インストーラを作る

```bash
npx tauri build
```

`src-tauri/target/release/bundle/` に、Windows では msi / exe、Linux では deb / rpm / AppImage ができます。
Linux 版は Linux の上でビルドしてください(Windows からは作れません)。

## 資料の形式

作業中の資料は `資料名/資料名.deck`(中身は JSON)と、同じフォルダの `assets/`(画像)・`widgets/`(動く図解の HTML)です。
人に渡すときは、アプリの「1ファイルにまとめる」で zip の `.deck` 1 つにできます(開くと隣のフォルダに展開されます)。

- `ai/schema.json`: 資料の JSON Schema
- `ai/COMMENTS.md`: 要素に付けたコメントを AI が読んで直す手順
- `docs/DESIGN.md`: 設計
- `docs/WIDGET-STATE.md`: 動く図解とアプリのやり取り
- `CLAUDE.md`: Claude Code 向けの作業手順と、機能ごとの現状

## テスト

```bash
npx tsc --noEmit                  # 型チェック
(cd src-tauri && cargo test)      # Rust の単体テスト
npm run test:production           # 本番ビルドで見本の資料とグラフが表示されるか
```

画面のテスト(`tools/e2e-*.mjs`・`tools/ui-audit.mjs`)は Playwright で Microsoft Edge(`channel: "msedge"`)を使います。
`npm run dev` を起動してから `node tools/e2e-editor.mjs` のように実行します。テストの一覧と、本物のアプリに接続するテストの準備は `CLAUDE.md` にあります。

## Linux での違い

Debian 12 で `npm ci` → `npx tauri build`(deb)→ 起動して、見本の資料と「ノート」形式の表示までを確かめています。
確かめたのは Docker 上の仮想の画面で、実機のデスクトップでの操作はまだ試していません。

Linux では画面の表示に WebKitGTK を使うので、Windows(WebView2)と次の点が違います。

- 既定の書体の Meiryo が無いので、入っている日本語の書体(Noto Sans CJK など)で表示されます。文字の幅が変わり、改行の位置や枠からのあふれが Windows と変わります(見本 sd-lora の 1 枚目では「文字がはみ出しています」の印が出ます)
- 日本語を文節で改行する指定(`word-break: auto-phrase`)が効かず、普通の改行になります
- スポイト(画面の色を拾う)は使えません
- pptx 書き出しでの数式の画像化と、PDF 書き出し(印刷)は、Linux ではまだ確かめていません

## ライセンス

MIT(`LICENSE`)。使っているライブラリのライセンスは `THIRD_PARTY_LICENSES.txt` にあります。依存を変えたら `npm run licenses` で作り直してください。
見本の資料の画像はスクリプトで作ったもので、ウィジェットには three.js(MIT)が含まれます。
