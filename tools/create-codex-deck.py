# decks/lumifold-codex(ノート形式の解説書「Lumifold の書庫」、60 ページ)を作る。
# Lumifold の技術スタック・選んだ理由・組み立て方を、古い書庫の写本の見た目で解説する。さわれる図 6 つ(うち 3D 2 つ)。
# ノートは 768x1024。見出し (64, 72, 640, 80)、飾り罫 y=164、本文 y=188〜952、左右 64、本文 14pt・行間 1.8・段落後 12。
# 章(巻)の扉は右ページ(0 始まりの偶数番目)、ページ数は偶数で裏表紙が最後に左で 1 枚。
# 使い方: node tools/create-codex-assets.mjs → python tools/build-widgets.py decks/lumifold-codex → python tools/create-codex-deck.py
# ウィジェットの単体テスト: node tools/e2e-codex-widgets.mjs
import json
import math
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "decks", "lumifold-codex", "lumifold-codex.deck")
X, W = 64, 640
pages = []
cur = None
warnings = []


# ---------------------------------------------------------------- 文字の大きさの見積もり(はみ出しの早期発見用。最終確認は tools/check-text-overflow.mjs)
def text_w(s, px):
    return sum(px * (1.0 if ord(c) >= 0x2000 else 0.56) for c in s)


def est_h(paras, w, pt, lh, ps, bullets=False):
    px = pt * 4 / 3
    width = w - (px * 1.4 if bullets else 0) - 4
    lines = sum(max(1, math.ceil(text_w(p, px) * 1.04 / width)) for p in paras)
    return lines * px * lh + (len(paras) - 1) * ps


# ---------------------------------------------------------------- 部品
def runs(text):
    """**太字** と [[accentN:色付き太字]] を run に分ける"""
    out = []
    for part in re.split(r"(\*\*.+?\*\*|\[\[[a-z0-9]+:.+?\]\])", text):
        if not part:
            continue
        if part.startswith("**"):
            out.append({"text": part[2:-2], "bold": True})
        elif part.startswith("[["):
            c, t = part[2:-2].split(":", 1)
            out.append({"text": t, "color": c, "bold": True})
        else:
            out.append({"text": part})
    return out


def plain(text):
    return re.sub(r"\*\*|\[\[[a-z0-9]+:|\]\]", "", text)


def add(el):
    cur["elements"].append(el)
    return el


def text(name, x, y, w, h, lines, size=14, color="dk1", bullets=False, lh=1.5, ps=0, group=None, role=None, check=True, **style):
    lines = [lines] if isinstance(lines, str) else lines
    st = {"fontSize": size, "color": color, "lineHeight": lh, **style}
    if ps:
        st["paraSpacing"] = ps
    el = {"id": f'{cur["id"]}-{name}', "type": "text", "x": x, "y": y, "w": w, "h": h, "style": st,
          "paragraphs": [{"runs": runs(t), **({"bullet": True} if bullets else {})} for t in lines]}
    if role:
        el["role"] = role
    if group:
        el["group"] = f'{cur["id"]}-{group}'
    for k in ("rotation", "opacity", "locked"):
        if k in style:
            el[k] = st.pop(k)
    if check:
        need = est_h([plain(t) for t in lines], w, size, lh, ps, bullets)
        if need > h + 0.5:
            warnings.append(f'{el["id"]}: 見積もり {need:.0f}px > 枠 {h}px')
    return add(el)


def shape(name, x, y, w, h, kind="roundRect", fill="lt2", line=None, group=None, **kw):
    el = {"id": f'{cur["id"]}-{name}', "type": "shape", "shape": kind, "x": x, "y": y, "w": w, "h": h, "fill": fill, "line": line, **kw}
    if group:
        el["group"] = f'{cur["id"]}-{group}'
    return add(el)


def hline(name, y, x=X, w=W, color="accent3", width=2, group=None):
    el = {"id": f'{cur["id"]}-{name}', "type": "shape", "shape": "line", "x": x, "y": y, "w": w, "h": 2, "line": {"color": color, "width": width}}
    if group:
        el["group"] = f'{cur["id"]}-{group}'
    return add(el)


def arrow(name, x1, y1, x2, y2, color="accent1", width=2, group=None):
    """2 点を結ぶ矢印(中点を中心に、長さ w、rotation = atan2(dy, dx) の arrow 要素)"""
    length = math.hypot(x2 - x1, y2 - y1)
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    el = {"id": f'{cur["id"]}-{name}', "type": "shape", "shape": "arrow", "x": round(cx - length / 2, 1), "y": round(cy - 6, 1), "w": round(length, 1), "h": 12,
          "line": {"color": color, "width": width}, "arrowHeadLength": 11, "arrowHeadWidth": 10}
    deg = math.degrees(math.atan2(y2 - y1, x2 - x1))
    if abs(deg) > 0.01:
        el["rotation"] = round(deg, 2)
    if group:
        el["group"] = f'{cur["id"]}-{group}'
    return add(el)


def image(name, src, x, y, w, h, group=None, **kw):
    el = {"id": f'{cur["id"]}-{name}', "type": "image", "x": x, "y": y, "w": w, "h": h, "src": src, "fit": "contain", **kw}
    if group:
        el["group"] = f'{cur["id"]}-{group}'
    return add(el)


def embed(name, src, title, y, h):
    return add({"id": f'{cur["id"]}-{name}', "type": "embed", "x": X, "y": y, "w": W, "h": h, "src": f"widgets/{src}.html", "title": title, "locked": True})


def table(name, x, y, w, h, rows, col_w, size=12):
    cells = [[c if isinstance(c, dict) else {"text": str(c)} for c in r] for r in rows]
    return add({"id": f'{cur["id"]}-{name}', "type": "table", "x": x, "y": y, "w": w, "h": h, "header": True, "fontSize": size, "colW": col_w, "rows": cells})


def math_el(name, x, y, w, h, latex, size=20, color="dk1"):
    return add({"id": f'{cur["id"]}-{name}', "type": "math", "x": x, "y": y, "w": w, "h": h, "latex": latex, "fontSize": size, "color": color, "displayMode": True})


def chart(name, x, y, w, h, kind, labels, series, title=None, **options):
    spec = {"kind": kind, "labels": labels, "series": series}
    if title:
        spec["title"] = title
    if options:
        spec["options"] = options
    return add({"id": f'{cur["id"]}-{name}', "type": "chart", "x": x, "y": y, "w": w, "h": h, "chart": spec})


def page(pid, kicker=None, title=None, **kw):
    """羊皮紙のページ。見出しの下は飾り罫(金の線と唐草)"""
    global cur
    cur = {"id": pid, "elements": [], **kw}
    pages.append(cur)
    image("paper", "assets/parchment.jpg", 0, 0, 768, 1024, locked=True)
    if title:
        if kicker:
            text("kicker", X, 44, W, 24, kicker, 11, "accent1", bold=True, check=False, font="head")
        text("title", X, 72, W, 80, title, 24, "dk2", bold=True, valign="bottom", role="title", lh=1.3)
        hline("rule-l", 164, X, 282, "accent3", 1.5, group="rule")
        image("rule-orn", "assets/fleuron.png", 352, 155, 64, 20, group="rule")
        hline("rule-r", 164, 422, 282, "accent3", 1.5, group="rule")
    return cur


def dark(pid, **kw):
    """革の表紙のページ(表紙・扉・裏表紙)"""
    global cur
    cur = {"id": pid, "background": {"color": "dk2"}, "hidePageNumber": True, "elements": [], **kw}
    pages.append(cur)
    image("leather", "assets/leather.jpg", 0, 0, 768, 1024, locked=True)
    return cur


def prose(name, y, h, lines, size=14, color="dk1", **kw):
    return text(name, X, y, W, h, lines, size, color, lh=1.8 if size >= 14 else 1.7, ps=12 if size >= 14 else 8, **kw)


def caption(name, y, s, x=X, w=W, align="left"):
    return text(name, x, y, w, 26, s, 11, "accent5", role="caption", lh=1.4, align=align)


def note(name, y, h, s, size=12):
    return text(name, X, y, W, h, s, size, "accent5", lh=1.65)


def point_box(name, y, h, head, lines, bullets=True, size=13, x=X, w=W, head_color="accent1", fill="lt2"):
    shape(f"{name}-bg", x, y, w, h, fill=fill, line={"color": "accent3", "width": 1.2}, radius=6, group=name)
    text(f"{name}-head", x + 28, y + 16, w - 56, 32, head, 15, head_color, bold=True, valign="middle", group=name, font="head")
    text(f"{name}-body", x + 28, y + 54, w - 56, h - 66, lines, size, "dk1", bullets=bullets, lh=1.7, ps=6, group=name)


def code(name, y, h, lines, size=10.5, x=X, w=W):
    """コードの抜き書き(帳簿の色の地に、朱の縦線)"""
    shape(f"{name}-bg", x, y, w, h, kind="rect", fill="lt2", line=None, group=name)
    shape(f"{name}-bar", x, y, 4, h, kind="rect", fill="accent1", line=None, group=name)
    text(f"{name}-text", x + 18, y + 10, w - 30, h - 20, lines, size, "dk1", lh=1.5, group=name)


def node(name, x, y, w, h, title, sub=None, fill="lt1", line="accent3", tcolor="dk2", tsize=13, ssize=10.5, lw=1.4):
    """図の箱(題と小さな説明)"""
    shape(f"{name}-box", x, y, w, h, fill=fill, line={"color": line, "width": lw}, radius=8, group=name)
    if sub:
        text(f"{name}-t", x + 8, y + 6, w - 16, h / 2 - 2, title, tsize, tcolor, bold=True, align="center", valign="bottom", lh=1.3, group=name)
        text(f"{name}-s", x + 8, y + h / 2 + 2, w - 16, h / 2 - 8, sub, ssize, "accent5", align="center", valign="top", lh=1.4, group=name)
    else:
        text(f"{name}-t", x + 8, y + 4, w - 16, h - 8, title, tsize, tcolor, bold=True, align="center", valign="middle", lh=1.35, group=name)


def label(name, x, y, w, h, s, size=10.5, color="accent5", align="center", **kw):
    return text(name, x, y, w, h, s, size, color, align=align, lh=1.35, **kw)


def numbered(items, top, step, desc_h, size=12.5):
    """番号付きの行(丸い番号・見出し・説明)"""
    for i, (head, desc) in enumerate(items):
        y = top + i * step
        g = f"n{i + 1}"
        shape(f"{g}-ring", X, y, 40, 40, kind="ellipse", fill="lt1", line={"color": "accent3", "width": 1.6}, group=g)
        text(f"{g}-no", X, y, 40, 40, str(i + 1), 16, "accent1", bold=True, align="center", valign="middle", lh=1, group=g, font="head", check=False)
        text(f"{g}-head", X + 58, y + 2, W - 58, 34, head, 15, "dk2", bold=True, valign="middle", group=g, font="head")
        text(f"{g}-desc", X + 58, y + 40, W - 58, desc_h, desc, size, "dk1", lh=1.65, group=g)


def tool_rows(items, top, desc_h, gap=12, name_w=170, name_size=15):
    """道具の行(左に名前と小さな札、右に説明)"""
    y = top
    for i, (name, tag, desc) in enumerate(items):
        g = f"t{i + 1}"
        hline(f"{g}-sep", y - gap / 2 - 1, color="accent3", width=0.75, group=g) if i else None
        text(f"{g}-name", X, y, name_w, 30, name, name_size, "accent1", bold=True, group=g, font="head", lh=1.3)
        text(f"{g}-tag", X, y + 32, name_w, 46, tag, 10.5, "accent5", group=g, lh=1.45)
        text(f"{g}-desc", X + name_w + 16, y, W - name_w - 16, desc_h, desc, 12, "dk1", group=g, lh=1.7)
        y += desc_h + gap


