/* Everything heard, made in code on the page's one AudioContext (../kit/audio).

   The music is a hammered dulcimer that plays on its own: plucked-string tones (Karplus-Strong, two
   strings a hair apart like a dulcimer's course) in phrases over a slow round of chords in C minor,
   on a low drone. It takes its measure from the track the owner chose as the mood (a dulcimer with
   nature sounds, 2026-10-24): C and G minor, no steady beat, four or five notes a second, warm and
   low (most of its sound under 1 kHz). None of that track is in the game.

   Round it: the waterfall's roar, louder and to that side as the wanderer nears it; wind in the
   leaves; a soft hum from the nearest light still out (and from the cave once all are in), panned
   to where it is, so a player who cannot see the glade can follow it by ear; steps on the grass;
   a rustle when the way is blocked; a rising run for each light gathered.

   The hour and the weather (setSurroundings): birds by day, crickets by night, rain on the leaves,
   the wind rising with a storm, thunder rolling after the lightning. */

import { onAudio } from "../kit/audio";
import { MOTES, CAVE, FALLS, W } from "../game/world";
import type { Ground } from "./view";
import { caveOpen, type Play, type PlayEvent } from "../game/play";
import type { Air } from "../game/weather";

interface Rig {
  context: AudioContext;
  music: GainNode;
  world: GainNode;
  falls: { gain: GainNode; pan: StereoPannerNode };
  hum: { gain: GainNode; pan: StereoPannerNode; low: OscillatorNode; high: OscillatorNode };
  timer: number;
  /** When the next phrase may start, on the context's clock. */
  next: number;
  bar: number;
  wind: GainNode;
  rain: GainNode;
  nextBird: number;
  nextCricket: number;
}

/** The hour and the weather as the sound needs them. */
let around = { night: 0, rain: 0, snow: 0, wind: 1, storm: 0, ice: 0, cover: 0 };
let nextCreak = 0;
let nextCrack = 0;

let rig: Rig | null = null;
let musicOn = true;
let lastBump = 0;
let lastStep = 0;

/* ---------- the dulcimer ---------- */

const strings = new Map<number, AudioBuffer>();

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** One struck course: two strings, a soft felt hammer, high notes ringing shorter than low ones. */
function course(context: AudioContext, midi: number): AudioBuffer {
  const known = strings.get(midi);
  if (known) return known;
  const rate = context.sampleRate;
  const freq = hz(midi);
  const ring = Math.max(1.1, 3.6 - freq / 600);
  const length = Math.floor(rate * (ring + 0.2));
  const buffer = context.createBuffer(1, length, rate);
  const out = buffer.getChannelData(0);
  for (const detune of [1, 1.0021]) {
    const period = Math.max(2, Math.round(rate / (freq * detune)));
    const line = new Float32Array(period);
    let soft = 0;
    for (let i = 0; i < period; i++) {
      soft = soft * 0.5 + (Math.random() * 2 - 1) * 0.5;
      line[i] = soft;
    }
    // Loses 60 dB over `ring` seconds: once per period, freq periods a second.
    const decay = Math.pow(0.001, 1 / (ring * freq * detune));
    let at = 0;
    for (let i = 0; i < length; i++) {
      const now = line[at];
      const next = line[at + 1 === period ? 0 : at + 1];
      out[i] += now * 0.5;
      line[at] = decay * 0.5 * (now + next);
      at = at + 1 === period ? 0 : at + 1;
    }
  }
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const fade = Math.floor(rate * 0.2);
  for (let i = 0; i < length; i++) {
    out[i] *= 0.5 / (peak || 1);
    if (i > length - fade) out[i] *= (length - i) / fade;
  }
  strings.set(midi, buffer);
  return buffer;
}

function strike(r: Rig, midi: number, at: number, level: number, to: AudioNode, pan = 0) {
  const source = r.context.createBufferSource();
  source.buffer = course(r.context, midi);
  const gain = r.context.createGain();
  gain.gain.value = level;
  const panner = r.context.createStereoPanner();
  panner.pan.value = pan;
  source.connect(gain).connect(panner).connect(to);
  source.start(at);
}

/* ---------- the music ---------- */

