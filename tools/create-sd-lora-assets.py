# decks/sd-lora（Stable Diffusion と LoRA の説明デッキ）の画像を作る。
# 使い方: python tools/create-sd-lora-assets.py → python tools/build-widgets.py decks/sd-lora → python tools/create-sd-lora-deck.py
#   assets/bg.jpg, bg-cover.jpg   暗室テーマの背景（フィルムの粒子・送り穴・セーフライトの赤い光）
#   assets/scene.jpg              「夕暮れの湖畔に座る猫」の自作イラスト（x_0 として使う。生成 AI の出力ではない）
#   assets/xt-XXX.jpg             scene に SD 1.5 と同じスケジュールでノイズを足した x_t（画素空間で表示）
#   assets/latent-noise.png       z_T のイメージ（64×64 の乱数を拡大）
#   widgets/_scene.js             ノイズのウィジェットが使う scene（data URL）
import base64
import io
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "decks" / "sd-lora"
(OUT / "assets").mkdir(parents=True, exist_ok=True)
(OUT / "widgets").mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(20261017)


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


# ---------------------------------------------------------------- 背景
def background(w, h, glow, name):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    img = np.zeros((h, w, 3), np.float32) + hexrgb("15110F")
    # 周辺減光
    d = np.sqrt(((xx - w / 2) / (w * 0.62)) ** 2 + ((yy - h / 2) / (h * 0.62)) ** 2)
    img *= (1 - 0.45 * np.clip(d - 0.35, 0, 1))[..., None]
    # セーフライトの赤（右上）と、現像液の琥珀（左下）
    for cx, cy, r, col, a in [(w * 0.92, -h * 0.05, w * 0.55, "FF4A36", glow), (w * 0.02, h * 1.05, w * 0.45, "F3B23E", glow * 0.35)]:
        g = np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (r * r)) * 2.2)
        img += g[..., None] * hexrgb(col) * a
    # フィルムの粒子
    img += rng.normal(0, 3.2, (h, w, 1))
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    dr = ImageDraw.Draw(im)
    # 送り穴と縁の線（上下）
    for y0 in (4, h - 14):
        for x0 in range(18, w - 10, 30):
            dr.rounded_rectangle([x0, y0, x0 + 13, y0 + 9], radius=2, fill=(36, 30, 26), outline=(52, 44, 38))
    dr.line([(0, 18), (w, 18)], fill=(44, 37, 32), width=1)
    dr.line([(0, h - 19), (w, h - 19)], fill=(44, 37, 32), width=1)
    im.save(OUT / "assets" / name, quality=90)


background(1280, 720, 0.10, "bg.jpg")
background(1280, 720, 0.20, "bg-cover.jpg")


