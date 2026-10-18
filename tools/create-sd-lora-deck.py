# Stable Diffusion と LoRA ファインチューニングの説明デッキ（decks/sd-lora、5 枚）を作る。
# テーマは「暗室」: ノイズから絵を現像する。赤 = ノイズ・拡散、琥珀 = LoRA・信号、青緑 = 文章の条件、青 = 潜在・VAE、紫 = UNet。
# 使い方: python tools/create-sd-lora-assets.py → python tools/build-widgets.py decks/sd-lora → python tools/create-sd-lora-deck.py
# ウィジェットの単体テスト: node tools/e2e-sd-lora-widgets.mjs
# 数値の根拠（ノートにも書く）:
#   LoRA の数 = SD 1.5 の注意層（16 ブロック × 自己/クロス × q,k,v,out）に rank r → 199,296 × r（r=4 で 797,184）
#               SDXL（640ch × 10 層、1280ch × 60 層、文章 2048 次元）→ 1,451,520 × r
#   SD 1.5 のスケジュール: scaled linear β 0.00085→0.012、T=1000 → √ᾱ_999 ≈ 0.068
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAME = "sd-lora"
OUT = ROOT / "decks" / NAME
N_SLIDES = 5

deck = {
    "version": 1,
    "meta": {"title": "Stable Diffusion と LoRA ファインチューニング", "author": "Lumifold", "created": "2026-10-17"},
    "theme": {"fonts": {"head": "Yu Gothic", "body": "Yu Gothic"}, "colors": {
        # 暗室: lt1 = 地、lt2 = カード、dk1 = 印画紙の白、dk2 = 控えめな文字、accent5 = 枠線
        "lt1": "15110F", "lt2": "201A17", "dk1": "EFE7DB", "dk2": "A89E91",
        "accent1": "FF5A47", "accent2": "F3B23E", "accent3": "45C4B0", "accent4": "7FA2FF", "accent5": "3B332C", "accent6": "C08BFF",
        "grid": "2B241F"}},
    "slides": [],
}
RED, AMBER, TEAL, BLUE, LINE, VIOLET, MUTE = "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "dk2"
s = None

# ---------------------------------------------------------------- 部品
def el(typ, name, x, y, w, h, **kw):
    obj = {"id": f'{s["id"]}-{name}', "type": typ, "x": round(x, 1), "y": round(y, 1), "w": round(w, 1), "h": round(h, 1), **kw}
    s["elements"].append(obj)
    return obj


def runs(text, emph=None):
    """**太字**（emph 色）と [[accentN:色付き太字]] を run に分ける"""
    out = []
    for part in re.split(r"(\*\*.+?\*\*|\[\[[a-z0-9]+:.+?\]\])", text):
        if not part:
            continue
        if part.startswith("**"):
            r = {"text": part[2:-2], "bold": True}
            if emph:
                r["color"] = emph
        elif part.startswith("[["):
            c, t = part[2:-2].split(":", 1)
            r = {"text": t, "color": c, "bold": True}
        else:
            r = {"text": part}
        out.append(r)
    return out


def paras(text, emph=None):
    ps = []
    for line in text.split("\n"):
        if line.startswith("・"):
            ps.append({"runs": runs(line[1:], emph), "bullet": True})
        else:
            ps.append({"runs": runs(line, emph)})
    return ps


def txt(name, text, x, y, w, h, size=10, color="dk1", bold=False, emph="dk1", **style):
    extra = {k: style.pop(k) for k in ("opacity", "rotation", "locked") if k in style}
    st = {"fontSize": size, "color": color, "bold": bold, "lineHeight": 1.4, **style}
    lines = text.count("\n") + 1
    need = lines * size * 4 / 3 * st["lineHeight"] + (lines - 1) * st.get("paraSpacing", 0) + 2
    if h < need:
        y -= (need - h) / 2 if st.get("valign") == "middle" else (need - h) if st.get("valign") == "bottom" else 0
        h = need
    return el("text", name, x, y, w, h, style=st, paragraphs=paras(text, emph), **extra)


def text_w(text, size):
    return sum(size * 4 / 3 * (1 if ord(c) > 0x2E80 else 0.6) for c in text)


def box(name, x, y, w, h, fill="lt2", line=LINE, radius=8, lw=1, **kw):
    return el("shape", name, x, y, w, h, shape="roundRect", fill=fill, line={"color": line, "width": lw} if line else None, radius=radius, **kw)


def bar(name, x, y, w, h, color, **kw):
    return el("shape", name, x, y, w, h, shape="rect", fill=color, line=None, **kw)


def group(name, items):
    for o in items:
        o["group"] = f'{s["id"]}-{name}'
    return items


def chip(name, label, x, y, w, h, color, size=9, solid=False):
    a = el("shape", name + "-bg", x, y, w, h, shape="roundRect", fill=color, line=None, radius=h / 2, **({} if solid else {"opacity": 0.16}))
    b = txt(name + "-t", label, x, y, w, h, size, "lt1" if solid else color, True, align="center", valign="middle", lineHeight=1.1)
    return group(name, [a, b])


def badge(name, label, cx, cy, color, d=22, size=9.5):
    a = el("shape", name + "-c", cx - d / 2, cy - d / 2, d, d, shape="ellipse", fill=color, line=None)
    b = txt(name + "-n", label, cx - d / 2, cy - d / 2, d, d, size, "lt1", True, align="center", valign="middle", lineHeight=1)
    return group(name, [a, b])


def arrow(name, x1, y1, x2, y2, color=MUTE, width=1.6, head=8):
    d = math.hypot(x2 - x1, y2 - y1)
    return el("shape", name, (x1 + x2 - d) / 2, (y1 + y2) / 2 - 3, d, 6, shape="arrow", fill=None, line={"color": color, "width": width},
              rotation=round(math.degrees(math.atan2(y2 - y1, x2 - x1)), 2), arrowHeadLength=head, arrowHeadWidth=head)


def seg(name, x1, y1, x2, y2, color=MUTE, width=1.6):
    """水平・垂直の線（矢印なし）"""
    if y1 == y2:
        return bar(name, min(x1, x2), y1 - width / 2, abs(x2 - x1), width, color)
    return bar(name, x1 - width / 2, min(y1, y2), width, abs(y2 - y1), color)


def math_el(name, latex, x, y, w, h, size=12, color="dk1"):
    return el("math", name, x, y, w, h, latex=latex, fontSize=size, color=color, displayMode=True)


def table(name, rows, x, y, w, h, widths, size=9, header=True):
    cells = [[c if isinstance(c, dict) else {"text": str(c)} for c in r] for r in rows]
    return el("table", name, x, y, w, h, header=header, fontSize=size, colW=widths, rows=cells)


def card(name, x, y, w, h, line=LINE, top=None, **kw):
    items = [box(name, x, y, w, h, line=line, **kw)]
    if top:
        items.append(bar(name + "-top", x + 10, y, w - 20, 3, top))
    return items


