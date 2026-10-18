# tools/fixtures/note-demo(ノート形式の見本「よく眠るためのノート」、10 ページ)を作る。
# ノートは 768x1024 の縦のページ。見出し (64, 72, 640, 80)、本文は y=188〜952、左右 64(src/editor/layouts.ts の NOTE_LAYOUTS と同じ作法)。
# 使い方: python tools/create-note-demo-deck.py
import json
import os

OUT = os.path.join(os.path.dirname(__file__), "fixtures", "note-demo", "note-demo.deck")
X, W = 64, 640


def para(text, **kw):
    return {"runs": [{"text": text}], **kw}


def text(id, x, y, w, h, lines, role=None, group=None, bullets=False, **style):
    el = {"id": id, "type": "text", "x": x, "y": y, "w": w, "h": h, "style": style,
          "paragraphs": [{**(line if isinstance(line, dict) else para(line)), **({"bullet": True} if bullets else {})} for line in lines]}
    if role:
        el["role"] = role
    if group:
        el["group"] = group
    return el


def title(pid, label):
    return text(f"{pid}-title", X, 72, W, 80, [label], role="title", fontSize=24, bold=True, color="dk2", valign="bottom")


def rule(pid, y=164, w=W, color="accent1", width=2, suffix="rule"):
    return {"id": f"{pid}-{suffix}", "type": "shape", "shape": "line", "x": X, "y": y, "w": w, "h": 2, "line": {"color": color, "width": width}}


def prose(id, y, h, lines, **style):
    return text(id, X, y, W, h, lines, fontSize=14, lineHeight=1.8, paraSpacing=12, **style)


pages = []

# 1. 表紙
pages.append({"id": "n1", "background": {"color": "dk2"}, "elements": [
    text("n1-kicker", X, 220, W, 40, ["SLEEP NOTE"], fontSize=12, bold=True, color="accent3"),
    text("n1-title", X, 270, W, 230, ["よく眠るための", "ノート"], role="title", fontSize=40, bold=True, color="lt1", valign="bottom", lineHeight=1.3),
    {"id": "n1-bar", "type": "shape", "shape": "line", "x": X, "y": 524, "w": 120, "h": 4, "line": {"color": "accent3", "width": 4}},
    text("n1-sub", X, 552, W, 110, ["眠りのしくみと、今夜からできる 7 つのこと"], fontSize=16, color="lt2", lineHeight=1.7),
    text("n1-by", X, 880, W, 48, ["Lumifold ノート形式の見本"], role="caption", fontSize=12, color="lt2", valign="bottom"),
]})

# 2. はじめに
pages.append({"id": "n2", "elements": [
    title("n2", "はじめに"), rule("n2"),
    prose("n2-body", 188, 620, [
        "人は人生のおよそ 3 分の 1 を眠って過ごします。それなのに、眠りについて学ぶ機会はあまりありません。",
        "このノートでは、まず眠りがどんなリズムでできているかを見て、そのあとで今夜から試せる工夫をまとめます。",
        "数字はどれも「多くの人に当てはまる目安」です。眠りには個人差が大きいので、自分の体の感じ方を一番の手がかりにしてください。",
    ]),
    text("n2-hint", X, 840, W, 80, ["右下の角をつまんでめくるか、→ キーで次のページへ。"], fontSize=11, color="accent5", lineHeight=1.6),
]})

# 3. 章の扉
pages.append({"id": "n3", "background": {"color": "lt2"}, "hidePageNumber": True, "elements": [
    text("n3-no", X, 270, W, 150, ["01"], fontSize=72, bold=True, color="accent1", valign="bottom"),
    rule("n3", 436),
    text("n3-title", X, 460, W, 110, ["眠りのしくみ"], role="title", fontSize=30, bold=True, color="dk2"),
    text("n3-lead", X, 580, W, 140, ["眠りは一晩じゅう同じ深さではありません。浅い眠りと深い眠りが、波のようにくり返します。"], fontSize=14, color="accent5", lineHeight=1.8),
]})

# 4. 眠りは 90 分の波(グラフ)
pages.append({"id": "n4", "elements": [
    title("n4", "眠りは約 90 分の波"), rule("n4"),
    {"id": "n4-chart", "type": "chart", "x": X, "y": 196, "w": W, "h": 360, "chart": {
        "kind": "line", "title": "一晩の眠りの深さ(イメージ)",
        "labels": ["0時間", "1", "2", "3", "4", "5", "6", "7", "8"],
        "series": [{"name": "眠りの深さ", "values": [0, 3, 1, 3, 1, 2, 0.5, 1.5, 0]}],
        "options": {"legend": "none"}}},
    text("n4-cap", X, 562, W, 32, ["図 1  深さ 0 = 目覚め、3 = いちばん深い眠り。前半ほど深く、明け方は浅い"], role="caption", fontSize=11, color="accent5"),
    prose("n4-body", 616, 330, [
        "眠り始めると、まず深い眠りまで一気に下り、そこから浅い眠りへ戻ってきます。この 1 往復がおよそ 90 分(人によって 70〜120 分)です。",
        "一晩でこれを 4〜5 回くり返します。深い眠りは前半に多く、明け方に近づくほど浅い眠りと夢の時間が増えます。",
    ]),
]})