/** C natural minor, as pitch classes. */
const SCALE = [0, 2, 3, 5, 7, 8, 10];
/** The chords the phrases lean on: root and the pitch classes that sound right on a strong note. */
const CHORDS: { root: number; tones: number[] }[][] = [
  [
    { root: 0, tones: [0, 3, 7] },
    { root: 8, tones: [8, 0, 3] },
    { root: 3, tones: [3, 7, 10] },
    { root: 10, tones: [10, 2, 5] },
  ],
  [
    { root: 0, tones: [0, 3, 7] },
    { root: 7, tones: [7, 10, 2] },
    { root: 8, tones: [8, 0, 3] },
    { root: 10, tones: [10, 2, 5] },
  ],
  [
    { root: 5, tones: [5, 8, 0] },
    { root: 0, tones: [0, 3, 7] },
    { root: 7, tones: [7, 10, 2] },
    { root: 0, tones: [0, 3, 7] },
  ],
];

const MELODY = Array.from({ length: 22 }, (_, i) => i + 58).filter((m) => SCALE.includes(m % 12));
let voice = MELODY.indexOf(67);

/** Writes one phrase from `start`: the root low, then a line that walks the scale, leans on the
    chord, sometimes strikes a note twice quickly, slows at the end and rests. Returns its length. */
function phrase(r: Rig, start: number): number {
  const rounds = CHORDS[Math.floor(r.bar / 4) % CHORDS.length];
  const chord = rounds[r.bar % 4];
  r.bar += 1;
  const bass = 36 + chord.root + (chord.root > 7 ? -12 : 0) + 12;
  strike(r, bass, start, 0.55, r.music, -0.15);
  strike(r, bass + 7, start + 0.42, 0.32, r.music, -0.1);

  const count = 7 + Math.floor(Math.random() * 7);
  let t = start + 0.12;
  for (let n = 0; n < count; n++) {
    const strong = n === 0 || n === count - 1 || n % 4 === 0;
    let step = Math.random() < 0.7 ? (Math.random() < 0.5 ? -1 : 1) : Math.random() < 0.5 ? -2 : 2;
    if (voice + step < 2 || voice + step > MELODY.length - 3) step = -step;
    voice += step;
    if (strong) {
      // Settle on the nearest chord tone.
      for (const d of [0, 1, -1, 2, -2]) {
        const m = MELODY[voice + d];
        if (m !== undefined && chord.tones.includes(m % 12)) {
          voice += d;
          break;
        }
      }
    }
    const midi = MELODY[voice];
    const arc = Math.sin((Math.PI * (n + 0.5)) / count);
    const level = 0.26 + 0.2 * arc + Math.random() * 0.06;
    const pan = (midi - 69) / 40;
    strike(r, midi, t, level, r.music, pan);
    if (!strong && Math.random() < 0.18) {
      strike(r, midi, t + 0.085, level * 0.7, r.music, pan);
      t += 0.085;
    }
    // Free time: a little quicker in the middle of the line, slower into its end.
    const gap = 0.2 + 0.07 * (1 - arc) + Math.random() * 0.05 + (n >= count - 2 ? 0.16 : 0);
    t += gap;
  }
  return t - start + 0.6 + Math.random() * 1.6;
}

function schedule(r: Rig) {
  const ahead = r.context.currentTime + 0.6;
  while (r.next < ahead) r.next += phrase(r, Math.max(r.next, r.context.currentTime + 0.05));
  const now = r.context.currentTime;
  const dry = around.rain < 0.2 && around.storm < 0.2;
  if (around.night < 0.4 && dry && around.snow < 0.3 && now > r.nextBird) {
    bird(r, now + 0.05);
    r.nextBird = now + 2.5 + Math.random() * 6;
  }
  if (around.night > 0.6 && dry && around.snow < 0.2 && now > r.nextCricket) {
    cricket(r, now + 0.05);
    r.nextCricket = now + 0.35 + Math.random() * 1.1;
  }
}

/** A small bird: two to four quick rising notes, somewhere in the trees. */
function bird(r: Rig, at: number) {
  const pan = r.context.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  pan.connect(r.world);
  const notes = 2 + Math.floor(Math.random() * 3);
  const base = 2400 + Math.random() * 900;
  for (let n = 0; n < notes; n++) {
    const start = at + n * (0.09 + Math.random() * 0.05);
    const osc = r.context.createOscillator();
    osc.frequency.setValueAtTime(base, start);
    osc.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.3), start + 0.06);
    const gain = r.context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.022, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0005, start + 0.08);
    osc.connect(gain).connect(pan);
    osc.start(start);
    osc.stop(start + 0.1);
  }
}

