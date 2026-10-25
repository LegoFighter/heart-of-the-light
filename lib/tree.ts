/* A tree rigged in code (owner, 2026-10-25: "einen blätterlosen Baum und setz Blätter per Code
   drauf, lass die Äste mit den Blättern bewegen im Wind").

   The bare tree is a skeleton: the trunk, and branches that fork from it, each hung on its parent
   at a point along it with an angle of its own, thinner and shorter the further out it is
   (`growTree`, from a seed, so the same tree grows every time). The leaves are set on the outer
   branches by code (`leafTree`): small clusters, each at a place along a branch and a little to
   one side, in the glade's greens, lighter where the sun from the upper left falls.

   The wind is the glade's (`gust` and the slow sway of lib/flora.ts, the same formula, so this
   tree would move with the wood): every branch bends about its base, the thinner and the further
   out the more, and takes its children and its leaves with it, since a child's base rides on its
   parent's posed direction. In a gust the twigs tremble and single leaves shift a pixel and show
   their lighter side for a frame. Pure pixels: everything is drawn at whole pixels, the branches
   as pixel lines of a whole width, the leaves as rects. `drawTree(c, tree, x, y, t, wind)` draws
   it on any 2D context, so a test can render it without a browser. */

import { gust } from "./flora";
import { grade, type RGB } from "./palette";

export interface Branch {
  /** The index of the branch this one hangs on; -1 for the trunk. */
  parent: number;
  /** Where on the parent it hangs: 0 the parent's base, 1 its tip. */
  at: number;
  /** The rest angle relative to the parent's direction, radians; positive leans right (east). */
  angle: number;
  length: number;
  /** The width at the base, in pixels; it tapers towards the tip. */
  width: number;
  /** 0 for the trunk, one more for each fork out. */
  depth: number;
  /** How far the wind bends it, radians per unit of wind. */
  flex: number;
  /** Its own phase in the gust's trembling. */
  phase: number;
  /** A root: at the foot, in the ground, never moving and never in leaf. */
  root?: boolean;
  /** A branch with no parent that starts away from the foot (on a tip of the painted tree):
      where, relative to the foot. Its angle is then absolute. */
  base?: { x: number; y: number };
}

export interface Leaf {
  branch: number;
  /** Where along the branch, 0..1 (a little over 1 hangs past the tip). */
  at: number;
  /** Sideways from the branch, in pixels, positive to its right. */
  side: number;
  /** Which of the leaf shapes. */
  shape: number;
  /** An index into the leaves' colours, dark (in the crown's shade) to light (sunlit). */
  shade: number;
  /** Behind the branches or in front of them. */
  back: boolean;
  phase: number;
  /** A leaf that sits on the painted tree itself, not on a branch of the rig: where, relative
      to the foot (`branch` is then -1). It moves with the picture's band. */
  fixed?: { x: number; y: number };
}

/** A painted bare tree (public/assets/trunk.png and trunk.json, from tools/art/trunk.py): the
    picture, its foot inside it, the tips of its twigs and points along its thin branches. */
export interface Painted {
  image: CanvasImageSource;
  w: number;
  h: number;
  foot: { x: number; y: number };
  tips: { x: number; y: number; dir: number }[];
  twigs: [number, number][];
}

export interface Tree {
  branches: Branch[];
  leaves: Leaf[];
  /** The painted bare tree the rig grows on, when it does not grow its own. */
  painted?: Painted;
  /** The height of the bare tree at rest, from the foot to the highest tip, in pixels. */
  height: number;
}

/** A posed branch: where it stands this frame. */
export interface Posed {
  x: number;
  y: number;
  /** The absolute direction, radians; 0 straight up, positive leaning right. */
  dir: number;
  tipX: number;
  tipY: number;
}

/** The colours of the glade's own broadleaf trees (the most common ones on the flora sheet, dark
    to light: the near-black depths of a crown, its olives, the lit leaves and the yellow
    highlights, with the cool green of the shade), and its bark's browns, shade to light. The
    sheet still has the painting's yellow cast; `grade` takes it off, as the shader does for the
    glade, so the tree looks as the glade's trees do on screen. */