def card(name, x, y, w, h, head, body, where=None, head_color="accent1", size=12.5):
    shape(f"{name}-bg", x, y, w, h, fill="lt2", line={"color": "accent3", "width": 1.2}, radius=6, group=name)
    text(f"{name}-head", x + 20, y + 14, w - 40, 30, head, 15, head_color, bold=True, valign="middle", group=name, font="head", lh=1.3)
    body_h = h - 58 - (28 if where else 0)
    text(f"{name}-body", x + 20, y + 48, w - 40, body_h, body, size, "dk1", lh=1.65, group=name)
    if where:
        text(f"{name}-where", x + 20, y + h - 34, w - 40, 22, "在りか  " + where, 10.5, "accent2", group=name, lh=1.3)


def widget_page(pid, kicker, title, lead, src, wtitle, h, foot):
    page(pid, kicker, title)
    prose("lead", 188, 72, lead)
    embed("widget", src, wtitle, 272, h)
    note("foot", 272 + h + 14, 952 - (272 + h + 14), foot, 11)


def door(pid, num, roman, title, lead, learn, emblem):
    dark(pid)
    image("emblem", f"assets/{emblem}.png", 224, 104, 320, 230)
    text("roman", X, 352, W, 24, roman, 12, "accent3", bold=True, align="center", lh=1.2, font="head", check=False)
    text("no", X, 378, W, 70, num, 40, "accent3", bold=True, align="center", valign="middle", lh=1.1, font="head")
    hline("rule", 462, 284, 200, "accent3", 1.5)
    text("title", X, 480, W, 60, title, 30, "lt1", bold=True, align="center", valign="middle", role="title", lh=1.3)
    text("lead", 104, 556, 560, 120, lead, 14, "lt2", align="center", lh=1.8)
    text("learn-head", X, 704, W, 28, "この巻で学ぶこと", 12, "accent3", bold=True, align="center", lh=1.3, font="head")
    text("learn", 154, 740, 460, 200, learn, 13, "lt2", bullets=True, lh=1.6, ps=4)


# ================================================================ 0 表紙
dark("cover")
image("art", "assets/cover-art.png", 104, 92, 560, 402)
text("kicker", X, 520, W, 26, "CODEX LUMIFOLD  ·  技術解説の写本", 12, "accent3", bold=True, align="center", font="head", check=False)
text("title", X, 556, W, 80, "Lumifold の書庫", 44, "lt1", bold=True, role="title", align="center", valign="middle", lh=1.2)
hline("bar", 652, 324, 120, "accent3", 2)
text("sub", 124, 676, 520, 96, "技術スタック・選んだ理由・組み立て方を、さわって確かめる解説ノート", 16, "lt2", align="center", lh=1.75)
text("by", X, 884, W, 30, "Lumifold ノート  ·  さわれる図 6 つ(うち 3D 2 つ)", 11, "accent3", role="caption", align="center", valign="bottom", font="head")

# ================================================================ 1 はじめに
page("intro", None, "はじめに")
prose("body", 188, 364, [
    "Lumifold は「メモを渡すと、ドラッグで自由に直せるスライドが出てきて、必要なら pptx にもなる」デスクトップアプリです。このノートは、その中身 —— どの道具を選び、なぜ選び、どう組み立てたか —— を、古い書庫を歩くように見て回る案内書です。",
    "アプリは 2 つの世界でできています。ファイルや OS に触る**Rust の世界**と、画面を描いて人の操作を受ける**Web の世界**です。その間を、決まった形の「手紙」が行き来しています。",
    "このノート自体も Lumifold で作りました。いまめくっているページも、動く図も、ページ番号も、このノートで解説する仕組みで動いています。",
])
point_box("howto", 568, 330, "このノートの使い方", [
    "金の枠の図は「**さわれる図**」。ドラッグやクリックで中を確かめよう(全部で 6 つ、うち 2 つは 3D)",
    "「**在りか**」として、その仕組みが書かれているファイルを示した(リポジトリの中のパス)",
    "巻一と巻二で「なぜ」を、巻三から巻七で「どう」を扱う",
    "道具の版と数は、このノートを書いた 2026 年 10 月のもの",
])
note("hint", 914, 30, "→ キーか、ページの角をつまんでめくります。", 11)

# ================================================================ 2 目次(ページ番号はあとで入れる)
page("toc", None, "目次")
TOC = [
    ("序", "一枚でわかる全体像", "中心にあるのは、資料の本文ひとつ", "overview"),
    ("巻一", "設計の約束", "8 つの要件・唯一の正・本文の形・AI の置き方と規約", "ch1"),
    ("巻二", "道具を選ぶ", "物差し・Tauri・React・編集と状態・描画と書き出し ・ さわれる図「書庫の地図」", "ch2"),
    ("巻三", "二つの世界をつなぐ", "IPC・壊さずに書く・見張る・まとめる ・ さわれる図「伝令の道」", "ch3"),
    ("巻四", "紙面を描く", "論理キャンバス・文字・動く図の器 ・ さわれる図「紙面の解剖」", "ch4"),
    ("巻五", "手で直す", "選ぶ・動かす・履歴と自動保存 ・ さわれる図「編集の机」", "ch5"),
    ("巻六", "本として読む", "ノート・読む画面・折り目・音 ・ さわれる図「折り目の幾何」「紙の音」", "ch6"),
    ("巻七", "外へ渡す・確かめる", "pptx と PDF・自動のテスト・本番と Linux", "ch7"),
    ("結び", "早見表と小辞典", "技術の早見表・用語の小辞典・おわりに", "cheat"),
]
toc_page = cur

# ================================================================ 3 一枚でわかる全体像
page("overview", "序", "一枚でわかる全体像")
prose("lead", 188, 72, "細かい話の前に、全体の地図を 1 枚で。中心にあるのは資料の本文ひとつだけで、人も AI もそれを読み書きします。")
node("cc", 64, 280, 250, 64, "Claude Code", "外の書き手(本人の PC で)", line="accent1")
node("human", 454, 280, 250, 64, "人", "アプリでドラッグ・入力", line="accent6")
node("deck", 224, 392, 320, 84, "資料名.deck(JSON)", "唯一の正 ・ 形は ai/schema.json", fill="lt1", line="accent3", tsize=15, lw=2.6)
arrow("a-cc", 220, 344, 290, 390, "accent1")
label("l-cc", 64, 352, 146, 22, "直接書く", 10.5, "accent1", align="right")
shape("app", 64, 530, 640, 232, fill="lt2", line={"color": "accent5", "width": 1.2}, radius=10, group="appg")
text("app-t", 84, 540, 400, 26, "Lumifold(Tauri のアプリ)", 12, "accent5", bold=True, group="appg", font="head")
node("rust", 88, 578, 270, 160, "Rust の世界", "src-tauri/\n読み書き・見張り・まとめる", line="accent2", tsize=15, ssize=11)
node("web", 410, 578, 270, 160, "Web の世界", "src/\n描画・編集・書き出し", line="accent6", tsize=15, ssize=11)
arrow("a-ipc1", 362, 640, 406, 640, "accent2")
arrow("a-ipc2", 406, 676, 362, 676, "accent6")
label("l-ipc", 352, 692, 64, 40, "invoke\nemit", 9.5, "accent5", check=False)
arrow("a-io1", 300, 480, 300, 574, "accent2")
arrow("a-io2", 330, 574, 330, 480, "accent2")
label("l-io", 344, 506, 160, 40, "読む・書く・見張る", 10.5, "accent2", align="left")
arrow("a-human", 600, 346, 600, 574, "accent6")
label("l-human", 610, 440, 90, 24, "操作", 10.5, "accent6", align="left")
node("out", 454, 784, 250, 56, "pptx / PDF", "書き出し(巻七)", line="accent5")
arrow("a-out", 545, 740, 560, 782, "accent5", 1.6)
note("legend", 64, 784, 372, "ウィジェット(動く図)は本文と同じフォルダの widgets/ に置き、Web の世界の中の iframe で動く(巻四)。", 11) if False else None
text("legend", 64, 784, 372, 64, "動く図は本文と同じフォルダの widgets/ に置き、Web の世界の中の iframe で動く(巻四)。", 11, "accent5", lh=1.6)
prose("body", 862, 90, "アプリは本文を描き、人の編集を書き戻すエディタです。AI は組み込まず、外から同じファイルを書き換えます。", 13)

# ================================================================ 4 扉 巻一
door("ch1", "巻 一", "LIBER  I", "設計の約束", "道具を選ぶ前に、何を作るかと、守る約束を決めました。どの技術を選ぶかは、ほとんどこの約束から自然に決まります。",
     ["8 つの要件 — 出発点は「直せない画像のスライド」", "唯一の正 — 本文ひとつを人と AI で共有する", "本文の形 — 資料 → ページ → 要素", "AI の置き方と規約、ライセンスの約束", "道のり — 見る → 直す → 渡す"], "emblem-1")

# ================================================================ 5 何を作るか
page("reqs", "巻一 · 設計の約束", "何を作るか — 8 つの要件")
prose("lead", 188, 72, "最初の壁打ちで決めた要件です。出発点は「AI が画像で作ったスライドが、あとから直せなくて困る」という不満でした。")
table("table", X, 276, W, 470, [
    ["", "要件", "由来"],
    ["R1", "全部の要素を直せる。画像に焼いたスライドは NG", "画像のスライドは直せない"],
    ["R2", "ドラッグとリサイズが、いちばんの編集手段", "「要素をドラッグしたい」"],
    ["R3", "HTML で描く。グラフは画面で動く", "いまの資料作りの流れ"],
    ["R4", "pptx に書き出せる(文字・図形・表はネイティブ)", "提出先が pptx を求める"],
    ["R5", "デスクトップアプリとして配る", "—"],
    ["R6", "AI は API キーでも Max プランでも使える", "—"],
    ["R7", "GPL / AGPL は使わない", "配布を考えて"],
    ["R8", "人と AI が同じデータを直し、どちらの変更も消えない", "—"],
], [56, 380, 204], 12)
point_box("not", 770, 182, "やらないこと(初版)", "アニメーションと切り替え効果、共同編集、既存の pptx の読み込み、自由曲線や手書き、書体の埋め込み。まずは「直せる資料」に集中するため。", bullets=False)

# ================================================================ 6 唯一の正
page("truth", "巻一 · 設計の約束", "唯一の正 — 本文ひとつを全員で")
prose("lead", 188, 108, "R8 を満たすいちばん素直な方法は、データを 1 か所に置くことです。Lumifold では資料の本文(資料名.deck、中身は JSON)が唯一の正で、画面も pptx も、そこから作る写しです。")
label("h-w", 64, 306, 180, 22, "書き手", 11, "accent1", bold=True, font="head")
label("h-c", 524, 306, 180, 22, "写し", 11, "accent2", bold=True, font="head")
for i, (t, s) in enumerate([("人", "アプリで編集"), ("Claude Code", "外から書く"), ("アプリ内 AI", "M5 で予定")]):
    node(f"w{i}", 64, 336 + i * 80, 180, 62, t, s, line="accent1")
    arrow(f"aw{i}", 246, 367 + i * 80, 290, 397 + (i - 1) * 10, "accent1", 1.6)
for i, (t, s) in enumerate([("画面", "描画・編集"), ("pptx / PDF", "書き出し"), ("1 ファイル", "zip の .deck")]):
    node(f"c{i}", 524, 336 + i * 80, 180, 62, t, s, line="accent2")
    arrow(f"ac{i}", 478, 397 + (i - 1) * 10, 522, 367 + i * 80, "accent2", 1.6)
