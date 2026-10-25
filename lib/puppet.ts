/* The wanderer as a cut-out puppet that ends up a pixel sprite.

   The pieces live on one atlas (public/assets/hero-parts.png), each view's pieces with their
   joints and where they sit on their parent (public/assets/hero-rig.json, made by
   tools/art/parts.py). Every pose is drawn at `scale` times the sprite's size, the pieces turned
   about their joints, then pressed into pixels: each scale x scale block takes the palette colour
   that covers most of it (never a mix, so the colour areas stay clean), is kept or dropped whole
   (no soft edge), and the silhouette's edge takes a darker shade of its own colour, like the
   painted glade's edges, not a black line.

   The poses are made here, from a few numbers (motion): the walk's phase and how much it walks,
   the time for breathing and idling, the wind, the lantern's swing. They are sampled POSE_FPS
   times a second, like frames drawn by hand; between them the sprite stands still. The left view
   is the side view mirrored. */

export type ViewName = "front" | "side" | "back";

export interface RigPart {
  name: string;
  rect: [number, number, number, number];
  joint: [number, number];
  z: number;
  parent?: string;
  at?: [number, number];
}

export interface Rig {
  scale: number;
  height: number;
  /** How much darker the silhouette's edge is; the palette holds those shades too. */
  edge: number;
  /** The atlas's colours: every pixel of the atlas snaps to the nearest of them. */
  palette: number[][];
  /** The colours the figure is shown in, one for each of `palette`; the palette itself when left out. */
  shown?: number[][];
  views: Record<ViewName, { hip: number; parts: RigPart[] }>;
}

/** How a piece is turned and moved off its rest place: radians, big pixels, factors. */
export interface PartPose {
  angle?: number;
  dx?: number;
  dy?: number;
  sx?: number;
  sy?: number;
  /** The angle is the piece's own against gravity, whatever its parents do (the lantern). */
  hang?: boolean;
  /** A shear: the piece's foot pushed sideways by this much of its height (cloth that lags). */
  skew?: number;
}

export interface Motion {
  /** The walk cycle, radians: one turn is two steps. */
  phase: number;
  /** 0 standing, 1 walking; in between while starting and stopping. */
  walk: number;
  /** Seconds, for breath and idle. */
  t: number;
  /** -1..1, the wind where the wanderer stands. */
  wind: number;
  /** The lantern's swing, radians off the vertical. */
  swing: number;
  /** The cloak (lib/puppet.ts Cloth): its swing off the body, radians, and how far its hem lags,
      -1..1. */
  cloak: number;
  hem: number;
}

export const POSE_FPS = 15;
/** The sprite box on screen, and where the feet stand in it. */
export const SPRITE_W = 48;
export const SPRITE_H = 40;
export const FEET_X = 24;
export const FEET_Y = 37;

const DEG = Math.PI / 180;

/** The pose for a view: the root (`torso`, turning about the hips) and each piece by name. `hip`
    is how high the hips stand, in big pixels. A grown-up's walk: a long, easy stride, the hips
    dropping a little as the legs part, the head steady, hardly any rocking. */
