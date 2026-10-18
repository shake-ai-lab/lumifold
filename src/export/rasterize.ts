import { PT, resolveColor, type MathElement, type Theme } from "../model/deck";
import { renderMathHtml } from "../render/elements/MathEl";
import { MATH_FONT_SIZE } from "../model/defaults";
import { readDataUrl } from "../imageData";

/**
 * 数式を PNG(data URL)にする。pptx は TeX をそのまま持てないので画像で入れる。
 * 画面と同じ KaTeX の HTML を SVG の foreignObject に入れて canvas に描く。
 * SVG を画像として描くときは外部ファイルを読めないので、KaTeX の CSS と書体を data URL で埋め込む。
 */
const toDataUrl = readDataUrl;

let katexCss: Promise<string> | null = null;
/** 読み込み済みの KaTeX の CSS(画面の表示に使っているもの)を集め、書体の url(...) を data URL に置き換える */
function embeddedKatexCss(): Promise<string> {
  katexCss ??= (async () => {
    const rules: string[] = [];
    const fonts: Promise<string>[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let list: CSSRuleList;
      try { list = sheet.cssRules; } catch { continue; } // 別オリジンの CSS は読めない
      for (const rule of Array.from(list)) {
        if (rule instanceof CSSFontFaceRule && /KaTeX_/.test(rule.style.getPropertyValue("font-family"))) {
          const url = rule.style.getPropertyValue("src").match(/url\("?([^")]+\.woff2)"?\)/)?.[1];
          if (!url) continue;
          const href = new URL(url, sheet.href ?? location.href).href;
          fonts.push(fetch(href).then((r) => r.blob()).then(toDataUrl).then((data) =>
            rule.cssText.replace(/src\s*:[^;]+;/, `src: url("${data}") format("woff2");`)).catch(() => ""));
        } else if (/\.katex|\.math-render/.test(rule.cssText)) {
          rules.push(rule.cssText);
        }
      }
    }
    return (await Promise.all(fonts)).join("\n") + "\n" + rules.join("\n");
  })();
  return katexCss;
}

/** 数式の要素を、要素の枠と同じ縦横比の PNG にする(ratio 倍の解像度) */
export async function rasterizeMath(el: MathElement, theme: Theme, ratio = 3): Promise<string> {
  const css = await embeddedKatexCss();
  const holder = document.createElement("div");
  holder.setAttribute("style", `width:${el.w}px;height:${el.h}px;font-size:${(el.fontSize ?? MATH_FONT_SIZE) * PT}px;color:${resolveColor(el.color ?? "dk1", theme, "#000000")};`
    + "display:flex;align-items:center;justify-content:center;overflow:hidden;font-family:'Meiryo','Yu Gothic',sans-serif;");
  holder.innerHTML = `<style>${css}</style><div class="math-render">${renderMathHtml(el.latex, el.displayMode ?? true)}</div>`;
  const xhtml = new XMLSerializer().serializeToString(holder);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${el.w * ratio}" height="${el.h * ratio}">`
    + `<foreignObject x="0" y="0" width="${el.w}" height="${el.h}" transform="scale(${ratio})">${xhtml}</foreignObject></svg>`;
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(el.w * ratio); canvas.height = Math.ceil(el.h * ratio);
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  return canvas.toDataURL("image/png");
}
