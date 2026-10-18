# deck-studio 設計書(v0 ドラフト)

作成: 2026-10-16  状態: **レビュー待ち。コードは未着手**

## 1. 何を作るか

「メモを渡すと、ドラッグで自由に直せるスライドが出てきて、必要なら pptx にもなる」デスクトップアプリ。

### 要件(壁打ちで確定したもの)

| # | 要件 | 由来 |
|---|---|---|
| R1 | 全要素が編集可能。画像化されたスライドは NG | Copilot の画像スライドが直せなくて困っている |
| R2 | 要素のドラッグ・リサイズが最優先の編集手段 | 「要素をドラッグが一番やりたいこと」 |
| R3 | HTML ベース。グラフは画面上で動く(ホバー・切替) | 現代の資料作りの流れ |
| R4 | pptx 書き出し。pptx 側のグラフは静止画でも可。文字・図形・表はネイティブ | 提出先が pptx を求めるケース |
| R5 | デスクトップアプリとして配布できる | — |
| R6 | AI は API キーでも Max プランでも使える | — |
| R7 | AGPL 不可。MIT / Apache 系のみ | 配布を考慮 |
| R8 | 人の編集と AI の編集が同じデータを指す。どちらで直しても消えない | — |

### やらないこと(初期バージョン)

- アニメーション、トランジション
- 共同編集
- 既存 pptx の読み込み(将来検討)
- 自由曲線、手書き
- フォント埋め込み

## 2. 全体構成

```
                  deck.json(唯一の正)
                       ▲    ▲
      ┌────────────────┘    └────────────────┐
      │                                      │
 Claude Code(Max プラン)             アプリ内 AI(API キー)
 ・本人がターミナルで使う             ・配布先の人が使う
 ・CLAUDE.md + スキルで                ・@anthropic-ai/sdk で
   deck.json を生成・修正               同じ deck.json を生成・修正
      │                                      │
      └──────────────┐    ┌──────────────────┘
                     ▼    ▼
               アプリ(Tauri = Rust シェル + Web フロント)
               ・deck.json を監視 → 即再描画
               ・ドラッグ編集 → deck.json に書き戻し
               ・pptx / PDF 書き出し
```

### AI の置き方(R6 と規約の両立)

Anthropic の規約上、**サードパーティアプリが claude.ai ログイン(Pro/Max)を提供することは不可**
([Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) の注記)。
一方、本人が自分のマシンで Claude Code を使うのは通常利用。

よって:

- **アプリは AI を必須にしない。** ファイルを描画し、編集を書き戻すエディタが本体
- **Max で使う** = Claude Code をいつも通り使い、deck.json を書かせる。アプリは横で開いておくだけ
- **API キーで使う** = アプリ内の「AI に頼む」欄。Messages API で同じ deck.json を生成
- 両者は **同じスキーマ・同じプロンプト定義**(`ai/` 配下)を共有する

## 3. データモデル: deck.json

### 座標系

- 論理キャンバス **1280 × 720**(16:9)。単位は論理 px
- 2026-10-17 追加: 資料の種類 `format`。`note` は縦 3:4 の **768 × 1024**(本のように単ページ・見開きでめくって読む。pptx は 8" × 10.667")
- pptx 書き出し時は 96 px = 1 inch で変換 → 13.333" × 7.5"(pptxgenjs の LAYOUT_WIDE と一致)。換算が整数なのでズレない
- フォントサイズは pt で保持(画面では pt × 96/72 px で描画)

### スキーマ(v1 案)

```jsonc
{
  "version": 1,
  "meta": { "title": "…", "author": "…", "created": "2026-10-16" },
  "theme": {
    "fonts": { "head": "Meiryo", "body": "Meiryo" },
    "colors": { "dk1": "1F2933", "lt1": "FFFFFF", "dk2": "0B4F6C", "lt2": "EEF2F5",
                "accent1": "0B4F6C", "accent2": "2A9D8F", "accent3": "E9C46A",
                "accent4": "F4A261", "accent5": "7A869A", "accent6": "E76F51" }
  },
  "slides": [
    {
      "id": "s1",
      "background": { "color": "lt1" },          // スキーム色名 or hex
      "notes": "発表者ノート",
      "elements": [
        { "id": "e1", "type": "text", "x": 60, "y": 40, "w": 1160, "h": 90, "rotation": 0,
          "role": "title",                           // title | body | caption | null(書き出し時のプレースホルダー判定用)
          "style": { "fontSize": 30, "bold": true, "color": "dk2", "align": "left", "valign": "middle" },
          "paragraphs": [
            { "runs": [ { "text": "タイトル" } ] },
            { "bullet": true, "level": 0, "runs": [ { "text": "箇条書き", "bold": false } ] }
          ] },
        { "id": "e2", "type": "shape", "shape": "roundRect", "x": 60, "y": 160, "w": 360, "h": 200,
          "fill": "lt2", "line": null, "radius": 12 },
        { "id": "e3", "type": "image", "x": 700, "y": 160, "w": 500, "h": 300, "src": "assets/fig1.png", "fit": "contain" },
        { "id": "e4", "type": "chart", "x": 60, "y": 400, "w": 560, "h": 280,
          "chart": { "kind": "bar", "labels": ["A","B"], "series": [ { "name": "2025", "values": [1,2] } ],
                     "options": { "stacked": false, "showValues": true, "legend": "bottom" } } },
        { "id": "e5", "type": "table", "x": 660, "y": 400, "w": 560, "h": 280,
          "colW": [200, 180, 180], "header": true,
          "rows": [ [ { "text": "項目" }, { "text": "値" }, { "text": "備考" } ],
                    [ { "text": "a" }, { "text": "1" }, { "text": "" } ] ] }
      ]
    }
  ]
}
```