export const SHEET_LEAF = ["#0e0c07", "#191b11", "#242716", "#284030", "#2d320d", "#3c4020", "#505415", "#626416", "#78751d", "#8c8421", "#b6a52d", "#ceac2d", "#e6c443"];
export const SHEET_BARK = ["#0e0c07", "#291e11", "#3f3421", "#574224", "#77582e", "#a1672e"];

function graded(hex: string): string {
  const c: RGB = [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
  return "#" + grade(c).map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
}

export const LEAF = SHEET_LEAF.map(graded);
export const BARK = SHEET_BARK.map(graded);
let leafInk = [...LEAF];
let barkInk = [...BARK];
/** The cool green of the shade in LEAF, sprinkled into the dark leaves. */
const COOL = 3;

/** Sets the colours the tree is drawn in (the leaves dark to light, the bark shade, mid, light). */
export function paintTree(leaves: string[], bark: string[]) {
  leafInk = leaves;
  barkInk = bark;
}

/** A small deterministic generator: the same seed, the same tree. */
export function random(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** The leaf shapes, as rows of pixel runs: [dx, dy, w]. */
const SHAPES: [number, number, number][][] = [
  [[0, 0, 2], [0, 1, 2]], // a 2x2 clump
  [[0, 0, 3], [0, 1, 3]], // a wider one
  [[1, 0, 1], [0, 1, 3], [1, 2, 1]], // a diamond
  [[0, 0, 2], [-1, 1, 3]], // a little tuft
  [[0, 0, 1], [0, 1, 2]], // a single leaf's worth
];

/** Grows the bare tree: the roots, the trunk and its forks, no leaves. `size` 1 is a tree of the
    glade's height (some 130 pixels); the study shows it at 1.7. */
export function growTree(seed = 7, size = 1.7): Tree {
  const rnd = random(seed);
  const branches: Branch[] = [];
  const trunkLength = Math.round((40 + rnd() * 8) * size);
  const trunkWidth = Math.max(3, Math.round(6.5 * size));
  branches.push({ parent: -1, at: 0, angle: (rnd() - 0.5) * 0.08, length: trunkLength, width: trunkWidth, depth: 0, flex: 0.003, phase: rnd() * 6.28 });
  // The roots: a few run out from the foot to either side and a little down into the ground,
  // one or two more between them, thick where they leave the trunk and thin at the end.
  const roots = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < roots; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const angle = side * (1.45 + rnd() * 0.45) + (rnd() - 0.5) * 0.1;
    branches.push({ parent: 0, at: 0.03, angle, length: Math.round((9 + rnd() * 10) * size), width: Math.max(3, Math.round(trunkWidth * (0.5 + rnd() * 0.25))), depth: 1, flex: 0, phase: 0, root: true });
  }

  const grow = (parent: number) => {
    const p = branches[parent];
    if (p.root || p.depth >= 6 || p.length < 5) return;
    const children: { at: number; angle: number; scale: number }[] = [];
    // The fork at the tip: a trunk opens into three or four arms, a branch into two or three,
    // spread about the parent's line.
    const arms = p.depth === 0 ? 3 + Math.floor(rnd() * 2) : rnd() < 0.35 ? 3 : 2;
    const spread = (p.depth === 0 ? 0.5 : 0.42) + rnd() * 0.3;
    for (let i = 0; i < arms; i++) {
      const centre = (i - (arms - 1) / 2) * (arms === 2 ? 2 : arms === 3 ? 1 : 0.8);
      const angle = centre * spread * (0.8 + rnd() * 0.4) + (rnd() - 0.5) * 0.2;
      children.push({ at: 1, angle, scale: 0.64 + rnd() * 0.14 - Math.abs(centre) * 0.05 });
    }
    // Side branches lower down: heavy limbs off the trunk, one or two off the first forks.
    if (p.depth <= 2) {
      const count = p.depth === 0 ? 2 + Math.floor(rnd() * 2) : rnd() < 0.7 ? 1 : 0;
      for (let i = 0; i < count; i++) {
        const side = p.depth === 0 ? (i % 2 === 0 ? -1 : 1) : rnd() < 0.5 ? -1 : 1;
        children.push({ at: 0.5 + rnd() * 0.4, angle: side * (0.65 + rnd() * 0.45), scale: 0.5 + rnd() * 0.15 });
      }
    }
    for (const child of children) {
      const depth = p.depth + 1;
      // The outer branches reach for the light: a pull towards straight up.
      const upright = -(p.angle + child.angle) * 0.18;
      const length = Math.round(p.length * child.scale);
      if (length < 3) continue;
      const width = Math.max(1, Math.round(p.width * 0.64));
      branches.push({
        parent,
        at: child.at,
        angle: child.angle + upright,
        length,
        width,
        depth,
        // The thinner and the further out, the more it gives.
        flex: 0.0035 * (1 + depth) ** 1.6 / Math.max(1, width * 0.5),
        phase: rnd() * 6.28,
      });
      grow(branches.length - 1);
    }
  };
  grow(0);

  const posed = pose(branches, 0, 0, 0, 0);
  const top = Math.min(...posed.map((b) => b.tipY));
  return { branches, leaves: [], height: -top };
}

/** Sets the leaves on the tree: along every branch from the second fork out, the thicker the
    foliage the further out, a few hanging past the tips. */
export function leafTree(tree: Tree, seed = 11, density = 1.3): Tree {
  const rnd = random(seed * 31 + 5);
  const leaves: Leaf[] = [];
  tree.branches.forEach((b, i) => {
    if (b.root || b.depth < 2) return;
    const count = Math.round((b.length * 0.5 + b.depth * 3) * density);
    for (let k = 0; k < count; k++) {
      const at = 0.2 + rnd() * 0.9;
      const side = Math.round((rnd() - 0.5) * (3 + b.depth));
      leaves.push({ branch: i, at, side, shape: Math.floor(rnd() * SHAPES.length), shade: 0, back: rnd() < 0.4, phase: rnd() * 6.28 });
    }
  });
  return lightLeaves({ ...tree, leaves }, seed);
}

/** Gives every leaf its shade from where it lies (owner, 2026-10-25: "es sieht zu stark nach
    Verlauf und zu wenig nach Licht auf Blättern"): the sun stands to the upper left, so a leaf is
    lit when few other leaves lie over it towards the upper left, that is at the top and the
    left edge of the crown and on top of each clump, and a leaf inside the crown is dark. Most
    leaves come out dark to mid; the yellow highlights fall on a few of the freest. */
export function lightLeaves(tree: Tree, seed = 12): Tree {
  const rnd = random(seed * 7 + 13);
  const rest = pose(tree.branches, 0, 0, 0, 0, tree.painted);
  const at = tree.leaves.map((leaf) => {
    if (leaf.fixed) return [leaf.fixed.x, leaf.fixed.y];
    const p = rest[leaf.branch];
    return [p.x + (p.tipX - p.x) * leaf.at + leaf.side * Math.cos(p.dir), p.y + (p.tipY - p.y) * leaf.at + leaf.side * Math.sin(p.dir)];
  });
  // The leaves in cells of 4 px, to count neighbours quickly.
  const CELL = 4;
  const cells = new Map<number, number[]>();
  const key = (cx: number, cy: number) => cx * 4096 + cy;
  at.forEach(([x, y], i) => {
    const k = key(Math.floor(x / CELL), Math.floor(y / CELL));
    const list = cells.get(k);
    if (list) list.push(i);
    else cells.set(k, [i]);
  });
  const shades = LEAF.length;
  const covers = tree.leaves.map((leaf, i) => {
    const [x, y] = at[i];
    // What lies over this leaf towards the sun: the leaves in a box up and to the left of it.
    let cover = 0;
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    for (let gx = cx - 3; gx <= cx + 1; gx++) {
      for (let gy = cy - 3; gy <= cy; gy++) {
        const list = cells.get(key(gx, gy));
        if (!list) continue;
        for (const j of list) {
          if (j === i) continue;
          const dx = at[j][0] - x;
          const dy = at[j][1] - y;
          if (dx < -10 || dx > 3 || dy < -10 || dy > 1) continue;
          // Straight above counts most; far to the side least.
          cover += 1 - Math.max(Math.abs(dx + 3), Math.abs(dy + 4)) / 12;
        }
      }
    }
    return cover;
  });
  // A leaf's exposure is its rank among all: however dense the crown, the covered two thirds
  // are dark, the next quarter mid, and only the freest few are light (owner: "er muss dunkler,
  // und quasi schattiger sein").
  const order = covers.map((c, i) => i).sort((i, j) => covers[j] - covers[i]);
  const n = Math.max(1, order.length - 1);
  // The light comes from above and fades on the way down through the crown (owner: "weiter
  // unten soll kein Licht mehr ankommen"): full in the top third of the leaves, gone in the
  // lowest fifth.
  const top = Math.min(...at.map(([, y]) => y));
  const bottom = Math.max(...at.map(([, y]) => y));
  order.forEach((i, rank) => {
    const height = (bottom - at[i][1]) / Math.max(1, bottom - top);
    const daylight = Math.max(0, Math.min(1, (height - 0.2) / 0.5));
    const exposure = (rank / n) * daylight;
    // Dark to mid for most, the light greens for the free ones, the yellows for a few of those.
    let shade = Math.min(8, Math.floor(exposure ** 2.4 * 7.6 + rnd() * 1.1));
    if (exposure > 0.96 && rnd() < 0.3) shade = Math.min(shades - 1, 9 + Math.floor(rnd() * 2));
    if (shade <= 4 && rnd() < 0.3) shade = COOL;
    tree.leaves[i].shade = shade;
  });
  return tree;
}

/** The wind's pull on the tree this moment, the same sway and gust as the glade's crowns. */
export function windAt(x: number, y: number, t: number, wind: number): { sway: number; g: number } {
  const g = gust(x, y, t, wind) * wind;
  const phase = (x * 0.94 + y * 0.34) * 0.0055;
  const sway = Math.sin(t * 0.45 - phase) * (0.35 + 0.35 * wind);
  return { sway, g };
}

/** Poses every branch for the moment `t` with the foot at (x, y): the trunk from the ground up,
    each child from its parent's posed base and direction, so a bend at the trunk carries the whole
    crown and a bend at a twig carries only its leaves. */
export function pose(branches: Branch[], x: number, y: number, t: number, wind: number, painted?: Painted): Posed[] {
  const { sway, g } = windAt(x, y, t, wind);
  const out: Posed[] = new Array(branches.length);
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    let baseX = x;
    let baseY = y;
    let parentDir = 0;
    if (b.base) {
      // On a tip of the painted tree: it rides on the picture's band.
      baseX = x + b.base.x + (painted ? bandShift(b.base.y + painted.foot.y, painted.h, sway, g, t) : 0);
      baseY = y + b.base.y;
    } else if (b.parent >= 0) {
      const p = out[b.parent];
      baseX = p.x + (p.tipX - p.x) * b.at;
      baseY = p.y + (p.tipY - p.y) * b.at;
      parentDir = p.dir;
    }
    // The gust trembles the twigs, quicker the thinner they are; the slow sway bends everything.
    const tremble = g > 0.2 ? Math.sin(t * (2.6 + b.depth * 0.9) + b.phase) * 0.4 * g : 0;
    const bend = (sway * 0.8 + g * 1.4 + tremble) * b.flex;
    const dir = parentDir + b.angle + bend;
    out[i] = { x: baseX, y: baseY, dir, tipX: baseX + Math.sin(dir) * b.length, tipY: baseY - Math.cos(dir) * b.length };
  }
  return out;
}