# ---------------------------------------------------------------- x_0: 夕暮れの湖畔に座る猫（自作の図案）
def scene(size=768):
    S = size
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / S
    stops = [(0.0, "120A28"), (0.30, "3E1A4C"), (0.50, "A33F52"), (0.60, "F08A4B"), (0.645, "FFC27A")]
    sky = np.zeros((S, S, 3), np.float32)
    for (v0, c0), (v1, c1) in zip(stops, stops[1:]):
        m = (yy >= v0) & (yy < v1)
        t = ((yy - v0) / (v1 - v0))[..., None]
        sky = np.where(m[..., None], hexrgb(c0) * (1 - t) + hexrgb(c1) * t, sky)
    sky = np.where((yy >= 0.645)[..., None], hexrgb("FFC27A"), sky)
    # 太陽の光
    sx, sy = 0.66, 0.585
    d = np.sqrt((xx - sx) ** 2 + (yy - sy) ** 2)
    sky += (np.exp(-d * 9) * 0.55)[..., None] * hexrgb("FFB070")
    sky = np.where((d < 0.075)[..., None], hexrgb("FFE6B0"), sky)
    # 星
    for _ in range(70):
        x, y = rng.random(), rng.random() * 0.32
        b = rng.random() ** 2
        r = 0.0016 + b * 0.0022
        m = (xx - x) ** 2 + (yy - y) ** 2 < r * r
        sky = np.where(m[..., None], sky * (1 - b) + 255 * b, sky)
    img = Image.fromarray(np.clip(sky, 0, 255).astype(np.uint8))
    dr = ImageDraw.Draw(img, "RGBA")

    def ridge(base, amps, col, seed):
        r2 = np.random.default_rng(seed)
        ph = r2.random(len(amps)) * 6.28
        pts = [(0, S)]
        for i in range(0, S + 1, 4):
            u = i / S
            v = base + sum(a * math.sin(u * f * 6.28 + p) for (a, f), p in zip(amps, ph))
            pts.append((i, v * S))
        pts.append((S, S))
        dr.polygon(pts, fill=col)

    ridge(0.555, [(0.035, 1.3), (0.018, 3.1), (0.006, 9)], (138, 58, 92, 255), 1)
    ridge(0.600, [(0.030, 0.9), (0.014, 2.6), (0.005, 11)], (84, 34, 70, 255), 2)
    # 湖（空の映り込み）
    lake = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lake)
    top = int(0.645 * S)
    for y in range(top, S):
        t = (y - top) / (S - top)
        c = hexrgb("B04E58") * (1 - t) ** 1.6 + hexrgb("1C0C24") * (1 - (1 - t) ** 1.6)
        ld.line([(0, y), (S, y)], fill=tuple(int(v) for v in c) + (255,))
    img.paste(lake, (0, 0), lake)
    dr = ImageDraw.Draw(img, "RGBA")
    # 太陽の映り込み（横縞）
    for i in range(46):
        y = top + 4 + i * (S - top) / 52 + rng.random() * 3
        w = (0.08 - i * 0.0012) * S * (0.6 + rng.random() * 0.7)
        a = int(220 * (1 - i / 50))
        dr.rounded_rectangle([sx * S - w / 2, y, sx * S + w / 2, y + 2 + rng.random() * 3], radius=2, fill=(255, 205, 140, a))
    # 手前の岸と岩
    dr.polygon([(0, 0.80 * S), (0.18 * S, 0.77 * S), (0.30 * S, 0.755 * S), (0.42 * S, 0.775 * S), (0.50 * S, 0.83 * S), (0.56 * S, S), (0, S)], fill=(18, 9, 22, 255))
    dr.polygon([(0.17 * S, 0.80 * S), (0.21 * S, 0.735 * S), (0.30 * S, 0.715 * S), (0.39 * S, 0.735 * S), (0.43 * S, 0.80 * S)], fill=(14, 7, 18, 255))
    # 猫（右の太陽を向いて座る）
    k = (12, 6, 16, 255)
    cx, base = 0.305 * S, 0.722 * S
    dr.ellipse([cx - 0.050 * S, base - 0.120 * S, cx + 0.046 * S, base + 0.004 * S], fill=k)       # 胴
    dr.ellipse([cx - 0.010 * S, base - 0.150 * S, cx + 0.044 * S, base - 0.060 * S], fill=k)       # 胸
    hx, hy, hr = cx + 0.030 * S, base - 0.168 * S, 0.034 * S
    dr.ellipse([hx - hr, hy - hr, hx + hr, hy + hr * 0.95], fill=k)                                  # 頭
    dr.polygon([(hx - 0.030 * S, hy - 0.012 * S), (hx - 0.024 * S, hy - 0.064 * S), (hx - 0.002 * S, hy - 0.030 * S)], fill=k)  # 耳
    dr.polygon([(hx + 0.006 * S, hy - 0.032 * S), (hx + 0.026 * S, hy - 0.066 * S), (hx + 0.034 * S, hy - 0.012 * S)], fill=k)
    dr.polygon([(hx + 0.030 * S, hy - 0.004 * S), (hx + 0.046 * S, hy + 0.006 * S), (hx + 0.028 * S, hy + 0.016 * S)], fill=k)   # 鼻先
    tail =[(cx - 0.04 * S - 0.06 * S * math.sin(a), base - 0.006 * S - 0.022 * S * (1 - math.cos(a)) * 1.6) for a in np.linspace(0, 2.0, 30)]
    dr.line(tail, fill=k, width=int(0.016 * S), joint="curve")
    # 左の松
    tx = 0.075 * S
    dr.rectangle([tx - 0.006 * S, 0.50 * S, tx + 0.006 * S, 0.82 * S], fill=(16, 8, 20, 255))
    for i in range(9):
        y = 0.40 * S + i * 0.042 * S
        w = (0.025 + i * 0.010) * S
        dr.polygon([(tx, y - 0.03 * S), (tx - w, y + 0.035 * S), (tx + w, y + 0.035 * S)], fill=(16, 8, 20, 255))
    return img.filter(ImageFilter.GaussianBlur(0.6))


big = scene(768)
for sz, name in [(512, "scene.jpg")]:
    big.resize((sz, sz), Image.LANCZOS).save(OUT / "assets" / name, quality=92)

# ---------------------------------------------------------------- x_t: SD 1.5 のスケジュール（scaled linear, β 0.00085→0.012, T=1000）
betas = np.linspace(math.sqrt(0.00085), math.sqrt(0.012), 1000) ** 2
abar = np.cumprod(1 - betas)
x0 = np.asarray(big.resize((336, 336), Image.LANCZOS), np.float32) / 127.5 - 1
eps = np.random.default_rng(7).normal(0, 1, x0.shape).astype(np.float32)
for t in [999, 800, 600, 400, 200, 0]:
    a = abar[t] if t > 0 else 1.0
    xt = math.sqrt(a) * x0 + math.sqrt(1 - a) * eps
    Image.fromarray(np.clip((xt + 1) * 127.5, 0, 255).astype(np.uint8)).save(OUT / "assets" / f"xt-{t:03}.jpg", quality=88)
    print(f"t={t:4}  sqrt(abar)={math.sqrt(a):.3f}")

# z_T のイメージ（64×64 の乱数、4ch のうち 3ch を色にした「見た目の例」）
z = np.random.default_rng(3).normal(0, 1, (64, 64, 3))
Image.fromarray(np.clip(z * 55 + 128, 0, 255).astype(np.uint8)).resize((192, 192), Image.NEAREST).save(OUT / "assets" / "latent-noise.png")

# ---------------------------------------------------------------- ウィジェット用（data URL）
buf = io.BytesIO()
big.resize((160, 160), Image.LANCZOS).save(buf, "PNG")
(OUT / "widgets" / "_scene.js").write_text(
    "// tools/create-sd-lora-assets.py が作る（assets/scene.jpg と同じ図案、160×160）\nconst SCENE_URL='data:image/png;base64," + base64.b64encode(buf.getvalue()).decode() + "';\n",
    encoding="utf-8")
print("assets written to", OUT / "assets")