node("deck", 292, 366, 184, 84, "資料名.deck", "唯一の正", fill="lt1", line="accent3", tsize=15, lw=2.6)
point_box("rules", 600, 352, "この約束から決まったこと", [
    "作業中はテキストのファイルのまま。AI がそのまま読み書きでき、差分も見られる",
    "アプリは本文を見張り、外の書き換えをすぐ描き直す(巻三)",
    "要素の id は変えない。「s6-chart を折れ線に」のように id で直してもらう",
    "保存は本文全体の書き直し。書いている途中の状態を読ませない(巻三)",
])

# ================================================================ 7 本文の形
page("schema", "巻一 · 設計の約束", "本文の形 — 資料 → ページ → 要素")
prose("lead", 188, 72, "本文は 3 段です。要素は 7 種類(文字・図形・画像・グラフ・表・数式・動く図)で、どれも位置と大きさを持ちます。")
code("json", 276, 300, [
    "{",
    '  "version": 1, "format": "note",',
    '  "theme": { "fonts": { "head": "Yu Mincho", … },',
    '             "colors": { "dk1": "2B2118", "accent1": "8A3220", … } },',
    '  "slides": [ { "id": "schema", "elements": [',
    '    { "id": "schema-title", "type": "text", "role": "title",',
    '      "x": 64, "y": 72, "w": 640, "h": 80,',
    '      "style": { "fontSize": 24, "color": "dk2" },',
    '      "paragraphs": [ { "runs": [ { "text": "本文の形" } ] } ] }',
    "  ] } ]",
    "}",
])
point_box("rules", 600, 352, "決め事", [
    "座標は論理キャンバスの px(スライドは 1280×720、ノートは 768×1024)。文字の大きさは pt",
    "色はテーマの名前(dk1・accent1 …)で書く。テーマを替えれば全体の色が変わる",
    "文字は「段落 → ラン」の 2 段。PowerPoint の段落 <a:p> とラン <a:r> にそのまま対応するので、書き出しで崩れない",
    "形は ai/schema.json(JSON Schema)に書き、AI の生成と検証で同じものを使う",
])

# ================================================================ 8 AI の置き方と規約
page("ai", "巻一 · 設計の約束", "AI の置き方と規約")
prose("lead", 188, 108, "R6(API キーでも Max プランでも)には、規約の壁がありました。第三者のアプリが claude.ai のログイン(Pro / Max)を組み込むことは認められていません。そこで AI の置き場所を 2 つに分けました。")
card("max", 64, 316, 310, 280, "Max プランで(いま)", "本人が自分の PC で Claude Code を使う(ふつうの使い方)。Claude Code が本文を書き、アプリは横で開いておくだけ。書き方の手順は CLAUDE.md に置く。", "CLAUDE.md", head_color="accent2")
card("api", 394, 316, 310, 280, "API キーで(M5 で予定)", "アプリの中の「AI に頼む」欄から Messages API を呼ぶ。キーは OS の資格情報に保管し、画面(WebView)には渡さない設計。", "docs/DESIGN.md 5 章", head_color="accent6")
point_box("core", 616, 168, "だから、アプリは AI を必須にしない", "アプリの本体は、本文を描き、人の編集を書き戻すエディタ。AI はどちらの形でも「同じ本文を書き換える外の書き手」として扱う。だから監視と差分(巻三)が、AI 連携の要になる。", bullets=False)
prose("license", 806, 146, "もう 1 つの約束は R7 のライセンスです。アプリは MIT で公開し、依存は MIT・Apache などの許容型に限りました(Tauri 経由で入る MPL-2.0 なども可)。GPL / AGPL は使いません。", 13)

# ================================================================ 9 道のり
page("road", "巻一 · 設計の約束", "道のり — 見る → 直す → 渡す")
prose("lead", 188, 108, "各段階で「実際に使えるもの」ができる順に進めました。M1 の時点で、AI 連携はほぼ動いていました。Claude Code が JSON を書けば、アプリがすぐ描くからです。")
table("table", X, 312, W, 440, [
    ["段", "内容", "いま"],
    ["M0", "設計と、本文の形(スキーマ)", "完了"],
    ["M1", "見る: 本文を描く・ファイルを見張る", "完了"],
    ["M2", "直す: 選ぶ・動かす・Ctrl+Z・書き戻す", "完了"],
    ["M2.5", "動く図(embed)", "完了"],
    ["ノート", "縦のページ・読む画面・ページめくり", "初版"],
    ["M3", "渡す: pptx・PDF", "初版"],
    ["M4", "Claude Code 連携(型・スキル)", "これから"],
    ["M5", "アプリの中の AI(API キー)", "これから"],
    ["M6", "配布(インストーラ・関連付け)", "インストーラまで"],
], [80, 380, 180], 12)
prose("body", 776, 176, "順番を「見る → 直す → 渡す」にしたのは、どの段階でも手元の資料作りに使えるようにするためです。見るだけのビューアでも、Claude Code と組み合わせれば、もう資料が作れました。", 13.5)

# ================================================================ 10 扉 巻二
door("ch2", "巻 二", "LIBER  II", "道具を選ぶ", "約束が決まれば、道具の選び方も決まります。この巻では、選んだ道具とその理由を、書庫の棚を見て回るように確かめます。",
     ["選ぶときの 5 つの物差し", "Tauri v2 — 外殻を Rust で", "画面・編集・状態の道具", "描く道具・渡す道具・Rust のクレート", "ライセンスの棚(253 の依存)"], "emblem-2")

# ================================================================ 11 物差し
page("rulers", "巻二 · 道具を選ぶ", "選ぶときの 5 つの物差し")
prose("lead", 188, 72, "道具は次の 5 つの物差しで比べました。どれも巻一の約束から来ています。")
numbered([
    ("ライセンス", "MIT・Apache などの許容型か(R7)。直接使う物だけでなく、依存の依存まで数える。"),
    ("配布の軽さ", "インストーラが小さく、使う人に別の実行環境を入れさせないか(R5)。"),
    ("直せる形", "画面の要素が、そのまま編集できる部品か(R1・R2)。画像に焼いてしまわないか。"),
    ("日本語", "文節での改行、明朝・ゴシックの書体、IME での入力が素直に動くか。"),
    ("外への出口", "pptx のネイティブ要素に写せるか(R4)。画面だけで終わらないか。"),
], 280, 120, 70)
note("tip", 888, 64, "迷ったら「小さく、あとで取り替えられるもの」を選んだ。状態管理の zustand、グラフの Chart.js がその例。")

# ================================================================ 12 Tauri
page("tauri", "巻二 · 道具を選ぶ", "Tauri v2 — 外殻を Rust で")
prose("lead", 188, 108, "デスクトップアプリの外殻には Tauri v2 を選びました。画面は OS が持つ WebView で描き、ファイルや OS との仕事は Rust で書く仕組みです。")
table("table", X, 306, W, 300, [
    ["比べた点", "Tauri v2", "Electron"],
    ["画面の描画", "OS の WebView(Windows は WebView2 = Edge)", "Chromium を同梱"],
    ["配布の大きさ", "数 MB", "Chromium と Node.js を同梱する分、大きい"],
    ["裏側の言語", "Rust", "Node.js"],
    ["画面と裏の境界", "登録したコマンドだけを呼べる", "Node の力に届きやすい"],
    ["OS ごとの差", "OS ごとに WebView が違う", "どこでも同じ Chromium"],
], [140, 260, 240], 12)
prose("body", 626, 326, [
    "Windows 11 には WebView2 が入っているので、使う人に追加のインストールは要りません。",
    "弱点は表の最後の行です。Linux では WebKitGTK で描くため、日本語の文節改行が効かないなどの差が出ます(巻七)。それでも、配布の軽さと「画面からは決まった窓口しか呼べない」境界のはっきりさを取りました。",
    "Rust で書くのは、ファイル・見張り・zip の 3 つだけ。画面の都合は Rust 側に持ち込まない、と決めています(巻三)。",
], 13.5)

# ================================================================ 13 さわれる図 01
widget_page("w-library", "巻二 · 道具を選ぶ", "さわってみよう: 書庫の地図",
            "道具を、役目ごとの 6 つの棚に並べました。本をクリックすると、役目・選んだ理由・コードの在りかが読めます。",
            "library3d", "書庫の地図(3D)", 600,
            "ドラッグで見回し、ホイールで寄る。上の札で「Rust」「画面」「開発用」「内蔵」に絞れる。← → キーで本を順に取り出せる。中央の書見台は資料の本文。")

# ================================================================ 14 React・TypeScript・Vite
page("react", "巻二 · 道具を選ぶ", "画面の道具 — React と Vite")
prose("lead", 188, 72, "画面は React 18 と TypeScript で書き、Vite で開発・ビルドしています。どれも、いまの Web の画面づくりの定番です。")
card("react", 64, 276, 640, 182, "React 18 — 画面を部品で組む", "要素の種類ごとに TextEl・ShapeEl・ChartEl … の部品を分け、Slide.tsx が本文の順に並べる。編集の部品(react-moveable)やグラフ(react-chartjs-2)の React 版がそろっていたのが決め手。", "src/render/Slide.tsx")
card("ts", 64, 474, 640, 182, "TypeScript 5 — 本文を型で守る", "本文の型(model/deck.ts)を ai/schema.json と対応させる。要素の種類を取り違えると、書いた時点で型の検査(npx tsc --noEmit)が止める。", "src/model/deck.ts")
card("vite", 64, 672, 640, 182, "Vite 5 — 開発と本番のビルド", "開発中は 1420 番で配信し、Tauri がそこを読む(devUrl)。保存すると画面だけが差し替わる。本番は dist/ に固めて EXE に入れる。", "vite.config.ts")
note("tip", 870, 82, "Windows では、cargo の出力フォルダを Vite が見張ると EBUSY で落ちる。vite.config.ts の server.watch.ignored に src-tauri を入れたままにする決まりがある。", 11)

# ================================================================ 15 react-moveable と react-selecto
page("moveable", "巻二 · 道具を選ぶ", "編集の道具 — Moveable と Selecto")
prose("lead", 188, 72, "R2(ドラッグが最優先)の中心になる部品です。どちらも Daybrush 製の MIT で、組み合わせて使う前提で作られています。")
card("mv", 64, 276, 310, 290, "react-moveable", "選んだ要素に枠とつまみを付け、移動・伸縮・回転・スナップをまとめて受け持つ。ほかの要素の辺と中央、紙の端と中央をガイド線にして、6px 以内で吸い付く。", "src/editor/Editor.tsx")
card("sel", 394, 276, 310, 290, "react-selecto", "クリック・Shift+クリック・ドラッグの囲みで要素を選び、選んだ要素の DOM を Moveable に渡す。操作の範囲は、紙面の周りの灰色まで含む(.stage)。", "src/editor/Editor.tsx")
point_box("why", 586, 200, "自前で書かなかった理由", "回転した要素の伸縮、複数の要素のまとめての変形、スナップの計算 —— どれも端の場合が多い。ここは定評のある部品に任せ、自分の時間は「PowerPoint と同じ動き」の調整(巻五)に回した。", bullets=False)
prose("univer", 806, 146, "設計の段階では、Univer Slides(Apache-2.0)を土台にする案も挙がっていました。結局は、自前の描画にこれらの部品を組み合わせる形になり、本文の形を自分で決められる構成になりました。", 13)

# ================================================================ 16 zustand と zundo
page("store", "巻二 · 道具を選ぶ", "状態の道具 — zustand と zundo")
prose("lead", 188, 72, "開いている資料・選択・編集中の要素などの状態は、zustand の 1 つの store(src/store.ts)にまとめています。")
code("code", 276, 176, [
    "export const useStore = create<State>()(",
    "  temporal((set, get) => ({ … }), {",
    "    partialize: (s) => ({ deck: s.deck }),   // 積むのは本文だけ",
    "    equality: (a, b) => a.deck === b.deck,  // 参照が変わったら 1 歩",
    "    limit: 200,                              // 最大 200 歩",
    "  }),",
    ");",
])
point_box("pts", 472, 480, "4 つの効きどころ", [
    "**partialize**: 積むのは本文だけ。選択や表示中のページは積まないので、Ctrl+Z で選択だけが戻るようなことは起きない",
    "**不変の更新**: 本文を直すときは、変えたページだけを新しく作り、ほかは前の物をそのまま使う。参照を比べるだけで「変わったか」がわかり、200 歩積んでも軽い",
    "**React の外から読める**: useStore.getState() で、保存のタイマーやテストからも同じ状態を読める",
    "**戻した後の始末**: Ctrl+Z の後は、変わったページへ表示を移す(settleAfterHistory)。PowerPoint と同じく、戻した所が見える",
])