/** A band of the painted tree is this many rows; the bands above the trunk shift by whole
    pixels, more the higher, as the glade's crowns do (lib/flora.ts). */
const BAND = 6;

/** How far the painted tree's row `row` (0 its top) is shifted this moment. */
export function bandShift(row: number, h: number, sway: number, g: number, t: number): number {
  const band = Math.floor(row / BAND) * BAND;
  const height = (h - band) / h;
  if (height < 0.36) return 0;
  const amount = ((height - 0.36) / 0.64) ** 2 * 4;
  const rustle = g > 0.2 ? Math.sin(t * 2.6 + band * 0.5) * 0.4 * g : 0;
  return Math.round((sway + g * 1.4 + rustle) * amount);
}

/** Draws the painted bare tree with its foot at (x, y), the trunk still and the crown in bands. */
function drawPainted(c: CanvasRenderingContext2D, p: Painted, x: number, y: number, sway: number, g: number, t: number) {
  const left = x - p.foot.x;
  const top = y - p.foot.y;
  for (let row = 0; row < p.h; row += BAND) {
    const rows = Math.min(BAND, p.h - row);
    c.drawImage(p.image, 0, row, p.w, rows, left + bandShift(row, p.h, sway, g, t), top + row, p.w, rows);
  }
}

/** The rig on a painted bare tree: twigs grown out of every so-manyeth tip of the picture, in the
    tip's direction, and leaves on them and along the picture's own thin branches. */
