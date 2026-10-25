/* The day: what light falls on the glade at each hour. The painting is late afternoon; every other
   hour is a grade of it: brightness, a tint, and how far it goes over into the blue of a moonlit
   night (darker, less colour). A whole day passes in DAY_SECONDS. */

export const DAY_SECONDS = 360;
/** The painting's own hour, where the game starts. */
export const START_HOUR = 16;

export type DayPhase = "dawn" | "day" | "dusk" | "night";

export interface Sky {
  /** How much light, 1 as painted. */
  light: number;
  tint: [number, number, number];
  /** 0 day, 1 deep night. */
  night: number;
}

/** The day's turning points; the hours between are blended. */
const KEYS: [number, Sky][] = [
  [0, { light: 0.42, tint: [0.6, 0.72, 1.0], night: 1 }],
  [5, { light: 0.42, tint: [0.6, 0.72, 1.0], night: 1 }],
  [6, { light: 0.66, tint: [1.04, 0.84, 0.86], night: 0.35 }],
  [7.5, { light: 0.95, tint: [1.0, 0.95, 0.9], night: 0 }],
  [12, { light: 1.06, tint: [1.0, 1.02, 1.03], night: 0 }],
  [16, { light: 1.0, tint: [1.0, 1.0, 1.0], night: 0 }],
  [18.5, { light: 0.97, tint: [1.08, 0.97, 0.82], night: 0 }],
  [19.4, { light: 0.74, tint: [1.0, 0.84, 0.8], night: 0.15 }],
  [20.2, { light: 0.52, tint: [0.78, 0.72, 0.96], night: 0.65 }],
  [21, { light: 0.42, tint: [0.6, 0.72, 1.0], night: 1 }],
  [24, { light: 0.42, tint: [0.6, 0.72, 1.0], night: 1 }],
];

const mix = (a: number, b: number, k: number) => a + (b - a) * k;

export function skyAt(hour: number): Sky {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 1; i < KEYS.length; i++) {
    const [h1, b] = KEYS[i];
    if (h > h1) continue;
    const [h0, a] = KEYS[i - 1];
    const k = (h - h0) / (h1 - h0);
    return {
      light: mix(a.light, b.light, k),
      tint: [mix(a.tint[0], b.tint[0], k), mix(a.tint[1], b.tint[1], k), mix(a.tint[2], b.tint[2], k)],
      night: mix(a.night, b.night, k),
    };
  }
  return KEYS[0][1];
}

export function phaseOf(hour: number): DayPhase {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 7.5) return "dawn";
  if (h >= 7.5 && h < 18.5) return "day";
  if (h >= 18.5 && h < 21) return "dusk";
  return "night";
}

/** The hour after `seconds` of play from `hour`. */
export function advance(hour: number, seconds: number): number {
  return (hour + (seconds * 24) / DAY_SECONDS) % 24;
}