# ================================================================ 17 描く道具
page("draw", "巻二 · 道具を選ぶ", "描く道具 — グラフ・数式・3D")
prose("lead", 188, 72, "要素を画面に描く道具たちです。どれも「画面では動き、書き出しでは静かになる」使い方をしています。")
tool_rows([
    ("Chart.js 4", "react-chartjs-2\ndatalabels", "グラフを画面で動かす(ホバー・切り替え)。棒・横棒・折れ線・面・円・ドーナツの 6 種類に絞り、どれも pptx のネイティブのグラフに写せる。一覧のサムネイルでは動きを止める。"),
    ("KaTeX 0.19", "数式", "TeX の数式をその場で組む。速く、書体も同梱。ダブルクリックで直すと、打つたびに組み直す。pptx には画像にして入れる(巻七)。"),
    ("lucide-react", "アイコン(ISC)", "操作ボタンのアイコン。角の丸い線画・線の太さ 1.75 にそろえ、短いラベルと並べる。使う絵だけが本番に入る。"),
    ("three.js r159", "3D(動く図)", "動く図の 3D(このノートの書庫も)。アプリ本体ではなく、資料の widgets/ の HTML に埋め込む。外の CDN に頼らず、資料だけで動く。"),
], 276, 104, 14)
point_box("trap", 752, 200, "落とし穴: 本番だけグラフが消える", "react-chartjs-2 の汎用の <Chart> は、グラフの種類(controller)を登録しない。開発中は動いても、本番のビルドの tree-shaking で消えて描けなくなる。ChartEl.tsx で 4 つの controller を登録し、npm run test:production で全 6 種類を確かめる。", bullets=False, size=12.5)

# ================================================================ 18 書き出しと外殻の道具
page("crates", "巻二 · 道具を選ぶ", "渡す道具と、Rust のクレート")
prose("lead", 188, 72, "書き出しの道具と、Rust の外殻を支えるクレート(Rust の部品)です。")
card("pptx", 64, 272, 640, 186, "pptxgenjs 4 — pptx を組み立てる", "ブラウザの中で、文字・図形・表・グラフを PowerPoint のネイティブ要素で出せる。大きいので、書き出すときだけ import() で読み込む。中で使う JSZip は MIT と GPL-3.0 の二重ライセンスで、MIT を選んで使う。", "src/export/pptx.ts")
table("table", X, 482, W, 330, [
    ["クレート", "役目", "ライセンス"],
    ["tauri 2", "窓・WebView・IPC", "Apache-2.0 / MIT"],
    ["tauri-plugin-dialog 2", "開く・保存のダイアログ", "Apache-2.0 / MIT"],
    ["notify 7", "フォルダの見張り", "CC0-1.0"],
    ["serde・serde_json 1", "型と JSON の変換", "MIT / Apache-2.0"],
    ["zip 9", "1 ファイルにまとめる・展開", "MIT"],
    ["base64 0.22", "画像・pptx を文字にして運ぶ", "MIT / Apache-2.0"],
], [200, 260, 180], 12)
note("pdf", 830, 122, "PDF には専用の道具を使っていない。全ページを並べた印刷用の面を作り、印刷の「PDF に保存」で出す(巻七)。設計書の段階では、Rust で SVG から PDF を作る案(resvg・svg2pdf)も検討していた。", 11.5)

# ================================================================ 19 ライセンスの棚
page("licenses", "巻二 · 道具を選ぶ", "ライセンスの棚")
prose("lead", 188, 108, "依存は、依存の依存まで数えると 253 個(npm 54・Rust のクレート 199)。すべてのライセンス文を THIRD_PARTY_LICENSES.txt にまとめ、インストーラに LICENSE と一緒に入れています。")
chart("chart", 64, 308, 330, 320, "doughnut", ["MIT / Apache-2.0  135", "MIT  74", "その他の許容型  22", "Unicode  16", "MPL-2.0  4", "Apache-2.0  2"],
      [{"name": "依存の数", "values": [135, 74, 22, 16, 4, 2]}], "253 個の依存のライセンス", legend="bottom", showValues=False,
      colors=["accent2", "accent6", "accent4", "accent3", "accent1", "accent5"])
text("side", 418, 318, 286, 300, [
    "「その他」は BSD・ISC・Zlib・CC0・Unlicense など。どれも許容型",
    "MPL-2.0 の 4 個は Tauri 経由で入る。改変せずに使い、入手先を書く",
    "GPL を選べる JSZip は、MIT のほうを選んで使う",
], 12.5, "dk1", bullets=True, lh=1.7, ps=10)
point_box("rules", 652, 300, "決まり", [
    "依存を足したら npm run licenses で作り直す(本番の依存と、本体にリンクされるクレートだけを集める)",
    "Anthropic のスキルのファイルは再配布できないので、リポジトリに入れない",
    "見本の資料に他人の画像を入れるときは、作者・ライセンス・URL・加工の有無を資料の中に書く",
])

# ================================================================ 20 扉 巻三
door("ch3", "巻 三", "LIBER  III", "二つの世界をつなぐ", "Rust の世界と Web の世界は、決まった窓口だけでつながっています。この巻では、その窓口と、ファイルを安全に扱う工夫を見ます。",
     ["Tauri のしくみ — 2 つのプロセスと手紙", "境界の約束とコマンドの一覧", "壊さずに書く — 一時ファイルと置き換え", "フォルダを見張る — notify", "外の書き換えを迎える — 控えと差分", "1 ファイルにまとめる — zip の .deck"], "emblem-3")

# ================================================================ 21 Tauri のしくみ
page("ipc", "巻三 · 二つの世界をつなぐ", "Tauri のしくみ — 2 つのプロセス")
prose("lead", 188, 108, "起動すると Rust の本体が窓を作り、その中に WebView2 を開いて画面(React)を読み込みます。2 つは別々のプロセスで、手紙でやりとりします。")
shape("rust-bg", 64, 312, 240, 270, fill="lt2", line={"color": "accent2", "width": 2}, radius=10, group="rustg")
text("rust-t", 84, 326, 200, 30, "lumifold.exe(Rust)", 14, "accent2", bold=True, group="rustg", font="head")
text("rust-b", 84, 366, 200, 200, ["tauri::Builder", "コマンド 11 個(#[tauri::command])", "見張り(notify)", "zip・base64"], 12, "dk1", bullets=True, lh=1.6, ps=8, group="rustg")
shape("web-bg", 464, 312, 240, 270, fill="lt2", line={"color": "accent6", "width": 2}, radius=10, group="webg")
text("web-t", 484, 326, 200, 30, "WebView2(画面)", 14, "accent6", bold=True, group="webg", font="head")
text("web-b", 484, 366, 200, 200, ["React の画面(dist/ か localhost:1420)", "src/tauri.ts(窓口)", "zustand の store", "動く図の iframe"], 12, "dk1", bullets=True, lh=1.6, ps=8, group="webg")
arrow("m1", 462, 386, 306, 386, "accent6")
label("m1-l", 306, 356, 156, 26, "invoke(名前, 引数)", 10, "accent6")
arrow("m2", 306, 450, 462, 450, "accent2")
label("m2-l", 306, 420, 156, 26, "戻り値 / エラー", 10, "accent2")
arrow("m3", 306, 530, 462, 530, "accent2")
label("m3-l", 306, 500, 156, 26, 'emit("deck-changed")', 10, "accent2")
code("code", 606, 190, [
    "// Rust 側(src-tauri/src/lib.rs)",
    "#[tauri::command]",
    "fn write_deck(path: String, text: String) -> Result<(), String> { … }",
    "",
    "// Web 側(src/tauri.ts)",
    'await invoke<void>("write_deck", { path, text });',
])
prose("body", 812, 140, "引数と戻り値は JSON になって運ばれます。だから画像や pptx のようなバイト列は base64 の文字にして渡します。画面のコードが勝手にファイルを開くことはできません。", 13)

# ================================================================ 22 境界の約束とコマンド一覧
page("cmds", "巻三 · 二つの世界をつなぐ", "境界の約束とコマンドの一覧")
card("web", 64, 192, 310, 170, "Web は OS に触らない", "ファイル・ダイアログに触るのは src/tauri.ts だけ。画面の部品はここの関数を呼ぶ。", head_color="accent6")
card("rust", 394, 192, 310, 170, "Rust は画面を知らない", "本文は文字列のまま受け取り、レイアウトの判断をしない。", head_color="accent2")
table("table", X, 384, W, 440, [
    ["コマンド", "仕事"],
    ["initial_deck", "起動時に開く資料(起動引数か DECK_STUDIO_OPEN)"],
    ["read_deck", "本文・ウィジェットの HTML を読む"],
    ["write_deck", "本文を書き戻す(一時ファイル → 置き換え)"],
    ["read_asset", "画像を data URL にして返す"],
    ["import_asset・write_asset", "画像を assets/ に入れる(同じ名前なら -1, -2 …)"],
    ["backup_deck", "書き換え直前の本文を .history/ へ(30 世代)"],
    ["write_binary", "書き出した pptx を書く"],
    ["watch_deck", "資料のフォルダを見張り始める"],
    ["prepare_deck・pack_deck", "zip を展開する・1 ファイルにまとめる"],
], [230, 410], 12)
note("browser", 844, 104, "ブラウザだけでも動く: inTauri() が偽なら、本文は fetch で読み、保存はしない。テストの多くは、この「ブラウザモード」で vite dev を Edge で開いて回している。", 11.5)

# ================================================================ 23 壊さずに書く
page("atomic", "巻三 · 二つの世界をつなぐ", "壊さずに書く — 別名で書いて置き換え")
prose("lead", 188, 108, "自動保存は編集のたびに走ります。書いている途中に AI やアプリが読むと、半分だけの JSON を読んでしまう。そこで「別名で書いてから置き換える」(atomic rename)を使います。")
node("s1", 64, 318, 186, 92, "① 全部書く", "資料.deck.tmp に", line="accent2")
node("s2", 291, 318, 186, 92, "② 置き換える", "rename で 資料.deck に", line="accent2")
node("s3", 518, 318, 186, 92, "③ 失敗したら", ".tmp を消して終わる", line="accent1")
arrow("a1", 252, 364, 289, 364, "accent2")
arrow("a2", 479, 364, 516, 364, "accent2")
caption("cap", 420, "置き換えは一瞬。読む側には「前の本文」か「新しい本文」のどちらかしか見えない", align="center")
code("code", 466, 214, [
    "fn replace_via_temp(target, write) {",
    "  let tmp = target + \".tmp\";",
    "  write(&tmp)?;                         // 失敗したら tmp を消して終わり",
    "  loop {",
    "    match rename(&tmp, target) {",
    "      Ok(()) => return Ok(()),",
    "      Err(_) if attempt < 5 => sleep(50ms), // つかまれていたら待って再挑戦",
    "      Err(e) => { remove(&tmp); return Err(e) }",
    "} } }",
])
prose("body", 700, 252, [
    "Windows では、置き換え先をウイルス対策・同期ソフト・開いている PowerPoint などがつかんでいると、rename が一瞬だけ失敗します。そこで 50 ms 待って、5 回までやり直します。",
    "一時ファイルの名前は .tmp で終わるので、見張り(次のページ)はこれを知らせません。pptx の書き出しも同じ書き方です。",
], 13.5)

