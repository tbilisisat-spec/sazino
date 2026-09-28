let ctx: AudioContext | null = null;
let muted = false;
let masterVerb: ConvolverNode | null = null;
let masterVerbGain: GainNode | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

/** Tiny synthetic impulse response — gives coins/wins a bit of "room" instead of sounding dead-dry. */
function verb(c: AudioContext): ConvolverNode {
  if (masterVerb) return masterVerb;
  const dur = 1.4;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  }
  masterVerb = c.createConvolver();
  masterVerb.buffer = buf;
  masterVerbGain = c.createGain();
  masterVerbGain.gain.value = 0.16;
  masterVerb.connect(masterVerbGain).connect(c.destination);
  return masterVerb;
}

export function setMuted(m: boolean) {
  muted = m;
}
export function isMuted() {
  return muted;
}
export function unlockAudio() {
  ac();
}

/** Shared output stage: dry signal to speakers + a send into the shimmer reverb, optionally panned. */
function outStage(c: AudioContext, g: GainNode, pan = 0, wet = 0.5) {
  if (pan !== 0 && "createStereoPanner" in c) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    p.connect(c.destination);
    if (wet > 0) p.connect(verb(c));
  } else {
    g.connect(c.destination);
    if (wet > 0) g.connect(verb(c));
  }
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.2, slide = 0, opts: { pan?: number; detune?: number; wet?: number } = {}) {
  const c = ac();
  if (!c || muted) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (opts.detune) o.detune.value = opts.detune;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), c.currentTime + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + Math.min(0.012, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g);
  outStage(c, g, opts.pan ?? 0, opts.wet ?? 0.35);
  o.start();
  o.stop(c.currentTime + dur + 0.05);
}

/** Two detuned voices instead of one — cheap "chorus" so tones feel less like a bare test-tone beep. */
function chord(freq: number, dur: number, type: OscillatorType, vol: number, pan = 0, wet = 0.4) {
  tone(freq, dur, type, vol * 0.75, 0, { pan, detune: -6, wet });
  tone(freq, dur, type, vol * 0.75, 0, { pan, detune: 6, wet });
}

function noise(dur: number, vol = 0.15, hp = 800, opts: { pan?: number; lp?: number; sweepTo?: number; wet?: number } = {}) {
  const c = ac();
  if (!c || muted) return;
  const buffer = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const f = c.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = hp;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(f);
  let last: AudioNode = f;
  if (opts.lp) {
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(opts.lp, c.currentTime);
    if (opts.sweepTo) lp.frequency.exponentialRampToValueAtTime(opts.sweepTo, c.currentTime + dur);
    last.connect(lp);
    last = lp;
  }
  last.connect(g);
  outStage(c, g, opts.pan ?? 0, opts.wet ?? 0.2);
  src.start();
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export const sfx = {
  chip() {
    chord(1200 + Math.random() * 300, 0.09, "triangle", 0.15, rand(-0.3, 0.3), 0.25);
    noise(0.045, 0.09, 3000, { pan: rand(-0.3, 0.3), wet: 0.15 });
  },
  undo() {
    tone(500, 0.08, "triangle", 0.12, -200);
  },
  click() {
    tone(900, 0.05, "square", 0.06);
  },
  tick() {
    tone(2400, 0.02, "square", 0.035);
  },
  /** Ball drop onto the spinning wheel: a filtered noise sweep instead of flat white noise. */
  launch() {
    noise(0.6, 0.14, 1200, { lp: 6000, sweepTo: 900, wet: 0.3 });
    tone(300, 0.5, "sawtooth", 0.05, 500);
  },
  drop() {
    tone(180, 0.15, "triangle", 0.25, -100);
    noise(0.08, 0.15, 500);
  },
  win(big = false) {
    const notes = big ? [523, 659, 784, 1047, 1319, 1568] : [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => chord(f, 0.3, "triangle", 0.18, rand(-0.4, 0.4), 0.45), i * 90));
    if (big) {
      setTimeout(() => noise(0.5, 0.09, 4000, { wet: 0.4 }), 500);
      [2093, 2637, 3136].forEach((f, i) => setTimeout(() => tone(f, 0.6, "sine", 0.05, 0, { pan: rand(-0.5, 0.5), wet: 0.55 }), 550 + i * 60));
    }
  },
  coin(i = 0) {
    tone(1800 + i * 60, 0.08, "sine", 0.08, 0, { pan: rand(-0.5, 0.5), wet: 0.3 });
  },
  lose() {
    tone(220, 0.35, "sawtooth", 0.08, -120);
  },
  gameOver() {
    [392, 349, 311, 262].forEach((f, i) => setTimeout(() => tone(f, 0.4, "triangle", 0.15, 0, { wet: 0.4 }), i * 220));
  },
  countdown(urgent = false) {
    tone(urgent ? 1320 : 880, urgent ? 0.12 : 0.08, "square", urgent ? 0.09 : 0.05);
    if (urgent) setTimeout(() => tone(1760, 0.08, "square", 0.06), 90);
  },
  betsClosed() {
    tone(660, 0.12, "triangle", 0.12);
    setTimeout(() => tone(440, 0.25, "triangle", 0.12), 120);
  },
  start() {
    [659, 784, 1047].forEach((f, i) => setTimeout(() => chord(f, 0.22, "triangle", 0.15, 0, 0.4), i * 80));
  },
};