def node(name, x, y, w, h, head, sub, color, fill="lt2", size=9.5, sub_size=8, lw=1.4, soft=False):
    """図解の箱: 見出し（色付き太字）+ 補足（控えめ）"""
    items = [box(name + "-b", x, y, w, h, fill=fill, line=color, lw=lw, radius=7)]
    if soft:
        items.append(box(name + "-s", x, y, w, h, fill=color, line=None, radius=7, opacity=0.10))
    lines = head + ("\n" + sub if sub else "")
    t = txt(name + "-t", f"[[{color}:{head}]]" + ("\n" + sub if sub else ""), x + 4, y, w - 8, h, sub_size, MUTE, align="center", valign="middle", lineHeight=1.3)
    t["paragraphs"][0]["runs"][0]["fontSize"] = size
    items.append(t)
    return group(name, items)


def chevron(name, x, y, w, h, color, label, size=9.5, first=False):
    pts = [(0, 0), (0.93, 0), (1, 0.5), (0.93, 1), (0, 1)] + ([] if first else [(0.07, 0.5)])
    a = el("shape", name + "-bg", x, y, w, h, shape="polygon", fill=color, line=None, opacity=0.22, lineJoin="miter",
           points=[{"x": px, "y": py} for px, py in pts])
    b = txt(name + "-t", label, x + (8 if first else 16), y, w - 30, h, size, color, True, valign="middle", lineHeight=1.1)
    return group(name, [a, b])


# ---------------------------------------------------------------- スライドの枠
def new_slide(notes, bg="assets/bg.jpg"):
    global s
    n = len(deck["slides"]) + 1
    s = {"id": f"s{n}", "background": {"color": "lt1"}, "notes": notes.strip(), "elements": []}
    deck["slides"].append(s)
    el("image", "bg", 0, 0, 1280, 720, src=bg, fit="cover", locked=True)
    return n


def footer(n):
    txt("edge", f"▸ {n:02}A    STABLE DIFFUSION × LoRA    DARKROOM NOTES", 60, 686, 600, 14, 7.5, AMBER, opacity=0.6, lineHeight=1.3)
    txt("page", f"{n:02} / {N_SLIDES:02}", 1120, 686, 100, 14, 8, MUTE, True, align="right", lineHeight=1.3)


def slide(chapter, title, lead, notes):
    n = new_slide(notes)
    txt("tag", f"FRAME {n:02}  ─  {chapter}", 60, 24, 700, 16, 9, RED, True, lineHeight=1.2)
    t = txt("title", title, 60, 38, 1160, 44, 22, bold=True, valign="middle", font="head", lineHeight=1.3)
    t["role"] = "title"
    plain = re.sub(r"\*\*|\[\[[a-z0-9]+:|\]\]", "", lead)
    assert text_w(plain, 10.5) < 1150, f"リードが 1 行に収まらない: {text_w(plain, 10.5):.0f}px {plain}"
    txt("lead", lead, 60, 84, 1160, 18, 10.5, MUTE, emph="dk1", lineHeight=1.35)
    bar("rule1", 60, 110, 48, 3, RED)
    bar("rule2", 114, 110, 10, 3, AMBER)
    footer(n)
    return n


def head(name, label, x, y, w, color, size=10.5):
    """カードの見出し（色の点 + 太字）"""
    a = el("shape", name + "-d", x, y + size * 0.42, size * 0.6, size * 0.6, shape="ellipse", fill=color, line=None)
    b = txt(name, label, x + size * 1.0, y, w - size * 1.0, size * 1.45, size, color, True, lineHeight=1.3)
    return [a, b]


# ================================================================ 01 表紙
new_slide("""
Stable Diffusion（SD）と、その追加学習の定番になった LoRA を 5 枚で説明します。テーマは「暗室」です。写真の現像で像が浮かび上がるように、拡散モデルはノイズから絵を少しずつ浮かび上がらせます。

下のフィルムは、自作のイラスト（夕暮れの湖畔に座る猫）に SD 1.5 と同じ係数でノイズを足したものです。左ほどノイズが多く、t=999 では信号の係数が 0.068 しか残りません。
・学習（前向き過程）: 右の絵にノイズを足し、足したノイズを当てる練習をする
・生成（逆過程）: 左の純粋なノイズから、予測したノイズを 1 手ずつ取り除く
本物の SD は画素ではなく、VAE で縮めた 64×64×4 の潜在空間でこれを行います。見やすさのため、ここでは画素で表示しています。

右の 4 つの数字が全体の要点です。
・1/48: 512×512×3 = 786,432 個の値を 64×64×4 = 16,384 個に縮めてから拡散する（Latent Diffusion）
・8.6 億: SD 1.5 の UNet のパラメータ数。1 手ごとにこれを 1〜2 回動かす（CFG では 2 回）
・7.5: diffusers の SD 1.5 での CFG の既定値
・0.09%: rank 4 の LoRA を注意層に入れたときの学習量（797,184 個 ÷ 8.6 億）。fp16 で約 1.6 MB。UNet 本体は fp16 で約 1.7 GB

3 枚目と 4 枚目と 5 枚目に、その場で操作できるウィジェットがあります（プレゼン中もそのまま操作できます）。

出典: Rombach et al. "High-Resolution Image Synthesis with Latent Diffusion Models" (CVPR 2022, arXiv:2112.10752) / Hu et al. "LoRA" (arXiv:2106.09685) / Hugging Face diffusers ドキュメント
""", bg="assets/bg-cover.jpg")
txt("tag", "DARKROOM NOTES  ─  生成 AI の暗室ノート", 80, 66, 640, 18, 10, RED, True, lineHeight=1.2)
t = txt("title", "Stable Diffusion と\nLoRA ファインチューニング", 80, 90, 700, 106, 33, bold=True, font="head", lineHeight=1.2)
t["role"] = "title"
bar("rule1", 80, 206, 64, 4, RED)
bar("rule2", 150, 206, 14, 4, AMBER)
txt("catch", "ノイズから絵を**現像**し、**小さな差分**で画風を教える。", 80, 222, 700, 30, 17, "dk1", True, emph=AMBER)
txt("sub", "潜在拡散・UNet・CFG のしくみから、LoRA の原理と学習の実践まで。触って確かめるウィジェット 4 つ付き", 80, 258, 700, 18, 10.5, MUTE)
cx = 80
for i, (label, c) in enumerate([("Latent Diffusion", BLUE), ("UNet・Cross-Attn", VIOLET), ("CFG", TEAL), ("LoRA  W₀ + BA", AMBER), ("kohya / diffusers", RED)]):
    w = text_w(label, 9) + 24
    chip(f"c{i}", label, cx, 290, w, 22, c, 9)
    cx += w + 8