# ================================================================ 24 フォルダを見張る
page("watch", "巻三 · 二つの世界をつなぐ", "フォルダを見張る — notify")
prose("lead", 188, 176, [
    "外(Claude Code)が本文を書き換えたら、すぐ描き直したい。Rust の notify で、資料のフォルダを丸ごと見張ります。",
    "本文のファイルではなくフォルダを見るのは、atomic rename で置き換えられると、元のファイルを見張る仕組みでは見失うことがあるからです。",
], 13.5)
table("table", X, 380, W, 230, [
    ["変わったもの", "画面への知らせ"],
    ["本文(資料名.deck)", '"deck-changed"(本文のパス)'],
    ["画像・ウィジェット", '"assets-changed"(パスの一覧)'],
    [".history/ の中", "知らせない(控えを書いても読み直さない)"],
    ["書き込み中の .tmp", "知らせない"],
], [220, 420], 12)
prose("rev", 630, 104, "画面は、ファイルごとに「版」の番号を持ちます(assetRevision.ts)。知らせが来たファイルだけ版を上げ、その画像・ウィジェットだけを読み直します。", 13)
point_box("trap", 752, 200, "落とし穴: 1 回の変更を 2 回処理していた", "Tauri の listen の登録は非同期。開発版の React(StrictMode)は effect を付けて外して付け直すので、登録が終わる前に後始末が来ることがある。そのときは登録が終わった時点で外す(unlistenLater)。", bullets=False, size=12.5)

# ================================================================ 25 さわれる図 02
widget_page("w-courier", "巻三 · 二つの世界をつなぐ", "さわってみよう: 伝令の道",
            "人がドラッグしたときと、Claude Code が書き換えたときに、手紙がどう走るかを追いかけます。",
            "courier", "伝令の道", 600,
            "「人が動かす」を素早く何回か押すと、待ちが掛け直されて、書き込みは 1 回にまとまる。自分で書いた本文が見張りから戻ってきても、中身が同じなので読み直さない。")

# ================================================================ 26 外の書き換えを迎える
page("external", "巻三 · 二つの世界をつなぐ", "外の書き換えを迎える")
prose("lead", 188, 72, "外の書き換えを見つけたら、ただ描き直すだけでは不安が残ります。何が変わったかを示し、戻せるようにしています。")
numbered([
    ("自分の書き込みか見分ける", "届いた本文が、最後に自分が書いた本文(lastSavedText)と同じなら何もしない。"),
    ("控えを残す", "取り込む直前の本文を backup_deck で .history/ へ。新しい方から 30 世代を残す。"),
    ("違いを数える", "diffDecks がページと要素を id で突き合わせ、追加・変更・削除・並べ替えを数える(model/diff.ts)。"),
    ("知らせて、戻せるようにする", "上部の帯に「変更 2 枚・追加 1 枚」。一覧に印、変わった要素に点線の枠。「元に戻す」で最初の書き換えの前へ。"),
], 280, 128, 78)
point_box("id", 806, 146, "id を変えない約束が、ここで効く", "id で突き合わせるので、AI が位置を少し動かしただけなら「同じ要素の変更」とわかる。続けて書き換えられたら、帯は 1 つにまとめる。", bullets=False, size=12.5)

# ================================================================ 27 1 ファイルにまとめる
page("pack", "巻三 · 二つの世界をつなぐ", "1 ファイルにまとめる")
prose("lead", 188, 72, "作業中の資料はフォルダ(本文 + assets/ + widgets/)です。人に渡すときだけ、zip 1 つにまとめます。")
code("tree", 278, 178, ["資料名/", "  資料名.deck   本文(テキストの JSON)", "  assets/       画像", "  widgets/      動く図の HTML", "  .history/     外の書き換えの控え"], 11, x=64, w=300)
arrow("a-pack", 370, 330, 450, 330, "accent1")
label("l-pack", 366, 296, 90, 26, "まとめる", 11, "accent1", bold=True)
arrow("a-open", 450, 400, 370, 400, "accent2")
label("l-open", 366, 410, 90, 26, "開く", 11, "accent2", bold=True)
node("zip", 456, 290, 248, 150, "資料名.deck(zip)", "先頭 4 バイト = PK\\x03\\x04\n中の本文は deck.json", line="accent3", lw=2.2, tsize=14)
point_box("rules", 470, 380, "決まり", [
    "拡張子はどちらも .deck。先頭の 4 バイトが PK\\x03\\x04 なら zip、そうでなければテキスト",
    "本文が参照している画像・ウィジェットだけを入れる。フォルダの外を指す画像は assets/ に入れ直して、参照を書き換える",
    "開くと隣の「資料名/」に展開する(あれば「資料名 (2)/」…)。同じファイルなら展開済みのフォルダを開く(印は .deck-source.json)",
    "展開では ../ や絶対パスの名前を拒み、2 GB・1 万ファイルまで。壊れた zip や悪意のある zip でディスクを埋めない",
], size=12.5)
note("why", 866, 80, "作業中を zip にしないのは、AI が本文を直接読み書きでき、見張り・自動保存・差分がそのまま使えるから。", 11.5)

# ================================================================ 28 扉 巻四
door("ch4", "巻 四", "LIBER  IV", "紙面を描く", "本文の JSON を、画面の上の紙面にする巻です。どの大きさの窓でも同じ見た目になるように、1 つの決まりで描いています。",
     ["論理キャンバスと、最後の 1 回の拡縮", "1 ページを層に分ける(さわれる図 03)", "文字を組む — 文節改行とはみ出しの見張り", "グラフ・数式・図形", "動く図の器と、手紙のやりとり", "拡縮から UI を守る"], "emblem-4")

# ================================================================ 29 論理キャンバスと拡縮
page("canvas", "巻四 · 紙面を描く", "論理キャンバスと拡縮")
prose("lead", 188, 108, "要素の位置は、いつも同じ大きさの「論理キャンバス」の px で書きます。スライドは 1280×720、ノートは 768×1024。画面の大きさに合わせるのは、最後の 1 回の拡縮だけです。")
code("code", 312, 176, [
    '<div class="slide-outer" style="width: 768s px; height: 1024s px">',
    '  <div class="slide" style="width: 768px; height: 1024px;',
    '       transform: scale(s); transform-origin: top left">',
    '    <div class="el" style="position: absolute; left: 64px; top: 72px;',
    '         width: 640px; height: 80px"> …本文の要素… </div>',
])
math_el("m-scale", 64, 506, 640, 80, r"s = \min\!\left(\dfrac{W}{768},\ \dfrac{H}{1024}\right)", 22)
math_el("m-unit", 64, 594, 640, 60, r"1\,\mathrm{in} = 96\,\mathrm{px}, \qquad 1\,\mathrm{pt} = \tfrac{96}{72}\,\mathrm{px}", 20)
prose("body", 668, 284, [
    "W・H は画面で使える幅と高さ。要素は絶対配置の div で、本文の x・y・w・h をそのまま left・top・width・height にします。拡縮は外側の transform 1 つなので、窓を広げても文字の折り返しは変わりません。",
    "pptx へは 96 で割るだけ。1280×720 は PowerPoint のワイド(13.333×7.5 インチ)に、768×1024 は 8×10.667 インチにぴったり合います。",
], 13.5)

# ================================================================ 30 さわれる図 03
widget_page("w-anatomy", "巻四 · 紙面を描く", "さわってみよう: 紙面の解剖",
            "1 ページを、要素ごとの層に分けて立体にしました。層の重なり順は、本文の elements の並び順そのものです。",
            "anatomy3d", "紙面の解剖(3D)", 600,
            "「分解」で層が離れる。層をクリックすると、その要素の JSON と CSS が出る。「前面へ」「背面へ」で並び順を入れ替えてみよう。上の 2 枚(ページ番号・編集の層)は要素ではない。")

# ================================================================ 31 文字を組む
page("text", "巻四 · 紙面を描く", "文字を組む")
prose("lead", 188, 72, "文字は「段落 → ラン」の 2 段を、そのまま HTML にします。段落は div、ランは書式の付いた span です。")
for i, (head, lines, col) in enumerate([("ふつうの改行", ["本文の JSON を、画面の上の紙", "面にする巻です。"], "accent5"),
                                        ("文節で改行(auto-phrase)", ["本文の JSON を、画面の上の", "紙面にする巻です。"], "accent2")]):
    x = 64 + i * 330
    label(f"cmp{i}-h", x, 276, 310, 24, head, 11, col, align="left", bold=True, font="head", group=f"cmp{i}")
    shape(f"cmp{i}-bg", x, 304, 310, 104, fill="lt1", line={"color": col, "width": 1.2}, radius=6, group=f"cmp{i}")
    text(f"cmp{i}-t", x + 18, 316, 280, 84, lines, 15, "dk1", lh=1.7, group=f"cmp{i}", check=False)
code("code", 428, 96, [
    "const TEXT_WRAP = { whiteSpace: \"pre-wrap\", wordBreak: \"auto-phrase\",",
    "                    overflowWrap: \"anywhere\", lineBreak: \"strict\" };   // TextEl.tsx",
])
point_box("rules", 544, 408, "改行の規則と、はみ出しの見張り", [
    "**auto-phrase**: 日本語を文節で改行する(WebView2 / Edge 119 以降、lang=\"ja\" のとき)",
    "**strict**: 「ー」や小さい「ゃ」を行頭に置かない。**anywhere**: 1 行に入らない長い英単語だけ途中で折る",
    "同じ規則を、表示・文字の編集・枠合わせ・表で共有する。状態を切り替えても改行位置が変わらない",
    "段落の並びの高さが枠より高ければ「文字がはみ出しています」の印を出す。書体の読み込みが終わった後にも測り直す",
], size=12.5)

# ================================================================ 32 グラフ・数式・図形
page("elements", "巻四 · 紙面を描く", "グラフ・数式・図形")
prose("lead", 188, 72, "文字のほかの要素も、それぞれ得意な道具で描きます。下のグラフは、このノートを作っている要素を種類ごとに数えたものです。")
count_chart = chart("count", 64, 272, 640, 270, "bar", ["文字", "図形", "画像", "表", "数式", "グラフ", "動く図"],
                    [{"name": "要素の数", "values": [0, 0, 0, 0, 0, 0, 0]}], "このノートの要素の数", legend="none", showValues=True)
tool_rows([
    ("グラフ", "ChartEl.tsx", "Chart.js で描く。色はテーマの accent1 から順に。一覧のサムネイルでは、動きとツールチップを止める。"),
    ("数式", "MathEl.tsx", "KaTeX で HTML に組む。編集パネルは数式のすぐ下(入らなければ上)に出し、右パネルに重ねない。書き方の誤りは日本語で出す。"),
    ("図形", "ShapeEl.tsx", "SVG で描く。要素の w・h をそのまま viewBox にするので、伸ばしても線の太さは変わらない。編集点を動かすと polygon(頂点は 0〜1 の割合)になる。"),
], 568, 104, 20, name_w=140)

# ================================================================ 33 動く図の器
page("embed", "巻四 · 紙面を描く", "動く図の器 — sandbox の iframe")
prose("lead", 188, 108, "さわれる図は、資料フォルダの widgets/ にある自己完結の HTML です。アプリはそれを iframe に入れて動かします。このノートの 6 つの図もそうです。")
code("code", 312, 52, ['<iframe srcdoc="…HTML の中身…" sandbox="allow-scripts">'], 11)
point_box("rules", 386, 402, "器の決まり", [
    "**sandbox=\"allow-scripts\"**: スクリプトは動くが、親の画面・ファイル・Cookie には触れない(別のオリジン扱い)",
    "HTML は Rust の read_deck で文字として読み、srcdoc で渡す。外の CDN は使わない(three.js も中に埋め込む)",
    "3 つのモード: 配置(透明なカバーでドラッグを受ける)・操作(カバーを外す)・固定(位置を守り、いつでも操作できる)",
    "ドラッグ中は iframe の pointer-events を切る。ポインタが iframe に入ると、親が mousemove を受け取れなくなるから",
    "一覧のサムネイルは、見えている物だけ iframe を作り(IntersectionObserver)、アニメーションは 125 ms おきに間引く",
], size=12.5)
point_box("build", 802, 150, "作り方", "widgets/*.template.html に書き、python tools/build-widgets.py で *.html を作る。three.js や共通の部品は、決まった印の所に差し込まれる。", bullets=False, size=12.5)

