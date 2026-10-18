// ウィジェット単体の動作確認: 各 HTML を Edge で直接開き、操作して値が変わることと、スクリプトエラーが無いことを見る。
// 使い方: node tools/e2e-widgets.mjs <デッキフォルダ> [出力ディレクトリ]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const deckDir = path.resolve(process.argv[2] ?? "decks/neural-network");
const outDir = process.argv[3] ?? "tools/shots-widgets";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
let failures = 0;
const check = (name, cond, detail = "") => { console.log(`${cond ? "ok  " : "FAIL"} ${name}${detail ? "  (" + detail + ")" : ""}`); if (!cond) failures++; };

async function open(file, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("file:///" + path.join(deckDir, "widgets", file).replace(/\\/g, "/"));
  await page.waitForTimeout(400);
  return { page, errors };
}

// ---- neuron ----
{
  const { page, errors } = await open("neuron.html", 760, 490);
  const y0 = await page.locator("#y").innerText();
  await page.locator("#w1").fill("3");
  await page.locator("#b").fill("-2");
  await page.waitForTimeout(100);
  const y1 = await page.locator("#y").innerText();
  check("neuron: スライダーで出力が変わる", y0 !== y1, `${y0} → ${y1}`);
  await page.locator("#act").selectOption("relu");
  await page.locator("#map").click({ position: { x: 300, y: 100 } });
  await page.waitForTimeout(100);
  check("neuron: クリックで入力点が動く", (await page.locator("#x1").innerText()) !== "0.50");
  await page.screenshot({ path: path.join(outDir, "neuron.png") });
  check("neuron: エラー無し", errors.length === 0, errors.join(" | ").slice(0, 200));
  await page.close();
}

// ---- descent ----
{
  const { page, errors } = await open("descent.html", 760, 490);
  const L0 = parseFloat(await page.locator("#L").innerText());
  for (let i = 0; i < 15; i++) await page.locator("#step").click();
  const L1 = parseFloat(await page.locator("#L").innerText());
  check("descent: ステップで損失が下がる", L1 < L0, `${L0} → ${L1}`);
  await page.locator("#lr").fill("2.6");
  await page.locator("#reset").click();
  for (let i = 0; i < 60; i++) await page.locator("#step").click();
  const msg = await page.locator("#msg").innerText();
  check("descent: 学習率が大きいと発散する", msg.includes("発散"), msg);
  await page.screenshot({ path: path.join(outDir, "descent.png") });
  check("descent: エラー無し", errors.length === 0, errors.join(" | ").slice(0, 200));
  await page.close();
}

// ---- train ----
{
  const { page, errors } = await open("train.html", 1160, 450);
  await page.locator("#dataset").selectOption("circle");
  await page.locator("#play").click();
  await page.waitForTimeout(2500);
  await page.locator("#play").click(); // 一時停止
  const epoch = parseInt(await page.locator("#epoch").innerText(), 10);
  const loss = parseFloat(await page.locator("#loss").innerText());
  const acc = parseInt(await page.locator("#acc").innerText(), 10);
  check("train: エポックが進む", epoch > 20, `epoch=${epoch}`);
  check("train: 損失が下がる(< 0.5)", loss < 0.5, `loss=${loss}`);
  check("train: 円データで精度が上がる(> 85%)", acc > 85, `acc=${acc}%`);
  await page.screenshot({ path: path.join(outDir, "train.png") });
  await page.locator("#dataset").selectOption("spiral");
  await page.locator("#hidden").selectOption("16");
  await page.locator("#lr").selectOption("0.1");
  await page.locator("#play").click();
  await page.waitForTimeout(6000);
  await page.locator("#play").click();
  const acc2 = parseInt(await page.locator("#acc").innerText(), 10);
  check("train: らせんでも学習が進む(> 70%)", acc2 > 70, `acc=${acc2}% epoch=${await page.locator("#epoch").innerText()}`);
  await page.screenshot({ path: path.join(outDir, "train-spiral.png") });
  await page.locator("#view3d").click();
  await page.waitForTimeout(600);
  const gl3 = await page.evaluate(() => { const c = document.getElementById("gl"); return getComputedStyle(c).display !== "none" && !!(c.getContext("webgl2") || c.getContext("webgl")); });
  check("train: 3D 表示に切り替わる", gl3);
  await page.screenshot({ path: path.join(outDir, "train-3d.png") });
  check("train: エラー無し", errors.length === 0, errors.join(" | ").slice(0, 200));
  await page.close();
}