KPI = [
    ("1/48", BLUE, "潜在空間で拡散する", "512×512×3 の画像を VAE で 64×64×4 に縮めてから拡散する"),
    ("8.6億", VIOLET, "UNet のパラメータ（SD 1.5）", "1 手ごとにノイズを予測。20〜50 手くり返して絵にする"),
    ("7.5", TEAL, "CFG の既定値", "条件あり・なしの予測の差を 7.5 倍してプロンプトに寄せる"),
    ("0.09%", AMBER, "LoRA の学習量（rank 4）", "注意層だけ 80 万個。fp16 で 1.6 MB（本体は 1.7 GB）"),
]
for i, (big, c, label, desc) in enumerate(KPI):
    x, y = 820 + (i % 2) * 206, 58 + (i // 2) * 130
    items = card(f"k{i}", x, y, 196, 122, top=c)
    items += [txt(f"k{i}v", big, x + 14, y + 12, 170, 36, 24, c, True, lineHeight=1.2),
              txt(f"k{i}l", label, x + 14, y + 50, 172, 16, 9.5, "dk1", True, lineHeight=1.3),
              txt(f"k{i}d", desc, x + 14, y + 70, 172, 48, 8.5, MUTE, lineHeight=1.4)]
    group(f"k{i}", items)
# フィルム: x_T → x_0（左ほどノイズ）
FY = 336
film = [el("shape", "film", 36, FY, 1208, 200, shape="rect", fill="0B0908", line={"color": "2E2622", "width": 1})]
for j, x in enumerate(range(52, 1236, 34)):
    for k, y in enumerate((FY + 7, FY + 182)):
        film.append(el("shape", f"hole{j}-{k}", x, y, 16, 11, shape="roundRect", fill="2A231E", line=None, radius=2.5))
group("film", film)
FRAMES = [(999, "0.068", "ただのノイズ"), (800, "0.192", ""), (600, "0.401", ""), (400, "0.652", ""), (200, "0.868", ""), (0, "1.000", "元の絵")]
for i, (t_, sa, cap) in enumerate(FRAMES):
    x = 75 + i * 196
    items = [el("image", f"f{i}", x, FY + 25, 150, 150, src=f"assets/xt-{t_:03}.jpg", fit="cover")]
    items.append(box(f"f{i}-edge", x, FY + 25, 150, 150, fill=None, line=AMBER if t_ == 0 else "4A3F37", radius=2, lw=1.5 if t_ == 0 else 1))
    items.append(txt(f"f{i}-t", f"t = {t_}" + (f"　{cap}" if cap else ""), x - 10, FY + 206, 170, 16, 9.5, AMBER if t_ == 0 else RED if t_ == 999 else "dk1", True, align="center", lineHeight=1.3))
    items.append(math_el(f"f{i}-s", r"\sqrt{\bar\alpha_t}=" + sa, x - 10, FY + 222, 170, 18, 8.5, MUTE))
    group(f"f{i}", items)
AY = FY + 254
arrow("gen", 75, AY + 8, 1205, AY + 8, AMBER, 2, 10)
txt("gen-t", "**生成（逆過程）**：ノイズから 1 手ずつ「予測したノイズ」を取り除く  →", 640, AY - 12, 565, 16, 9.5, AMBER, emph=AMBER, align="right", lineHeight=1.3)
txt("fwd-t", "←  **学習（前向き過程）**：絵にノイズを足し、足したノイズを当てさせる", 75, AY - 12, 560, 16, 9.5, RED, emph=RED, lineHeight=1.3)
txt("film-note", "※ 自作イラストに SD 1.5 と同じ係数でノイズを足した実例。実際の SD は 64×64×4 の潜在で行う（見やすさのため画素で表示）", 75, AY + 16, 1130, 14, 8, MUTE, align="center", lineHeight=1.3)
TOC = [("02", VIOLET, "しくみ", "VAE・CLIP・UNet・スケジューラと式"), ("03", RED, "拡散を触る", "ノイズを足す／逆拡散と CFG を動かす"),
       ("04", AMBER, "LoRA の原理", "B·A を学習させ、他の手法と比べる"), ("05", TEAL, "学習の実践", "データ・設定・失敗の見分け方・使い方")]
for i, (num, c, title, desc) in enumerate(TOC):
    x = 60 + i * 294
    items = card(f"toc{i}", x, 628, 280, 50)
    items += [txt(f"toc{i}n", num, x + 12, 628, 40, 50, 18, c, True, valign="middle", lineHeight=1.1),
              txt(f"toc{i}h", title, x + 54, 634, 216, 18, 10.5, "dk1", True, lineHeight=1.3),
              txt(f"toc{i}d", desc, x + 54, 653, 222, 16, 8.5, MUTE, lineHeight=1.3)]
    group(f"toc{i}", items)
footer(1)

# ================================================================ 02 しくみ
slide("STABLE DIFFUSION のしくみ", "Stable Diffusion のしくみ ─ 潜在空間で「ノイズ当て」をくり返す",
      "Latent Diffusion（Rombach et al. 2022）。画像を VAE で **64×64×4 の潜在**に縮めて拡散し、文章は CLIP で **77×768** のベクトル列にしてクロスアテンションへ",
      """
上の図が SD 1.5 の全体像です。部品は 4 つ: VAE（画像 ⇄ 潜在の変換）、CLIP Text Encoder（文章 → ベクトル列）、UNet（ノイズの予測）、Scheduler（予測を使って 1 手進める解き方）。

生成（上段）: プロンプトを 77 トークンに区切り、CLIP ViT-L/14 の文章側で 77×768 のベクトル列 c にします。乱数で作った z_T（64×64×4）から始め、UNet が「今の z_t に含まれるノイズ ε」を予測し、Scheduler がそれを使って少しノイズの少ない z_{t−Δ} に進めます。これを 20〜50 回くり返し、最後の z_0 を VAE Decoder で 512×512 の画像に戻します。

学習（下段）: 学習画像を VAE Encoder で z_0 にし、t を 1〜1000 から一様に選んでノイズ ε を足した z_t を作ります（式①で 1 回で作れる）。UNet に z_t・t・説明文 c を入れ、足した ε を当てさせる（式②）。学習するのは UNet だけで、VAE と CLIP は凍結です。

UNet の中: ResBlock（時刻 t の埋め込みを足す）と Transformer ブロック（Self-Attention → Cross-Attention → FeedForward）が、潜在を 64²→32²→16²→8² と縮めてから戻す U 字に並びます。Transformer ブロックは計 16 個（下り 6・中間 1・上り 9）。Cross-Attention では Q を画像の特徴、K と V を文章ベクトルから作るので、ここで文章が絵に入ります（式④）。4 枚目の LoRA は主にこの注意層の W_Q, W_K, W_V, W_out に差分を足します。

CFG（式③）: 1 手ごとに「条件あり」「条件なし（空の文章）」の 2 回 UNet を動かし、差を w 倍して足します。SD 1.5 は学習中に 10% の確率で文章を空にして、無条件の予測も同時に学んでいます。ネガティブプロンプトは、この空の文章の代わりに「避けたい文章」を入れる工夫です。

下の表: SD 2.x はテキストエンコーダを OpenCLIP ViT-H/14 に替え、768 版は v 予測（ノイズではなく速度 v を予測）。SDXL は UNet を 2.6B に大型化し、テキストエンコーダを 2 つ使い、1024² が標準。SD 3.5 は UNet をやめて MMDiT（文章と画像のトークンを同じ Transformer で処理）と Rectified Flow を使います。LoRA の考え方はどれも同じですが、ベースが違うと LoRA は流用できません。

出典: Rombach et al. 2022 (arXiv:2112.10752) / Ho et al. "DDPM" 2020 (arXiv:2006.11239) / Ho & Salimans "Classifier-Free Diffusion Guidance" (arXiv:2207.12598) / Radford et al. "CLIP" (arXiv:2103.00020) / Podell et al. "SDXL" (arXiv:2307.01952) / Esser et al. "Scaling Rectified Flow Transformers" (arXiv:2403.03206) / Stable Diffusion v1-5 モデルカード（学習データ、10% の文章ドロップ）
""")
# 図解パネル
P = card("panel", 60, 122, 790, 374)
group("panel", P)
txt("lane1", "▶ 生成（推論）", 76, 130, 200, 14, 9, AMBER, True, lineHeight=1.3)
txt("lane2", "▶ 学習", 76, 398, 200, 14, 9, RED, True, lineHeight=1.3)
bar("lane-sep", 76, 390, 758, 1, LINE)
# 文章の流れ
items = [box("prompt-b", 76, 150, 150, 54, line=TEAL, lw=1, radius=7),
         txt("prompt-t", "プロンプト\n[[dk1:「夕暮れの湖畔に座る猫、]]\n[[dk1:フィルム写真」]]", 84, 152, 140, 50, 8, MUTE, valign="middle", lineHeight=1.3)]
items[1]["paragraphs"][1]["runs"][0]["bold"] = False
items[1]["paragraphs"][2]["runs"][0]["bold"] = False
group("prompt", items)
arrow("a-p", 228, 177, 250, 177, TEAL)
node("tok", 252, 150, 96, 54, "Tokenizer", "77 トークンに区切る", TEAL)
arrow("a-t", 350, 177, 372, 177, TEAL)
node("clip", 374, 150, 150, 54, "CLIP Text Encoder", "ViT-L/14 · 1.23 億 · 凍結", TEAL, soft=True)
arrow("a-c", 449, 206, 449, 252, TEAL)
txt("c-lab", "c：77×768\n→ K, V へ", 455, 212, 90, 30, 8, TEAL, True, lineHeight=1.25)
# デノイズの流れ
el("image", "zT", 76, 262, 76, 76, src="assets/latent-noise.png", fit="fill")
math_el("zT-m", r"z_T\sim\mathcal N(0,I)", 62, 340, 104, 18, 8.5, MUTE)
txt("zT-lab", "64×64×4（乱数）", 62, 358, 104, 14, 7.5, MUTE, align="center", lineHeight=1.3)
arrow("a-z", 156, 300, 196, 300, MUTE)
math_el("a-z-l", "z_t", 160, 280, 34, 18, 9, MUTE)
U = [box("unet-b", 198, 254, 330, 116, fill="lt2", line=VIOLET, lw=1.6, radius=8),
     box("unet-s", 198, 254, 330, 116, fill=VIOLET, line=None, radius=8, opacity=0.07),
     txt("unet-h", "UNet", 210, 258, 48, 20, 11, VIOLET, True, lineHeight=1.3),
     math_el("unet-m", r"\epsilon_\theta(z_t,\,t,\,c)", 252, 256, 110, 24, 10.5, VIOLET),
     txt("unet-n", "パラメータ 8.6 億", 372, 260, 150, 16, 8.5, "dk1", True, lineHeight=1.3)]
for i, (hd, sb, lora) in enumerate([("ResBlock", "+ 時刻 t", False), ("Self-Attn", "画像どうし", True), ("Cross-Attn", "Q 画像 / KV 文", True), ("FF", "GEGLU", False)]):
    x = 210 + i * 78
    U.append(box(f"ub{i}", x, 284, 72, 44, fill="lt1", line=AMBER if lora else LINE, lw=1, radius=5))
    U.append(txt(f"ub{i}t", f"[[dk1:{hd}]]\n{sb}", x, 284, 72, 44, 7.5, MUTE, align="center", valign="middle", lineHeight=1.3))
    if lora:
        U.append(el("shape", f"ub{i}l", x + 62, 279, 10, 10, shape="ellipse", fill=AMBER, line=None))
U.append(txt("unet-f", "64² → 8² と縮めて戻す U 字（Transformer ブロック 16 個）\n[[accent2:●]] = LoRA を挿す主な層", 210, 334, 314, 28, 7.5, MUTE, lineHeight=1.35))
group("unet", U)
arrow("a-u", 530, 300, 566, 300, MUTE)
math_el("a-u-l", r"\hat\epsilon", 534, 280, 30, 18, 9.5, MUTE)
node("sched", 568, 262, 128, 76, "Scheduler", "DDIM / DPM++ / Euler\n予測を使って 1 手進める", RED, soft=True)
# くり返しの戻り線
seg("loop1", 632, 340, 632, 381, RED, 1.4)
seg("loop2", 363, 381, 632, 381, RED, 1.4)
arrow("loop3", 363, 382, 363, 371, RED, 1.4, 7)
txt("loop-t", "N 回くり返す\n（20〜50 手）", 640, 344, 100, 28, 7.5, RED, True, lineHeight=1.3)
# 出力
arrow("a-s", 660, 260, 660, 210, AMBER)
math_el("a-s-l", "z_0", 664, 224, 30, 18, 9, AMBER)
node("dec", 610, 150, 104, 54, "VAE Decoder", "8 倍に拡大", BLUE, soft=True)
arrow("a-d", 716, 177, 740, 177, BLUE)
group("out", [el("image", "out", 742, 140, 92, 92, src="assets/scene.jpg", fit="cover"),
              box("out-f", 742, 140, 92, 92, fill=None, line=AMBER, radius=2, lw=1.5)])
txt("out-l", "512×512×3", 742, 234, 92, 14, 8, AMBER, True, align="center", lineHeight=1.3)
# 学習の流れ
group("x0", [el("image", "x0", 76, 418, 62, 62, src="assets/scene.jpg", fit="cover"), box("x0-f", 76, 418, 62, 62, fill=None, line="4A3F37", radius=2)])
txt("x0-l", "学習画像", 66, 481, 82, 12, 7.5, MUTE, align="center", lineHeight=1.2)
arrow("b-1", 140, 449, 160, 449, BLUE)
node("enc", 162, 422, 104, 54, "VAE Encoder", "512² → 64²×4", BLUE, soft=True)
arrow("b-2", 268, 449, 296, 449, MUTE)
math_el("b-2l", "z_0", 268, 430, 30, 18, 9, MUTE)
group("plus", [el("shape", "plus-c", 298, 431, 36, 36, shape="ellipse", fill="lt1", line={"color": RED, "width": 1.6}),
               txt("plus-t", "+ε", 298, 431, 36, 36, 10, RED, True, align="center", valign="middle", lineHeight=1)])
txt("plus-l", "t を一様に選び\nノイズ ε を足す", 276, 469, 80, 24, 7, RED, align="center", lineHeight=1.25)
arrow("b-3", 336, 449, 364, 449, MUTE)
math_el("b-3l", "z_t", 336, 430, 30, 18, 9, MUTE)
node("unet2", 366, 422, 120, 54, "UNet（同じもの）", "＋ 時刻 t ＋ 説明文 c", VIOLET, soft=True)
arrow("b-4", 488, 449, 514, 449, MUTE)
math_el("b-4l", r"\hat\epsilon", 488, 430, 28, 18, 9.5, MUTE)
L = [box("loss-b", 516, 422, 318, 54, fill="lt1", line=RED, lw=1.4, radius=7),
     math_el("loss-m", r"\lVert\epsilon-\hat\epsilon\rVert^2", 524, 427, 76, 24, 11, RED),
     txt("loss-t", "を最小化 ＝ 足したノイズを当てる練習", 600, 430, 228, 16, 9, RED, True, lineHeight=1.3),
     txt("loss-s", "学習するのは UNet だけ（VAE・CLIP は凍結）", 526, 454, 302, 14, 7.5, MUTE, lineHeight=1.3)]
group("loss", L)
# 式のパネル
group("mathp", card("mathp", 870, 122, 350, 374))
FORMULAS = [
    ("① 前向き過程（ノイズを足す）", RED, r"z_t=\sqrt{\bar\alpha_t}\,z_0+\sqrt{1-\bar\alpha_t}\,\epsilon,\quad \bar\alpha_t=\textstyle\prod_{s\le t}(1-\beta_s)",
     "β は 0.00085→0.012（T = 1000）。どの時刻の入力も 1 回で作れる。ε は標準正規乱数"),
    ("② 学習の目的（ノイズ当て）", VIOLET, r"\mathcal L=\mathbb E_{z_0,\epsilon,t}\left[\lVert\epsilon-\epsilon_\theta(z_t,t,\tau(y))\rVert^2\right]",
     "τ は文章エンコーダ、y は説明文。t は 1〜1000 から一様に選ぶ"),
    ("③ CFG（プロンプトへ寄せる）", TEAL, r"\tilde\epsilon=\epsilon_\theta(z_t,\varnothing)+w\left(\epsilon_\theta(z_t,c)-\epsilon_\theta(z_t,\varnothing)\right)",
     "学習中 10% の確率で文章を空にして無条件も学ぶ。w = 7.5 が既定"),
    ("④ クロスアテンション（文章を絵に入れる）", AMBER, r"\mathrm{Attn}(Q,K,V)=\mathrm{softmax}\!\left(\frac{QK^\top}{\sqrt d}\right)V",
     "Q は画像の特徴、K・V は文章から作る。Q・K・V・出力の 4 つの重み行列が LoRA の主な対象（04）"),
]
for i, (label, c, tex, desc) in enumerate(FORMULAS):
    y = 132 + i * 91
    items = head(f"fm{i}h", label, 884, y, 326, c, 9.5)
    items.append(math_el(f"fm{i}", tex, 878, y + 17, 334, 40, 10 if i in (0, 3) else 11))
    items.append(txt(f"fm{i}d", desc, 884, y + 58, 326, 28, 8, MUTE, lineHeight=1.35))
    group(f"fm{i}", items)
# 下段: 世代の表と SD 1.5 の数字
table("versions", [
    ["モデル", "公開", "骨格・予測するもの", "テキストエンコーダ（次元）", "標準解像度", "規模"],
    ["SD 1.5", "2022.10", "UNet・ノイズ ε を予測", "CLIP ViT-L/14（768）", "512²", "UNet 0.86B"],
    ["SD 2.1", "2022.12", "UNet・v 予測（768 版）", "OpenCLIP ViT-H/14（1024）", "768²", "UNet 0.87B"],
    ["SDXL 1.0", "2023.07", "大型 UNet（＋Refiner）", "CLIP-L ＋ OpenCLIP bigG（2048）", "1024²", "UNet 2.6B"],
    ["SD 3.5 Large", "2024.10", "MMDiT・Rectified Flow", "CLIP-L ＋ bigG ＋ T5-XXL", "1024²", "8.1B"],
], 60, 508, 790, 172, [1.15, 0.85, 1.75, 2.15, 0.95, 1.0], 9)
N = card("nums", 870, 508, 350, 172, top=VIOLET)
N += head("nums-h", "SD 1.5 の部品と数字", 884, 516, 320, VIOLET, 10)
N.append(txt("nums-t", "・**VAE**：縦横 8 分の 1・4 チャネル（約 8,400 万）。潜在は 0.18215 倍して分散をそろえる\n"
             "・**Text Encoder**：CLIP ViT-L/14 の文章側（約 1.23 億）。凍結\n"
             "・**UNet**：約 8.6 億。学習したのはここだけ\n"
             "・**スケジュール**：scaled linear、β 0.00085→0.012、T = 1000\n"
             "・**データ**：LAION-5B 系（laion-aesthetics v2 5+ で追加学習）\n"
             "・**ライセンス**：CreativeML OpenRAIL-M", 880, 538, 332, 136, 8, MUTE, emph="dk1", lineHeight=1.4))
group("nums", N)

# ================================================================ 03 拡散を触る
slide("拡散を触る", "拡散を触る ─ 前向き過程でノイズを足し、逆過程で取り除く",
      "左：SD 1.5 と同じ係数でノイズを足す（学習データの作り方）。右：2 次元の玩具モデルで**生成と CFG** を再現（ノイズの予測は学習済みネットの代わりに、式で厳密に計算）",
      """
このページの 2 つのウィジェットは操作できます（編集画面でも固定してあるので、そのまま中を触れます）。

左（前向き過程）: スライダーで t を動かすと、信号 √ᾱ_t·x_0 とノイズ √(1−ᾱ_t)·ε の配分が変わり、その和が UNet への入力 x_t になります。グラフは 2 つの係数の推移。SD 1.5 の scaled linear と cosine を切り替えられます。
・t=999 でも SD 1.5 では信号が 0.068 残る。生成は純粋なノイズから始めるので学習とずれ、「平均的な明るさの絵になりやすい」原因とされた（Lin et al. 2023）。対策に zero terminal SNR（最後の SNR を 0 にする）、offset noise（学習時のノイズにチャネルごとの偏りを混ぜる）がある
・cosine（Nichol & Dhariwal 2021）は中盤の信号を多く残す

右（逆過程と CFG）: 2 つの三日月形の分布を「猫」「犬」の 2 つの概念に見立てた 2 次元の玩具モデルです。分布が混合ガウスなので、ノイズを足した後の分布のスコア（＝最適なノイズの予測）を式で厳密に計算でき、学習済みネットの代わりに使っています。生成の手順（DDIM）とスケジュールは SD 1.5 と同じです。
・w=1: 条件付き分布をそのまま再現し、三日月 7 区画を全部覆う
・w=7.5（SD の既定）: 条件には忠実だが、相手の分布に近い先端が出なくなり、覆う区画が 4/7 に減る（多様性の低下）。実画像では色の飽和や硬いコントラストとして出やすい
・空（無条件）: 猫と犬が半々。CFG にはこの無条件の予測も必要
・手数 N を 2〜4 に減らすと、1 手の近似が粗くなりデータから外れる点が増える
・確率的（η=1）は各手でノイズを足し直す DDPM 相当の解き方

下の 4 枚のカードは補足です。サンプラーの「a」（Euler a など）は ancestral の略で、各手でノイズを足す確率的な解き方です。LCM（Latent Consistency Models）や SDXL Turbo は蒸留で 1〜8 手まで減らした例。

出典: Ho et al. 2020 DDPM / Song et al. "DDIM" (arXiv:2010.02502) / Lu et al. "DPM-Solver++" (arXiv:2211.01095) / Karras et al. "EDM" (arXiv:2206.00364) / Nichol & Dhariwal "Improved DDPM" (arXiv:2102.09672) / Lin et al. "Common Diffusion Noise Schedules and Sample Steps are Flawed" (arXiv:2305.08891) / Ho & Salimans 2022 / Luo et al. "LCM" (arXiv:2310.04378)
""")
el("embed", "noise", 60, 122, 560, 400, src="widgets/noise.html", title="前向き過程：ノイズを足す", locked=True)
el("embed", "cfg", 640, 122, 580, 400, src="widgets/cfg.html", title="逆拡散と CFG（2 次元の玩具モデル）", locked=True)
NOTES3 = [
    ("① スケジュール", RED, "β を 0.00085→0.012 へ増やすと、信号の係数がだんだん下がる。SD 1.5 は t = 999 でも係数 0.068 の信号が残り、純粋なノイズから始める生成とずれる → **zero terminal SNR**・**offset noise** で明暗の幅を改善"),
    ("② 逆過程の 1 手", AMBER, None),
    ("③ サンプラーと手数", BLUE, "DDPM 1000 手 → DDIM 50 手 → **DPM-Solver++** 20 手前後。Euler a などの「a」は ancestral（確率的）。手数を減らすと速いが粗い。LCM・Turbo 系は蒸留で 1〜8 手"),
    ("④ CFG の効き方", TEAL, "w = 1 で条件付き分布そのもの。上げるとプロンプトに忠実になる代わりに多様性が減り、上げすぎると色が飽和する。**ネガティブプロンプト**は空の文章 ∅ の代わりに「避けたい文章」を入れる工夫"),
]
for i, (label, c, body) in enumerate(NOTES3):
    x = 60 + i * 294
    items = card(f"n{i}", x, 534, 280, 146, top=c)
    items += head(f"n{i}h", label, x + 12, 544, 256, c, 10)
    if body:
        items.append(txt(f"n{i}t", body, x + 12, 566, 258, 110, 8.5, MUTE, emph="dk1", lineHeight=1.45))
    else:  # 式 + 説明
        items.append(math_el(f"n{i}m", r"\hat x_0=\frac{z_t-\sqrt{1-\bar\alpha_t}\,\hat\epsilon}{\sqrt{\bar\alpha_t}}", x + 8, 566, 264, 40, 10.5, "dk1"))
        items.append(txt(f"n{i}t", "予測したノイズから元の絵を推定し、次の時刻の係数で推定とノイズを混ぜ直す（**DDIM**、決定的）。η = 1 は毎手ノイズを足し直す確率的な解き方（DDPM 相当）",
                         x + 12, 610, 258, 66, 8.5, MUTE, emph="dk1", lineHeight=1.45))
    group(f"n{i}", items)

# ================================================================ 04 LoRA の原理
slide("LoRA の原理", "LoRA の原理 ─ 元の重みは凍結し、低ランクの差分 B·A だけを学ぶ",
      "Hu et al. 2021（LoRA: Low-Rank Adaptation）。微調整で生じる重みの変化 ΔW は**少ない方向に集中する**と考え、ΔW を細長い 2 つの行列の積 **B·A** で表す",
      """
LoRA は、元の重み W₀（d×k）を凍結したまま、差分 ΔW を B（d×r）と A（r×k）の積で表して、A と B だけを学習します。r は rank で、d や k よりずっと小さい（4〜128 程度）。

左の図: 入力 x は 2 つの道を通ります。上は凍結した W₀、下は A で r 次元に落としてから B で d 次元に戻す細い道。出力は h = W₀x + (α/r)·BAx。A はガウス乱数、B は 0 で始めるので、学習開始時は ΔW = 0 で、元のモデルとまったく同じ出力になります。α/r は倍率で、r を変えても学習率を調整し直さずに済むように付けられています。

右のウィジェット（操作できます）: 32×32 の目標 ΔW*（特異値がなだらかに減るように作った例）を、B·A で近似するように勾配降下で実際に学習させています。B=0 から始まり、残りの差が「rank r で届く下限」（特異値分解で求めた最良の近似、Eckart–Young の定理）まで下がります。r を上げると下限も下がる、つまり表現力とパラメータ数の交換です。下の帯は、同じ r を SD 1.5 と SDXL の注意層すべてに入れたときの数とファイルサイズ（fp16）です。
・SD 1.5: 16 個の Transformer ブロック × 自己注意・クロス注意 × q, k, v, out。合計 199,296 × r 個（r=4 で 797,184 個、UNet の 0.09%）
・SDXL: 70 層（640ch × 10、1280ch × 60）、文章 2048 次元 → 1,451,520 × r 個（r=4 で約 580 万個）

LoRA の利点: 学習する数が少ないので、勾配と Adam の状態のメモリが小さい。ファイルが小さく、1 つのベースに多数の LoRA を差し替えられる。推論前に W₀ + (α/r)BA を足し込めば（マージ）、遅延が増えない。LoRA 論文では GPT-3 175B で学習するパラメータを 1 万分の 1、GPU メモリを 3 分の 1 にしています。

注意: ベースモデルの系統に依存します（SD 1.5 用の LoRA は SDXL では使えない）。複数の LoRA を重ねると差分が足し算されるので、干渉したり強すぎたりします。

右下の表: DreamBooth（Ruiz et al. 2022）は被写体 3〜5 枚で全重みを微調整し、同じクラスの画像で元の知識を保つ「事前保存損失」を加えた手法。現在は DreamBooth の手順で LoRA を学習する（DreamBooth-LoRA）ことが多いです。Textual Inversion（Gal et al. 2022）はモデルを変えず、新しい単語の埋め込みベクトルだけを学びます。LoCon は Conv 層にも LoRA を入れる方式、LoHa はアダマール積、LoKr はクロネッカー積で表現力を上げる方式（LyCORIS）、DoRA（Liu et al. 2024）は重みを大きさと向きに分けて向きに LoRA を使う方式です。

出典: Hu et al. "LoRA" (arXiv:2106.09685) / Ruiz et al. "DreamBooth" (arXiv:2208.12242) / Gal et al. "Textual Inversion" (arXiv:2208.01618) / Liu et al. "DoRA" (arXiv:2402.09353) / LyCORIS (github.com/KohakuBlueleaf/LyCORIS) / cloneofsimo/lora（SD への LoRA の最初期の実装）/ diffusers の LoRA 学習スクリプト
""")
D = card("diag", 60, 122, 450, 318)
txt("diag-h", "1 つの線形層（例：Cross-Attn で Q を作る重み）", 76, 130, 420, 16, 9.5, "dk1", True, lineHeight=1.3)
D.append(bar("x-bar", 80, 178, 14, 168, BLUE, opacity=0.8))
D.append(txt("x-l", "入力 x\n（k 次元）", 64, 350, 50, 26, 7.5, BLUE, True, align="center", lineHeight=1.25))
D += [arrow("x-w", 96, 214, 150, 214, MUTE), arrow("x-a", 96, 320, 150, 320, AMBER)]
D += [box("w0", 152, 156, 132, 116, fill="dk2", line="6E655B", radius=4, opacity=0.22),
      txt("w0-t", "**W₀**（d×k）\n事前学習の重み\n[[accent1:凍結：動かさない]]", 152, 156, 132, 116, 8.5, "dk1", emph="dk1", align="center", valign="middle", lineHeight=1.45)]
D[-1]["paragraphs"][0]["runs"][0]["fontSize"] = 12
D += [box("A", 152, 308, 132, 24, fill=AMBER, line=None, radius=3, opacity=0.85),
      txt("A-t", "A（r×k）", 152, 308, 132, 24, 9, "lt1", True, align="center", valign="middle", lineHeight=1.1),
      txt("A-l", "ガウス乱数で開始", 152, 334, 132, 14, 7.5, AMBER, align="center", lineHeight=1.3)]
D += [arrow("a-b", 286, 320, 310, 320, AMBER),
      box("B", 312, 278, 24, 84, fill=AMBER, line=None, radius=3, opacity=0.85),
      txt("B-t", "B", 312, 278, 24, 84, 10, "lt1", True, align="center", valign="middle", lineHeight=1),
      txt("B-l", "B（d×r）\n0 で開始", 296, 364, 60, 26, 7.5, AMBER, align="center", lineHeight=1.25)]
D += chip("scale", "× α / r", 346, 308, 54, 24, AMBER, 8.5)
D += [arrow("a-s", 338, 320, 344, 320, AMBER), seg("s-up1", 402, 320, 420, 320, AMBER, 1.6), seg("s-up2", 420, 232, 420, 320, AMBER, 1.6),
      arrow("s-up3", 420, 240, 420, 231, AMBER, 1.6, 7)]
D += [arrow("w-o", 286, 214, 403, 214, MUTE),
      el("shape", "sum", 404, 198, 32, 32, shape="ellipse", fill="lt1", line={"color": "dk1", "width": 1.5}),
      txt("sum-t", "+", 404, 198, 32, 32, 14, "dk1", True, align="center", valign="middle", lineHeight=1),
      arrow("s-h", 438, 214, 462, 214, MUTE),
      bar("h-bar", 464, 156, 14, 116, VIOLET, opacity=0.8),
      txt("h-l", "出力 h\n（d 次元）", 446, 276, 50, 26, 7.5, VIOLET, True, align="center", lineHeight=1.25)]
D.append(txt("r-note", "r ≪ d, k\n（4〜128）", 346, 250, 64, 26, 7.5, MUTE, align="center", lineHeight=1.25))
D.append(math_el("eq", r"h=W_0x+\frac{\alpha}{r}\,B A x", 76, 386, 210, 46, 13))
D.append(txt("eq-n", "学習するのは A と B だけ：**r(d+k)** 個\nW₀ に足し込めば推論の**遅延はゼロ**", 292, 392, 212, 36, 8, MUTE, emph="dk1", lineHeight=1.45))
group("diag", D)
el("embed", "lora", 530, 122, 690, 318, src="widgets/lora.html", title="LoRA：B·A で ΔW を近似する", locked=True)
# どこに挿すか
W = card("where", 60, 452, 450, 228, top=AMBER)
W += head("where-h", "SD のどこに挿すか・どう使うか", 74, 462, 420, AMBER, 10)
for i, (name, parts) in enumerate([("Self-Attn", ["q", "k", "v", "out"]), ("Cross-Attn", ["q", "k", "v", "out"]), ("FeedForward", [])]):
    x = 74 + i * 142
    W.append(box(f"blk{i}", x, 486, 134, 50, fill="lt1", line=LINE, radius=5))
    W.append(txt(f"blk{i}t", name, x, 488, 134, 14, 8.5, "dk1", True, align="center", lineHeight=1.3))
    for j, p in enumerate(parts):
        W.append(box(f"blk{i}p{j}", x + 9 + j * 30, 507, 26, 20, fill=AMBER, line=None, radius=3, opacity=0.85))
        W.append(txt(f"blk{i}p{j}t", p, x + 9 + j * 30, 507, 26, 20, 7.5, "lt1", True, align="center", valign="middle", lineHeight=1))
    if not parts:
        W.append(txt(f"blk{i}n", "kohya では対象にも", x, 507, 134, 20, 7.5, MUTE, align="center", valign="middle", lineHeight=1.2))
    if i < 2:
        W.append(arrow(f"blk{i}a", x + 135, 511, x + 141, 511, MUTE, 1.2, 5))
W.append(txt("where-t",
             "・**既定（diffusers）**：UNet の注意層 to_q / to_k / to_v / to_out（[[accent2:■]]）。kohya は proj_in/out・FF も、**LoCon** は Conv 層も。Text Encoder にも挿せる（学習率は低め）\n"
             "・**強さ s**：W₀ + s·(α/r)BA。A1111 なら <lora:名前:0.8>。s を 0 にすれば元のモデル\n"
             "・**重ね掛け**：複数の LoRA の差分は足し算で効く。合計が強すぎると崩れる\n"
             "・**ベース依存**：SD 1.5 用は SDXL では使えない。同じ系統の派生モデルには概ね使える",
             70, 544, 432, 132, 8.5, MUTE, emph="dk1", lineHeight=1.45))
group("where", W)
table("methods", [
    ["手法", "何を学ぶか", "学習する数（SD1.5）", "ファイル", "向いている用途"],
    ["フル微調整", "UNet の全重み", "約 8.6 億", "2〜4 GB", "大きなドメイン変更"],
    ["DreamBooth", "全重み＋事前保存損失", "約 8.6 億", "2〜4 GB", "特定の被写体を 3〜5 枚で"],
    ["Textual Inversion", "新しい単語の埋め込み", "768 × 語数", "数 KB", "単純な物・画風"],
    [{"text": "LoRA", "bold": True, "color": AMBER}, {"text": "注意層の低ランク差分 B·A", "color": AMBER}, {"text": "80万〜2,550万（r = 4〜128）", "color": AMBER},
     {"text": "数〜150 MB", "color": AMBER}, {"text": "画風・キャラ・服。重ね掛け可", "color": AMBER}],
    ["LyCORIS・DoRA", "Conv 層にも・積の形を工夫・大きさと向きに分解", "方式による", "数〜数百 MB", "表現力・効率の改善"],
], 530, 452, 690, 228, [1.15, 1.95, 1.4, 0.9, 1.6], 8.5)

# ================================================================ 05 学習の実践
slide("LoRA 学習の実践", "LoRA 学習の実践 ─ データ・キャプション・設定・評価",
      "道具の例：**kohya-ss/sd-scripts**、**diffusers** の学習スクリプト（train_dreambooth_lora など）。数値はよく使われる出発点で、データと目的で調整する",
      """
LoRA を実際に学習させる流れと、設定の目安、失敗の見分け方をまとめました。数値はコミュニティでよく使われる出発点であり、正解ではありません。最後はサンプル画像を見て判断します。

上段の 6 段階:
・① 目的: 画風・キャラ・物・服のどれを覚えさせるか。「LoRA に固定したいもの」と「プロンプトで変えたいもの」を分けておく
・② データ: 15〜50 枚程度。構図・背景・表情・光をばらつかせる。似た画像ばかりだと背景や服まで覚える
・③ 前処理: SD 1.5 は 512²、SDXL は 1024² 前後。aspect ratio bucketing を使えば縦長・横長をそのまま学習できる
・④ キャプション: トリガー語（例: drkcat のような既存の意味が薄い語）＋その他の要素。キャプションに書いた要素は「プロンプトで変えられる」ものとして扱われ、書かなかった共通点が LoRA（トリガー語）に吸収される。BLIP や WD14 Tagger で下書きして手で直す
・⑤ 学習: rank・学習率・ステップを決めて回す。エポックごとに保存し、サンプル画像も出す
・⑥ 評価: 同じシード・同じプロンプトで「保存版 × 強さ」を並べた比較表（A1111 の X/Y/Z plot など）で選ぶ

中段の表と右のウィジェット: 総ステップ = ⌈画像の枚数 × 繰り返し ÷ バッチ⌉ × エポック（kohya-ss/sd-scripts の数え方。正則化画像を使うとその分増える）。ウィジェットで枚数・繰り返し・エポック・バッチ・rank・保存間隔を変えると、総ステップ、1 枚を学ぶ回数、LoRA のファイルサイズ（注意層のみ・fp16 の計算値）、学習率の推移と保存点が変わります。帯の「1,000〜3,000」はよく使われる出発点の目安です。
・alpha: 実効倍率は α/r。α を r の半分にすると、同じ学習率でも更新は半分になる
・Prodigy: 学習率を自動で調整するオプティマイザ。学習率は 1.0 を指定する
・min-SNR 重み付け（Hang et al. 2023）: t ごとの損失の偏りを抑えて収束を速める。γ=5 がよく使われる
・noise offset: 2 枚目・3 枚目の「明暗が弱い」問題への簡易な対策

下段の 5 枚: よくある失敗と対処、使い方と権利。正則化画像は DreamBooth の事前保存の考え方で、同じクラス（例: 一般的な猫）の画像を混ぜて、クラス全体が学習対象に引っ張られるのを防ぎます。

権利: 学習画像の著作権・肖像権に注意し、ベースモデルのライセンス（SD 1.5: CreativeML OpenRAIL-M、SDXL: CreativeML OpenRAIL++-M、SD 3.5: Stability AI Community License）の利用条件を確認します。

出典: kohya-ss/sd-scripts ドキュメント / Hugging Face diffusers "LoRA" 学習ガイド / Ruiz et al. "DreamBooth" / Hang et al. "Efficient Diffusion Training via Min-SNR Weighting Strategy" (arXiv:2303.09556) / Mishchenko & Defazio "Prodigy" (arXiv:2306.06101) / bitsandbytes（8-bit optimizers）
""")
STEPS = [
    ("① 目的を決める", RED, "画風・キャラ・物・服のどれか。**固定したいもの**と**プロンプトで変えたいもの**を分ける"),
    ("② データを集める", AMBER, "**15〜50 枚**が目安。構図・背景・表情・光を散らす。低画質・重複・透かしは除く"),
    ("③ 前処理", BLUE, "SD 1.5 は **512²**、SDXL は **1024²** 前後。縦横比はバケットでそのまま使える"),
    ("④ キャプション", TEAL, "**トリガー語**＋その他の要素。書いた要素は変えられ、**書かない共通点**が LoRA に入る"),
    ("⑤ 学習", VIOLET, "rank・学習率・ステップを決める。**エポックごとに保存**し、サンプル画像も出す"),
    ("⑥ 評価・使う", RED, "固定シードで**保存版 × 強さ**の比較表を作って選ぶ。safetensors で配る"),
]
for i, (label, c, body) in enumerate(STEPS):
    x = 60 + i * 194
    chevron(f"st{i}", x, 122, 190, 28, c, label, 9.5, first=i == 0)
    txt(f"st{i}t", body, x + 6, 154, 178, 62, 8, MUTE, emph="dk1", lineHeight=1.4)
table("settings", [
    ["項目", "SD 1.5", "SDXL", "意味・注意"],
    ["解像度", "512²", "1024²", "使うときも学習と近い解像度が安定"],
    ["rank / alpha", "8〜32 / rank の半分〜同じ", "8〜32 / 同左", "実効倍率は α/r。大きい rank は表現力↑・過学習とサイズ↑"],
    ["学習率", "UNet 1e-4・TE 5e-5", "1e-4 前後（TE は凍結も）", "Prodigy なら 1.0 で自動調整"],
    ["バッチ / 総ステップ", "1〜4 / 1,000〜3,000", "同程度", "総数 = 枚数 × 繰り返し × エポック ÷ バッチ"],
    ["オプティマイザ", "AdamW8bit", "AdamW8bit・Adafactor", "8bit は Adam の状態のメモリを約 1/4 に"],
    ["省メモリ", "fp16/bf16・勾配チェックポイント", "＋ 潜在・文章のキャッシュ", "VRAM の目安 6〜8 GB ／ 12〜24 GB"],
    ["安定化", "min-SNR γ=5・noise offset 0.05", "同左", "t ごとの損失の偏り・明暗の弱さを補う"],
], 60, 226, 580, 298, [1.0, 1.45, 1.35, 2.2], 8.5)
el("embed", "planner", 660, 226, 560, 298, src="widgets/planner.html", title="LoRA 学習の設定を計算する", locked=True)
FAILS = [
    ("過学習", RED, "症状：学習画像と同じ構図・背景・服が出る。プロンプトが効かない\n対処：早い保存版を使う／ステップ・学習率・rank を下げる／データを散らす"),
    ("学習不足", BLUE, "症状：トリガー語を入れても特徴が出ない\n対処：ステップを増やす／特徴そのものをキャプションに書きすぎていないか確認"),
    ("焼け・破綻", AMBER, "症状：色が濃い・ざらつく・輪郭が崩れる\n対処：学習率を下げる／強さを 0.6〜0.8 に／他の LoRA との合計を抑える"),
    ("混ざる・漏れる", VIOLET, "症状：背景や画風まで覚える。トリガー語なしでも出る\n対処：背景・画風をキャプションに書く／正則化画像（同じクラスの一般画像）を混ぜる"),
    ("使う・配る", TEAL, "A1111/Forge：<lora:名前:0.8>　ComfyUI：Load LoRA\ndiffusers：load_lora_weights → set_adapters → fuse_lora\n権利：学習画像の著作権・肖像権とベースのライセンスを確認"),
]
for i, (label, c, body) in enumerate(FAILS):
    x = 60 + i * 234
    items = card(f"f{i}", x, 536, 224, 144, top=c)
    items += head(f"f{i}h", label, x + 12, 545, 200, c, 10)
    t = txt(f"f{i}t", body, x + 12, 566, 204, 110, 8.5, MUTE, lineHeight=1.45)
    for p in t["paragraphs"]:
        r0 = p["runs"][0]["text"]
        m = re.match(r"^(症状：|対処：|権利：|A1111/Forge：|diffusers：)", r0)
        if m:
            p["runs"] = [{"text": m.group(1), "bold": True, "color": "dk1"}, {"text": r0[len(m.group(1)):]}]
    items.append(t)
    group(f"f{i}", items)

# ---------------------------------------------------------------- 書き出し
assert len(deck["slides"]) == N_SLIDES
for ss in deck["slides"]:
    ids = [e["id"] for e in ss["elements"]]
    dup = {i for i in ids if ids.count(i) > 1}
    assert not dup, dup
(OUT / f"{NAME}.deck").write_text(json.dumps(deck, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Created", len(deck["slides"]), "slides,", sum(len(x["elements"]) for x in deck["slides"]), "elements at", OUT / f"{NAME}.deck")