export function paintedTree(painted: Painted, seed = 12, every = 3, scale = 1): Tree {
  const rnd = random(seed * 17 + 1);
  const branches: Branch[] = [];
  const grow = (parent: number) => {
    const p = branches[parent];
    if (p.depth >= 6 || p.length < 4) return;
    const arms = rnd() < 0.4 ? 3 : 2;
    const spread = 0.45 + rnd() * 0.3;
    for (let i = 0; i < arms; i++) {
      const centre = (i - (arms - 1) / 2) * (arms === 2 ? 2 : 1);
      const angle = centre * spread * (0.8 + rnd() * 0.4) + (rnd() - 0.5) * 0.2 - (p.angle * 0.1);
      const length = Math.round(p.length * (0.6 + rnd() * 0.2));
      if (length < 2) continue;
      const depth = p.depth + 1;
      branches.push({ parent, at: 1, angle, length, width: 1, depth, flex: 0.0035 * (1 + depth) ** 1.6, phase: rnd() * 6.28 });
      grow(branches.length - 1);
    }
  };
  painted.tips.forEach((tip, i) => {
    if (i % every !== 0) return;
    const base = { x: tip.x - painted.foot.x, y: tip.y - painted.foot.y };
    branches.push({ parent: -1, at: 0, angle: tip.dir + (rnd() - 0.5) * 0.3, length: Math.max(2, Math.round((7 + rnd() * 7) * scale)), width: 1, depth: 3, flex: 0.0035 * 4 ** 1.6, phase: rnd() * 6.28, base });
    grow(branches.length - 1);
  });
  const tree = leafTree({ branches, leaves: [], height: painted.h, painted }, seed, 0.9);
  // Leaves on the picture's own thin branches, so the crown is in leaf down to the limbs.
  for (const [tx, ty] of painted.twigs) {
    const n = 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      const spread = 2 + 3 * scale;
      const fixed = { x: tx - painted.foot.x + Math.round((rnd() - 0.5) * spread), y: ty - painted.foot.y + Math.round((rnd() - 0.5) * spread) };
      tree.leaves.push({ branch: -1, at: 0, side: 0, shape: Math.floor(rnd() * SHAPES.length), shade: 0, back: rnd() < 0.45, phase: rnd() * 6.28, fixed });
    }
  }
  return lightLeaves(tree, seed);
}

