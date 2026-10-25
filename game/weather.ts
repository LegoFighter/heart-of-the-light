/* The weather: what kind it is, how it turns into the next, and what each kind does, as numbers
   the shader and the sound read (lib/stage.ts, lib/sound.ts). A kind lasts a minute or two, then
   the next is drawn from what usually follows it; the change takes CHANGE_SECONDS. Snow lies and
   melts, the ground stays wet a while after rain, a storm throws lightning. */

export const KINDS = ["clear", "clouds", "rain", "storm", "fog", "snow"] as const;
export type Kind = (typeof KINDS)[number];

export interface Air {
  /** Falling rain, 0..1. */
  rain: number;
  /** Falling snow, 0..1. */
  snow: number;
  fog: number;
  /** How much of the sky is cloud, for the shadows and the dimming. */
  clouds: number;
  /** Times the usual wind. */
  wind: number;
  /** How much the weather takes from the day's light. */
  dark: number;
  /** A storm: lightning, thunder. */
  storm: number;
}

const AIR: Record<Kind, Air> = {
  clear: { rain: 0, snow: 0, fog: 0, clouds: 0, wind: 1, dark: 0, storm: 0 },
  clouds: { rain: 0, snow: 0, fog: 0, clouds: 0.75, wind: 1.4, dark: 0.18, storm: 0 },
  rain: { rain: 0.6, snow: 0, fog: 0.1, clouds: 1, wind: 1.35, dark: 0.26, storm: 0 },
  storm: { rain: 0.8, snow: 0, fog: 0.08, clouds: 1, wind: 2.0, dark: 0.38, storm: 1 },
  fog: { rain: 0, snow: 0, fog: 0.85, clouds: 0.3, wind: 0.35, dark: 0.12, storm: 0 },
  snow: { rain: 0, snow: 0.8, fog: 0.15, clouds: 0.9, wind: 0.8, dark: 0.2, storm: 0 },
};

/** What usually follows what, with weights. */
const NEXT: Record<Kind, [Kind, number][]> = {
  clear: [["clouds", 5], ["fog", 1.5], ["clear", 2]],
  clouds: [["rain", 4], ["clear", 4], ["snow", 1], ["storm", 0.6]],
  rain: [["clouds", 5], ["storm", 1.5], ["clear", 2.5]],
  storm: [["rain", 7], ["clouds", 3]],
  fog: [["clear", 6], ["clouds", 4]],
  snow: [["clouds", 6], ["clear", 4]],
};

export const CHANGE_SECONDS = 12;
/** A change asked for with the weather button comes this fast, and leaving snow that way melts
    what lies in THAW_SECONDS (owner, 2026-10-24: "wenn Schnee ausgestellt wird, gerne schneller
    Schnee weg, und Schneien stoppen"). */
export const QUICK_SECONDS = 2.5;
export const THAW_SECONDS = 8;

export interface Weather {
  from: Kind;
  to: Kind;
  /** 0..1 through the change from `from` to `to`; 1 when settled. */
  blend: number;
  /** Seconds until the next change starts. */
  until: number;
  /** How much snow lies, 0..1, and how wet the ground is. */
  cover: number;
  wet: number;
  /** Seconds until the next lightning; how long ago the last struck. */
  bolt: number;
  struck: number;
  /** The change under way was asked for (the weather button): it comes in QUICK_SECONDS. */
  quick: boolean;
  /** Snow was switched off with the button: no more lies, and what lies melts in THAW_SECONDS. */
  thaw: boolean;
}

export type WeatherEvent = { type: "weather"; kind: Kind } | { type: "lightning" };

export function createWeather(kind: Kind = "clear", rand: () => number = Math.random): Weather {
  return { from: kind, to: kind, blend: 1, until: 40 + rand() * 50, cover: kind === "snow" ? 0.6 : 0, wet: kind === "rain" || kind === "storm" ? 1 : 0, bolt: 3, struck: 99, quick: false, thaw: false };
}

/** The air as it is now, the change blended. */
export function airOf(w: Weather): Air {
  const a = AIR[w.from];
  const b = AIR[w.to];
  const k = w.blend * w.blend * (3 - 2 * w.blend);
  const out = {} as Air;
  for (const key of Object.keys(a) as (keyof Air)[]) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

function draw(kind: Kind, rand: () => number): Kind {
  const options = NEXT[kind];
  let pick = rand() * options.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [next, weight] of options) if ((pick -= weight) <= 0) return next;
  return options[0][0];
}

/** Starts a change to `kind` (or to the usual next one); `asked` when the player asked for it. */
export function changeTo(w: Weather, kind: Kind | null, rand: () => number = Math.random, asked = false): WeatherEvent[] {
  const next = kind ?? draw(w.to, rand);
  w.from = w.blend >= 1 ? w.to : w.from;
  w.to = next;
  // Pressed again while an asked change is still under way (the button goes through the kinds in
  // order), the change goes on from where it is towards the new kind, so the kinds passed on
  // the way (a storm between rain and snow) do not each come up for a moment.
  w.blend = w.from === next ? 1 : asked && w.quick && w.blend < 1 ? w.blend : 0;
  // A storm passes sooner than the other kinds (owner, 2026-10-24: the rain was "ab und zu zu
  // wild"; softer and rarer too, with more of the cosy: the cottage lit, the smoke rising).
  w.until = next === "storm" ? 25 + rand() * 20 : 40 + rand() * 50;
  w.quick = asked;
  w.thaw = asked && next !== "snow" && w.cover > 0;
  return next === w.from ? [] : [{ type: "weather", kind: next }];
}

export function stepWeather(w: Weather, dt: number, rand: () => number = Math.random): WeatherEvent[] {
  const events: WeatherEvent[] = [];
  w.blend = Math.min(1, w.blend + dt / (w.quick ? QUICK_SECONDS : CHANGE_SECONDS));
  w.until -= dt;
  if (w.until <= 0 && w.blend >= 1) events.push(...changeTo(w, null, rand));
  const air = airOf(w);
  // Snow settles in about forty seconds and melts in seventy (switched off, in THAW_SECONDS; a
  // tester found a minute "a very long time"); the ground dries in a minute.
  const settling = air.snow > 0.2 && !w.thaw;
  w.cover = Math.max(0, Math.min(1, w.cover + (settling ? dt / 40 : -dt / (w.thaw ? THAW_SECONDS : 70))));
  if (w.cover <= 0) w.thaw = false;
  w.wet = Math.max(0, Math.min(1, w.wet + (air.rain > 0.2 ? dt / 8 : -dt / 60)));
  w.struck += dt;
  if (air.storm > 0.5) {
    w.bolt -= dt;
    if (w.bolt <= 0) {
      w.bolt = 7 + rand() * 12;
      w.struck = 0;
      events.push({ type: "lightning" });
    }
  }
  return events;
}

/** The flash of the last lightning, 0..1: two quick bursts, then gone. */
export function flashOf(w: Weather): number {
  const s = w.struck;
  if (s < 0.06) return 1;
  if (s < 0.14) return 0.15;
  if (s < 0.26) return 0.65;
  if (s < 0.6) return 0.65 * (1 - (s - 0.26) / 0.34);
  return 0;
}