export function poseOf(view: ViewName, m: Motion, hip = 60): Record<string, PartPose> {
  const s = Math.sin(m.phase);
  const w = m.walk;
  const breath = Math.sin(m.t * 1.8);
  const idle = 1 - w;
  if (view === "side") {
    const legs = 28 * DEG * w;
    const drop = hip * (1 - Math.cos(legs * Math.abs(s)));
    return {
      torso: { angle: 2.5 * DEG * w + Math.sin(m.t * 0.6) * 0.6 * DEG * idle, dy: drop, sy: 1 + 0.012 * breath },
      head: { angle: (-1 * w + Math.sin(2 * m.phase) * 0.5 * w + Math.sin(m.t * 0.7) * 1.2 * idle) * DEG },
      legNear: { angle: -s * legs },
      legFar: { angle: s * legs },
      armNear: { angle: s * 14 * DEG * w + Math.sin(m.t * 1.1) * 1.2 * DEG * idle },
      armFar: { angle: -s * 16 * DEG * w - Math.sin(m.t * 1.1 + 1) * 1.5 * DEG * idle },
      // The cloak's back flap: hangs off the body a little, swings as cloth (Cloth: it lags the
      // walk and takes the wind), flutters at its hem in a gust, and its foot lags its top.
      flap: {
        angle: (4 + 6 * w) * DEG + m.cloak + (Math.sin(m.t * 9.3) * 1.5 + Math.sin(m.t * 14.7) * 0.8) * DEG * Math.abs(m.wind) * (0.6 + w),
        sx: 1 + 0.04 * w + 0.05 * Math.abs(m.hem),
        skew: m.hem * 0.35 + Math.sin(m.t * 11.0) * 0.04 * Math.abs(m.wind),
      },
      satchel: { angle: (Math.sin(m.phase + 0.6) * 4 * w) * DEG + m.cloak * 0.4 },
      lantern: { angle: m.swing, hang: true },
    };
  }
  // Front and back: a leg swings through foreshortened (seen end-on it looks shorter as it comes
  // forward or goes back) and a little across, off the ground only briefly and low; the body
  // sways a pixel to the side and rises hardly at all (owner, 2026-10-24: lifting each leg four
  // pixels straight up and bouncing the body as much looked like "stomping or pumping").
  const left = Math.max(0, s);
  const right = Math.max(0, -s);
  const lift = 1.6 * w;
  return {
    // The cloak hangs from the shoulders as the torso piece: its foot lags sideways with the walk
    // and the wind (a shear), and its hem widens a little on each step.
    torso: {
      angle: s * 0.6 * DEG * w + Math.sin(m.t * 0.6) * 0.5 * DEG * idle,
      dx: s * 0.6 * w,
      dy: -Math.abs(Math.sin(2 * m.phase)) * 0.8 * w,
      sy: 1 + 0.012 * breath,
      sx: 1 + 0.03 * Math.abs(s) * w,
      skew: m.hem * 0.1 + m.wind * 0.05 + Math.sin(m.t * 9.3) * 0.012 * Math.abs(m.wind),
    },
    head: { angle: (-s * 0.5 * w + Math.sin(m.t * 0.7) * 1.2 * idle) * DEG },
    legL: { dy: -left * left * lift, sy: 1 - 0.1 * left * w },
    legR: { dy: -right * right * lift, sy: 1 - 0.1 * right * w },
    armL: { angle: s * 4 * DEG * w + Math.sin(m.t * 1.1) * 1.2 * DEG * idle, sy: 1 + 0.04 * s * w },
    armR: { angle: -s * 4 * DEG * w - Math.sin(m.t * 1.1 + 1) * 1.2 * DEG * idle, sy: 1 - 0.04 * s * w },
    satchel: { angle: (s * 3 * w + m.wind * 2) * DEG + m.cloak * 0.3 },
    lantern: { angle: m.swing, hang: true },
  };
}

/** The cloak as cloth: it hangs off the back, lags the body when the walk starts and stops, is
    pushed by the wind, and settles in a second or two. `angle` is its swing off its rest
    (radians, positive is out behind), `hem` how far its foot lags its top (-1..1). */
export class Cloth {
  angle = 0;
  hem = 0;
  private speed = 0;
  private hemSpeed = 0;
  private lastWalk = 0;

  /** `walk` is how much the figure walks (0..1), `wind` the wind at it (-1..1, with the figure's
      facing), both this frame. */
  step(walk: number, wind: number, dt: number) {
    if (dt <= 0) return;
    const push = (walk - this.lastWalk) / dt;
    this.lastWalk = walk;
    // Light cloth: it blows out behind in a walk and in wind, swings back when the walk stops.
    const rest = 0.18 * walk + 0.22 * wind;
    const accel = -40 * (this.angle - rest) - 7 * this.speed + push * 0.9;
    this.speed += Math.max(-30, Math.min(30, accel)) * dt;
    this.angle = Math.max(-0.5, Math.min(0.9, this.angle + this.speed * dt));
    // The hem follows the swing a beat later.
    const hemAccel = -60 * (this.hem - this.angle * 1.4) - 9 * this.hemSpeed;
    this.hemSpeed += hemAccel * dt;
    this.hem = Math.max(-1, Math.min(1, this.hem + this.hemSpeed * dt));
  }
}

export type Matrix = [number, number, number, number, number, number];

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
const rotate = (a: number): Matrix => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
const scaleBy = (x: number, y: number): Matrix => [x, 0, 0, y, 0, 0];

export function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export interface Placed {
  part: RigPart;
  matrix: Matrix;
}

