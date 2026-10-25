/* The glade alive: one WebGL2 pass over the painted scene, pixel by pixel at the scene's own size.

   Nothing is blurred and nothing new is painted where the picture already is: every moving thing
   moves by taking another pixel of the picture.
   - Leaves (masks R) shift by whole pixels: a slow sway, gusts that roll across the forest from
     the west, and a rustle that differs from clump to clump; crowns move more at the top than at
     the foot. A leaf only ever takes another leaf's pixel, so no tree bleeds into the meadow.
   - Grass and flowers (masks G) lean a pixel or two as the gusts pass and catch the light in bands.
   - The falls and the stream run with a flow map (flow.png): two copies of the water slide along
     the flow half a cycle apart and take turns, by an ordered dither instead of a blend, so the
     pixels stay the picture's own colours; streaks of foam race down the falls.
   - The pool rings out from where the falls strike; foam churns there and mist rises.
   - Chimney smoke is drawn here, in four dithered steps of density, rising and bent by the wind.
   The weather (game/weather.ts) and the hour (game/sky.ts) come in as numbers:
   - snow lies on what faces the sky (the lighter pixels first, never on water) as it builds up;
     rain darkens the ground; the wind's strength scales every sway;
   - on top comes the overlay (the wanderer, the lights, what flies: lib/view.ts), then cloud
     shadows, then the hour's grade (light, tint, and the blue of night), and the lights in
     dithered steps, which give back the painted colours where they shine: in the dark the lantern,
     the windows, the cave and the five lights are what show the glade;
   - then mist in dithered banks, rain in 1-pixel streaks with splashes and rings on the water,
     snowflakes, a lightning flash, the glow overlay (what shines by itself: fireflies, the lights'
     cores), and the dark at the glade's edge. */

import { CAVE, CHIMNEY, DOOR, H, PLUNGE, W, WINDOWS } from "../game/world";
import { buildLut, buildPalette, LUT_SIZE } from "./palette";

export interface StageImages {
  scene: HTMLImageElement;
  masks: HTMLImageElement;
  flow: HTMLImageElement;
  /** The colours the painting is made of (0..255): the palette filter is built from them. */
  colours: number[][];
}

export interface StageFrame {
  t: number;
  /** Lantern: x, y in scene pixels, strength. */
  lantern: [number, number, number];
  /** Each light still out: x, y of its glow, 1 while out, its blink. */
  motes: [number, number, number, number][];
  lights: number;
  open: number;
  home: number;
  /** The hour's light, tint and night (game/sky.ts). */
  light: number;
  tint: [number, number, number];
  night: number;
  /** The weather (game/weather.ts): falling rain and snow, snow lying, mist, cloud, wind, wet
      ground, a lightning flash. */
  rain: number;
  snow: number;
  cover: number;
  fog: number;
  clouds: number;
  wind: number;
  wet: number;
  flash: number;
  /** The hour, 0..24: where the sun stands (rays at dawn, rim light at golden hour, the windows
      lit from dusk, the moon's patches at night). */
  hour: number;
  /** The wanderer's feet, in scene pixels: the grass gives way round them. */
  hero: [number, number];
  /** Where what stands behind the trees (the deer, on the `behind` canvas) has its feet: a crown
      whose foot reaches below that is in front of it. */
  behindFeet: number;
}