# ================================================================ 34 手紙のやりとり
page("messages", "巻四 · 紙面を描く", "手紙のやりとり — postMessage")
prose("lead", 188, 72, "親(アプリ)と iframe(ウィジェット)は、postMessage の手紙だけでやりとりします。名前はどれも deck-studio: で始まります。")
node("parent", 80, 276, 232, 46, "親(アプリ)", line="accent6", tsize=13.5)
node("child", 456, 276, 232, 46, "ウィジェット(iframe)", line="accent1", tsize=13.5)
shape("life-p", 4, 516, 384, 2, kind="line", line={"color": "accent5", "width": 1}, rotation=90)
shape("life-c", 380, 516, 384, 2, kind="line", line={"color": "accent5", "width": 1}, rotation=90)
MSGS = [("widget-ready", "準備ができた", -1), ("widget-restore { state }", "前の状態を返す", 1), ("widget-state { state }", "さわるたびに", -1),
        ("widget-exit", "Esc で配置に戻る", -1), ("presentation-key { key }", "発表中のページ送り", -1)]
for i, (name, desc, d) in enumerate(MSGS):
    y = 372 + i * 64
    if d < 0:
        arrow(f"msg{i}", 570, y, 198, y, "accent1" if d < 0 else "accent6", 1.6)
    else:
        arrow(f"msg{i}", 198, y, 570, y, "accent6", 1.6)
    label(f"msg{i}-n", 206, y - 30, 356, 22, name, 11.5, "dk1", bold=True)
    label(f"msg{i}-d", 206, y + 8, 356, 20, desc, 10, "accent5")
point_box("rules", 702, 250, "受け取る側の用心", [
    "親は event.source がその iframe のときだけ受け付ける。ウィジェットも source === parent を確かめる",
    "状態はメモリにだけ置く(最大 100 個、1 つ 131072 文字まで)。本文にも Ctrl+Z の履歴にも入れない",
    "名前が deck-studio: なのは旧名のなごり。変えると既存のウィジェットが動かなくなるので残している",
], size=12.5)

# ================================================================ 35 拡縮から UI を守る
page("uiscale", "巻四 · 紙面を描く", "拡縮から UI を守る")
prose("lead", 188, 108, "紙面は transform: scale で縮むので、紙面の中に置いた操作ボタンも一緒に縮みます。狭い画面では、ボタンの文字が数 px になってしまいます。")
math_el("m", 64, 308, 640, 64, r"\mathrm{UI} \times s \times \tfrac{1}{s} = \mathrm{UI}", 22)
caption("cap", 374, "紙面の拡縮 s を、UI の側で 1/s を掛けて打ち消す", align="center")
point_box("rules", 420, 410, "4 つの決まり", [
    "紙面の中の編集 UI は拡縮を打ち消す。CSS は --ui-scale、JS は UiScaleContext。Moveable には zoom = 1/s を渡す",
    "要素に付く操作バーやパネルは、紙面の中に置かない(はみ出すと切れる)。portal と position: fixed で .stage の中に置き、右パネルに重ねない(FloatingBar)",
    "ボタンは mousedown で preventDefault する。編集中の文字からフォーカスを奪わない",
    "見えない(opacity 0)操作部品は、pointer-events も切る。透明なボタンが、下の要素のクリックを奪わないように",
], size=12.5)
note("audit", 848, 80, "これらの決まりは ui-audit(巻七)が、68 の状態と 3 つの画面幅で見張っている。", 11.5)

# ================================================================ 36 扉 巻五
door("ch5", "巻 五", "LIBER  V", "手で直す", "R2(ドラッグが最優先)の巻。部品は react-moveable と react-selecto ですが、手になじむ動きにするための調整がほとんどでした。手本は PowerPoint です。",
     ["選ぶ・動かすの流れ", "スナップ・Ctrl+Z・自動保存(さわれる図 04)", "PowerPoint に合わせた動き", "履歴と自動保存のしくみ", "編集の部品たち", "画像を入れる 3 つの道・コメントと AI"], "emblem-5")

# ================================================================ 37 選ぶ・動かす
page("select", "巻五 · 手で直す", "選ぶ・動かすの流れ")
prose("lead", 188, 72, "クリックしてからドラッグを離すまでに、部品の間を次の順に仕事が渡ります。")
FLOW = [("pointerdown(.stage)", "紙面の周りの灰色も含む操作領域。余白のクリックで選択を外す"),
        ("Selecto: どれを選ぶか", "Shift で追加・解除(グループ単位)。ドラッグの囲みで複数"),
        ("store.select(ids) → 再描画", "選んだ要素の DOM を Moveable の target に渡す"),
        ("Moveable: 枠・つまみ・ドラッグ", "ドラッグ中は見た目だけ動かし、本文は変えない"),
        ("離した: patchElements() を 1 回", "本文が 1 回だけ変わる → Ctrl+Z 1 回で戻る")]
for i, (t, d) in enumerate(FLOW):
    y = 274 + i * 76
    node(f"f{i}", 64, y, 300, 54, t, line="accent6" if i < 4 else "accent1", tsize=12.5)
    if i:
        arrow(f"fa{i}", 214, y - 21, 214, y - 1, "accent5", 1.4)
    label(f"fd{i}", 382, y + 4, 322, 48, d, 11.5, "dk1", align="left")
point_box("traps", 664, 288, "つまずいた所", [
    "Moveable と Selecto に渡す入れ物は、callback ref で state に入れてから渡す。最初の描画の null を渡すと、操作の範囲が window 全体になる",
    "素早いクリックの後に、終わらないドラッグが残った。Selecto → Moveable の dragStart は再描画を待つので、離した後に始まっていた。「ボタンがまだ押されているときだけ」呼ぶ",
], size=12.5)

# ================================================================ 38 さわれる図 04
widget_page("w-desk", "巻五 · 手で直す", "さわってみよう: 編集の机",
            "小さな紙面で、スナップ・Ctrl+Z・自動保存の 3 つを同時に見られる机です。",
            "desk", "編集の机", 606,
            "ガイドに 6px 以内で近づくと吸い付く。画像の角は縦横比を保ち、Shift で外れる(図形は逆)。左下が Ctrl+Z の履歴、右下が 400ms の自動保存の待ち。")

# ================================================================ 39 PowerPoint に合わせる
page("ppt", "巻五 · 手で直す", "PowerPoint に合わせる")
prose("lead", 188, 72, "使う人の頭の中の基準は PowerPoint です。迷ったら、PowerPoint ではどう動くかを確かめて合わせました。")
table("table", X, 276, W, 470, [
    ["操作", "動き"],
    ["画像の角をドラッグ", "縦横比を保つ。Shift で外す"],
    ["図形の角をドラッグ", "自由に変わる。Shift で縦横比を保つ"],
    ["辺のつまみ", "その方向だけ伸びる"],
    ["グループの要素をクリック", "1 回目はグループ全体、2 回目で中の要素"],
    ["グループを伸ばす", "まとめて伸縮。文字の大きさ・線の太さは変えない"],
    ["新しく入れる画像", "縦横比を保って収める(スライドは最大 640×405、ノートは 384×576)"],
    ["Ctrl+Z の後", "変わったページへ表示を移す(戻した所が見える)"],
    ["位置を固定", "位置・大きさ・削除を守る。中身(文字・表・数式)は直せる"],
], [220, 420], 12)
note("scale", 768, 90, "グループの伸縮は src/editor/scale.ts。回転した直線を含むときは、両端の点を写す。グループの回転はできない。", 11.5)

# ================================================================ 40 履歴と自動保存
page("history", "巻五 · 手で直す", "履歴と自動保存")
prose("lead", 188, 72, "Ctrl+Z と自動保存は、同じ「本文が変わった」という出来事から動きます。")
node("set", 234, 272, 300, 50, "本文が変わる(set)", line="accent1", tsize=13)
node("zundo", 64, 360, 300, 56, "zundo", "過去の本文を積む(最大 200 歩)", line="accent6")
node("sub", 404, 360, 300, 56, "subscribe", "400ms の待ちを掛け直す", line="accent2")
node("save", 404, 448, 300, 50, "flushSave → write_deck", line="accent2", tsize=12.5)
arrow("a1", 330, 324, 250, 358, "accent5", 1.4)
arrow("a2", 438, 324, 518, 358, "accent5", 1.4)
arrow("a3", 554, 418, 554, 446, "accent5", 1.4)
code("code", 516, 170, [
    "useStore.subscribe((s, prev) => {",
    "  if (s.deck === prev.deck) return;",
    "  if (skipNextSave) { skipNextSave = false; return; }  // ファイルから読んだだけ",
    "  clearTimeout(saveTimer);",
    "  saveTimer = setTimeout(flushSave, 400);",
    "});",
])
point_box("rules", 700, 252, "決まり", [
    "skipNextSave は「次の 1 回だけ保存しない」旗。読み込んだ本文と参照で比べる方法は使わない(Ctrl+Z で読み込み直後に戻ると、保存されなくなる)",
    "書き込みは 1 列に並べる(saveQueue)。前の書き込みが終わる前に次を始めない",
    "書く直前に、最後に書いた本文と同じなら書かない",
], size=12.5)

# ================================================================ 41 編集の部品たち
page("parts", "巻五 · 手で直す", "編集の部品たち")
prose("lead", 188, 72, "編集の画面は、役目ごとの部品に分かれています(src/editor/)。")
table("table", X, 270, W, 560, [
    ["部品", "役目"],
    ["Editor.tsx", "Moveable と Selecto。ドラッグ・伸縮・回転・スナップ"],
    ["useEditorKeys.ts", "キー操作と貼り付け(Ctrl+C/X/V/A・F2・矢印)"],
    ["TextEditOverlay", "文字の直接編集。表示と同じ書式・背景で重ねる"],
    ["TableEditOverlay", "表のセル。Tab で移動、列の境界をドラッグ"],
    ["MathEditOverlay", "TeX の編集パネル。右パネルに重ねない"],
    ["ShapeEditOverlay・LineHandles", "図形の編集点と、線の端点"],
    ["ContextMenu・elementMenu", "右クリックのメニュー"],
    ["PropertiesPanel", "右パネル。複数選択でそろわない値は「混在」"],
    ["ChartDataDialog", "グラフのデータ。Excel の表を貼れる"],
    ["FloatingBar", "要素に付く操作バー(portal で .stage へ)"],
], [250, 390], 12)
note("consistency", 846, 100, "文字の編集枠は、表示と同じ上下位置から始まる。編集に入っても字面が動かないことを、e2e-state-consistency が全要素で確かめている。", 11.5)

# ================================================================ 42 画像を入れる 3 つの道
page("images", "巻五 · 手で直す", "画像を入れる 3 つの道")
prose("lead", 188, 72, "画像は、挿入ボタン・貼り付け・ドロップの 3 つの道から入ります。どの道でも、行き先は資料フォルダの assets/ です。")
for i, (t, s) in enumerate([("挿入ボタン", "ファイルを選ぶ → import_asset で assets/ にコピー(ブラウザでは data URL)"),
                            ("貼り付け", "システムのクリップボードに画像があれば優先 → write_asset"),
                            ("ドロップ", "落とした位置が画像の中心 → assets/ へ")]):
    x = 64 + i * 220
    card(f"r{i}", x, 276, 200, 200, t, s, size=12)
