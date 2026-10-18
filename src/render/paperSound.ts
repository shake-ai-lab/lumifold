/**
 * 紙をめくる音。録音ファイルは使わず、Web Audio でノイズを削って毎回少しずつ違う音を作る。
 *   持ち上げ: 角をつまんだときの小さな「カサッ」(高い音の短い粒をいくつか)
 *   めくり: 紙が空気を切る「ふぁさっ」(帯域を上下させたノイズ。めくりの長さに合わせる)
 *   着地: 紙が降りたときの軽い「ぱさっ」(低めの短いノイズ)
 * AudioContext は最初に鳴らすとき(ユーザーの操作の中)に作る。使えない環境では何もしない。
 */
let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function context(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      // 耳に刺さらないよう高すぎる音を少し丸めてから出す
      const soften = ctx.createBiquadFilter();
      soften.type = "lowpass";
      soften.frequency.value = 9000;
      out = ctx.createGain();
      out.gain.value = 1.1;
      out.connect(soften).connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** 2 秒分のノイズ(ホワイトノイズを少しだけ平滑化して、紙らしい柔らかさにする)。毎回違う位置から切り出す */
function noise(a: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === a.sampleRate) return noiseBuffer;
  const length = Math.floor(a.sampleRate * 2);
  const buffer = a.createBuffer(1, length, a.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) { last = last * 0.3 + (Math.random() * 2 - 1) * 0.7; data[i] = last; }
  noiseBuffer = buffer;
  return buffer;
}

const vary = (v: number, amount = 0.15) => v * (1 + (Math.random() * 2 - 1) * amount);

interface Burst { type: BiquadFilterType; freq: number; to?: number; q: number; gain: number; attack: number }

/** ノイズを 1 粒鳴らす。at から dur 秒、立ち上がり attack 秒で gain まで上げて消える */
function burst(a: AudioContext, at: number, dur: number, b: Burst) {
  const src = a.createBufferSource();
  src.buffer = noise(a);
  const filter = a.createBiquadFilter();
  filter.type = b.type;
  filter.Q.value = b.q;
  filter.frequency.setValueAtTime(b.freq, at);
  if (b.to) filter.frequency.exponentialRampToValueAtTime(b.to, at + dur);
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(b.gain, at + Math.min(b.attack, dur * 0.9));
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filter).connect(gain).connect(out!);
  src.start(at, Math.random() * 1.6, dur + 0.05);
}

/** 角をつまんだとき */
export function playPageLift() {
  const a = context();
  if (!a) return;
  const t = a.currentTime + 0.005;
  for (let i = 0; i < 3; i++) burst(a, t + i * vary(0.018, 0.5), vary(0.022), { type: "highpass", freq: vary(3200), q: 0.7, gain: vary(0.05, 0.4), attack: 0.003 });
}

/** 1 枚めくる。ms はめくりの長さ。lift = false ならつまむ音を省く(ドラッグで既に鳴らしたとき) */
export function playPageTurn(ms: number, lift = true) {
  const a = context();
  if (!a) return;
  const t = a.currentTime + 0.01, dur = Math.max(0.16, (ms / 1000) * 0.92);
  if (lift) for (let i = 0; i < 3; i++)
    burst(a, t + i * vary(0.016, 0.5), vary(0.02), { type: "highpass", freq: vary(3400), q: 0.7, gain: vary(0.045, 0.4), attack: 0.003 });
  // ふぁさっ: 帯域を上げてから下げる。山は前半
  const src = a.createBufferSource();
  src.buffer = noise(a);
  const band = a.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = vary(0.9, 0.3);
  band.frequency.setValueAtTime(vary(1100), t);
  band.frequency.exponentialRampToValueAtTime(vary(3600), t + dur * 0.4);
  band.frequency.exponentialRampToValueAtTime(vary(1500), t + dur);
  const gain = a.createGain();
  const peak = vary(0.22, 0.2);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak * 0.35, t + dur * 0.12);
  gain.gain.exponentialRampToValueAtTime(peak, t + dur * 0.42);
  gain.gain.exponentialRampToValueAtTime(peak * 0.25, t + dur * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(band).connect(gain).connect(out!);
  src.start(t, Math.random() * 1.2, dur + 0.05);
  // ぱさっ: 紙が降りる
  const land = t + dur * 0.86;
  burst(a, land, vary(0.09), { type: "lowpass", freq: vary(700), q: 0.6, gain: vary(0.16, 0.25), attack: 0.004 });
  burst(a, land + 0.004, vary(0.05), { type: "bandpass", freq: vary(2200), q: 1.2, gain: vary(0.06, 0.3), attack: 0.003 });
}