設計上の決め事:

- **要素 id は安定**。AI は「e4 のラベルを変えて」のように id で差分指示できる。人がドラッグしても id は変わらない
- **色はスキーム名で持つ**(`dk1`, `accent1` …)。hex も許容。テーマ切替で全体が変わる
- **テキストは段落 → ラン**の 2 階層。pptx の `<a:p>` / `<a:r>` と 1:1 に対応するので書き出しで崩れない
- **chart.kind** は `bar | hbar | line | pie | doughnut | area` から開始。pptx でネイティブ化できる範囲に限定
- `shape` は `rect | roundRect | ellipse | line | arrow | triangle` から開始
- グループ化(`group` 要素)は v1 では見送り。必要になったら `children` を持つ要素として追加

### 整合性ルール(R8)

- アプリは保存のたびに deck.json を**全体書き込み**(atomic rename)。AI 側も同じ
- アプリは deck.json を監視(chokidar)。外部変更を検知したら、**自分の未保存編集と衝突しなければ**即反映。衝突時は「外部で変更されました: 読み込む / 自分の変更を優先」を出す
- 画像などのバイナリは `assets/` に置き、deck.json は相対パスで参照。1 デッキ = 1 フォルダ
- 本文のファイル名は `<資料名>.deck`(中身は deck.json と同じ JSON。旧名 `deck.json` も開ける)。拡張子を専用にするのは、ダブルクリックで開けるようにするため(関連付けは M6)
- 人に渡すときだけ「1ファイルにまとめる」で zip 1 つ(拡張子 `.deck`、本文は中で `deck.json`)にする。開くと隣のフォルダに展開して作業中の形に戻す。
  作業中を zip にしないのは、AI が本文を直接読み書きでき、監視・自動保存・差分がそのまま使えるようにするため

```
my-deck/
  my-deck.deck
  assets/
    fig1.png
```

## 4. アプリ構成

**Tauri v2**: 外側(ウィンドウ・ファイル・OS 連携)を Rust、画面を Web で作る。
Windows では WebView2(Edge)で描画するので Windows 11 なら追加インストール不要。配布サイズは数 MB。

### Rust 側(`src-tauri/`)

| 役割 | クレート | ライセンス |
|---|---|---|
| ウィンドウ・メニュー・ダイアログ・IPC | tauri, tauri-plugin-dialog, tauri-plugin-fs | MIT/Apache |
| deck.json の読み書き(atomic rename) | std, serde, serde_json | MIT/Apache |
| ファイル監視 | notify | MIT/Apache |
| スキーマ検証 | jsonschema | MIT |
| API キー保管 | keyring(OS 資格情報マネージャ) | MIT/Apache |
| Claude API 呼び出し | reqwest(公式 Rust SDK が無いので raw HTTP) | MIT/Apache |
| PDF 書き出し | resvg + svg2pdf(各スライドを SVG 化して合成) | MIT/Apache |
| パッケージング | tauri-bundler(NSIS / MSI) | MIT/Apache |

### Web 側(`src/`)

| 役割 | 技術 | ライセンス |
|---|---|---|
| UI | React + TypeScript + Vite | MIT |
| ドラッグ・変形 | react-moveable + react-selecto | MIT |
| グラフ | Chart.js(react-chartjs-2) | MIT |
| 状態管理 | zustand + zundo(undo/redo) | MIT |
| pptx 書き出し | pptxgenjs(ブラウザ版。Blob を Rust 側に渡して保存) | MIT |
| SVG 化(PDF 用) | 各スライドの DOM → SVG(自前。グラフは Chart.js の canvas を PNG 化して埋め込み) | — |

### 境界の決め方

- **Web 側は OS に触らない**。ファイル・鍵・ネットワークは全部 Tauri コマンド経由で Rust に頼む
- **Rust 側は画面を知らない**。deck.json の構造は `serde` の型として持つが、描画・レイアウト判断はしない
- Claude API の呼び出しは Rust 側。API キーは WebView に渡さない

### 画面

