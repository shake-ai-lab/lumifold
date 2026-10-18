# ウィジェットのビルド: widgets/*.template.html の /*CYBER*/ に共通 CSS、/*THREE*/ に three.js、
# /*INC:_name.js*/ に widgets/_name.js（共通のデータや描画コード）を差し込んで *.html を作る。
# 使い方: python tools/build-widgets.py decks/<name>
import os, re, sys

deck_dir = sys.argv[1] if len(sys.argv) > 1 else "decks/neural-network"
wdir = os.path.join(deck_dir, "widgets")
css_path = os.path.join(wdir, "_cyber.css")
css = open(css_path, encoding="utf-8").read() if os.path.exists(css_path) else ""
three_path = os.path.join("node_modules", "three", "build", "three.min.js")
three = None

for name in sorted(os.listdir(wdir)):
    if not name.endswith(".template.html"):
        continue
    src = open(os.path.join(wdir, name), encoding="utf-8").read()
    out = src.replace("/*CYBER*/", "\n" + css + "\n")
    if "/*THREE*/" in out:
        if three is None:
            three = open(three_path, encoding="utf-8").read()
            assert "</script" not in three
        out = out.replace("/*THREE*/", "// three.js r159 (MIT) https://threejs.org — 自己完結にするため埋め込み\n" + three)
    # /*INC:_name.js*/ は widgets/_name.js の中身に置き換える（共通のデータや描画コード）
    out = re.sub(r"/\*INC:([\w.-]+)\*/", lambda m: open(os.path.join(wdir, m.group(1)), encoding="utf-8").read(), out)
    target = os.path.join(wdir, name.replace(".template.html", ".html"))
    open(target, "w", encoding="utf-8").write(out)
    print(f"{target}  {len(out) // 1024} KB")