point_box("rules", 500, 270, "決まり", [
    "tauri.conf の dragDropEnabled は false。Tauri にファイルのドロップを横取りさせず、画面の drop イベントで受ける",
    "同じ名前のファイルがあれば -1, -2 … を付け、危ない文字は _ にする(unique_asset_path)",
    "入れた画像は縦横比を保って収め、収め方は「引き伸ばす」(fill)",
], size=12.5)
point_box("group", 792, 158, "画像に枠を重ねるときは", "画像と枠の図形に同じ group を付ける。付けないと上の枠だけが選ばれて、画像の大きさを変えられない。", bullets=False, size=12.5)

# ================================================================ 43 コメントと AI
page("comments", "巻五 · 手で直す", "コメントで AI に頼む")
prose("lead", 188, 108, "直してほしい所は、要素ごとのコメントとして本文に残せます。AI はそれを読んで直します(手順は ai/COMMENTS.md)。")
code("code", 312, 176, [
    '{ "id": "s6-chart", "type": "chart", …,',
    '  "comments": [ {',
    '    "id": "c1", "text": "折れ線にして、2025 年を足す",',
    '    "createdAt": "2026-10-17T10:00:00Z",',
    '    "images": [ { "src": "assets/memo.png", "name": "memo.png" } ] } ] }',
])
point_box("rules", 512, 330, "流れ", [
    "コメントは elements[].comments に入る。参考の画像も付けられる",
    "アプリから AI へは自動で送らない。右パネルの「AIへの修正依頼をコピー」で、未解決のコメントをまとめて Claude Code に渡す",
    "AI は id で要素を探して直し、終わったコメントだけ resolved: true にする(本文と画像は残す)",
    "直した結果は、巻三の帯と点線の枠で確かめられる",
], size=12.5)
note("why", 860, 90, "送らないのは、コメントや画像を「外へ送ってよい」という許可と取り違えないため。何を誰に渡すかは、使う人が決める。", 11.5)

# ================================================================ 44 扉 巻六
door("ch6", "巻 六", "LIBER  VI", "本として読む", "Lumifold には、横長のスライドのほかに、縦長の「ノート」があります。このノートもその形です。この巻では、紙をめくる仕組みを分解します。",
     ["ノートの形 — 3:4 の縦のページ", "読む画面 — 単ページと見開き", "折り目の幾何(さわれる図 05)", "陰と、合成するめくりの音(さわれる図 06)", "このノートの作り方"], "emblem-6")

# ================================================================ 45 ノートの形
page("note", "巻六 · 本として読む", "ノートの形")
prose("lead", 188, 108, "資料の種類 format を \"note\" にすると、縦 768×1024 のページになります。Kindle の画面と同じ 3:4 で、見開きにすると 3:2 になり、横長の画面に収まりやすい形です。")
math_el("m", 64, 306, 640, 76, r"\dfrac{768}{1024} = \dfrac{3}{4}, \qquad \dfrac{768 \times 2}{1024} = \dfrac{3}{2}", 22)
point_box("rules", 400, 420, "決まり", [
    "大きさは canvasSize(deck) で引く。画面の言葉も unitName(deck) で「スライド / ページ」を切り替える",
    "種類の切り替えは PowerPoint の「サイズに合わせて調整」と同じ。中身を縦横比を保って縮め、中央へ(文字・線の太さも同じ倍率)。1 回の Ctrl+Z で戻る",
    "元の種類に戻すと、縮尺と余白も戻る(変換前の種類を formatOrigin に残す)",
    "綴じ方 binding(右綴じは表紙が左、← で次へ)と、ページ番号 pageNumbers(\"outside\" は見開きの外の角)",
], size=12.5)
note("this", 840, 90, "このノートは pageNumbers: \"outside\"。章の扉・表紙・裏表紙には hidePageNumber を付けている。", 11.5)

# ================================================================ 46 読む画面
page("reader", "巻六 · 本として読む", "読む画面 — 単ページと見開き")
prose("lead", 188, 72, "「読む」で、本のようにめくる画面(src/Reader.tsx)になります。見開きでは、表紙が右に 1 枚、そのあとは 2–3、4–5 … と並びます。")
SPREADS = [(None, 1), (2, 3), (4, 5), (6, 7)]
for k, (lp, rp) in enumerate(SPREADS):
    x0 = 72 + k * 160
    g = f"sp{k}"
    for side, num in ((0, lp), (1, rp)):
        if num is None:
            continue
        shape(f"{g}-p{side}", x0 + side * 62, 286, 60, 80, kind="rect", fill="lt1" if num > 1 else "dk2", line={"color": "accent5", "width": 1}, group=g)
        text(f"{g}-n{side}", x0 + side * 62, 286, 60, 80, str(num), 14, "accent5" if num > 1 else "accent3", bold=True, align="center", valign="middle", group=g, check=False)
    label(f"{g}-k", x0, 372, 124, 22, f"見開き {k}", 10.5, "accent5", group=g)
point_box("rules", 420, 520, "しくみ", [
    "めくり方: 紙をつまんでドラッグ(3 割引くか払えばめくる)、外側の端のクリック、← → / PgUp / PgDn / Space、ホイール。本文の上のクリックではめくらない",
    "ページの DOM はページ順に並べたまま、役割(表・裏・下)を style だけで変える。並べ替えると iframe が読み込み直され、動く図の状態が消えるから",
    "ページの中身(PageContent)は memo。めくりの間、毎フレーム変わるのは紙の形だけ",
    "めくりの途中で次を押すと、前のめくりを終えてから次へ。動きを減らす設定(prefers-reduced-motion)では、めくらずに切り替える",
], size=12.5)

# ================================================================ 47 折り目の幾何
page("fold", "巻六 · 本として読む", "折り目の幾何")
prose("lead", 188, 72, "めくれた紙は、1 本の折り目で折り返した平らな紙として描いています。曲面の計算は使いません。")
math_el("m1", 64, 264, 640, 90, r"M = \tfrac{C + P}{2}, \qquad \mathbf{n} = \dfrac{C - P}{\lVert C - P \rVert}", 20)
caption("c1", 354, "角 C を指先 P まで引くと、折り目は線分 CP の垂直二等分線になる", align="center")
math_el("m2", 64, 390, 640, 60, r"X' = X - 2\,\big((X - M)\cdot\mathbf{n}\big)\,\mathbf{n}", 20)
caption("c2", 452, "折り目での鏡映。裏の面は、これを CSS の matrix(a, b, c, d, e, f) にして重ねる", align="center")
point_box("rules", 496, 456, "src/render/pageTurn.ts", [
    "**表の面**: 紙の四角を折り目で切った残り。多角形の切り取り(Sutherland–Hodgman を 1 辺ぶん)を clip-path: polygon(…) にする",
    "**裏の面**: 折り返した部分。鏡映を transform: matrix(…) にして、次のページの中身を写す",
    "**紙は伸びない**: 角は背(とじ目)から紙の幅より遠くへ行けない。対角の長さでも抑える(constrain)",
    "左から始まるめくりは、左右を反転して同じ計算を使う。自動でめくるときは、角を弧に沿って運ぶ(arcPoint)",
], size=12.5)

# ================================================================ 48 さわれる図 05
widget_page("w-fold", "巻六 · 本として読む", "さわってみよう: 折り目の幾何",
            "見開きの右ページの角をつまんで、引いてみてください。作図線が、前のページの式そのものです。",
            "fold", "折り目の幾何", 600,
            "C は角の元の位置、P は指先(紙が伸びない範囲に抑えた点)、M は CP の中点、赤い破線が折り目。点線の円が紙の届く範囲。3 割を超えて離すとめくれる。")

# ================================================================ 49 陰と音
page("shade", "巻六 · 本として読む", "陰と音")
prose("lead", 188, 72, "平らな紙に立体らしさを与えるのは、陰と音です。")
point_box("shade", 270, 260, "陰", [
    "4 つの陰: 表の折り目のあたり・裏の丸み・下のページに落ちる影・裏の drop-shadow",
    "見開きのとじ目の陰と、紙の束の厚み",
    "単ページの紙の裏は、同じページを左右反転して、紙の色(lt1)を 86% 重ねる(裏写り)",
], size=12.5)
point_box("sound", 548, 404, "音(src/render/paperSound.ts)", [
    "録音ではなく Web Audio で作る。ノイズを BiquadFilter で削り、GainNode で音量の山を付ける",
    "つまむ「カサッ」、めくる「ふぁさっ」、着地の「ぱさっ」。毎回少しずつゆらす",
    "AudioContext は最初に鳴らすとき(人の操作の中)に作る。自動再生の制限にかからないように",
    "録音を使わないので、音のファイルもそのライセンスも要らない。めくりの長さに合わせて音を伸ばせる",
], size=12.5)

# ================================================================ 50 さわれる図 06
widget_page("w-sound", "巻六 · 本として読む", "さわってみよう: 紙の音を作る",
            "めくる音の 3 つの部品を、ひとつずつ鳴らしてみましょう(音が出ます)。",
            "sound", "紙の音を作る", 560,
            "グラフの金色が音量、赤い線がフィルタの周波数(対数の目盛り)。「めくりの長さ」を変えると、ふぁさっの音が伸び縮みする。「ゆらぎ」を切ると、毎回同じ音になる。")

# ================================================================ 51 このノートの作り方
page("making", "巻六 · 本として読む", "このノートの作り方")
prose("lead", 188, 72, "このノートも、本文の JSON をスクリプトで書き出して作りました。手順は CLAUDE.md の「ノートを作るとき」に沿っています。")
numbered([
    ("絵を描く", "tools/codex-art.js の SVG(羊皮紙・革・表紙の絵・紋章)を、create-codex-assets.mjs が Edge で PNG / JPEG に撮る。"),
    ("さわれる図を作る", "widgets/*.template.html を書き、build-widgets.py で three.js と共通の部品を差し込む。"),
    ("本文を書き出す", "tools/create-codex-deck.py がページを組み、文字の量からはみ出しを見積もって警告する。"),
    ("確かめる", "さわれる図の単体テスト(e2e-codex-widgets.mjs)、全ページの撮影(shot.mjs)、はみ出しの検査(check-text-overflow.mjs)。"),
], 280, 126, 76)
point_box("rules", 798, 154, "ノートの寸法", "見出し (64, 72, 640, 80)、本文は y=188〜952・左右 64・14pt・行間 1.8。章の扉は右ページ、ページ数は偶数にして、裏表紙が最後に左で 1 枚になるようにする。", bullets=False, size=12.5)

# ================================================================ 52 扉 巻七
door("ch7", "巻 七", "LIBER  VII", "外へ渡す・確かめる", "最後の巻は、資料を外へ出す書き出しと、壊れていないことを確かめる仕組みです。",
     ["pptx へ写す・PDF にする", "自動のテスト — 機能と見た目", "本番のビルドと、Linux で確かめる"], "emblem-7")

# ================================================================ 53 pptx と PDF
page("export", "巻七 · 外へ渡す・確かめる", "pptx へ写す・PDF にする")
prose("lead", 188, 72, "書き出しは上部の「書き出し ▾」から。pptx は src/export/pptx.ts が pptxgenjs で組み立てます。")
table("table", X, 270, W, 360, [
    ["要素", "pptx では"],
    ["文字", "テキストボックス(段落・ラン・箇条書き・行間)"],
    ["図形", "PowerPoint の図形。矢印・自由な図形は頂点で"],
    ["表・グラフ", "ネイティブの表・グラフ(PowerPoint で直せる)"],
    ["数式", "画像(KaTeX → SVG → PNG)"],
    ["動く図", "題名入りの枠(静止画の代わり)"],
    ["ページ番号・ノート", "文字枠と、発表者ノート"],
], [180, 460], 12)
math_el("m", 64, 646, 640, 60, r"x_{\mathrm{in}} = \dfrac{x_{\mathrm{px}}}{96}, \qquad w_{\mathrm{pt}} = 0.75\,w_{\mathrm{px}}", 20)
prose("body", 718, 234, [
    "数式の画像化: KaTeX の HTML を SVG の foreignObject に入れて canvas に描く。SVG を画像として描くときは外のファイルを読めないので、KaTeX の CSS と書体を data URL にして埋め込む。",
    "PDF: 全ページを並べた印刷用の面を作り、書体の読み込みを待ってから印刷の「PDF に保存」で出す。画面と同じ文字組みのまま紙になる。",
    "pptx の確かめは python-pptx での突き合わせ(tools/check-pptx.py)まで。PowerPoint は文節改行をしないので、枠ぎりぎりの文はあふれることがある。",
], 12.5)