/** A cricket: three short high pulses. */
function cricket(r: Rig, at: number) {
  const pan = r.context.createStereoPanner();
  pan.pan.value = Math.random() * 1.8 - 0.9;
  pan.connect(r.world);
  const pitch = 4200 + Math.random() * 500;
  for (let n = 0; n < 3; n++) {
    const start = at + n * 0.055;
    const osc = r.context.createOscillator();
    osc.frequency.value = pitch;
    const gain = r.context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.009, start + 0.006);
    gain.gain.linearRampToValueAtTime(0, start + 0.028);
    osc.connect(gain).connect(pan);
    osc.start(start);
    osc.stop(start + 0.03);
  }
}

/** Thunder after lightning: a low roll, nearer the sooner it comes. */
export function thunder(delay: number) {
  if (!rig) return;
  const r = rig;
  const at = r.context.currentTime + delay;
  const length = 4.5;
  const buffer = r.context.createBuffer(1, Math.floor(r.context.sampleRate * length), r.context.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < data.length; i++) {
    brown = (brown + (Math.random() * 2 - 1) * 0.02) * 0.998;
    data[i] = brown * 3.5;
  }
  const source = r.context.createBufferSource();
  source.buffer = buffer;
  const low = r.context.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 160 + 200 / (1 + delay);
  const gain = r.context.createGain();
  const loud = 0.5 / (1 + delay * 0.4);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(loud, at + 0.15);
  gain.gain.linearRampToValueAtTime(loud * 0.6, at + 0.6);
  gain.gain.exponentialRampToValueAtTime(0.001, at + length - 0.1);
  source.connect(low).connect(gain).connect(r.world);
  source.start(at);
}

/* ---------- the glade ---------- */

function noise(context: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  // Pink, near enough (Paul Kellet's three poles): a roar, not a hiss.
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
  }
  return buffer;
}

function loop(context: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = Math.random() * 0.5;
  source.start();
  return source;
}

function build(context: AudioContext): Rig {
  const master = context.createGain();
  master.gain.value = 0.7;
  master.connect(context.destination);
  const music = context.createGain();
  music.gain.value = musicOn ? 0.42 : 0;
  music.connect(master);
  const world = context.createGain();
  world.gain.value = 1;
  world.connect(master);

  // The drone: C and G far down, through a low filter, breathing slowly.
  const drone = context.createGain();
  drone.gain.value = 0.05;
  const darker = context.createBiquadFilter();
  darker.type = "lowpass";
  darker.frequency.value = 380;
  for (const [f, type] of [[hz(36), "triangle"], [hz(43), "sine"], [hz(48), "sine"]] as const) {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = f;
    osc.connect(darker);
    osc.start();
  }
  const breath = context.createOscillator();
  breath.frequency.value = 0.07;
  const depth = context.createGain();
  depth.gain.value = 0.02;
  breath.connect(depth).connect(drone.gain);
  breath.start();
  darker.connect(drone).connect(music);

  const pink = noise(context, 4);
  const fallsFilter = context.createBiquadFilter();
  fallsFilter.type = "lowpass";
  fallsFilter.frequency.value = 1500;
  const fallsGain = context.createGain();
  fallsGain.gain.value = 0;
  const fallsPan = context.createStereoPanner();
  loop(context, pink).connect(fallsFilter).connect(fallsGain).connect(fallsPan).connect(world);

  const leaves = context.createBiquadFilter();
  leaves.type = "bandpass";
  leaves.frequency.value = 700;
  leaves.Q.value = 0.6;
  const wind = context.createGain();
  wind.gain.value = 0.025;
  // Rain: white noise without its lowest and highest, a hiss on the leaves.
  const hiss = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
  const hissData = hiss.getChannelData(0);
  for (let i = 0; i < hissData.length; i++) hissData[i] = (Math.random() * 2 - 1) * 0.5;
  const rainLow = context.createBiquadFilter();
  rainLow.type = "highpass";
  rainLow.frequency.value = 600;
  const rainHigh = context.createBiquadFilter();
  rainHigh.type = "lowpass";
  rainHigh.frequency.value = 6500;
  const rainGain = context.createGain();
  rainGain.gain.value = 0;
  loop(context, hiss).connect(rainLow).connect(rainHigh).connect(rainGain).connect(world);
  const gust = context.createOscillator();
  gust.frequency.value = 0.11;
  const gustDepth = context.createGain();
  gustDepth.gain.value = 0.018;
  gust.connect(gustDepth).connect(wind.gain);
  gust.start();
  loop(context, pink).connect(leaves).connect(wind).connect(world);

  const humGain = context.createGain();
  humGain.gain.value = 0;
  const humPan = context.createStereoPanner();
  const low = context.createOscillator();
  low.frequency.value = hz(79);
  const high = context.createOscillator();
  high.frequency.value = hz(86);
  const highLevel = context.createGain();
  highLevel.gain.value = 0.4;
  const shimmer = context.createOscillator();
  shimmer.frequency.value = 5.5;
  const shimmerDepth = context.createGain();
  shimmerDepth.gain.value = 0.3;
  const humBody = context.createGain();
  humBody.gain.value = 0.7;
  shimmer.connect(shimmerDepth).connect(humBody.gain);
  low.connect(humBody);
  high.connect(highLevel).connect(humBody);
  humBody.connect(humGain).connect(humPan).connect(world);
  for (const osc of [low, high, shimmer]) osc.start();

  const r: Rig = {
    context,
    music,
    world,
    falls: { gain: fallsGain, pan: fallsPan },
    hum: { gain: humGain, pan: humPan, low, high },
    timer: 0,
    next: context.currentTime + 0.4,
    bar: 0,
    wind,
    rain: rainGain,
    nextBird: context.currentTime + 2,
    nextCricket: context.currentTime + 1,
  };
  r.timer = window.setInterval(() => schedule(r), 150);
  schedule(r);
  return r;
}