# 5. レム睡眠とノンレム睡眠(表と要点)
pages.append({"id": "n5", "elements": [
    title("n5", "2 種類の眠り"), rule("n5"),
    prose("n5-body", 188, 150, ["眠りは大きく「レム睡眠」と「ノンレム睡眠」に分かれます。役割が違うので、どちらも欠かせません。"]),
    {"id": "n5-table", "type": "table", "x": X, "y": 330, "w": W, "h": 250, "fontSize": 13, "header": True, "rows": [
        [{"text": ""}, {"text": "ノンレム睡眠"}, {"text": "レム睡眠"}],
        [{"text": "体と脳", "bold": True}, {"text": "脳も体も休む"}, {"text": "体は休み、脳は活発"}],
        [{"text": "多い時間帯", "bold": True}, {"text": "夜の前半"}, {"text": "明け方"}],
        [{"text": "主なはたらき", "bold": True}, {"text": "体の修復・成長"}, {"text": "記憶の整理・夢"}],
    ]},
    {"id": "n5-box", "type": "shape", "shape": "roundRect", "x": X, "y": 612, "w": W, "h": 300, "fill": "lt2", "line": None, "radius": 12, "group": "n5-point"},
    text("n5-box-head", X + 28, 636, W - 56, 44, ["ポイント"], fontSize=15, bold=True, color="accent1", valign="middle", group="n5-point"),
    text("n5-box-body", X + 28, 688, W - 56, 200, [
        "寝始めの 3 時間に深い眠りが集まる",
        "明け方の眠りは記憶の整理に大切",
        "どちらかだけを削ると、もう一方も乱れやすい",
    ], group="n5-point", bullets=True, fontSize=14, lineHeight=1.7, paraSpacing=8),
]})

# 6. 起きる時刻を数える(数式)
pages.append({"id": "n6", "elements": [
    title("n6", "起きる時刻を数える"), rule("n6"),
    prose("n6-body", 188, 200, [
        "波の途中、深い眠りのところで起こされると、頭がぼんやりしやすくなります。波が浅くなるところに合わせて目覚ましをかけると、すっきり起きやすくなります。",
    ]),
    {"id": "n6-math", "type": "math", "x": X, "y": 410, "w": W, "h": 110, "latex": "t_{\\text{起床}} = t_{\\text{就寝}} + 15 + 90\\,n", "fontSize": 24, "displayMode": True},
    text("n6-where", X, 530, W, 60, ["15 分は寝つくまでの時間、n は波の回数(4〜5)"], fontSize=12, color="accent5", align="center"),
    {"id": "n6-ex-bg", "type": "shape", "shape": "roundRect", "x": X, "y": 620, "w": W, "h": 250, "fill": "lt2", "line": None, "radius": 12, "group": "n6-ex"},
    text("n6-ex", X + 28, 640, W - 56, 210, [
        para("例: 23:00 に布団に入るなら"),
        {"runs": [{"text": "n = 4 → 5:15    n = 5 → 6:45", "bold": True}]},
        para("90 分はあくまで目安。数日試して、起きやすい時刻を探しましょう。"),
    ], fontSize=14, lineHeight=1.8, paraSpacing=6, group="n6-ex"),
]})

# 7. 章の扉
pages.append({"id": "n7", "background": {"color": "lt2"}, "hidePageNumber": True, "elements": [
    text("n7-no", X, 270, W, 150, ["02"], fontSize=72, bold=True, color="accent2", valign="bottom"),
    rule("n7", 436, color="accent2"),
    text("n7-title", X, 460, W, 110, ["今夜からできること"], role="title", fontSize=30, bold=True, color="dk2"),
    text("n7-lead", X, 580, W, 140, ["特別な道具はいりません。光・温度・カフェインの 3 つを意識するだけで、眠りは変わります。"], fontSize=14, color="accent5", lineHeight=1.8),
]})