```
┌──────────────┬──────────────────────────────────────┬──────────────┐
│ スライド一覧  │ キャンバス(1280×720 を拡縮表示)       │ プロパティ   │
│ (サムネイル) │  ・クリックで選択、ドラッグで移動      │ ・位置/サイズ │
│  並べ替え    │  ・ハンドルでリサイズ/回転              │ ・色/フォント │
│  追加/削除   │  ・ダブルクリックでテキスト編集         │ ・グラフデータ│
│              │  ・スナップガイド                       │ ・表の編集   │
├──────────────┴──────────────────────────────────────┴──────────────┤
│ ツールバー: 要素追加(テキスト/図形/画像/グラフ/表) 整列 前面/背面  │
│            書き出し(pptx / PDF)   AI に頼む(API キー設定時のみ)   │
└──────────────────────────────────────────────────────────────────┘
```

### pptx 書き出しの方針(R4)

| 要素 | 出力 |
|---|---|
| text | テキストボックス。`role: title` はレイアウトのプレースホルダーに載せる |
| shape | 図形(pptxgenjs ShapeType) |
| image | 画像 |
| chart | **原則ネイティブグラフ**(bar / line / pie / doughnut / area は pptxgenjs が対応)。対応外の表現はアプリ内 Chart.js で PNG 化して貼る |
| table | ネイティブ表 |
| theme | テーマのフォント・色を各要素の書式として書き出す(src/export/pptx.ts) |

「静止画でもよい」は許容条件であって目標ではない。ネイティブにできるものはネイティブで出す。

エクスポータは `src/export/pptx.ts`(pptxgenjs を書き出すときだけ読み込む)。前身の pptxgenjs 直書きのスクリプト(legacy/)は吸収済みで、リポジトリからは外した。

## 5. AI 連携

### 共有部分 `ai/`

- `ai/schema.json` — deck.json の JSON Schema。アプリの検証にも AI の構造化出力にも使う
- `ai/prompts/` — 「原稿 → deck.json」「指示 → 差分修正」のシステムプロンプト。構成の作法(1 枚 1 メッセージ、レイアウトの型、文字あふれ禁止)をここに集約
- `ai/layouts/` — レイアウトの型(カード 3 枚 / 2 カラム / グラフ+結論 / 表 / 数値コールアウト …)を**座標付きのテンプレート**として定義。AI はゼロから座標を考えず、型を選んで中身を埋める。人がドラッグで崩すのは自由

### Claude Code モード(Max)

- リポジトリの `CLAUDE.md` と `.claude/skills/deck/` に手順を書く
- 「`decks/<name>/<name>.deck` を作って」→ 私が `ai/layouts/` を参照して JSON を書く → アプリが監視して描画
- 修正は「e4 を折れ線に」「3 枚目を 2 カラムに」のように id / 枚数で指示

### アプリ内モード(API キー)

- 設定画面で API キーを保存(Rust 側 `keyring` で OS の資格情報マネージャへ)
- Rust 側から Messages API を raw HTTP(`reqwest`)で呼ぶ。モデルは `claude-opus-5-5`、構造化出力(`output_config.format`)で `ai/schema.json` に従わせる。長い出力になるのでストリーミング
- 入力: 原稿テキスト + 現在の deck.json(修正時) → 出力: deck.json 全体または差分
- WebView にはキーを渡さない。進捗だけイベントで流す

## 6. マイルストーン

| M | 内容 | 完了条件 |
|---|---|---|
| M0 | 設計(この文書)+ deck.json スキーマ確定 | レビュー OK |
| M1 | ビューア: deck.json → 画面描画。全要素種別。ファイル監視 | Claude Code で書いた JSON が即座に表示される |
| M2 | エディタ: 選択・移動・リサイズ・回転・スナップ・テキスト直接編集・undo/redo・書き戻し | ドラッグした結果が deck.json に保存され、再起動しても残る |
| M3 | 書き出し: pptx(ネイティブ、Web 側)+ PDF(SVG → Rust 側) | PowerPoint で開いて全要素が編集できる |
| M4 | Claude Code 連携: CLAUDE.md / スキル / レイアウト型 | 「○○の報告作って」で一式が出る |
| M5 | アプリ内 AI(API キー) | 設定したキーで同じことができる |
| M6 | パッケージング(tauri-bundler で Windows インストーラ) | 他の PC で動く |

M1 → M2 → M3 の順で、**各段階で実際に使えるもの**ができる。M4 は M1 の時点でほぼ動く(JSON を書けば表示されるので)。

## 7. 未決事項

- [ ] PDF の SVG 化で、テキストの折り返しを WebView と一致させる方法(WebView で行分割した結果を `<text>` 行ごとに出すのが堅い)
- [ ] テキストの折り返し・自動縮小をどこまでやるか(画面と pptx で改行位置が違う問題は原理的に残る)
- [ ] 日本語フォントの既定(Meiryo / Yu Gothic / Noto Sans JP)。配布先に無いフォントのフォールバック
- [ ] Univer Slides(Apache-2.0)を土台にできるか。M1 着手時に 1 日だけ触って判断
- [ ] 既存 pptx の読み込みを v2 でやるか
