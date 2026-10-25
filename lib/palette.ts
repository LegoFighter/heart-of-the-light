/* The glade's palette, and the filter that keeps every pixel in it (owner, 2026-10-24, on a
   tester's word that the video looked sloppy, "ChatGPT piss filter": "use the color of the assets
   and create a filter for a color palette").

   The painting came out of the generator with a yellow cast over everything: its grass is olive
   (165, 153, 49), its whitest white a cream (236, 234, 199), its mean has half as much blue as
   red. `grade` takes that cast off each of the painting's 96 colours: a white balance that makes
   the cream white, a turn of the yellows and olives towards green (the browns of the path and the
   autumn trees keep their hue), and a little cool in the shadows. The painting itself stays as it
   is (the mask tooling keys off its colours); the correction is in the look-up.

   `buildPalette` is every graded colour under the hours' light (noon, dusk, dawn, night with its
   colour gone out), in the dark of the glade's edge, in the lantern's warmth and in the snow's
   cold, plus the neutral ramps that the snow, fog, foam and rain are drawn in: about a thousand
   colours that all come from the painting's own. `buildLut` is a 32x32x32 cube that maps any
   colour to the nearest of them; the shader looks every finished pixel up in it (with a hair of
   ordered dither so a slope does not band), so the lantern's glow, the night, the snow and the
   wanderer all sit in one palette. */

export type RGB = [number, number, number];

/** The cube's edge: 32 steps per channel. The texture is the 32 blue slices side by side. */
export const LUT_SIZE = 32;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function toHsv([r, g, b]: RGB): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-9) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = ((h * 60) % 360 + 360) % 360;
  }
  return [h, max > 1e-9 ? d / max : 0, max];
}

function fromHsv(h: number, s: number, v: number): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const k = Math.floor(h / 60) % 6;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
  return [r + m, g + m, b + m];
}

/** A colour (0..1) with the yellow cast taken off. The correction is for the painting's warm
    colours; a colour that is cool already (the night's blue, snow, foam) has no cast to take off
    and passes as it is, so the night does not go violet. */
export function grade([r0, g0, b0]: RGB): RGB {
  const warmth = clamp01(((r0 + g0) / 2 - b0) / 0.12);
  // White balance: the painting's cream (236, 234, 199) becomes white.
  let r = clamp01(r0 * (1 - 0.015 * warmth));
  let g = clamp01(g0 * (1 - 0.01 * warmth));
  let b = clamp01(b0 * (1 + 0.17 * warmth));
  // Yellows and olives (hue 42..95) turn towards green; the path's and the autumn trees' browns
  // and oranges, below that, keep their hue.
  const [h, s, v] = toHsv([r, g, b]);
  const k = clamp01((h - 42) / 14) * clamp01((95 - h) / 15);
  [r, g, b] = fromHsv((h + 24 * k) % 360, Math.min(1, s * (1 + 0.12 * k)), v);
  // The shadows a little cooler and lifted.
  const lum = 0.3 * r + 0.59 * g + 0.11 * b;
  const shadow = Math.max(0, 1 - lum * 3) * warmth;
  return [clamp01(r + 0.015 * shadow), clamp01(g + 0.025 * shadow), clamp01(b + 0.05 * shadow)];
}

const scaled = ([r, g, b]: RGB, [x, y, z]: RGB, k = 1): RGB => [clamp01(r * x * k), clamp01(g * y * k), clamp01(b * z * k)];
const towardsGrey = ([r, g, b]: RGB, k: number): RGB => {
  const grey = 0.3 * r + 0.59 * g + 0.11 * b;
  return [r + (grey - r) * k, g + (grey - g) * k, b + (grey - b) * k];
};

/** The lights the shader puts the painting under (game/sky.ts and lib/stage.ts): the hours, the
    glade's dark edge, the lantern, the snow's cold. */
const LIGHTS: ((c: RGB) => RGB)[] = [
  (c) => c,
  (c) => scaled(c, [1.0, 1.02, 1.03], 1.06),
  (c) => scaled(c, [1.18, 0.93, 0.64], 0.97),
  (c) => scaled(c, [1.08, 0.74, 0.66], 0.74),
  (c) => scaled(towardsGrey(c, 0.3), [0.78, 0.72, 0.96], 0.52),
  (c) => scaled(towardsGrey(c, 0.5), [0.66, 0.76, 1.0], 0.42),
  (c) => scaled(towardsGrey(c, 0.5), [0.66, 0.76, 1.0], 0.26),
  (c) => scaled(c, [1.04, 0.84, 0.86], 0.66),
  (c) => scaled(c, [1, 1, 1], 0.64),
  (c) => scaled(c, [1, 1, 1], 0.4),
  (c) => scaled(c, [1.06, 0.92, 0.74], 1.2),
  (c) => scaled(c, [1.1, 0.96, 0.8], 0.75),
  (c) => scaled(c, [1, 1, 1], 1.3),
  (c) => scaled(towardsGrey(c, 0.5), [0.95, 1.0, 1.12], 1.4),
  (c) => scaled(towardsGrey(c, 0.5), [0.95, 1.0, 1.12], 0.6),
];

/** Every colour the glade is shown in, from the painting's `colours` (0..255). */
export function buildPalette(colours: number[][]): RGB[] {
  const seen = new Set<number>();
  const out: RGB[] = [];
  const add = ([r, g, b]: RGB) => {
    const key = (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
    if (seen.has(key)) return;
    seen.add(key);
    out.push([Math.round(r * 255) / 255, Math.round(g * 255) / 255, Math.round(b * 255) / 255]);
  };
  for (const c of colours) {
    const base = grade([c[0] / 255, c[1] / 255, c[2] / 255]);
    for (const light of LIGHTS) add(light(base));
  }
  // The neutral ramps: snow and fog (cool), foam and rain (plain), the lantern's spot (warm).
  for (let i = 0; i <= 14; i++) {
    const v = 0.06 + (i / 14) * 0.94;
    add(scaled([v, v, v], [0.92, 0.96, 1.05]));
    add([v, v, v]);
    add(scaled([v, v, v], [1.0, 0.94, 0.8]));
  }
  return out;
}

/** The nearest of `palette` to `c`, by index. */
export function nearestIndex(c: RGB, palette: RGB[]): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const dr = (c[0] - p[0]) * 0.3;
    const dg = (c[1] - p[1]) * 0.59;
    const db = (c[2] - p[2]) * 0.11;
    // Weighted like the eye, and the plain distance too, so a hue is not traded for brightness.
    const d = dr * dr + dg * dg + db * db + 0.25 * ((c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** The look-up cube as a texture of LUT_SIZE*LUT_SIZE x LUT_SIZE RGBA pixels: slice `b` at
    x = b * LUT_SIZE + r, y = g. Each cell is its colour graded and snapped to the palette. */
export function buildLut(palette: RGB[]): Uint8Array {
  const n = LUT_SIZE;
  const out = new Uint8Array(n * n * n * 4);
  for (let b = 0; b < n; b++)
    for (let g = 0; g < n; g++)
      for (let r = 0; r < n; r++) {
        // The cast comes off the pixel first, then it snaps: looked up as it is, an olive would
        // find the palette's dusk-lit greens, which are olive again.
        const p = palette[nearestIndex(grade([r / (n - 1), g / (n - 1), b / (n - 1)]), palette)];
        const at = (g * n * n + b * n + r) * 4;
        out[at] = Math.round(p[0] * 255);
        out[at + 1] = Math.round(p[1] * 255);
        out[at + 2] = Math.round(p[2] * 255);
        out[at + 3] = 255;
      }
  return out;
}