const VERTEX = `#version 300 es
in vec2 corner;
void main() { gl_Position = vec4(corner, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D scene, masks, flow, overlay, glow, ground, behind, front, lut;
uniform float behindFeet;
uniform float t, lights, open, home;
uniform float light, night, rain, snow, cover, fog, clouds, wind, wet, flash, hour;
uniform vec3 tint;
uniform vec3 lantern;
uniform vec2 hero;
uniform vec4 motes[5];
out vec4 colour;

const vec2 SIZE = vec2(${W}.0, ${H}.0);
const vec2 PLUNGE = vec2(${PLUNGE[0]}.0, ${PLUNGE[1]}.0);
const vec2 CHIMNEY = vec2(${CHIMNEY[0]}.0, ${CHIMNEY[1]}.0);
const vec2 CAVE = vec2(${CAVE.x}.0, ${CAVE.y - 14}.0);
const vec2 WIN0 = vec2(${WINDOWS[0][0]}.0, ${WINDOWS[0][1]}.0);
const vec2 WIN1 = vec2(${WINDOWS[1][0]}.0, ${WINDOWS[1][1]}.0);
const vec2 WIN2 = vec2(${WINDOWS[2][0]}.0, ${WINDOWS[2][1]}.0);
const vec2 DOOR = vec2(${DOOR[0]}.0, ${DOOR[1]}.0);
// The stream's middle, for the morning mist that lies along it.
const vec2 S0 = vec2(174.0, 297.0), S1 = vec2(128.0, 358.0), S2 = vec2(230.0, 470.0), S3 = vec2(307.0, 576.0);

float segment(vec2 f, vec2 a, vec2 b) {
  vec2 d = b - a;
  float k = clamp(dot(f - a, d) / dot(d, d), 0.0, 1.0);
  return length(f - a - d * k);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}
float bayer(ivec2 p) {
  int x = p.x & 3, y = p.y & 3;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[y * 4 + x]) + 0.5) / 16.0;
}
ivec2 inside(ivec2 p) { return clamp(p, ivec2(0), ivec2(SIZE) - 1); }
vec3 pick(ivec2 p) { return texelFetch(scene, inside(p), 0).rgb; }
vec4 kind(ivec2 p) { return texelFetch(masks, inside(p), 0); }
float luma(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }

// Gusts roll in from the west-north-west: a long swell and a quicker one, uneven in strength.
// A gust: one broad, slow wave from the west every ten to twenty seconds, some strong and some
// faint (the envelope), the same in lib/flora.ts, so the crowns and the shader move as one wind.
// (Until 2026-10-24 two sharper waves with noise: the owner found the picture restless.)
float gust(vec2 p) {
  float s = dot(p, vec2(0.94, 0.34));
  float a = 0.5 + 0.5 * sin(s * 0.0055 - t * 0.38);
  float env = 0.6 + 0.8 * (0.5 + 0.5 * sin(t * 0.3 + 1.0));
  return pow(a, 3.0) * env;
}

// A plant's pixel (the behind and front canvases, lib/flora.ts) in the breeze: the crown's
// body stands (the swaying is the rig's, lib/flora.ts); only a leaf at the crown's edge lets go
// for a frame now and then in a gust, so the silhouette rustles, and the lit side shines a hair.
// Bark and stone (little colour) do nothing. (Until 2026-10-24 every pixel took a neighbour in
// a wave: the owner found that restless.)
vec4 breeze(sampler2D layer, ivec2 p, vec4 px) {
  vec2 f = vec2(p);
  float g = gust(f) * wind;
  if (g < 0.12) return px;
  float sat = max(px.r, max(px.g, px.b)) - min(px.r, min(px.g, px.b));
  if (sat < 0.2) return px;
  // The crown's edge is where the open sky lies three and five pixels on, not a gap between two
  // leaf clumps: the rendered trees (lib/tree.ts, 2026-10-25) are full of such gaps, and with
  // a one-pixel test the whole crown let go as a gust passed (owner: "weirde Baum-Effekte wenn
  // man die vertikale Linie übertritt").
  bool open3 = texelFetch(layer, inside(p + ivec2(3, 0)), 0).a < 0.5 || texelFetch(layer, inside(p - ivec2(3, 0)), 0).a < 0.5 || texelFetch(layer, inside(p - ivec2(0, 3)), 0).a < 0.5;
  bool open5 = texelFetch(layer, inside(p + ivec2(5, 0)), 0).a < 0.5 || texelFetch(layer, inside(p - ivec2(5, 0)), 0).a < 0.5 || texelFetch(layer, inside(p - ivec2(0, 5)), 0).a < 0.5;
  bool near = texelFetch(layer, inside(p + ivec2(1, 0)), 0).a < 0.5 || texelFetch(layer, inside(p - ivec2(1, 0)), 0).a < 0.5 || texelFetch(layer, inside(p - ivec2(0, 1)), 0).a < 0.5;
  bool edge = near && open3 && open5;
  if (edge && hash(f + floor(t * 5.0)) < g * 0.15) px.a = 0.0;
  px.rgb *= 1.0 + 0.05 * min(g, 1.5);
  return px;
}

// Snow on a plant (or the deer): on the lit leaves as the cover grows, a cap along the crown's
// top edge, none on the dark of the trunk and the shade.
vec3 plantSnow(vec3 col, ivec2 p, sampler2D layer) {
  if (cover < 0.01) return col;
  vec2 s = vec2(p);
  float l = luma(col);
  float patch_ = noise(s * 0.045) * 0.55 + noise(s * 0.13) * 0.25 + hash(s) * 0.08;
  // A cap where the plant faces the sky: open above, and open above to either side too, so a
  // seam between two bands of the crown's rig, or the trunk's still rows against the first
  // shifted band, does not count (owner, 2026-10-25: a "white collar" round the trees in snow).
  // And the pixel must be the top of a mass at least three wide, not a twig, a leg or a neck
  // (owner, the same day: "jetzt sind die Deers weiß").
  float above = max(texelFetch(layer, inside(p - ivec2(0, 2)), 0).a, max(texelFetch(layer, inside(p - ivec2(3, 2)), 0).a, texelFetch(layer, inside(p + ivec2(3, -2)), 0).a));
  float wide = min(texelFetch(layer, inside(p - ivec2(1, 0)), 0).a, texelFetch(layer, inside(p + ivec2(1, 0)), 0).a);
  float cap = above < 0.5 && wide > 0.5 ? 0.7 * step(0.2, cover) : 0.0;
  float depth = cover * 1.15 - 0.05 + cap + (l - 0.4) * 1.1 - patch_;
  // Bark (red over green) takes no cover, only the cap where it faces the sky (owner,
  // 2026-10-25: "die Stämme sollen nicht weiß werden, nur oben etwas", or the snowed-in glade
  // loses its bearings).
  if (col.r > col.g * 1.02 && col.r - min(col.g, col.b) < 0.3) depth = cap * 1.2 - 0.2 - patch_ * 0.4;
  float lay = depth > 0.3 ? 1.0 : (depth > 0.1 && bayer(p) < (depth - 0.1) * 5.0 ? 1.0 : 0.0);
  vec3 white = mix(vec3(0.66, 0.72, 0.82), vec3(0.95, 0.96, 1.0), clamp(l * 1.6, 0.0, 1.0));
  return mix(col, white, lay * 0.92);
}

// Two copies of the water a half cycle apart, taking turns by the dither: no seam, no blend.
ivec2 flowing(ivec2 p, vec2 dir, float reach, float speed, float seed) {
  float a = fract(t * speed + seed);
  float b = fract(a + 0.5);
  float second = abs(0.5 - a) * 2.0;
  float phase = bayer(p) < second ? b : a;
  return p - ivec2(round(dir * phase * reach));
}

// One layer of rain: 1-pixel streaks falling along (slant, 1), each in a cell of its own. The rain
// comes in sheets: the density drifts over the glade with a slow noise, so it is thick here and
// thin there and never even, and the streaks are of uneven length.
// One layer of rain, drawn into c. Every drop has a place to land: in each cell of cellSize
// pixels there is one landing point, struck once a cycle; the streak is the drop's last fall
// pixels above that point, slanted by the wind, and it ends there, where the splash follows,
// after the surface: a burst on stone, a plop and a ring on water, a flat dash on the ground, a
// dot on the leaves (owner, 2026-10-24: "der Regen fällt quasi in der Luft auf den Boden … dass
// Landefläche nur Objekte sind"; before, the streaks were a scrolling lattice that began and
// ended anywhere, and the splashes lay where no drop had come down).
void rainLayer(vec2 f, float cellSize, float fall, float len, float slant, float density, float seed, float period, float bright, vec3 drop, inout vec3 c) {
  float px = floor(f.x), py = floor(f.y);
  int cy0 = int(floor(py / cellSize)), cy1 = int(floor((py + fall) / cellSize));
  int cx0 = int(floor((px - 3.0) / cellSize)), cx1 = int(floor((px + fall * slant + 3.0) / cellSize));
  for (int cy = cy0; cy <= cy1; cy++)
    for (int cx = cx0; cx <= cx1; cx++) {
      vec2 cell = vec2(cx, cy);
      if (hash(cell + seed) > density) continue;
      // The cycle: the drop falls through the first three quarters, then the splash.
      float u = fract(t / period + hash(cell + seed + 2.0));
      // Not every cycle brings a drop: the rain's thickness decides.
      if (hash(cell + seed + 4.0 + floor(t / period + hash(cell + seed + 2.0))) > density * 1.6) continue;
      vec2 L = floor(cell * cellSize + vec2(hash(cell + seed + 6.0), hash(cell + seed + 8.0)) * (cellSize - 1.0));
      if (u < 0.75) {
        float head = L.y - (0.75 - u) / 0.75 * fall;
        if (py <= head && py > head - len && py <= L.y) {
          float x = floor(L.x - (L.y - py) * slant);
          if (px == x) c = mix(c, drop, bright);
        }
      } else if (py >= L.y - 3.0 && py <= L.y + 1.0) {
        float phase = (u - 0.75) / 0.25;
        vec2 d = vec2(px, py) - L;
        vec2 a = abs(d);
        vec4 k = kind(ivec2(L));
        float splash = 0.0;
        if (k.b > 0.1) {
          // Water: the plop, a droplet thrown up, and a ring widening.
          splash = phase < 0.2 ? step(a.x + a.y, 0.5) : (phase < 0.45 ? step(a.x, 0.5) * step(abs(d.y + 2.0), 0.5) : 0.0);
          float ring = step(abs(length(d * vec2(1.0, 1.6)) - phase * 5.0), 0.6) * step(0.25, phase);
          c += vec3(0.12, 0.14, 0.15) * ring * (1.0 - phase);
        } else if (k.r > 0.01) {
          // On the leaves: a dot, then gone.
          splash = phase < 0.3 ? step(a.x + a.y, 0.5) : 0.0;
        } else {
          vec3 struck = pick(ivec2(L));
          bool stone = max(struck.r, max(struck.g, struck.b)) - min(struck.r, min(struck.g, struck.b)) < 0.12 && k.g < 0.3;
          if (stone) {
            // On rock the drop bursts: a dot, then two beads thrown up and apart, then one falling.
            splash = phase < 0.25 ? step(a.x + a.y, 0.5) : (phase < 0.55 ? step(abs(a.x - 1.0), 0.1) * step(abs(d.y + 2.0), 0.5) : (phase < 0.8 ? step(abs(a.x - 2.0), 0.1) * step(abs(d.y + 1.0), 0.5) : 0.0));
          } else {
            // On the ground it spreads flat: a dot, then a short dash.
            splash = phase < 0.3 ? step(a.x + a.y, 0.5) : (phase < 0.65 ? step(abs(a.x + a.y - 1.0), 0.1) * step(a.y, 0.5) : 0.0);
          }
          if (stone) splash *= 1.2;
        }
        c = mix(c, drop * 1.25, splash * bright);
      }
    }
}

// One layer of snow: flakes drifting down and sideways, wobbling.
float flake(vec2 f, float fall, float drift, float size, float density, float seed) {
  vec2 q = vec2(f.x - t * drift, f.y - t * fall);
  vec2 c = floor(q / 11.0);
  if (hash(c + seed) > density) return 0.0;
  vec2 at = c * 11.0 + vec2(hash(c + seed + 2.0), hash(c + seed + 5.0)) * 9.0 + 1.0;
  at.x += sin(t * 1.3 + hash(c + seed + 9.0) * 6.28) * 1.6;
  vec2 d = abs(floor(q) - floor(at));
  return (d.x < size && d.y < size) ? 1.0 : 0.0;
}

// How far it is to the nearest pixel that is not falls (which == 0) or not water (which == 1),
// looked for 3 pixels at a time up to 18: where the ice grows from.
float toEdge(ivec2 p, int which) {
  for (int d = 3; d <= 18; d += 3) {
    ivec2 o = ivec2(d, 0);
    ivec2 u = ivec2(0, d);
    if (which == 0) {
      if (kind(p + o).a < 0.5 || kind(p - o).a < 0.5) return float(d);
    } else {
      if (kind(p + o).b < 0.1 || kind(p - o).b < 0.1 || kind(p + u).b < 0.1 || kind(p - u).b < 0.1) return float(d);
    }
  }
  return 21.0;
}

void main() {
  ivec2 p = ivec2(int(gl_FragCoord.x), int(SIZE.y) - 1 - int(gl_FragCoord.y));
  vec2 f = vec2(p);
  vec4 m = kind(p);
  ivec2 src = p;
  vec3 c;
  bool water = false;
  // Frost: the falls and the pool freeze from their edges in as the snow lies, and thaw the same
  // way; a frozen pixel stands still, pale, and takes snow like ground.
  float ice = smoothstep(0.2, 0.95, cover);
  bool frozen = false;
  vec3 iceColour = vec3(0.8, 0.87, 0.94);

  if (m.a > 0.5) {
    // The falls: the picture's water dragged down, streaks of foam racing over it. Frozen, the
    // edges hang still in icicles, by columns of uneven length, and the stream between runs on
    // narrower.
    water = true;
    float column = hash(vec2(floor(f.x / 3.0), 1.0));
    float hang = hash(vec2(floor(f.x / 3.0), 2.0));
    float reach = ice * (6.0 + 14.0 * column);
    if (ice > 0.01 && toEdge(p, 0) <= reach && (hang < ice * 1.3 || f.y < 214.0 - 40.0 * (1.0 - ice))) {
      frozen = true;
      c = pick(p);
      float grain = noise(vec2(f.x * 0.7, f.y * 0.12));
      c = mix(c, iceColour * (0.85 + 0.25 * grain), 0.7);
      // A glint where a column ends.
      c += vec3(0.1) * step(0.92, hash(f + floor(t * 0.5)));
    } else {
      float seed = noise(vec2(f.x * 0.08, 0.0)) * 0.6;
      ivec2 q = flowing(p, vec2(0.0, 1.0), 16.0, 1.25 * (1.0 - ice * 0.4), seed);
      c = kind(q).a > 0.5 ? pick(q) : pick(p);
      float s1 = noise(vec2(f.x * 0.55, f.y * 0.05 - t * 2.4));
      float s2 = noise(vec2(f.x * 0.9 + 13.0, f.y * 0.1 - t * 3.3));
      float bright = step(0.74, s1) + step(0.8, s2) * 0.7;
      c = mix(c, vec3(0.9, 0.96, 0.95), clamp(bright, 0.0, 1.0) * 0.55);
      c *= 1.0 - 0.12 * step(s1, 0.16);
      // The foot of the falls (owner, 2026-10-25: the surface where the falls meet the basin
      // stood still): the last rows crash into a froth that boils up and down, white with dark
      // gaps that rise through it and burst.
      float foot = smoothstep(14.0, 1.0, 214.0 - f.y) * (1.0 - ice);
      float froth = noise(vec2(f.x * 0.35 + t * 0.8, f.y * 0.45 - t * 9.0));
      c = mix(c, vec3(0.93, 0.97, 0.97), step(0.36, froth) * foot * 0.7);
      c *= 1.0 - 0.2 * step(froth, 0.18) * foot;
    }
  } else if (m.b > 0.1 && ice > 0.01 && length((f - PLUNGE) * vec2(1.0, 1.9)) > 26.0 + 30.0 * (1.0 - ice) && toEdge(p, 1) <= ice * (9.0 + 12.0 * noise(f * 0.06))) {
    // The pool and the stream: ice from the shore in, open in the middle and under the falls.
    frozen = true;
    c = pick(p);
    float grain = noise(f * 0.2) * 0.5 + noise(f * 0.05) * 0.5;
    c = mix(c, iceColour * (0.8 + 0.3 * grain), 0.65);
    // Cracks, thin and dark.
    float crack = step(0.985, noise(f * 0.9 + 3.0)) * step(0.4, ice);
    c = mix(c, vec3(0.45, 0.52, 0.6), crack);
  } else if (m.b > 0.1) {
    water = true;
    vec4 fl = texelFetch(flow, p, 0);
    vec2 dir = (fl.rg * 255.0 - 128.0) / 127.0;
    float r = length((f - PLUNGE) * vec2(1.0, 1.9));
    ivec2 q;
    if (length(dir) > 0.3) {
      // The stream: dragged along its course, faster in the middle.
      float mid = 1.0 - fl.b;
      q = flowing(p, normalize(dir), 9.0, 0.8 + 0.6 * mid, noise(f * 0.05) * 0.5);
      if (kind(q).b < 0.1) q = p;
      c = pick(q);
      float along = dot(f, normalize(dir));
      float across = dot(f, vec2(-dir.y, dir.x));
      float n = noise(vec2(along * 0.22 - t * 3.2, across * 0.5));
      // More foam where the stream leaves the pool, carried down from the falls.
      float fromPool = smoothstep(170.0, 60.0, r) * 0.14;
      c = mix(c, vec3(0.86, 0.94, 0.93), step(0.76 - fromPool, n) * 0.5 * (0.4 + mid));
    } else {
      // The pool: rings from where the falls strike, a slow wobble, churning foam near it.
      float ring = sin(r * 0.32 - t * 2.4 + noise(f * 0.05) * 2.0);
      float near = smoothstep(150.0, 20.0, r);
      vec2 out_ = normalize(f - PLUNGE + 0.001);
      vec2 d = out_ * ring * 0.9 * near + (vec2(noise(f * 0.15 + t * 0.7), noise(f * 0.15 - t * 0.6 + 7.0)) - 0.5) * 1.4;
      float churn = smoothstep(34.0, 8.0, r);
      d += (vec2(noise(f * 0.4 + t * 6.0), noise(f * 0.4 - t * 5.0 + 3.0)) - 0.5) * 4.0 * churn;
      q = p + ivec2(round(d));
      if (kind(q).b < 0.1) q = p;
      c = pick(q);
      c += vec3(0.05, 0.07, 0.07) * step(0.8, ring) * near;
      c = mix(c, vec3(0.88, 0.95, 0.94), step(0.62, noise(f * 0.3 + t * 4.0)) * churn * 0.6);
      // Where the falls plunge in (owner, 2026-10-25: the basin's surface felt static): a heap
      // of foam that heaves and boils, white with dark water welling up through it, and from it
      // flecks of foam race outward along the rings and thin out as the water calms, a few
      // carried on to the stream's mouth.
      float boil = smoothstep(30.0, 7.0, r);
      float heave = noise(vec2(f.x * 0.2 + t * 1.3, f.y * 0.4 - t * 6.5)) * 0.6 + noise(f * 0.5 + vec2(-t * 4.0, t * 3.0)) * 0.4;
      c = mix(c, vec3(0.92, 0.97, 0.97), step(0.48 - 0.25 * boil, heave) * boil * 0.85);
      c *= 1.0 - 0.22 * step(heave, 0.24) * boil;
      float ang = atan(out_.y, out_.x);
      float race = noise(vec2(ang * 11.0, r * 0.3 - t * 7.0)) * 0.7 + noise(vec2(ang * 23.0 + 5.0, r * 0.6 - t * 11.0)) * 0.3;
      float fleck = step(0.73, race) * smoothstep(110.0, 16.0, r) * (1.0 - boil);
      c = mix(c, vec3(0.9, 0.96, 0.96), fleck * 0.65);
    }
    // Rain rings on the water.
    if (rain > 0.05) {
      vec2 cell = floor(f / 13.0);
      float phase = fract(t * 1.1 + hash(cell) * 7.0);
      vec2 centre = cell * 13.0 + 3.0 + vec2(hash(cell + 1.0), hash(cell + 2.0)) * 7.0;
      float ringR = phase * 5.0;
      float here = step(hash(cell + floor(t * 1.1 + hash(cell) * 7.0)), rain);
      float on = step(abs(length((f - centre) * vec2(1.0, 1.6)) - ringR), 0.6) * here;
      c += vec3(0.12, 0.14, 0.15) * on * (1.0 - phase);
      // The drop itself: a bright plop at the strike, a droplet thrown up and falling back.
      vec2 d = floor(f) - floor(centre);
      float plop = phase < 0.07 ? step(abs(d.x) + abs(d.y), 0.5) : (phase < 0.22 ? step(abs(d.x), 0.5) * step(abs(d.y + 1.0 + 2.0 * sin((phase - 0.07) / 0.15 * 3.14159)), 0.5) : 0.0);
      c = mix(c, vec3(0.92, 0.97, 0.98), plop * here * 0.9);
    }
  } else if (m.r > 0.01 && max(pick(p).r, max(pick(p).g, pick(p).b)) - min(pick(p).r, min(pick(p).g, pick(p).b)) < 0.1) {
    // Grey under the leaf mask is rock or bark (a tester saw rocks move in the wind): it stays.
    c = pick(p);
  } else if (m.r > 0.01) {
    // Leaves: sway, gust and rustle, by whole pixels, only ever from leaf to leaf.
    float g = gust(f) * wind;
    float sway = sin(t * 1.05 + f.x * 0.012 + f.y * 0.006) * (0.6 + 0.4 * wind);
    // The rustle (rx, ry) is small and only in a gust, so the crown does not seethe with
    // shuffled pixels; the gust's shine is faint, not a band rolling over.
    float rx = noise(f * 0.16 + vec2(t * 1.4, t * 1.0)) - 0.5;
    float ry = noise(f * 0.16 + vec2(-t * 1.1, t * 1.6) + 31.0) - 0.5;
    vec2 d = vec2(sway * 0.8 + g * 1.6 + rx * 1.0 * g, ry * 0.6 * g + abs(sway) * 0.3) * m.r;
    ivec2 q = p + ivec2(round(d));
    if (kind(q).r < 0.01) q = p;
    src = q;
    c = pick(q) * (1.0 + 0.035 * min(g, 1.5) * m.r);
  } else if (m.g > 0.7) {
    // Grass and flowers lean with the gusts and shine in bands as they pass, and give way round
    // the wanderer's feet.
    float g = gust(f) * wind;
    // Gentle (owner, 2026-10-25: "die Wellen auf dem Rasen abschwächen"): a lean of a pixel in
    // a gust, a flicker of less, and hardly any shine.
    float x = g * 0.7 + sin(t * 2.1 + f.x * 0.09 + f.y * 0.05) * 0.3 * (0.5 + 0.5 * wind) + (noise(f * 0.3 + t * 2.0) - 0.5) * 0.4;
    vec2 toHero = f - hero;
    x += sign(toHero.x + 0.01) * 2.0 * smoothstep(8.0, 2.0, length(toHero * vec2(1.0, 1.8)));
    ivec2 q = p + ivec2(int(round(x)), 0);
    if (kind(q).g < 0.7) q = p;
    src = q;
    c = pick(q) * (1.0 + 0.015 * min(g, 1.5));
  } else {
    c = pick(p);
  }

  // Snow lies in patches that grow together: the open meadow first, then the lit tops of the
  // crowns; shade, trunks and water stay dark. A dithered rim where it thins.
  // What stands behind the trees (the deer): under the crowns that are in front of it, over
  // the rest; it takes the hour and the weather like the glade, but no snow lies on it.
  vec4 b = texelFetch(behind, p, 0);
  bool behindHere = b.a > 0.5;
  if (behindHere) {
    b = breeze(behind, p, b);
    behindHere = b.a > 0.5;
  }
  if (behindHere) c = plantSnow(b.rgb, p, behind);
  // The plants in front of the wanderer (the front canvas) are laid on here as well, at the same
  // stage as those behind, so a crown looks the same from either side of it (owner,
  // 2026-10-24: it turned dark below and white above in the snow): what follows (wet, mist,
  // the hour, the lights) treats both alike, and the overlay stays under it.
  vec4 fr = texelFetch(front, p, 0);
  bool frontHere = fr.a > 0.5;
  if (frontHere) {
    fr = breeze(front, p, fr);
    frontHere = fr.a > 0.5;
    if (frontHere) c = plantSnow(fr.rgb, p, front);
  }
  bool plantHere = behindHere || frontHere;

  float snowy = 0.0;
  if (cover > 0.01 && !water && !plantHere) {
    vec2 s = vec2(src);
    float l = luma(pick(src));
    float patch_ = noise(s * 0.045) * 0.55 + noise(s * 0.13) * 0.25 + hash(s) * 0.08;
    // Frozen water stays ice to look at (a tester: "the snow effect covers the flowing water"):
    // snow settles on it only once the cover is nearly whole.
    float open_ = m.g > 0.3 ? 0.25 : (m.r > 0.01 ? -0.25 : (frozen ? -0.55 : -0.08));
    // A cap on what faces the sky: the top of a fence rail, a barrel, a stone, the roof's ridge,
    // where the picture changes just above a still pixel.
    float cap = 0.0;
    if (m.g < 0.3 && m.r < 0.01) cap = step(0.16, distance(pick(p), pick(p - ivec2(0, 2)))) * step(0.3, cover) * 0.6;
    float depth = cover * 1.15 + open_ + cap + (l - 0.4) * 1.1 - patch_;
    // The cottage's walls stand upright and keep their plaster and timber (owner, 2026-10-25:
    // "Hauswand auch nicht"); only sills and beams that face the sky take a cap. Within the
    // cottage's ground, a wall is what is neither meadow or path (the mask), nor a roof tile
    // (orange), nor grey stone or slate (the chimney, the shed's roof, the steps), which take
    // snow as everything else does.
    vec3 here = pick(src);
    bool cottage = f.x > 742.0 && f.x < 958.0 && f.y > 150.0 && f.y < 246.0 && m.g < 0.3;
    bool tile = here.r > here.g * 1.25 && here.r > 0.35;
    bool grey = max(here.r, max(here.g, here.b)) - min(here.r, min(here.g, here.b)) < 0.14 && l > 0.25;
    // Grey stone stands up (the cliffs, the boulders, the chimney): snow lies on its tops and in
    // patches once the cover is deep, not over the whole face (owner, 2026-10-25: "die
    // Felswände sollen nicht so zugeschneit sein").
    // (The rock's own texture trips the cap test everywhere, so the cap counts for little here.)
    if (grey && m.g < 0.3) depth = cap * 0.5 + cover * 0.45 - 0.3 - patch_ * 0.5;
    bool wall = cottage && !tile && !grey;
    if (wall) depth = cap * 1.2 - 0.2 - patch_ * 0.4;
    // Inside the cave's mouth no snow falls (owner, 2026-10-25: "das Innere der Höhle darf nicht
    // zuschneien"): an arch about (460, 105), its dark and its glow.
    vec2 arch = (f - vec2(460.0, 105.0)) / vec2(26.0, 36.0);
    bool cave = abs(f.x - 460.0) < 26.0 && f.y < 124.0 && (f.y > 105.0 || dot(arch, arch) < 1.0) && l < 0.55;
    if (cave) depth = -1.0;
    float lay = depth > 0.3 ? 1.0 : (depth > 0.1 && bayer(p) < (depth - 0.1) * 5.0 ? 1.0 : 0.0);
    vec3 white = mix(vec3(0.66, 0.72, 0.82), vec3(0.95, 0.96, 1.0), clamp(l * 1.6, 0.0, 1.0));
    // The ground canvas: where the snow is trodden (footprints) it is pressed down into shade,
    // and the snow pushed up at a print's foot (its red) catches the light.
    vec4 gnd = texelFetch(ground, p, 0);
    float hollow = gnd.a * (1.0 - max(gnd.b, gnd.g));
    if (hollow > 0.01) {
      white = mix(white, white * vec3(0.5, 0.56, 0.72), hollow);
      white *= 1.0 + 0.2 * gnd.r * hollow;
    }
    c = mix(c, white, lay * 0.92);
    snowy = lay;
  }
  // The ground canvas's blue is the shadow every plant and rock throws to its lower right in
  // the sun (lib/flora.ts), its green the sun's patches on the ground under a crown, moving
  // with it; both fade with cloud and go out at night.
  if (!plantHere) {
    vec4 gnd2 = texelFetch(ground, p, 0);
    float sun = (1.0 - night) * (1.0 - clouds * 0.7) * (1.0 - fog * 0.8);
    // The shade is cool: it takes more of the red and the green than of the blue.
    c *= 1.0 - gnd2.b * gnd2.a * (0.45 + 0.55 * sun) * vec3(0.62, 0.58, 0.44);
    c *= 1.0 + gnd2.g * gnd2.a * 0.2 * sun * (1.0 - snowy * 0.7);
  }

  // Rain darkens the ground and the leaves; stones shine with it; puddles stand on the path and
  // mirror the sky, and go as the ground dries.
  c = mix(c, c * vec3(0.8, 0.84, 0.9), wet * (water ? 0.2 : 0.55));
  if (wet > 0.05 && !water && snowy < 0.5) {
    vec3 own = pick(p);
    float stone = step(max(own.r, max(own.g, own.b)) - min(own.r, min(own.g, own.b)), 0.12) * step(0.3, luma(own)) * (1.0 - m.r) * step(m.g, 0.3);
    c += vec3(0.25, 0.27, 0.3) * stone * wet * step(0.965, hash(floor(f / 2.0) + floor(t * 1.5)));
    if (m.g > 0.3) {
      // Puddles (owner, 2026-10-25: "wenn es regnet sollen Pfützen, die reflektieren,
      // entstehen"): they gather on the path and in the meadow's hollows, grow while it stays
      // wet, and mirror what stands above them: a tree, the cottage, the wanderer, else the sky.
      // The mirror is about a line every fourteen rows (a puddle is about that tall), rippled
      // sideways while the rain falls.
      float pn = noise(f * 0.06 + 7.0) * 0.7 + noise(f * 0.2 + 3.0) * 0.3;
      float threshold = (m.g < 0.7 ? 0.62 : 0.77) + (1.0 - min(1.0, wet)) * 0.08;
      float puddle = step(threshold, pn) * step(0.25, wet);
      vec3 skyMirror = vec3(0.6, 0.66, 0.76) * light * tint;
      if (puddle > 0.5) {
        float surface = floor(f.y / 14.0) * 14.0;
        float ripple = rain * (sin(t * 4.0 + f.y * 0.9 + f.x * 0.3) + 0.5 * sin(t * 6.3 + f.x * 0.7)) * 0.8;
        ivec2 q = inside(ivec2(int(round(f.x + ripple)), int(surface - (f.y - surface) - 1.0)));
        vec4 ro = texelFetch(overlay, q, 0);
        vec4 rf = texelFetch(front, q, 0);
        vec4 rb = texelFetch(behind, q, 0);
        vec3 seen = ro.a > 0.5 ? ro.rgb : (rf.a > 0.5 ? rf.rgb : (rb.a > 0.5 ? rb.rgb : vec3(-1.0)));
        vec3 mirror = seen.r < 0.0 ? skyMirror : mix(seen * 0.75, skyMirror, 0.3);
        c = mix(c, mix(c * 0.6, mirror, 0.6), min(1.0, wet * 1.5));
      }
      if (rain > 0.05 && puddle > 0.5) {
        vec2 cell = floor(f / 13.0);
        float phase = fract(t * 1.1 + hash(cell) * 7.0);
        vec2 centre = cell * 13.0 + 3.0 + vec2(hash(cell + 1.0), hash(cell + 2.0)) * 7.0;
        float on = step(abs(length((f - centre) * vec2(1.0, 1.6)) - phase * 5.0), 0.6) * step(hash(cell + floor(t * 1.1 + hash(cell) * 7.0)), rain);
        c += vec3(0.12, 0.14, 0.15) * on * (1.0 - phase);
      }
    }
  }

  // Mist over the foot of the falls.
  vec2 mp = (f - PLUNGE) / vec2(62.0, 30.0);
  float mist = exp(-dot(mp, mp)) * fbm(f * 0.07 + vec2(t * 0.25, t * 0.7));
  c = mix(c, vec3(0.9, 0.95, 0.95), floor(mist * 3.2 + bayer(p)) / 3.0 * 0.45);

  // Smoke from the chimney, in four dithered steps, rising and leaning with the wind.
  float h = CHIMNEY.y - f.y;
  if (h > -1.0 && h < 125.0) {
    float g = gust(f);
    float centre = CHIMNEY.x + h * 0.16 * wind + h * h * 0.0011 * (1.0 + 1.5 * g) * wind + sin(h * 0.06 - t * 1.1) * 2.2 * min(h / 40.0, 1.0);
    float width = 2.4 + h * 0.17;
    float dx = (f.x - centre) / width;
    if (abs(dx) < 3.0) {
      float n = fbm(vec2(f.x * 0.08, f.y * 0.08 + t * 1.1));
      float density = exp(-dx * dx * 1.4) * (0.3 + 0.95 * n) * smoothstep(122.0, 30.0, h) * smoothstep(-1.0, 4.0, h) * (1.0 - rain * 0.25) * (1.0 + cover * 0.7 + night * 0.3 + rain * 0.4);
      float step_ = floor(density * 4.0 + bayer(p) - 0.25) / 4.0;
      vec3 smoke = mix(vec3(0.55, 0.57, 0.56), vec3(0.88, 0.89, 0.86), clamp(n * 1.2 - dx * 0.15, 0.0, 1.0));
      c = mix(c, smoke, clamp(step_, 0.0, 1.0) * 0.85);
    }
  }

  // The overlay: the wanderer, the lights, what flies. The wanderer's far side from the lantern
  // falls into its own shade, one step darker, deeper at night.
  vec4 o = texelFetch(overlay, p, 0);
  // Only the wanderer's own pixels: not a bird beside them.
  bool inBox = abs(f.x - hero.x) < 16.0 && f.y > hero.y - 40.0 && f.y < hero.y + 2.0;
  bool onFigure = o.a > 0.5 && inBox;
  // The glade is dense, so the pixels round the silhouette fall into shade (a tester lost the
  // figure in it): not a drawn line, the ground itself a step darker where it meets the figure.
  if (!onFigure && inBox) {
    bool beside = texelFetch(overlay, inside(p + ivec2(1, 0)), 0).a > 0.5 || texelFetch(overlay, inside(p - ivec2(1, 0)), 0).a > 0.5 || texelFetch(overlay, inside(p + ivec2(0, 1)), 0).a > 0.5 || texelFetch(overlay, inside(p - ivec2(0, 1)), 0).a > 0.5;
    if (beside) c *= 0.72;
  }
  if (onFigure && length(f - lantern.xy) < 40.0) {
    float away = smoothstep(5.0, 16.0, length((f - lantern.xy) * vec2(1.0, 0.6)));
    o.rgb *= 1.0 - away * lantern.z * (0.16 + night * 0.18);
    // In the snow the wanderer belongs to it (owner, 2026-10-24: "he must blend into the
    // surrounding"): the colours take the cold, and snow lies on what faces the sky, the hood,
    // the shoulders, the satchel, the lantern's top, two rows deep and the third dithered. The
    // cap faces the sky, so it is brighter than the snow on the ground (the same white would melt
    // into the snow behind and only make the figure look smaller); the lantern's glass stays
    // clear.
    bool glass = o.r > 0.75 && o.b < 0.5;
    if (cover > 0.05 && !glass) {
      float grey = luma(o.rgb);
      // The snow's light on the figure: paler, bluer, and lifted towards the white round it.
      // Less of it since 2026-10-25 (owner: "der Charakter auch nicht so weiß"): the colours
      // cool a little, and the cap is two rows at most.
      vec3 cold = mix(mix(o.rgb, vec3(grey), 0.35) * vec3(0.95, 1.0, 1.1) * 1.15, vec3(0.7, 0.75, 0.86), 0.3);
      o.rgb = mix(o.rgb, cold, min(1.0, cover * 1.2) * 0.5);
      float above1 = texelFetch(overlay, inside(p - ivec2(0, 1)), 0).a;
      float above2 = texelFetch(overlay, inside(p - ivec2(0, 2)), 0).a;
      float capDepth = above1 < 0.5 ? cover * 1.4 : (above2 < 0.5 ? cover * 0.8 : 0.0);
      float capLay = capDepth > 0.5 ? 1.0 : (capDepth > 0.15 && bayer(p) < (capDepth - 0.15) * 2.9 ? 1.0 : 0.0);
      o.rgb = mix(o.rgb, vec3(1.12, 1.14, 1.18) * (above1 < 0.5 ? 1.0 : 0.94), capLay * 0.95);
    }
  }
  // In the snow the lantern warms the figure less: it stays of a piece with the white round it.
  float figureInSnow = onFigure ? min(1.0, cover * 1.2) : 0.0;
  if (!frontHere) c = mix(c, o.rgb, o.a);
  vec3 painted = c;

  // The low sun of the golden hour, from the west, lines the crowns' edges on its side; the first
  // sun of the morning comes through the crowns in rays, from the east over the cliffs, and a
  // mist lies along the stream until it warms.
  float golden = smoothstep(16.5, 18.2, hour) * (1.0 - smoothstep(18.8, 19.6, hour)) * (1.0 - clouds * 0.8);
  if (golden > 0.01 && m.r > 0.01 && kind(p + ivec2(-2, -2)).r < 0.01) c += vec3(0.26, 0.17, 0.05) * golden;
  float dawn = smoothstep(5.6, 6.6, hour) * (1.0 - smoothstep(8.0, 9.6, hour)) * (1.0 - clouds * 0.9);
  if (dawn > 0.01) {
    float s = dot(f, vec2(-0.78, 0.63));
    float band = pow(0.5 + 0.5 * sin(s * 0.05 + noise(vec2(s * 0.012, t * 0.04)) * 4.0), 7.0);
    float where = smoothstep(360.0, 140.0, f.y) * smoothstep(80.0, 300.0, f.x) * (0.5 + 0.5 * noise(f * 0.01 + t * 0.02));
    c += vec3(1.0, 0.88, 0.62) * floor(band * where * dawn * 2.2 + bayer(p)) / 3.0 * 0.22;
    float along = min(segment(f, S0, S1), min(segment(f, S1, S2), segment(f, S2, S3)));
    float lowMist = dawn * exp(-along / 24.0) * (0.4 + 0.6 * fbm(f * vec2(0.03, 0.05) + vec2(t * 0.03, 0.0)));
    c = mix(c, vec3(0.86, 0.9, 0.92) * light * tint, floor(lowMist * 3.0 + bayer(p)) / 3.0 * 0.5);
  }

  // Cloud shadows drift over the glade; more cloud, more and darker shadow.
  float cloud = smoothstep(0.5 - clouds * 0.22, 0.62 - clouds * 0.22, fbm(f * 0.0032 + vec2(t * 0.011, t * 0.004) * 0.8));
  c *= 1.0 - (0.14 + clouds * 0.12) * floor(cloud * 2.0 + bayer(p)) / 2.0;

  // The hour: its light and tint, and the blue of night with the colour gone out of it.
  c *= tint * light;
  c = mix(c, vec3(luma(c)) * vec3(0.55, 0.7, 1.0) * 1.25, night * 0.7);
  // Snow gives the night's light back: the lying snow stays pale, and the moon's light comes
  // through the crowns in slow patches on the open ground.
  c *= 1.0 + snowy * night * 0.5;
  float moon = night * smoothstep(0.52, 0.72, fbm(f * 0.011 + vec2(t * 0.0025, -t * 0.0015))) * (1.0 - clouds * 0.9);
  c *= 1.0 + floor(moon * 2.0 + bayer(p)) / 2.0 * (m.g > 0.3 ? 0.2 : 0.08);

  // Light: the lantern, the cave, the lights still out, the windows; in dithered steps. Where it
  // shines it gives back the painted colour, warmed: by day a glow, by night what you see by.
  float l = 0.0;
  vec2 lp = (f - lantern.xy) * vec2(1.0, 1.25);
  float lr = (22.0 + lights * 6.0) * (1.0 + night * 0.8) * (1.0 + fog * 0.3);
  l += lantern.z * pow(max(0.0, 1.0 - length(lp) / lr), 1.6);
  float breathe = 0.85 + 0.15 * sin(t * (open > 0.5 ? 2.4 : 1.1));
  float cr = (30.0 + lights * 8.0 + open * 26.0) * (1.0 + night * 0.4);
  l += (0.25 + lights * 0.08 + open * 0.4) * breathe * pow(max(0.0, 1.0 - length((f - CAVE) * vec2(1.0, 1.3)) / cr), 2.0);
  for (int i = 0; i < 5; i++) {
    vec4 mo = motes[i];
    if (mo.z < 0.5) continue;
    l += (0.5 + 0.15 * mo.w) * pow(max(0.0, 1.0 - length(f - mo.xy) / (16.0 + night * 10.0)), 2.0);
  }
  // The windows are lit from dusk, each flickering on its own, and a warm spot lies before the
  // door; in the dark of a storm or snow they come on by day as well, and in rain they glow
  // warm (the cosy of a dry house in the wet).
  float flicker = 0.8 + 0.2 * noise(vec2(t * 3.0, 0.0));
  float evening = clamp(night + smoothstep(17.2, 19.4, hour) * 0.7 * (1.0 - night) + (1.0 - smoothstep(5.0, 7.0, hour)) * 0.7 + (clouds * 0.3 + rain * 0.5) * (1.0 - night), 0.0, 1.0);
  float windowR = 11.0 + evening * 16.0;
  float windows = (0.08 + evening * 0.62) * flicker;
  l += windows * (0.9 + 0.1 * noise(vec2(t * 2.1, 1.0))) * pow(max(0.0, 1.0 - length(f - WIN0) / windowR), 2.0);
  l += windows * (0.9 + 0.1 * noise(vec2(t * 2.6, 2.0))) * pow(max(0.0, 1.0 - length(f - WIN1) / windowR), 2.0);
  l += windows * (0.9 + 0.1 * noise(vec2(t * 1.8, 3.0))) * pow(max(0.0, 1.0 - length(f - WIN2) / windowR), 2.0);
  l += windows * 0.7 * pow(max(0.0, 1.0 - length((f - DOOR) * vec2(0.8, 1.4)) / (windowR * 1.1)), 2.0);
  float lq = floor(l * 6.0 + bayer(p)) / 6.0;
  vec3 warm = vec3(1.0, 0.76, 0.42);
  c = mix(c, painted * vec3(1.06, 0.92, 0.74) * (0.85 + lq * 0.35), clamp(lq * (0.25 + night * 1.1), 0.0, 1.0) * (1.0 - figureInSnow * 0.35));
  c += warm * lq * (0.32 + night * 0.12) * (1.0 - night * 0.4) * (1.0 - figureInSnow * 0.35);
  // The snow mirrors the lights faintly.
  c += warm * lq * snowy * 0.22;

  // Mist in dithered banks, lit by the lights in it.
  if (fog > 0.01) {
    float n = fbm(f * vec2(0.007, 0.012) + vec2(t * 0.018, t * 0.004));
    float dense = fog * (0.35 + 0.75 * n);
    vec3 grey = mix(vec3(0.78, 0.8, 0.8) * light * tint, vec3(0.13, 0.16, 0.22), night);
    c = mix(c, grey + warm * lq * 0.35, floor(dense * 5.0 + bayer(p)) / 5.0 * 0.8);
  }

  // Rain: two layers of streaks, the near one brighter, and splashes on the ground.
  if (rain > 0.01) {
    // Three layers of drops, each landing on the glade. The wind slants the streaks about their
    // landing points, and the gusts sway that slant: nothing jumps, nothing ends in the air.
    float slant = 0.1 + 0.08 * wind + wind * (0.05 * sin(t * 0.7) + 0.02 * sin(t * 1.9 + 1.3));
    vec3 drop = mix(vec3(0.72, 0.78, 0.86), vec3(0.32, 0.38, 0.5), night) * (0.7 + lq);
    rainLayer(f, 14.0, 70.0, 6.0, slant * 0.8, rain * 0.6, 40.0, 0.46, 0.3, drop, c);
    rainLayer(f, 20.0, 110.0, 10.0, slant, rain * 0.55, 0.0, 0.5, 0.55, drop, c);
    // The long bright drops come only with heavy rain, and few of them.
    rainLayer(f, 40.0, 150.0, 14.0, slant * 1.2, smoothstep(0.5, 0.8, rain) * 0.3, 80.0, 0.48, 0.75, drop * 1.15, c);
  }

  // Snow in depth: three layers, the far flakes small, slow, dim and many, the near ones big,
  // fast and bright, drifting more; each flake with a brightness of its own.
  if (snow > 0.01) {
    float drift = 5.0 + 9.0 * wind;
    vec3 flakeColour = mix(vec3(0.95, 0.96, 1.0), vec3(0.55, 0.6, 0.72), night) * (0.8 + lq * 0.9);
    float far = flake(f + 11.0, 11.0, drift * 0.45, 0.5, snow * 0.7, 40.0);
    float mid = flake(f + 5.0, 19.0, drift * 0.75, 0.5, snow * 0.55, 20.0);
    float near = flake(f, 36.0, drift * 1.3, 1.5, snow * 0.3, 0.0);
    float vary = 0.75 + 0.25 * noise(f * 0.5 + t);
    c = mix(c, flakeColour * 0.72, far * 0.5 * vary);
    c = mix(c, flakeColour * 0.9, mid * 0.8 * vary);
    c = mix(c, flakeColour * 1.05, near * 0.95);
  }

  // Lightning: the glade in a flash of white-blue, the night gone for an instant.
  c = mix(c, painted * 1.35 + vec3(0.12, 0.14, 0.2), flash * 0.65);

  // What shines by itself: fireflies, the lights' cores.
  vec4 g = texelFetch(glow, p, 0);
  c = mix(c, g.rgb, g.a);

  // The dark at the glade's edge, deeper at night.
  float v = length((f - vec2(560.0, 300.0)) / vec2(640.0, 410.0));
  c *= 1.0 - (0.36 + night * 0.2) * floor(smoothstep(0.62, 1.15, v) * 4.0 + bayer(p)) / 4.0;

  c = mix(c, vec3(1.0, 0.94, 0.8), home * 0.85);

  // The palette filter (lib/palette.ts): every finished pixel becomes the nearest colour of the
  // glade's palette, with a hair of ordered dither so a slope does not band.
  ivec3 q = ivec3(clamp(c + (bayer(p) - 0.5) / 64.0, 0.0, 1.0) * 31.0 + 0.5);
  c = texelFetch(lut, ivec2(q.b * 32 + q.r, q.g), 0).rgb;
  colour = vec4(c, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
  return shader;
}

const FLOATS = ["t", "lights", "open", "home", "light", "night", "rain", "snow", "cover", "fog", "clouds", "wind", "wet", "flash", "hour"] as const;

export class Stage {
  private readonly gl: WebGL2RenderingContext;
  private readonly overlayTexture: WebGLTexture;
  private readonly glowTexture: WebGLTexture;
  private readonly groundTexture: WebGLTexture;
  private readonly behindTexture: WebGLTexture;
  private readonly frontTexture: WebGLTexture;
  private readonly at: Record<string, WebGLUniformLocation | null> = {};

  /** Throws when the browser has no WebGL2; the caller then draws the plain picture. */
  constructor(
    canvas: HTMLCanvasElement,
    images: StageImages,
    private readonly overlay: HTMLCanvasElement,
    private readonly glow: HTMLCanvasElement,
    private readonly ground: HTMLCanvasElement,
    private readonly behind: HTMLCanvasElement,
    private readonly front: HTMLCanvasElement,
  ) {
    canvas.width = W;
    canvas.height = H;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error("No WebGL2");
    this.gl = gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
    gl.useProgram(program);

    const corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, "corner");
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

    for (const name of ["scene", "masks", "flow", "overlay", "glow", "ground", "behind", "front", "lut", "tint", "lantern", "motes", "hero", ...FLOATS]) this.at[name] = gl.getUniformLocation(program, name);

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    const texture = (unit: number, name: string, source: TexImageSource | Uint8Array, width = 0, height = 0) => {
      const tex = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      for (const param of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, param, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (source instanceof Uint8Array) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.uniform1i(this.at[name], unit);
      return tex;
    };
    texture(0, "scene", images.scene);
    texture(1, "masks", images.masks);
    texture(2, "flow", images.flow);
    this.overlayTexture = texture(3, "overlay", overlay);
    this.glowTexture = texture(4, "glow", glow);
    this.groundTexture = texture(5, "ground", ground);
    this.behindTexture = texture(6, "behind", behind);
    this.frontTexture = texture(8, "front", front);
    texture(7, "lut", buildLut(buildPalette(images.colours)), LUT_SIZE * LUT_SIZE, LUT_SIZE);
  }

  render(frame: StageFrame) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.overlay);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.glowTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.glow);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.groundTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.ground);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.behindTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.behind);
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.frontTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.front);
    for (const name of FLOATS) gl.uniform1f(this.at[name], frame[name]);
    gl.uniform3fv(this.at.tint, frame.tint);
    gl.uniform3fv(this.at.lantern, frame.lantern);
    gl.uniform2fv(this.at.hero, frame.hero);
    gl.uniform1f(this.at.behindFeet, frame.behindFeet);
    const motes = new Float32Array(20);
    frame.motes.slice(0, 5).forEach((mote, i) => motes.set(mote, i * 4));
    gl.uniform4fv(this.at.motes, motes);
    gl.viewport(0, 0, W, H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
