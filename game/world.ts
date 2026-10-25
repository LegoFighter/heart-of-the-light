/* The glade, in the scene's own pixels (public/assets/scene.png, 1024x576): where feet may go, the
   lights to gather, the places that speak, and the cave. Traced by hand over the picture; when the
   picture changes, these change with it.

   The experiment of 2026-10-24: the picture is the ground alone (no plants); the trees and
   bushes stand on it as objects (lib/flora.ts) and their trunks block the way (`TRUNKS`, set
   from public/assets/flora.json when the art is loaded). */

export const W = 1024;
export const H = 576;

export type Point = readonly [number, number];

/** The open ground: the meadow east of the stream, up to the cliffs and the cottage. */
export const WALK: readonly Point[] = [
  [338, 575], [312, 532], [271, 492], [230, 451], [189, 410], [169, 374], [189, 333], [220, 302],
  [287, 300], [358, 287], [379, 256], [358, 230], [317, 215], [389, 184], [436, 182], [438, 108], [468, 108], [470, 180], [512, 169], [614, 159],
  [707, 133], [758, 108], [799, 82], [896, 72], [1023, 82], [1023, 575],
];

/** What feet never enter: the cottage with its woodshed, and the fenced garden. */
export const SOLID: readonly (readonly Point[])[] = [
  [[727, 154], [742, 97], [860, 87], [901, 61], [922, 61], [922, 246], [840, 256], [737, 246]],
  [[666, 200], [748, 246], [973, 241], [1023, 276], [1023, 317], [911, 338], [819, 328], [727, 297], [666, 246]],
];

export interface Ellipse {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
}

/** What stands in the meadow besides the plants and rocks (none: the rocks are objects too). */
export const BLOCKS: readonly Ellipse[] = [];

/** The trunks of the trees and the bushes' feet: set once the flora is loaded. */
export let TRUNKS: readonly Ellipse[] = [];
export function setTrunks(trunks: readonly Ellipse[]) {
  TRUNKS = trunks;
}

/** The cave's mouth. Feet pass the threshold only once all lights are gathered; above `inside` the
    light takes the wanderer in. */
export const CAVE = { x: 452, y: 100, threshold: 140, inside: 118 } as const;

export const SPAWN: Point = [589, 566];

/** The five lights, where they hover (the ground point under each). */
export const MOTES: readonly Point[] = [
  [461, 358],
  [512, 486],
  [768, 435],
  [410, 256],
  [640, 287],
];

export type PlaceId = "pool" | "cottage" | "cave";

export const PLACES: readonly { id: PlaceId; x: number; y: number; r: number }[] = [
  { id: "pool", x: 385, y: 275, r: 30 },
  { id: "cottage", x: 648, y: 252, r: 20 },
  { id: "cave", x: 452, y: 150, r: 22 },
];

/** Where the water falls (the roar comes from here), where it strikes the pool, where the
    chimney smokes, and the cottage's lit windows. */
export const FALLS: Point = [210, 102];
export const PLUNGE: Point = [220, 225];
export const CHIMNEY: Point = [888, 97];
export const WINDOWS: readonly Point[] = [[773, 200], [791, 201], [868, 205]];
/** The cottage's door, where its light falls out onto the steps. */
export const DOOR: Point = [799, 212];

export function inside(polygon: readonly Point[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function inEllipse(e: Ellipse, x: number, y: number): boolean {
  const dx = (x - e.x) / e.rx;
  const dy = (y - e.y) / e.ry;
  return dx * dx + dy * dy < 1;
}

/** Whether feet may stand here. Feet are a little oval, so a figure never pokes into a trunk. */
export function walkable(x: number, y: number, caveOpen: boolean): boolean {
  if (!caveOpen && y < CAVE.threshold) return false;
  for (const [ox, oy] of FEET) {
    if (!inside(WALK, x + ox, y + oy)) return false;
    if (SOLID.some((s) => inside(s, x + ox, y + oy))) return false;
  }
  return !BLOCKS.some((b) => inEllipse(b, x, y)) && !TRUNKS.some((b) => inEllipse(b, x, y));
}

const FEET: readonly Point[] = [[0, 0], [-4, 0], [4, 0], [0, -2], [0, 2]];

/** The water (the pool and the stream), where an animal may wade, and the bank west of the
    stream, where only animals go. */
export const WADE: readonly Point[] = [
  [128, 225], [205, 220], [287, 215], [358, 230], [379, 256], [358, 287], [307, 297], [220, 302], [215, 307],
  [184, 333], [164, 374], [184, 410], [225, 451], [266, 492], [307, 532], [333, 576],
  [271, 576], [246, 532], [205, 492], [164, 451], [123, 410], [102, 369], [118, 338], [143, 302], [128, 256],
];
export const LEFT_BANK: readonly Point[] = [
  [0, 275], [128, 256], [102, 369], [123, 410], [164, 451], [205, 492], [246, 532], [271, 576], [0, 576],
];

/** Whether an animal may stand here: the meadow, the water, the west bank, or off the picture;
    never in the cottage or its garden, never in a trunk or a rock. */
export function animalWalkable(x: number, y: number): boolean {
  if (x < 0 || x >= W || y >= H) return true;
  if (y < 0) return false;
  // The water's outline and the meadow's were traced apart and leave slivers between them: a
  // point a few pixels either side counts, so a deer gets from the bank into the stream.
  const wet = inside(WADE, x, y) || inside(WADE, x - 6, y) || inside(WADE, x + 6, y);
  if (!(inside(WALK, x, y) || wet || inside(LEFT_BANK, x, y) || inside(LEFT_BANK, x + 6, y))) return false;
  if (SOLID.some((s) => inside(s, x, y))) return false;
  return !TRUNKS.some((b) => inEllipse(b, x, y));
}