/** A painted bare tree's picture in the crown's shadow (owner, 2026-10-25: "dunkler, und quasi
    schattiger"): the limbs up in the leaves darkest and a little cool, the foot and the roots in
    more light. `tone` may change each colour first (the study grades them as the shader grades
    the glade; in the game the shader does that itself). */
export function shadedPicture(source: CanvasImageSource, sx: number, sy: number, w: number, h: number, tone?: (rgb: [number, number, number]) => [number, number, number]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d", { willReadFrequently: true })!;
  c.drawImage(source, sx, sy, w, h, 0, 0, w, h);
  const pixels = c.getImageData(0, 0, w, h);
  const d = pixels.data;
  const seen = new Map<number, [number, number, number]>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const f = (i >> 2) / w / h;
    const dark = 0.42 + 0.3 * f * f;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let out = seen.get(key);
    if (!out) {
      out = tone ? tone([d[i], d[i + 1], d[i + 2]]) : [d[i], d[i + 1], d[i + 2]];
      seen.set(key, out);
    }
    d[i] = Math.round(out[0] * dark * 0.97);
    d[i + 1] = Math.round(out[1] * dark);
    d[i + 2] = Math.round(Math.min(255, out[2] * dark * 1.08));
  }
  c.putImageData(pixels, 0, 0);
  return canvas;
}