# 8. 7 つの習慣
habits = [
    ("朝の光を浴びる", "起きて 1 時間以内に外の光を。体内時計がそろいます。"),
    ("起きる時刻をそろえる", "休日もずれは 1 時間以内に。"),
    ("カフェインは昼過ぎまで", "夕方以降のコーヒー・緑茶は控えめに(次のページ)。"),
    ("寝る前の画面を減らす", "明るい光は眠気を遅らせます。"),
    ("お風呂は寝る 1〜2 時間前", "体温が下がるときに眠気が来ます。"),
    ("寝室は涼しく暗く", "暑さと明かりは眠りを浅くします。"),
    ("眠れないときは一度起きる", "布団で悩まず、眠くなってから戻る。"),
]
els = [title("n8", "7 つの習慣"), rule("n8")]
for i, (head, body) in enumerate(habits):
    y = 196 + i * 104
    els += [
        {"id": f"n8-no{i+1}", "type": "shape", "shape": "ellipse", "x": X, "y": y + 6, "w": 44, "h": 44, "fill": "accent1", "line": None, "group": f"n8-h{i+1}"},
        text(f"n8-no{i+1}-t", X, y + 6, 44, 44, [str(i + 1)], group=f"n8-h{i+1}", fontSize=15, bold=True, color="lt1", align="center", valign="middle"),
        text(f"n8-head{i+1}", X + 64, y, W - 64, 34, [head], fontSize=15, bold=True, color="dk2"),
        text(f"n8-body{i+1}", X + 64, y + 36, W - 64, 56, [body], fontSize=12, color="dk1", lineHeight=1.6),
    ]
pages.append({"id": "n8", "elements": els})

# 9. カフェインの半減期
hours = list(range(0, 13))
remain = [round(100 * 0.5 ** (h / 5)) for h in hours]
pages.append({"id": "n9", "elements": [
    title("n9", "カフェインはゆっくり抜ける"), rule("n9"),
    prose("n9-body", 188, 150, ["カフェインが体の中で半分になるまで、およそ 5 時間(人によって 2〜8 時間)かかります。夕方の 1 杯は、寝る時刻にもまだ残っています。"]),
    {"id": "n9-chart", "type": "chart", "x": X, "y": 350, "w": W, "h": 380, "chart": {
        "kind": "area", "title": "15 時に飲んだコーヒーのカフェイン(%)",
        "labels": [f"{(15 + h) % 24}時" for h in hours],
        "series": [{"name": "残っている量", "values": remain}],
        "options": {"legend": "none", "colors": ["accent4"]}}},
    text("n9-cap", X, 736, W, 32, ["図 2  半減期 5 時間で計算。0 時でもおよそ 3 割が残る"], role="caption", fontSize=11, color="accent5"),
    {"id": "n9-call-bg", "type": "shape", "shape": "roundRect", "x": X, "y": 790, "w": W, "h": 140, "fill": "dk2", "line": None, "radius": 12, "group": "n9-call"},
    text("n9-call", X + 28, 790, W - 56, 140, ["目安: 寝る 8 時間前を最後の 1 杯に"], fontSize=17, bold=True, color="lt1", valign="middle", group="n9-call"),
]})

# 10. おわりに(奥付)
pages.append({"id": "n10", "elements": [
    title("n10", "おわりに"), rule("n10"),
    prose("n10-body", 188, 420, [
        "眠りは「がんばる」ほど遠ざかるものです。7 つ全部を守ろうとせず、まずは朝の光と起きる時刻の 2 つから始めてみてください。",
        "1 週間ほど続けると、夜の眠気が来る時刻が少しずつそろってきます。",
    ]),
    rule("n10", 760, w=W, color="accent5", width=1, suffix="colophon-rule"),
    text("n10-colophon", X, 780, W, 150, [
        "よく眠るためのノート",
        "Lumifold「ノート」形式の見本。読むボタンで単ページ・見開きを切り替え、ページの角をつまんでめくれます。",
        "内容は一般的な目安です。眠りの悩みが続くときは医療機関に相談してください。",
    ], fontSize=10, color="accent5", lineHeight=1.7, paraSpacing=4),
]})

deck = {
    "version": 1,
    "format": "note",
    "pageNumbers": "outside",
    "meta": {"title": "よく眠るためのノート", "created": "2026-10-17"},
    "theme": {
        "fonts": {"head": "Meiryo", "body": "Meiryo"},
        "colors": {"dk1": "2B2A28", "lt1": "FFFDF8", "dk2": "23395B", "lt2": "F1ECE2",
                   "accent1": "3E6FA8", "accent2": "4F8A6E", "accent3": "E3B24F",
                   "accent4": "C8794A", "accent5": "8A8379", "accent6": "B5524B"},
    },
    "slides": pages,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(json.dumps(deck, ensure_ascii=False, indent=2) + "\n")
print(OUT, len(pages), "pages")