/** Where every piece goes for a pose, in the big drawing (feet at FEET_X, FEET_Y times scale),
    in drawing order. Mirrored turns the whole figure about the feet (the left view). */
export function layout(rig: Rig, view: ViewName, pose: Record<string, PartPose>, mirrored = false): Placed[] {
  const k = rig.scale;
  const v = rig.views[view];
  const byName = new Map(v.parts.map((p) => [p.name, p]));
  const matrices = new Map<string, Matrix>();
  const angles = new Map<string, number>();
  const feet: Matrix = mirrored ? [-1, 0, 0, 1, 2 * FEET_X * k, 0] : [1, 0, 0, 1, 0, 0];

  const place = (part: RigPart): Matrix => {
    const known = matrices.get(part.name);
    if (known) return known;
    const p = pose[part.name] ?? {};
    let base: Matrix;
    let parentAngle = 0;
    if (!part.parent) base = multiply(feet, translate(FEET_X * k + (p.dx ?? 0), FEET_Y * k - v.hip + (p.dy ?? 0)));
    else {
      const parent = byName.get(part.parent)!;
      base = multiply(place(parent), translate(part.at![0] + (p.dx ?? 0), part.at![1] + (p.dy ?? 0)));
      parentAngle = angles.get(parent.name)!;
    }
    const own = p.hang ? (p.angle ?? 0) - parentAngle : (p.angle ?? 0);
    angles.set(part.name, parentAngle + own);
    const shear: Matrix = [1, 0, p.skew ?? 0, 1, 0, 0];
    const m = multiply(multiply(multiply(multiply(base, rotate(own)), shear), scaleBy(p.sx ?? 1, p.sy ?? 1)), translate(-part.joint[0], -part.joint[1]));
    matrices.set(part.name, m);
    return m;
  };
  return v.parts.map((part) => ({ part, matrix: place(part) }));
}

/** The middle of a placed piece, in the big drawing. */
export function middleOf(placed: Placed): [number, number] {
  const [, , w, h] = placed.part.rect;
  return apply(placed.matrix, w / 2, h / 2);
}

/** Nearest palette colour for every colour cut to 5 bits a channel. */
export function paletteTable(palette: number[][]): Uint8Array {
  const table = new Uint8Array(32768);
  for (let i = 0; i < 32768; i++) {
    const r = ((i >> 10) & 31) * 8 + 4;
    const g = ((i >> 5) & 31) * 8 + 4;
    const b = (i & 31) * 8 + 4;
    let best = 0;
    let bestD = Infinity;
    palette.forEach(([pr, pg, pb], j) => {
      // Weighted a little towards green, as the eye is.
      const d = 2 * (r - pr) ** 2 + 4 * (g - pg) ** 2 + 3 * (b - pb) ** 2;
      if (d < bestD) [bestD, best] = [d, j];
    });
    table[i] = best;
  }
  return table;
}

const rgb15 = (r: number, g: number, b: number) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

/** The pixel filter: `big` (k times the size) into `small`, block by block. Each block takes the
    palette colour most of its covered pixels snap to and is kept when half of it is covered; a
    kept pixel beside an empty one takes the darker shade (`edge`) of its colour. `shown` is what
    each palette colour comes out as (the atlas's colours by default). */
export function pixelate(big: Uint8ClampedArray, bigW: number, small: Uint8ClampedArray, smallW: number, smallH: number, k: number, palette: number[][], table: Uint8Array, edge: number, shown: number[][] = palette) {
  const area = k * k;
  const counts = new Uint16Array(palette.length);
  const chosen = new Int16Array(smallW * smallH).fill(-1);
  for (let y = 0; y < smallH; y++)
    for (let x = 0; x < smallW; x++) {
      counts.fill(0);
      let covered = 0;
      for (let j = 0; j < k; j++) {
        let i = ((y * k + j) * bigW + x * k) * 4;
        for (let n = 0; n < k; n++, i += 4) {
          if (big[i + 3] < 128) continue;
          covered++;
          counts[table[rgb15(big[i], big[i + 1], big[i + 2])]]++;
        }
      }
      if (covered * 2 < area) continue;
      let best = 0;
      for (let c = 1; c < counts.length; c++) if (counts[c] > counts[best]) best = c;
      chosen[y * smallW + x] = best;
    }
  const kept = (x: number, y: number) => x >= 0 && y >= 0 && x < smallW && y < smallH && chosen[y * smallW + x] >= 0;
  for (let y = 0; y < smallH; y++)
    for (let x = 0; x < smallW; x++) {
      const o = (y * smallW + x) * 4;
      const index = chosen[y * smallW + x];
      if (index < 0) {
        small[o + 3] = 0;
        continue;
      }
      let c = shown[index];
      if (!(kept(x - 1, y) && kept(x + 1, y) && kept(x, y - 1) && kept(x, y + 1))) {
        const own = palette[index];
        c = shown[table[rgb15(own[0] * edge, own[1] * edge, own[2] * edge)]];
      }
      small[o] = c[0];
      small[o + 1] = c[1];
      small[o + 2] = c[2];
      small[o + 3] = 255;
    }
}