# ================================================================ 54 自動のテスト
page("tests", "巻七 · 外へ渡す・確かめる", "自動のテスト — 機能と見た目")
prose("lead", 188, 72, "テストは Playwright で Edge(本物のブラウザ)を動かして回します。機能だけでなく、見た目の崩れも機械で見張っています。")
table("table", X, 270, W, 470, [
    ["テスト(tools/)", "確かめること"],
    ["e2e-editor・bugs・bugs2", "ドラッグ量・Ctrl+Z・文字編集・バグの再現"],
    ["e2e-resize・multi-lock", "PowerPoint の伸縮・グループ・位置の固定"],
    ["e2e-external-change", "外の書き換えの帯・印・点線の枠・元に戻す"],
    ["e2e-note", "読む画面・めくり・ページ番号・右綴じ・音"],
    ["e2e-export", "pptx を書き出して本文と突き合わせる・PDF"],
    ["e2e-tauri・package・tauri-assets", "本物のアプリに CDP でつなぎ、書き戻し・見張り・zip"],
    ["ui-audit", "68 の状態で、隠れ・はみ出し・文字切れ"],
    ["e2e-state-consistency", "状態を切り替えても、見た目がずれない"],
], [260, 380], 12)
point_box("audit", 760, 192, "見た目を機械で見張る", "ui-audit は、要素の種類ごとの選択・各エディタ・メニュー・ダイアログ・プレゼン・3 つの画面幅を巡り、操作部品が他に隠れる・浮いた UI のはみ出し・文字切れを数える。画面を変えたら回し、FAIL 0 を保つ。", bullets=False, size=12.5)

# ================================================================ 55 本番と Linux
page("release", "巻七 · 外へ渡す・確かめる", "本番の形で確かめる")
prose("lead", 188, 72, "開発中に動いても、本番のビルドで壊れることがあります(巻二のグラフの例)。最後は、本番の形で確かめます。")
tool_rows([
    ("test:production", "npm run", "最適化済みの dist を配信し、見本の資料 15 枚と、全 6 種類のグラフが描けるか確かめる。"),
    ("release-smoke", "e2e-release-smoke.mjs", "release の EXE を、別の WebView のデータの場所で起動する。"),
    ("cargo test", "Rust の単体テスト", "まとめる・展開・一時ファイル・控えの名前を確かめる。"),
], 276, 74, 20, name_w=190, name_size=13)
point_box("linux", 594, 358, "Linux(Debian 12)で確かめたこと", [
    "コンテナで npm ci → tauri build(deb)→ 仮想の画面(Xvfb)で起動し、見本とノートの表示を確かめた",
    "WebKitGTK は文節改行(auto-phrase)が効かない。Meiryo も無いので、改行やあふれが Windows と変わる",
    "選択欄を OS の明るい配色で描くので、入力部品だけ color-scheme: dark にする(ページ全体に付けると、動く図の iframe の地が透けなくなる)",
    "スポイト(EyeDropper)は使えない",
], size=12.5)

# ================================================================ 56 技術の早見表
page("cheat", "結び", "技術の早見表")
table("table", X, 188, W, 764, [
    ["層", "道具", "在りか"],
    ["外殻", "Tauri v2・Rust", "src-tauri/src/lib.rs"],
    ["窓口", "invoke・listen", "src/tauri.ts"],
    ["見張り", "notify 7", "src-tauri/src/watch.rs"],
    ["まとめる", "zip 9", "src-tauri/src/package.rs"],
    ["状態", "zustand・zundo", "src/store.ts"],
    ["描画", "React 18", "src/render/Slide.tsx"],
    ["グラフ", "Chart.js 4", "src/render/elements/ChartEl.tsx"],
    ["数式", "KaTeX 0.19", "src/render/elements/MathEl.tsx"],
    ["動く図", "iframe・postMessage", "src/render/elements/EmbedEl.tsx"],
    ["編集", "react-moveable・selecto", "src/editor/Editor.tsx"],
    ["読む", "折り目・Web Audio", "src/render/pageTurn.ts・paperSound.ts"],
    ["書き出し", "pptxgenjs・印刷", "src/export/pptx.ts"],
    ["本文の形", "JSON Schema", "ai/schema.json"],
    ["テスト", "Playwright・Edge", "tools/e2e-*.mjs・ui-audit.mjs"],
], [110, 200, 330], 12)

# ================================================================ 57 用語の小辞典
page("glossary", "結び", "用語の小辞典")
TERMS = [
    ("IPC", "別々のプロセスの間のやりとり。Tauri では invoke と emit。"),
    ("WebView", "OS が持つ、Web の画面を描く部品。Windows では WebView2(Edge)。"),
    ("atomic rename", "別名で書き上げてから名前を置き換え、途中の状態を見せない書き方。"),
    ("debounce", "続けて起きた出来事を、最後の 1 回にまとめること(自動保存の 400ms)。"),
    ("tree-shaking", "本番のビルドで、使っていないコードを落とすこと。"),
    ("sandbox", "iframe に与える力を絞る指定。allow-scripts だけなら、スクリプトだけが動く。"),
    ("postMessage", "別の窓や iframe に、手紙(データ)を送る仕組み。"),
    ("portal", "React の部品を、親とは別の場所の DOM に出す仕組み。"),
    ("論理キャンバス", "本文の座標系(1280×720 / 768×1024)。画面の大きさとは関係ない。"),
    ("スナップ", "近くのガイド線に吸い付くこと(6px 以内)。"),
    ("唯一の正", "全員が読み書きする、ただ 1 つのデータ(single source of truth)。"),
    ("data URL", "ファイルの中身を文字列にして、URL として埋め込む書き方。"),
]
for i, (term, desc) in enumerate(TERMS):
    col, row = i % 2, i // 2
    x, y = X + col * 330, 192 + row * 126
    g = f"g{i + 1}"
    text(f"{g}-term", x, y, 310, 30, term, 15, "accent1", bold=True, group=g, font="head", lh=1.3)
    hline(f"{g}-line", y + 34, x, 120, "accent3", 1, group=g)
    text(f"{g}-desc", x, y + 44, 310, 78, desc, 12, "dk1", group=g, lh=1.65)

# ================================================================ 58 おわりに
page("end", None, "おわりに")
prose("body", 188, 262, [
    "Lumifold は、「AI が作った資料を、人が自分の手で直せるように」という小さな不満から始まりました。道具を選ぶたびに戻ってきたのは、巻一の約束 —— 本文はひとつ、全部の要素を直せる、境界ははっきり —— でした。",
    "次は手元の資料を 1 つ Lumifold で開いて、Claude Code に直してもらうところを横で眺めてみてください。帯が出て、点線の枠が付いて、Ctrl+Z で戻せる。その裏で、このノートの手紙が走っています。",
])
point_box("next", 470, 236, "この先を読むなら", [
    "docs/DESIGN.md — 設計書(要件・構成・マイルストーン)",
    "CLAUDE.md — 機能ごとの現状と、作業の手順",
    "docs/WIDGET-STATE.md — 動く図とアプリのやりとり",
    "ai/schema.json — 本文の形",
])
hline("colophon-rule", 760, color="accent3", width=1)
text("colophon", X, 778, W, 150, [
    "Lumifold の書庫 — 技術スタックと組み立て方の解説ノート",
    "Lumifold のノート形式で作った資料。さわれる図は資料フォルダの widgets/ にある自己完結の HTML(3D は three.js r159 を埋め込み)。絵はすべて SVG から描き起こした。",
    "道具の版と数は 2026 年 10 月のもの。",
], 10, "accent5", lh=1.7, ps=4)

# ================================================================ 59 裏表紙
dark("back")
image("seal", "assets/emblem-seal.png", 224, 300, 320, 230)
text("msg", X, 560, W, 90, ["本文はひとつ。", "手は自由に。"], 18, "lt1", align="center", lh=1.8, bold=True, font="head")
text("kicker", X, 872, W, 30, "LUMIFOLD  ·  CODEX", 12, "accent3", bold=True, align="center", font="head", check=False)

# ---------------------------------------------------------------- 目次を埋める
ids = [p["id"] for p in pages]
cur = toc_page
for i, (no, head, sub, target) in enumerate(TOC):
    y = 188 + i * 84
    g = f"row{i + 1}"
    num = ids.index(target) + 1
    text(f"{g}-no", X, y + 2, 76, 36, no, 17 if len(no) <= 1 else 14, "accent1", bold=True, group=g, valign="middle", lh=1.2, font="head")
    text(f"{g}-head", X + 84, y, 470, 34, head, 16, "dk2", bold=True, group=g, valign="middle", font="head")
    text(f"{g}-sub", X + 84, y + 36, 490, 42, sub, 10.5, "accent5", group=g, lh=1.45)
    text(f"{g}-page", X + W - 70, y, 70, 34, str(num), 14, "accent5", bold=True, align="right", group=g, valign="middle")
    if i < len(TOC) - 1:
        hline(f"{g}-sep", y + 79, color="accent3", width=0.75)

# ---------------------------------------------------------------- このノートの要素の数(グラフ)
KINDS = ["text", "shape", "image", "table", "math", "chart", "embed"]
count = {k: 0 for k in KINDS}
for p in pages:
    for e in p["elements"]:
        count[e["type"]] += 1
count_chart["chart"]["series"][0]["values"] = [count[k] for k in KINDS]

# ---------------------------------------------------------------- 検査
assert len(pages) % 2 == 0, f"ページ数が奇数: {len(pages)}"
for p in pages:
    if re.fullmatch(r"ch\d", p["id"]):
        assert ids.index(p["id"]) % 2 == 0, f'{p["id"]} が右ページにない({ids.index(p["id"])})'
seen = set()
for p in pages:
    for e in p["elements"]:
        assert e["id"] not in seen, e["id"]
        seen.add(e["id"])
        if not e.get("rotation"):
            assert e["y"] >= 0 and e["y"] + e["h"] <= 1024 and e["x"] >= 0 and e["x"] + e["w"] <= 768 + 0.5, f'{e["id"]} がページの外'
        if e["type"] in ("image", "embed"):
            assert os.path.exists(os.path.join(os.path.dirname(OUT), e["src"])), e["src"]

deck = {
    "version": 1,
    "format": "note",
    "pageNumbers": "outside",
    "meta": {"title": "Lumifold の書庫", "author": "Lumifold", "created": "2026-10-18"},
    "theme": {
        "fonts": {"head": "Yu Mincho", "body": "BIZ UDPMincho"},
        "colors": {"dk1": "2B2118", "lt1": "F6EEDB", "dk2": "4A2A17", "lt2": "EADBB9",
                   "accent1": "8A3220", "accent2": "2F6E6A", "accent3": "C9A227",
                   "accent4": "5F7A3A", "accent5": "7A6650", "accent6": "34508A", "grid": "C8B48C"},
    },
    "slides": pages,
}
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(json.dumps(deck, ensure_ascii=False, indent=2) + "\n")
for w in warnings:
    print("注意:", w)
print(OUT, len(pages), "pages", count)