/** A tree as it stands still, drawn once onto a canvas of its own with room for the leaves
    round the picture: the glade draws these and sways them in bands (lib/flora.ts). */
export interface Rendered {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  /** The foot inside the canvas; its y is the bottom row. */
  foot: { x: number; y: number };
}

export function renderTree(tree: Tree, margin = 14): Rendered {
  const p = tree.painted!;
  const w = p.w + margin * 2;
  const h = p.h + margin;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d")!;
  const foot = { x: margin + p.foot.x, y: h - 1 };
  drawTree(c, tree, foot.x, foot.y, 0, 0);
  return { canvas, w, h, foot };
}

/** A pixel line of a whole width from (x0, y0) to (x1, y1): runs of `w0` to `w1` pixels across the
    line's direction, one per step along it, so a steep branch is rows and a flat one columns. */
function line(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steep = Math.abs(dy) >= Math.abs(dx);
  const steps = Math.max(1, Math.round(Math.abs(steep ? dy : dx)));
  for (let s = 0; s <= steps; s++) {
    const u = s / steps;
    const w = Math.max(1, Math.round(w0 + (w1 - w0) * u));
    const px = Math.round(x0 + dx * u);
    const py = Math.round(y0 + dy * u);
    if (steep) c.fillRect(px - (w >> 1), py, w, 1);
    else c.fillRect(px, py - (w >> 1), 1, w);
  }
}

/** The bark's grooves on a thick branch: short dark strokes along it, and a lit fleck here and
    there, at places that are the same every frame (a hash of the branch and the step). */
function grooves(c: CanvasRenderingContext2D, i: number, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))));
  const steep = Math.abs(dy) >= Math.abs(dx);
  for (let s = 0; s < steps; s++) {
    const u = s / steps;
    const w = w0 + (w1 - w0) * u;
    const h = ((i * 7919 + s * 104729) % 1000) / 1000;
    if (h > 0.42) continue;
    const across = Math.round((h / 0.42 - 0.5) * (w - 1.5));
    const px = Math.round(x0 + dx * u) + (steep ? across : 0);
    const py = Math.round(y0 + dy * u) + (steep ? 0 : across);
    c.fillStyle = h < 0.3 ? barkInk[1] : barkInk[4];
    if (steep) c.fillRect(px, py, 1, 2);
    else c.fillRect(px, py, 2, 1);
  }
}

/** Draws the posed branches: the roots first, then the trunk and its forks, each a tapered pixel
    line with its lit edge on the left and its shade on the right where it is wide enough, the
    thick ones grooved. */