/** Starts the sound once the page's audio is open (the start screen's Play, or the first press in
    the dev app). Returns a function that stops it. */
export function startSound(): () => void {
  const cancel = onAudio((context) => {
    if (!rig) rig = build(context);
  });
  return () => {
    cancel();
    if (!rig) return;
    window.clearInterval(rig.timer);
    rig.music.disconnect();
    rig.world.disconnect();
    rig = null;
  };
}

export function setMusic(on: boolean) {
  musicOn = on;
  if (!rig) return;
  rig.music.gain.setTargetAtTime(on ? 0.42 : 0, rig.context.currentTime, 0.4);
}

/** Every frame: the roar and the hum follow the wanderer; steps follow the stride. */
/** The hour and the weather: the rain's hiss, the wind's strength, birds or crickets. */
export function setSurroundings(air: Air, night: number, cover = 0) {
  // The falls freeze from the edges as the snow lies (lib/stage.ts): less of them roars.
  around = { night, rain: air.rain, snow: air.snow, wind: air.wind, storm: air.storm, ice: Math.max(0, Math.min(1, (cover - 0.2) / 0.75)), cover };
  if (!rig) return;
  const now = rig.context.currentTime;
  rig.rain.gain.setTargetAtTime(air.rain * 0.16, now, 0.8);
  rig.wind.gain.setTargetAtTime(0.012 + 0.016 * air.wind, now, 0.8);
}