// ---- overfit ----
{
  const { page, errors } = await open("overfit.html", 760, 490);
  const at = async (d) => { await page.locator("#deg").fill(String(d)); await page.waitForTimeout(80); return [parseFloat(await page.locator("#tr").innerText()), parseFloat(await page.locator("#va").innerText())]; };
  const [t1, v1] = await at(1), [t4, v4] = await at(4), [t12, v12] = await at(12);
  check("overfit: 次数を上げると訓練誤差は下がる", t12 < t4 && t4 < t1, `${t1} > ${t4} > ${t12}`);
  check("overfit: 検証誤差は 4 付近が最小で 12 で上がる", v4 < v1 && v12 > v4, `v1=${v1} v4=${v4} v12=${v12}`);
  check("overfit: 高次で過学習と表示", (await page.locator("#msg").innerText()).includes("過学習"));
  await page.screenshot({ path: path.join(outDir, "overfit.png") });
  check("overfit: エラー無し", errors.length === 0, errors.join(" | ").slice(0, 200));
  await page.close();
}


// ---- surface3d(WebGL) ----
{
  const { page, errors } = await open("surface3d.html", 760, 490);
  await page.waitForTimeout(800);
  const gl = await page.evaluate(() => { const c = document.getElementById("gl"); return !!(c.getContext("webgl2") || c.getContext("webgl")); });
  check("surface3d: WebGL が使える", gl);
  const L0 = parseFloat(await page.locator("#L").innerText());
  for (let i = 0; i < 25; i++) await page.locator("#step").click();
  const L1 = parseFloat(await page.locator("#L").innerText());
  check("surface3d: ステップで損失が下がる", L1 < L0, `${L0} → ${L1}`);
  const c = page.locator("#gl"); const b = await c.boundingBox();
  await page.mouse.move(b.x + 500, b.y + 250); await page.mouse.down(); await page.mouse.move(b.x + 400, b.y + 200, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, "surface3d.png") });
  check("surface3d: エラー無し", errors.length === 0, errors.join(" | ").slice(0, 200));
  await page.close();
}


// ---- network3d(WebGL、信号の流れ) ----
{
  const { page, errors } = await open("network3d.html", 1160, 440);
  await page.waitForTimeout(800);
  await page.locator("#fwd").click();
  await page.waitForTimeout(300);
  const ph = await page.locator("#phase").innerText();
  check("network3d: 順伝播が始まる", ph.includes("順伝播"), ph);
  await page.screenshot({ path: path.join(outDir, "network3d-fwd.png") });
  await page.waitForTimeout(2500);
  await page.locator("#bwd").click();
  await page.waitForTimeout(300);
  check("network3d: 逆伝播が始まる", (await page.locator("#phase").innerText()).includes("逆伝播"));
  await page.waitForTimeout(2500);
  check("network3d: 周回が数えられる", parseInt(await page.locator("#iter").innerText(), 10) >= 1);
  await page.screenshot({ path: path.join(outDir, "network3d.png") });
  check("network3d: エラー無し", errors.length === 0, errors.join(" | ").slice(0, 200));
  await page.close();
}

console.log(failures ? `\n${failures} 件失敗` : "\n全部 OK");
await browser.close();
process.exit(failures ? 1 : 0);