function drawBranches(c: CanvasRenderingContext2D, tree: Tree, posed: Posed[]) {
  const { branches } = tree;
  const order = [...branches.keys()].sort((a, b) => Number(branches[b].root ?? false) - Number(branches[a].root ?? false));
  for (const i of order) {
    const b = branches[i];
    const p = posed[i];
    const w1 = Math.max(1, Math.round(b.width * (b.root ? 0.3 : 0.64)));
    c.fillStyle = barkInk[b.width <= 1 ? 2 : 3];
    line(c, p.x, p.y, p.tipX, p.tipY, b.width, w1);
    if (b.depth === 0) {
      // The trunk flares at the foot, where the roots leave it: a short wedge from half as wide
      // again down to the trunk's own width a little way up.
      const u = Math.min(0.16, 12 / b.length);
      line(c, p.x, p.y, p.x + (p.tipX - p.x) * u, p.y + (p.tipY - p.y) * u, Math.round(b.width * 1.6), b.width);
    }
    if (b.width >= 3) {
      // The light from the upper left along the left edge, the shade along the right.
      const off = (b.width >> 1);
      c.fillStyle = barkInk[4];
      line(c, p.x - off, p.y, p.tipX - (w1 >> 1), p.tipY, 1, 1);
      c.fillStyle = barkInk[1];
      line(c, p.x + off - (b.width % 2 === 0 ? 1 : 0), p.y, p.tipX + (w1 >> 1) - (w1 % 2 === 0 ? 1 : 0), p.tipY, 1, 1);
      if (b.width >= 2 && !b.root) {
        c.fillStyle = barkInk[0];
        line(c, p.x + off - (b.width % 2 === 0 ? 1 : 0) + 1, p.y, p.tipX + (w1 >> 1) - (w1 % 2 === 0 ? 1 : 0), p.tipY, 1, 1);
      }
    }
    if (b.width >= 4) grooves(c, i, p.x, p.y, p.tipX, p.tipY, b.width, w1);
  }
}

/** Draws the leaves of one layer (behind or before the branches). In a gust a leaf shifts a pixel
    and turns its lighter side for a frame. */
function drawLeaves(c: CanvasRenderingContext2D, tree: Tree, posed: Posed[], back: boolean, t: number, g: number, sway: number, footX: number, footY: number) {
  const painted = tree.painted;
  for (const leaf of tree.leaves) {
    if (leaf.back !== back) continue;
    let x: number;
    let y: number;
    if (leaf.fixed) {
      x = footX + leaf.fixed.x + (painted ? bandShift(leaf.fixed.y + painted.foot.y, painted.h, sway, g, t) : 0);
      y = footY + leaf.fixed.y;
    } else {
      const p = posed[leaf.branch];
      const sx = Math.cos(p.dir);
      const sy = Math.sin(p.dir);
      x = p.x + (p.tipX - p.x) * leaf.at + leaf.side * sx;
      y = p.y + (p.tipY - p.y) * leaf.at + leaf.side * sy;
    }
    let shade = leaf.shade;
    if (g > 0.2) {
      const flutter = Math.sin(t * 7 + leaf.phase);
      x += flutter * g * 1.2;
      if (flutter > 0.75 && g > 0.35) shade = Math.min(leafInk.length - 1, shade + 1);
    }
    if (back) shade = Math.max(0, shade - 2);
    c.fillStyle = leafInk[shade];
    const px = Math.round(x);
    const py = Math.round(y);
    for (const [dx, dy, w] of SHAPES[leaf.shape]) c.fillRect(px + dx, py + dy, w, 1);
  }
}

/** Draws the tree with its foot at (x, y) for the moment `t` in the wind `wind` (0 calm .. 1): the
    leaves behind, the branches, the leaves before. */
export function drawTree(c: CanvasRenderingContext2D, tree: Tree, x: number, y: number, t: number, wind: number) {
  const posed = pose(tree.branches, x, y, t, wind, tree.painted);
  const { sway, g } = windAt(x, y, t, wind);
  drawLeaves(c, tree, posed, true, t, g, sway, x, y);
  if (tree.painted) drawPainted(c, tree.painted, x, y, sway, g, t);
  drawBranches(c, tree, posed);
  drawLeaves(c, tree, posed, false, t, g, sway, x, y);
}