export function updateSound(play: Play, ground: Ground = "grass") {
  if (!rig) return;
  const now = rig.context.currentTime;
  const { x, y, walking, stride } = play.hero;

  // The trees creak in a strong wind; the ice on the pool cracks now and then.
  if (around.wind > 1.3 && now > nextCreak) {
    nextCreak = now + 5 + Math.random() * 12;
    creak(rig);
  }
  if (around.ice > 0.5 && now > nextCrack) {
    nextCrack = now + 10 + Math.random() * 18;
    brush(rig, 0.05, 2600, 0.04);
    thump(rig, 0.05, 58, 0.2);
  }

  const toFalls = Math.hypot(x - FALLS[0], (y - FALLS[1]) * 1.4);
  const roar = (0.05 + 0.32 * Math.pow(Math.max(0, 1 - toFalls / 620), 1.8)) * (1 - around.ice * 0.6);
  rig.falls.gain.gain.setTargetAtTime(play.home ? 0.02 : roar, now, 0.25);
  rig.falls.pan.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, (FALLS[0] - x) / 360)), now, 0.25);

  let target: readonly [number, number] | null = null;
  if (caveOpen(play)) target = [CAVE.x, CAVE.y];
  else {
    let best = Infinity;
    MOTES.forEach((m, i) => {
      const d = Math.hypot(m[0] - x, m[1] - y);
      if (!play.gathered[i] && d < best) [best, target] = [d, m];
    });
  }
  if (target && !play.home) {
    const [tx, ty] = target as readonly [number, number];
    const d = Math.hypot(tx - x, ty - y);
    rig.hum.gain.gain.setTargetAtTime(0.004 + 0.05 * Math.pow(Math.max(0, 1 - d / 300), 2), now, 0.2);
    rig.hum.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, ((tx - x) / W) * 3)), now, 0.2);
    const pitch = caveOpen(play) ? 72 : 79;
    rig.hum.low.frequency.setTargetAtTime(hz(pitch), now, 0.3);
    rig.hum.high.frequency.setTargetAtTime(hz(pitch + 7), now, 0.3);
  } else rig.hum.gain.gain.setTargetAtTime(0, now, 0.3);

  // A step on every footfall (two a stride, four frames a stride): a soft brush on the grass, a
  // drier tap on the path, a crunch in lying snow.
  const fall = Math.floor(stride * 4);
  if (walking && fall !== lastStep) {
    lastStep = fall;
    if (around.cover > 0.4) brush(rig, 0.075, 480, 0.1);
    else if (ground === "path") brush(rig, 0.04, 1500, 0.045);
    else brush(rig, 0.05, 900, 0.07);
  }
}

/** A tree's creak: a low tone bending down through a narrow filter. */
function creak(r: Rig) {
  const now = r.context.currentTime;
  const osc = r.context.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(115 + Math.random() * 30, now);
  osc.frequency.exponentialRampToValueAtTime(78, now + 0.55);
  const filter = r.context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 260;
  filter.Q.value = 2.5;
  const gain = r.context.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.022, now + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.6);
  osc.connect(filter).connect(gain).connect(r.world);
  osc.start(now);
  osc.stop(now + 0.65);
}

/** A low thump, for the ice. */
function thump(r: Rig, level: number, freq: number, seconds: number) {
  const now = r.context.currentTime;
  const osc = r.context.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, now + seconds);
  const gain = r.context.createGain();
  gain.gain.setValueAtTime(level, now);
  gain.gain.exponentialRampToValueAtTime(0.0005, now + seconds);
  osc.connect(gain).connect(r.world);
  osc.start(now);
  osc.stop(now + seconds + 0.02);
}

/** A short rustle: leaves underfoot or brushed. */
function brush(r: Rig, level: number, freq: number, seconds: number) {
  const source = r.context.createBufferSource();
  source.buffer = noise(r.context, seconds);
  const filter = r.context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq * (0.9 + Math.random() * 0.2);
  filter.Q.value = 1.2;
  const gain = r.context.createGain();
  const now = r.context.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(level, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0005, now + seconds);
  source.connect(filter).connect(gain).connect(r.world);
  source.start(now);
}

export function soundEvent(event: PlayEvent) {
  if (!rig) return;
  const now = rig.context.currentTime;
  switch (event.type) {
    case "gather": {
      const run = [72, 75, 79, 84];
      run.forEach((m, i) => strike(rig!, m, now + 0.02 + i * 0.075, 0.5, rig!.world));
      break;
    }
    case "open": {
      [60, 67, 72, 75, 79, 84, 87, 91].forEach((m, i) => strike(rig!, m, now + 0.45 + i * 0.11, 0.42, rig!.world, (i - 4) / 8));
      strike(rig, 36, now + 0.45, 0.6, rig.world);
      break;
    }
    case "home": {
      // The light: the chord struck over and over, swelling and dying away.
      for (let k = 0; k < 28; k++) {
        const m = [60, 67, 72, 75, 79, 84][k % 6];
        const swell = Math.sin((Math.PI * k) / 28);
        strike(rig, m, now + k * 0.11, 0.15 + 0.4 * swell, rig.world, ((k % 6) - 2.5) / 4);
      }
      strike(rig, 36, now, 0.7, rig.world);
      strike(rig, 48, now + 1.6, 0.5, rig.world);
      break;
    }
    case "bump": {
      if (now - lastBump < 0.4) break;
      lastBump = now;
      brush(rig, 0.07, 1300, 0.16);
      break;
    }
    case "place":
      break;
  }
}