export class Puppet {
  /** The sprite, SPRITE_W x SPRITE_H, feet at FEET_X, FEET_Y. */
  readonly sprite: HTMLCanvasElement;
  /** Where the lantern's glass is, in sprite pixels. */
  lantern: [number, number] = [FEET_X, FEET_Y - 12];
  private readonly big: HTMLCanvasElement;
  private readonly bigContext: CanvasRenderingContext2D;
  private readonly spriteContext: CanvasRenderingContext2D;
  private readonly pixels: ImageData;
  private readonly table: Uint8Array;
  private drawn = "";

  constructor(
    private readonly atlas: HTMLImageElement,
    private readonly rig: Rig,
  ) {
    const k = rig.scale;
    this.big = document.createElement("canvas");
    this.big.width = SPRITE_W * k;
    this.big.height = SPRITE_H * k;
    this.bigContext = this.big.getContext("2d", { willReadFrequently: true })!;
    this.sprite = document.createElement("canvas");
    this.sprite.width = SPRITE_W;
    this.sprite.height = SPRITE_H;
    this.spriteContext = this.sprite.getContext("2d")!;
    this.pixels = this.spriteContext.createImageData(SPRITE_W, SPRITE_H);
    this.table = paletteTable(rig.palette);
  }

  /** Draws the pose of this frame of POSE_FPS; does nothing while the frame is the same. */
  update(view: ViewName, mirrored: boolean, motion: Motion) {
    const frame = Math.floor(motion.t * POSE_FPS);
    const key = `${view}${mirrored}${frame}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const k = this.rig.scale;
    const c = this.bigContext;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.big.width, this.big.height);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    const placed = layout(this.rig, view, poseOf(view, { ...motion, t: frame / POSE_FPS }, this.rig.views[view].hip), mirrored);
    for (const { part, matrix } of placed) {
      const [x, y, w, h] = part.rect;
      c.setTransform(...matrix);
      c.drawImage(this.atlas, x, y, w, h, 0, 0, w, h);
      if (part.name === "lantern") {
        const [lx, ly] = apply(matrix, w / 2, h * 0.62);
        this.lantern = [lx / k, ly / k];
      }
    }
    const big = c.getImageData(0, 0, this.big.width, this.big.height).data;
    pixelate(big, this.big.width, this.pixels.data, SPRITE_W, SPRITE_H, k, this.rig.palette, this.table, this.rig.edge, this.rig.shown);
    this.spriteContext.putImageData(this.pixels, 0, 0);
  }
}

/** The lantern on its handle: a pendulum pushed by the hand's sway and the wind. */
export class Pendulum {
  angle = 0;
  speed = 0;
  private last: number | null = null;
  private velocity = 0;

  /** `hand` is where the hand is across the screen, in scene pixels. */
  step(hand: number, wind: number, dt: number) {
    if (dt <= 0) return;
    if (this.last === null) this.last = hand;
    const velocity = (hand - this.last) / dt;
    const push = (velocity - this.velocity) / dt;
    this.last = hand;
    this.velocity = velocity;
    // A small lantern on a short handle: about a swing and a half a second, dying in a few.
    const accel = -80 * Math.sin(this.angle) - 2.6 * this.speed - push * 0.045 * Math.cos(this.angle) + wind * 1.5;
    this.speed += Math.max(-60, Math.min(60, accel)) * dt;
    this.angle = Math.max(-0.9, Math.min(0.9, this.angle + this.speed * dt));
  }
}
