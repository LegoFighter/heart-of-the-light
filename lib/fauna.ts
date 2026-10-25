/* The glade's animals (owner, 2026-10-24: "mehr Tiere, vllt Rudel, auch die nach oben laufen, und
   nicht einfach so verschwinden sondern aus dem Bild laufen, in den Fluss laufen"):
   - a herd of deer that grazes by the stream, looks up when the wanderer comes near, and flees
     together, off the picture or through the stream and up the west bank, wading with a splash,
     and comes back a while later from the edge it left by;
   - rabbits that hop about the meadow's edge and hide behind a bush;
   - a fox that trots along the wood's edge at dusk and at dawn;
   - a heron that stands at the pool at dawn and flies off when the wanderer comes;
   - a squirrel on a trunk, up when the wanderer comes, down to forage after;
   - an owl in a conifer at night, its eyes on us;
   - ducks on the pool in the rain.
   Every animal is an actor with its feet on a point; the view sorts them by that point among the
   plants, so a deer goes behind a trunk and a rabbit behind a bush. Animals walk where
   `animalWalkable` allows (the meadow, the water, the west bank) and go round trunks and rocks. */

import { animalWalkable, H, W, inside, WADE } from "../game/world";
import { drawDeer, drawDeerAlong, paintDeer, type DeerGait, type DeerPose } from "./deer";

/** The animals' colours in the glade's: muted a little and snapped to the painting's palette
    (set by `Fauna` from the art's colours), each hex once. A yellow (an eye, a bill) keeps its
    own, as the lantern does. */
let palette: number[][] = [];
const fitted = new Map<string, string>();
export function ink(hex: string): string {
  const known = fitted.get(hex);
  if (known) return known;
  if (!palette.length) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  let out = hex;
  if (!(r > 200 && g > 150 && b < 110)) {
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    const muted = [r, g, b].map((v) => (v * 0.78 + l * 0.22) * 0.9);
    // A warm colour (a deer's brown, a fox's red) snaps only to a warm one of the painting's:
    // the nearest by distance alone was an olive, and the deer came out green (owner,
    // 2026-10-25: "die Deers sind grün").
    // Brown is red clearly over green over blue; an olive (red a hair over green) is not.
    const brown = (k: number[]) => k[0] > k[1] * 1.12 && k[1] > k[2] * 1.1;
    const warm = brown([r, g, b]);
    const candidates = warm ? palette.filter(brown) : palette;
    let best = candidates[0] ?? palette[0];
    let bestD = Infinity;
    for (const k of candidates) {
      const d = (k[0] - muted[0]) ** 2 + (k[1] - muted[1]) ** 2 + (k[2] - muted[2]) ** 2;
      if (d < bestD) [best, bestD] = [k, d];
    }
    out = `rgb(${best[0]}, ${best[1]}, ${best[2]})`;
  }
  fitted.set(hex, out);
  return out;
}
import type { FloraData, Placed } from "./flora";

export interface Actor {
  /** The feet, in scene pixels: what it is sorted by. */
  y: number;
  draw: (c: CanvasRenderingContext2D) => void;
}

export interface Moment {
  t: number;
  dt: number;
  heroX: number;
  heroY: number;
  hour: number;
  night: number;
  rain: number;
  cover: number;
}

/** A hoof's or a paw's mark in the snow, for the view's prints. */
export interface Track {
  x: number;
  y: number;
}

interface Mover {
  x: number;
  y: number;
  /** The way it last moved, for the drawing. */
  vx: number;
  vy: number;
}

/** Moves `m` towards (tx, ty) at `speed`, going round what is in the way: the straight way
    first, then ever wider to either side. Returns whether it moved. */
function step(m: Mover, tx: number, ty: number, speed: number, dt: number): boolean {
  const dx = tx - m.x;
  const dy = ty - m.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) return false;
  const reach = Math.min(dist, speed * dt);
  const base = Math.atan2(dy, dx);
  for (const turn of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) {
    const a = base + turn;
    const nx = m.x + Math.cos(a) * reach;
    const ny = m.y + Math.sin(a) * reach;
    // Look a few pixels ahead as well, so a trunk is seen before the nose is in it.
    if (animalWalkable(nx, ny) && animalWalkable(m.x + Math.cos(a) * (reach + 4), m.y + Math.sin(a) * (reach + 4))) {
      m.vx = nx - m.x;
      m.vy = ny - m.y;
      m.x = nx;
      m.y = ny;
      return true;
    }
  }
  return false;
}

function off(x: number, y: number): boolean {
  return x < -30 || x > W + 30 || y > H + 30 || y < -30;
}

/* ---------- the herd ---------- */

interface Deer extends Mover {
  /** The place in the herd: the offset from the leader. */
  ox: number;
  oy: number;
  /** The way it faces, radians (0 east, PI/2 south), turned smoothly towards `want`: a turn
      goes through the along-view, so the deer is seen to turn round rather than flip. */
  heading: number;
  want: number;
  /** The view it is drawn in: hysteresis keeps it from flickering at the boundary. */
  along: boolean;
  /** When it last moved: the walk is kept up a moment over a stutter. */
  movedAt: number;
  /** Its temperament (owner, 2026-10-24: "different timing or randomness … otherwise it looks
      mechanical"): how fast it goes against the others, how long it takes to react, how much it
      wanders off its line, and how often it stops a moment on the way. */
  pace: number;
  delay: number;
  wander: number;
  pauses: number;
  /** When it will act on the herd's state (the reaction delay), and until when it pauses. */
  actAt: number;
  pauseUntil: number;
  head: number;
  headDown: boolean;
  nextHead: number;
  phase: number;
  gait: DeerGait;
  tx: number;
  ty: number;
  /** How deep it stands in the water, pixels of leg under the surface, eased so the body does
      not jump at the shore. */
  depth: number;
  /** The water it throws up: droplets in the air that fall back, and foam at the waterline. */
  splash: Splash[];
  /** When it last threw a droplet. */
  splashAt: number;
}

/** A bit of water thrown up by a wading deer (owner, 2026-10-25: the crossing looked floaty and
    wanted splashes): in the air it falls under gravity to `line`, the waterline it came from,
    and turns to foam there, which drifts with the stream a moment and goes. */
interface Splash {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The waterline it falls back to (screen y). */
  line: number;
  foam: boolean;
  born: number;
  life: number;
}

/** How deep an animal stands at (x, y) in the water, in pixels, from how far the shore is: at
    the edge its hooves are wet, nine pixels in it is up to the knee, in the middle of the stream
    the legs are gone to the belly. The stream is not deep: a deer wades, it never swims. */
export function wadeDepth(x: number, y: number): number {
  if (!inside(WADE, x, y)) return 0;
  let shore = 0;
  for (let k = 2; k <= 10; k += 2) {
    if (!inside(WADE, x - k, y) || !inside(WADE, x + k, y) || !inside(WADE, x, y - k * 0.5) || !inside(WADE, x, y + k * 0.5)) break;
    shore = k;
  }
  return Math.min(7, 1 + shore * 0.6);
}

/** The way the stream runs here, for the foam to drift with: out of the pool and down the
    picture to the south-east. */
const STREAM_DRIFT: [number, number] = [0.42, 0.9];

type HerdState = "graze" | "alert" | "flee" | "gone" | "return";

/** Where the herd grazes: the meadow by the stream. */
const HERD_AT: [number, number] = [318, 352];

class Herd {
  deer: Deer[] = [];
  state: HerdState = "graze";
  since = 0;
  /** Where the flight goes: an edge point, and the one they come back from. */
  exit: [number, number] = [-60, 352];
  nextStroll = 4;
  private back = 0;

  constructor() {
    const places: [number, number][] = [[0, 0], [22, 6], [-18, 9], [8, -12]];
    for (const [ox, oy] of places)
      this.deer.push({
        x: HERD_AT[0] + ox, y: HERD_AT[1] + oy, vx: -1, vy: 0, ox, oy, heading: Math.PI, want: Math.PI, along: false, movedAt: -9,
        pace: 0.88 + Math.random() * 0.24, delay: 0.1 + Math.random() * 0.5, wander: 0.3 + Math.random() * 0.7, pauses: 0.05 + Math.random() * 0.12, actAt: 0, pauseUntil: 0,
        head: 0, headDown: false, nextHead: 1 + Math.random() * 3, phase: Math.random() * 6.28, gait: "stand", tx: HERD_AT[0] + ox, ty: HERD_AT[1] + oy,
        depth: 0, splash: [], splashAt: 0,
      });
  }

  update(m: Moment, tracks: Track[]) {
    const { t, dt } = m;
    const lead = this.deer[0];
    const toHero = Math.hypot(m.heroX - lead.x, (m.heroY - lead.y) * 1.4);
    switch (this.state) {
      case "graze":
        if (toHero < 130) {
          this.state = "alert";
          this.since = t;
          // Each looks up in its own time: the nearest first, the slow one last.
          for (const d of this.deer) d.actAt = t + d.delay * (0.5 + Math.random());
        } else if (t > this.nextStroll) {
          this.nextStroll = t + 6 + Math.random() * 9;
          lead.tx = HERD_AT[0] + (Math.random() - 0.5) * 50;
          lead.ty = HERD_AT[1] + (Math.random() - 0.5) * 24;
        }
        break;
      case "alert":
        if (toHero < 88 || (t - this.since > 4 && toHero < 130)) this.flee(m);
        else if (toHero > 165) this.state = "graze";
        break;
      case "flee":
        if (this.deer.every((d) => off(d.x, d.y))) {
          this.state = "gone";
          this.since = t;
          this.back = 22 + Math.random() * 25;
        }
        break;
      case "gone":
        if (t - this.since > this.back && toHero > 150) {
          // Back from the edge they left by, at a walk, to the grazing place.
          this.state = "return";
          for (const d of this.deer) {
            d.x = this.exit[0] + d.ox * 0.6;
            d.y = this.exit[1] + d.oy;
            if (d.y > H + 20) d.y = H + 20 + d.oy * 0.3;
          }
        }
        return;
      case "return":
        if (Math.hypot(lead.x - HERD_AT[0], lead.y - HERD_AT[1]) < 4) {
          this.state = "graze";
          this.nextStroll = t + 4;
        } else if (toHero < 110) this.flee(m);
        break;
    }
    const fleeing = this.state === "flee";
    for (const [i, d] of this.deer.entries()) {
      // Not yet reacted to the herd's new state: it goes on as before for a moment.
      if (t < d.actAt) {
        d.head += ((d.headDown ? 1 : 0) - d.head) * Math.min(1, dt * 4);
        continue;
      }
      if (this.state === "alert") {
        d.headDown = false;
        d.want = Math.atan2((m.heroY - d.y) * 0.5, m.heroX - d.x);
      }
      // A pause on the way now and then (not in flight): it stops, looks, goes on.
      if (!fleeing && t > d.pauseUntil && Math.random() < dt * d.pauses * 0.8) d.pauseUntil = t + 0.4 + Math.random() * 1.6;
      const speed = (fleeing ? 62 : 11) * d.pace;
      // Where to: the leader to its own target; the others to their place beside it.
      let tx: number;
      let ty: number;
      if (fleeing) {
        tx = this.exit[0] + d.ox * 0.7;
        ty = this.exit[1] + d.oy * 0.7;
      } else if (this.state === "return" || i === 0) {
        tx = (i === 0 ? (this.state === "return" ? HERD_AT[0] : lead.tx) : HERD_AT[0] + d.ox);
        ty = (i === 0 ? (this.state === "return" ? HERD_AT[1] : lead.ty) : HERD_AT[1] + d.oy);
      } else {
        tx = lead.x + d.ox;
        ty = lead.y + d.oy;
      }
      // Its own line: a slow wander to either side of the straight way, more for some.
      const far0 = Math.hypot(tx - d.x, ty - d.y);
      if (far0 > 12) {
        const side = Math.sin(t * (0.7 + d.wander * 0.5) + i * 1.9) * d.wander * 9;
        const nx = -(ty - d.y) / far0;
        const ny = (tx - d.x) / far0;
        tx += nx * side;
        ty += ny * side;
      }
      const far = Math.hypot(tx - d.x, ty - d.y);
      const wants = fleeing || this.state === "return" || far > (i === 0 ? 1 : 7 + d.wander * 3);
      const wading = inside(WADE, d.x, d.y);
      // The water holds the legs: the deeper, the slower, and the body settles into it over a
      // few frames rather than dropping at the shore.
      const deep = wadeDepth(d.x, d.y);
      d.depth += (deep - d.depth) * Math.min(1, dt * 6);
      const drag = wading ? 0.6 - d.depth * 0.035 : 1;
      let moved = false;
      if (wants && this.state !== "alert" && t > d.pauseUntil) moved = step(d, tx, ty, speed * drag, dt);
      const covered = moved ? Math.hypot(d.vx, d.vy) : 0;
      this.wash(d, m, covered, fleeing);
      if (covered > 0.02) {
        d.gait = fleeing ? "gallop" : "walk";
        d.movedAt = t;
        d.headDown = false;
        d.phase += (covered / ((fleeing ? 22 : 14) * (0.85 + d.pace * 0.15))) * Math.PI * 2;
        // The heading follows the way it goes, with the picture's foreshortening: a step up the
        // picture is a longer step than it looks.
        d.want = Math.atan2(d.vy * 0.6, d.vx);
        if (m.cover > 0.25 && Math.floor(d.phase / Math.PI) !== Math.floor((d.phase - (covered / (fleeing ? 22 : 14)) * Math.PI * 2) / Math.PI)) tracks.push({ x: d.x, y: d.y });
      } else if (t - d.movedAt < 0.25 && d.gait !== "stand") {
        // A stutter at a trunk: the legs keep going a moment, no flicker to standing and back.
        d.phase += dt * (fleeing ? 10 : 4);
      } else {
        d.gait = "stand";
        if (this.state === "graze" && t > d.nextHead) {
          d.headDown = !d.headDown;
          // One head is always up: the sentinel.
          if (d.headDown && this.deer.every((o) => o === d || o.headDown)) d.headDown = false;
          d.nextHead = t + (d.headDown ? 2.5 + Math.random() * 3 : 1 + Math.random() * 2.5);
        }
      }
      d.head += ((d.headDown ? 1 : 0) - d.head) * Math.min(1, dt * 4);
      // The turn: the shortest way round, at most about a half turn a second, so a deer that
      // goes from east to west is seen facing us (or away) between.
      let turn = d.want - d.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      const rate = (fleeing ? 7 : 3.5) * dt * (0.8 + d.pace * 0.3);
      d.heading += Math.abs(turn) < rate ? turn : Math.sign(turn) * rate;
      const s = Math.abs(Math.sin(d.heading));
      if (d.along ? s < 0.6 : s > 0.8) d.along = !d.along;
    }
  }

  /** The water a wading deer stirs up: droplets kicked ahead and to the sides by the legs,
      more and higher in a gallop, that fall back to the waterline and lie there as foam a moment,
      drifting with the stream; a standing deer only sends a fleck or two off its legs. */
  private wash(d: Deer, m: Moment, covered: number, fleeing: boolean) {
    const { t, dt } = m;
    const g = 95;
    for (const s of d.splash) {
      if (s.foam) {
        s.x += STREAM_DRIFT[0] * 7 * dt;
        s.y += STREAM_DRIFT[1] * 7 * dt;
      } else {
        s.vy += g * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.vy > 0 && s.y >= s.line) {
          // Back in the water: a fleck of foam where it landed.
          s.foam = true;
          s.y = s.line;
          s.born = t;
          s.life = 0.5 + Math.random() * 0.6;
        }
      }
    }
    d.splash = d.splash.filter((s) => t - s.born < s.life);
    if (d.depth < 0.5) return;
    // The waterline: the hooves stand on the bed, the body `depth` pixels in.
    const line = d.y - Math.round(d.depth);
    const moving = covered > 0.02;
    const every = moving ? (fleeing ? 0.035 : 0.09) : 0.7;
    if (t - d.splashAt < every) return;
    d.splashAt = t;
    const dirX = covered > 0 ? d.vx / covered : Math.cos(d.heading);
    const dirY = covered > 0 ? d.vy / covered : 0;
    const n = moving ? (fleeing ? 3 : 2) : 1;
    const kick = moving ? (fleeing ? 55 : 30) : 14;
    for (let i = 0; i < n; i++) {
      // Off the front legs, ahead and to the side; a little behind as well.
      const front = Math.random() < 0.7;
      const sx = d.x + dirX * (front ? 5 : -5) + (Math.random() - 0.5) * 6;
      d.splash.push({
        x: sx,
        y: line - 1,
        vx: dirX * kick * (0.3 + Math.random() * 0.5) + (Math.random() - 0.5) * kick * 0.9,
        vy: -(kick * 0.5 + Math.random() * kick * 0.6),
        line: line + (dirY > 0 ? 1 : 0) + Math.round((Math.random() - 0.5) * 2),
        foam: false,
        born: t,
        life: 1.5,
      });
    }
    // The bow wave: foam set down along the waterline round the legs as it goes.
    if (moving && Math.random() < 0.8) {
      d.splash.push({ x: d.x + dirX * 6 + (Math.random() - 0.5) * 10, y: line, vx: 0, vy: 0, line, foam: true, born: t, life: 0.4 + Math.random() * 0.7 });
    }
  }

  private flee(m: Moment) {
    this.state = "flee";
    this.since = m.t;
    const lead = this.deer[0];
    // Away from the wanderer: the edge that lies most in that direction. West means through
    // the stream and up the far bank.
    const ax = lead.x - m.heroX;
    const ay = lead.y - m.heroY;
    const edges: [number, number][] = [[-60, Math.min(H - 40, Math.max(300, lead.y))], [W + 60, lead.y], [lead.x, H + 60]];
    let best = edges[0];
    let score = -Infinity;
    for (const e of edges) {
      const ex = e[0] - lead.x;
      const ey = e[1] - lead.y;
      const s = (ex * ax + ey * ay) / (Math.hypot(ex, ey) + 1);
      if (s > score) {
        score = s;
        best = e;
      }
    }
    this.exit = best;
    // They break one after another, the quickest first, within about half a second.
    for (const d of this.deer) {
      d.headDown = false;
      d.actAt = m.t + d.delay * 0.8 * Math.random();
    }
  }

  actors(m: Moment): Actor[] {
    if (this.state === "gone") return [];
    return this.deer.filter((d) => !off(d.x, d.y)).map((d) => ({
      y: d.y,
      draw: (c) => {
        const x = Math.round(d.x);
        const y = Math.round(d.y);
        const pose: DeerPose = { gait: d.gait, phase: d.phase, head: d.head, t: m.t };
        const depth = Math.round(d.depth);
        // In the water the legs go in under the surface (owner, 2026-10-25: the crossing was
        // floaty: the deer walked on the water): what is below the waterline is not drawn, and
        // the body rides a pixel up and down as the stream pushes against it.
        const bob = depth > 1 && d.gait !== "stand" ? Math.round(Math.sin(m.t * 5 + d.ox) * 0.6) : 0;
        if (depth > 0) {
          c.save();
          c.beginPath();
          c.rect(x - 24, y - 60, 48, 60 - depth);
          c.clip();
        }
        if (d.along) drawDeerAlong(c, x, y + bob, Math.sin(d.heading) > 0, pose);
        else drawDeer(c, x, y + bob, Math.cos(d.heading) < 0 ? -1 : 1, pose);
        if (depth > 0) {
          c.restore();
          // The waterline across the legs: a ragged pale line that wavers, brighter where it
          // goes against the stream.
          const line = y - depth;
          const half = d.along ? 4 : 8;
          c.fillStyle = ink("#d6e8ea");
          for (let i = -half; i <= half; i++) {
            const w = Math.sin(m.t * 6 + (x + i) * 1.3) + Math.sin(m.t * 3.7 + i * 0.6);
            if (w > 0.4) c.fillRect(x + i, line - (w > 1.4 ? 1 : 0), 1, 1);
          }
        }
        // The water thrown up and the foam it leaves.
        for (const s of d.splash) {
          const age = (m.t - s.born) / s.life;
          if (s.foam) {
            if (age > 0.75 && Math.floor(m.t * 10) % 2 === 0) continue;
            c.fillStyle = ink(age < 0.4 ? "#e8f2f4" : "#c9dfe2");
            c.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
          } else {
            c.fillStyle = ink("#eef7f8");
            c.fillRect(Math.round(s.x), Math.round(s.y), 1, s.vy < -20 ? 2 : 1);
          }
        }
      },
    }));
  }
}

/* ---------- rabbits ---------- */

interface Rabbit extends Mover {
  homeX: number;
  homeY: number;
  /** The bush it hides behind: its foot. */
  bushX: number;
  bushY: number;
  state: "about" | "hide" | "hidden";
  tx: number;
  ty: number;
  /** The hop: its start, and whether one is under way. */
  hopAt: number;
  hopping: boolean;
  nextHop: number;
  facing: -1 | 1;
}

class Rabbits {
  rabbits: Rabbit[] = [];

  constructor(flora: FloraData) {
    // Three bushes nearest the meadow's middle are their homes.
    const bushes = flora.placed
      .filter((p) => flora.sprites[p.sprite].kind === "bush")
      .sort((a, b) => Math.hypot(a.x - 560, a.y - 380) - Math.hypot(b.x - 560, b.y - 380))
      .slice(0, 3);
    for (const b of bushes) {
      const hx = b.x + (Math.random() - 0.5) * 30;
      const hy = b.y + 10 + Math.random() * 14;
      this.rabbits.push({ x: hx, y: hy, vx: 1, vy: 0, homeX: hx, homeY: hy, bushX: b.x, bushY: b.y, state: "about", tx: hx, ty: hy, hopAt: 0, hopping: false, nextHop: Math.random() * 3, facing: 1 });
    }
  }

  update(m: Moment, tracks: Track[]) {
    for (const r of this.rabbits) {
      const toHero = Math.hypot(m.heroX - r.x, (m.heroY - r.y) * 1.4);
      if (r.state !== "hidden" && toHero < 70) {
        r.state = "hide";
        r.tx = r.bushX;
        r.ty = r.bushY - 4;
      }
      if (r.state === "hidden" && toHero > 120 && m.t > r.nextHop) r.state = "about";
      if (r.state === "about" && m.t > r.nextHop && !r.hopping) {
        r.nextHop = m.t + 1.5 + Math.random() * 4;
        r.tx = r.homeX + (Math.random() - 0.5) * 50;
        r.ty = r.homeY + (Math.random() - 0.5) * 24;
      }
      const far = Math.hypot(r.tx - r.x, r.ty - r.y);
      if (far > 1 && r.state !== "hidden") {
        if (!r.hopping) {
          r.hopping = true;
          r.hopAt = m.t;
        }
        const speed = r.state === "hide" ? 70 : 34;
        if (step(r, r.tx, r.ty, speed, m.dt) && Math.abs(r.vx) > 0.01) r.facing = r.vx < 0 ? -1 : 1;
        if (m.cover > 0.25 && Math.random() < m.dt * 3) tracks.push({ x: r.x, y: r.y });
      } else {
        if (r.hopping && r.state === "hide") {
          r.state = "hidden";
          r.nextHop = m.t + 8 + Math.random() * 8;
        }
        r.hopping = false;
      }
    }
  }

  actors(m: Moment): Actor[] {
    return this.rabbits.map((r) => ({
      y: r.y,
      draw: (c) => {
        const x = Math.round(r.x);
        // The hop: an arc, four pixels at its top, three hops a second.
        const lift = r.hopping ? Math.round(Math.abs(Math.sin((m.t - r.hopAt) * 9.4)) * 4) : 0;
        const y = Math.round(r.y) - lift;
        c.fillStyle = ink("#8a7257");
        c.fillRect(x - 2, y - 3, 4, 3);
        c.fillStyle = ink("#a8906f");
        c.fillRect(x - 1, y - 1, 2, 1);
        // The ears up, the head towards where it goes, the tail's white tuft behind.
        const headX = x + (r.facing > 0 ? 1 : -2);
        c.fillStyle = ink("#8a7257");
        c.fillRect(headX, y - 5, 1, 2);
        c.fillRect(headX + (r.facing > 0 ? -1 : 1), y - 5, 1, 1);
        c.fillStyle = ink("#f2ede0");
        c.fillRect(x + (r.facing > 0 ? -2 : 1), y - 3, 1, 1);
      },
    }));
  }
}

/* ---------- the fox ---------- */

interface Fox extends Mover {
  active: boolean;
  /** The day's pass is done: once a dusk and once a dawn. */
  doneAt: number;
  tx: number;
  ty: number;
  phase: number;
  bolting: boolean;
}

/** Along the wood's south edge, from the east over to the stream and off at the south-west. */
const FOX_WAY: [number, number][] = [[W + 20, 505], [820, 520], [700, 530], [560, 536], [430, 540], [360, 560], [330, H + 20]];

class FoxOne {
  fox: Fox = { x: FOX_WAY[0][0], y: FOX_WAY[0][1], vx: -1, vy: 0, active: false, doneAt: -1, tx: 0, ty: 0, phase: 0, bolting: false };
  private leg = 0;

  update(m: Moment, tracks: Track[]) {
    const f = this.fox;
    const dusk = m.hour > 17.2 && m.hour < 21.5;
    const dawn = m.hour > 5 && m.hour < 7.6;
    const window = dusk ? 1 : dawn ? 2 : 0;
    if (!f.active) {
      if (window && f.doneAt !== window && Math.random() < m.dt * 0.08) {
        f.active = true;
        f.doneAt = window;
        this.leg = 1;
        f.x = FOX_WAY[0][0];
        f.y = FOX_WAY[0][1];
        f.bolting = false;
      }
      return;
    }
    const toHero = Math.hypot(m.heroX - f.x, (m.heroY - f.y) * 1.4);
    if (toHero < 80) f.bolting = true;
    const [tx, ty] = FOX_WAY[this.leg];
    const speed = f.bolting ? 75 : 26;
    if (step(f, tx, ty, speed, m.dt)) {
      f.phase += (Math.hypot(f.vx, f.vy) / 9) * Math.PI * 2;
      if (m.cover > 0.25 && Math.random() < m.dt * 4) tracks.push({ x: f.x, y: f.y });
    }
    if (Math.hypot(tx - f.x, ty - f.y) < 2) {
      this.leg++;
      if (this.leg >= FOX_WAY.length) f.active = false;
    }
  }

  actors(m: Moment): Actor[] {
    const f = this.fox;
    if (!f.active || off(f.x, f.y)) return [];
    return [{
      y: f.y,
      draw: (c) => {
        const x = Math.round(f.x);
        const y = Math.round(f.y);
        const d = f.vx < 0 ? -1 : 1;
        const px = (bx: number) => x + bx * d;
        // Legs, two seen, swinging; the body low and long; the brush behind with its white tip.
        c.fillStyle = ink("#6b3a1a");
        const s = Math.round(Math.sin(f.phase) * 1.5);
        c.fillRect(px(2) + s * d, y - 2, 1, 2);
        c.fillRect(px(-2) - s * d, y - 2, 1, 2);
        c.fillStyle = ink("#c8642a");
        c.fillRect(px(-4), y - 5, 8, 3);
        c.fillRect(px(4), y - 6, 2, 2);
        c.fillStyle = ink("#e4a56a");
        c.fillRect(px(-3), y - 3, 6, 1);
        // The ears, and the brush: up a little as it runs.
        c.fillStyle = ink("#6b3a1a");
        c.fillRect(px(4), y - 7, 1, 1);
        c.fillRect(px(6), y - 7, 1, 1);
        c.fillStyle = ink("#c8642a");
        c.fillRect(px(-7), y - 4 - (f.bolting ? 1 : 0), 4, 2);
        c.fillStyle = ink("#f2ede0");
        c.fillRect(px(-8), y - 4 - (f.bolting ? 1 : 0), 1, 2);
      },
    }];
  }
}

/* ---------- the heron ---------- */

const HERON_AT: [number, number] = [372, 268];

class Heron {
  state: "away" | "standing" | "flying" = "away";
  since = 0;
  x = HERON_AT[0];
  y = HERON_AT[1];
  private doneDay = -1;

  update(m: Moment) {
    const morning = m.hour > 5 && m.hour < 9.5;
    const day = Math.floor(m.t / 600);
    if (this.state === "away") {
      if (morning && this.doneDay !== day && Math.hypot(m.heroX - HERON_AT[0], m.heroY - HERON_AT[1]) > 160 && Math.random() < m.dt * 0.1) {
        this.state = "standing";
        this.x = HERON_AT[0];
        this.y = HERON_AT[1];
        this.doneDay = day;
      }
      return;
    }
    if (this.state === "standing") {
      const toHero = Math.hypot(m.heroX - this.x, (m.heroY - this.y) * 1.4);
      if (toHero < 95 || !morning) {
        this.state = "flying";
        this.since = m.t;
      }
      return;
    }
    // Flying: up and away over the falls, slow wingbeats.
    const s = m.t - this.since;
    this.x -= m.dt * 38;
    this.y -= m.dt * (12 + s * 9);
    if (off(this.x, this.y) || s > 7) this.state = "away";
  }

  actors(m: Moment): Actor[] {
    if (this.state === "away") return [];
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    return [{
      y: this.y,
      draw: (c) => {
        if (this.state === "standing") {
          // Two thin legs, the body, the neck up and the head with its yellow bill, facing the water.
          c.fillStyle = ink("#5e5e58");
          c.fillRect(x - 1, y - 7, 1, 7);
          c.fillRect(x + 1, y - 7, 1, 7);
          c.fillStyle = ink("#9a9ca0");
          c.fillRect(x - 3, y - 10, 6, 3);
          c.fillStyle = ink("#b8babd");
          c.fillRect(x - 4, y - 16, 1, 6);
          c.fillRect(x - 5, y - 17, 2, 2);
          c.fillStyle = ink("#d9b43c");
          c.fillRect(x - 7, y - 16, 2, 1);
        } else {
          // In the air: the body a line, the neck tucked, the wings beating slowly.
          const beat = Math.sin((m.t - this.since) * 4.5);
          c.fillStyle = ink("#9a9ca0");
          c.fillRect(x - 3, y, 7, 2);
          c.fillRect(x - 5, y, 2, 1);
          c.fillStyle = ink("#b8babd");
          const up = Math.round(beat * 3);
          for (let i = 1; i <= 5; i++) {
            c.fillRect(x - i, y - Math.round((up * i) / 5), 1, 1);
            c.fillRect(x + i, y - Math.round((up * i) / 5), 1, 1);
          }
          c.fillStyle = ink("#5e5e58");
          c.fillRect(x + 4, y + 1, 3, 1);
        }
      },
    }];
  }
}

/* ---------- the squirrel ---------- */

class Squirrel {
  private treeX = 0;
  private treeY = 0;
  private top = 0;
  /** Height up the trunk, 0 at the ground. */
  private up = 0;
  private want = 0;
  private next = 3;
  private x = 0;
  private facing: -1 | 1 = 1;

  constructor(flora: FloraData) {
    // A tree with a trunk to show near the meadow's south-east.
    const trees = flora.placed.filter((p) => flora.sprites[p.sprite].kind !== "bush" && flora.sprites[p.sprite].kind !== "rock");
    const tree = trees.sort((a, b) => Math.hypot(a.x - 700, a.y - 480) - Math.hypot(b.x - 700, b.y - 480))[0];
    if (tree) {
      this.treeX = tree.x;
      this.treeY = tree.y;
      this.top = (tree.h ?? flora.sprites[tree.sprite].h) * 0.55;
      this.x = tree.x + 6;
    }
  }

  update(m: Moment) {
    if (!this.treeX) return;
    const toHero = Math.hypot(m.heroX - this.treeX, (m.heroY - this.treeY) * 1.4);
    if (toHero < 70) {
      this.want = this.top;
      this.next = m.t + 6;
    } else if (m.t > this.next) {
      this.next = m.t + 4 + Math.random() * 7;
      this.want = this.want > 0 ? 0 : this.top * (0.5 + Math.random() * 0.5);
    }
    const d = this.want - this.up;
    this.up += Math.sign(d) * Math.min(Math.abs(d), m.dt * (toHero < 70 ? 90 : 40));
    // On the ground it forages a few pixels to either side of the trunk.
    if (this.up < 0.5 && Math.random() < m.dt * 0.8) {
      this.x = this.treeX + (Math.random() - 0.5) * 24;
      this.facing = this.x < this.treeX ? -1 : 1;
    }
  }

  actors(): Actor[] {
    if (!this.treeX) return [];
    const onTrunk = this.up > 0.5;
    const x = Math.round(onTrunk ? this.treeX + 1 : this.x);
    const y = Math.round(this.treeY - this.up);
    return [{
      // Just after the tree, so it sits on the trunk's face.
      y: this.treeY + 0.5,
      draw: (c) => {
        c.fillStyle = ink("#8b4a1e");
        if (onTrunk) {
          c.fillRect(x, y - 3, 2, 3);
          c.fillRect(x - 1, y - 6, 1, 4);
          c.fillStyle = ink("#1e1208");
          c.fillRect(x + 1, y - 3, 1, 1);
        } else {
          c.fillRect(x - 1, y - 2, 3, 2);
          c.fillRect(x + (this.facing > 0 ? -3 : 2), y - 4, 2, 3);
          c.fillStyle = ink("#1e1208");
          c.fillRect(x + (this.facing > 0 ? 1 : -1), y - 2, 1, 1);
        }
      },
    }];
  }
}

/* ---------- the owl ---------- */

class Owl {
  private x = 0;
  private y = 0;
  private sortY = 0;
  private blink = 0;
  private look = 0;

  constructor(flora: FloraData) {
    // A tree in the north-east of the wood (a conifer until 2026-10-25; now every tree is the
    // same kind).
    const kind = (p: Placed) => flora.sprites[p.sprite].kind;
    const trees = flora.placed.filter((p) => kind(p) !== "bush" && kind(p) !== "rock" && p.y < 330 && p.x > 380 && p.x < 900);
    const tree = trees.sort((a, b) => Math.hypot(a.x - 760, a.y - 150) - Math.hypot(b.x - 760, b.y - 150))[0];
    if (tree) {
      const h = tree.h ?? flora.sprites[tree.sprite].h;
      this.x = tree.x;
      this.y = tree.y - Math.round(h * 0.6);
      this.sortY = tree.y + 0.5;
    }
  }

  update(m: Moment) {
    if (Math.random() < m.dt * 0.25) this.blink = m.t;
    if (Math.random() < m.dt * 0.3) this.look = Math.floor(Math.random() * 3) - 1;
  }

  actors(m: Moment): Actor[] {
    if (!this.x || m.night < 0.45) return [];
    const x = this.x;
    const y = this.y;
    const shut = m.t - this.blink < 0.15;
    return [{
      y: this.sortY,
      draw: (c) => {
        c.fillStyle = ink("#3a2d22");
        c.fillRect(x - 1, y - 4, 3, 4);
        c.fillRect(x - 2, y - 2, 5, 2);
        c.fillStyle = ink("#54453a");
        c.fillRect(x - 1, y - 3, 1, 1);
        c.fillRect(x + 1, y - 3, 1, 1);
        c.fillStyle = ink(shut ? "#3a2d22" : "#ffd84a");
        c.fillRect(x - 1 + this.look * 0.5, y - 3, 1, 1);
        c.fillRect(x + 1 + this.look * 0.5, y - 3, 1, 1);
      },
    }];
  }
}

/* ---------- the ducks ---------- */

interface Duck extends Mover {
  tx: number;
  ty: number;
  next: number;
}

class Ducks {
  ducks: Duck[] = [];
  private on = 0;

  constructor() {
    for (let i = 0; i < 2; i++) this.ducks.push({ x: 236 + i * 26, y: 250 + i * 12, vx: 1, vy: 0, tx: 236, ty: 250, next: i });
  }

  update(m: Moment) {
    const want = m.rain > 0.3 && m.cover < 0.3 ? 1 : 0;
    this.on += (want - this.on) * Math.min(1, m.dt / 3);
    if (this.on < 0.05) return;
    for (const d of this.ducks) {
      if (m.t > d.next) {
        d.next = m.t + 3 + Math.random() * 5;
        for (let tries = 0; tries < 8; tries++) {
          const tx = 200 + Math.random() * 150;
          const ty = 232 + Math.random() * 50;
          if (inside(WADE, tx, ty) && ty < 296) {
            d.tx = tx;
            d.ty = ty;
            break;
          }
        }
      }
      const dx = d.tx - d.x;
      const dy = d.ty - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.5) {
        const r = Math.min(dist, m.dt * 7);
        d.vx = (dx / dist) * r;
        d.x += d.vx;
        d.y += (dy / dist) * r;
      }
    }
  }

  actors(): Actor[] {
    if (this.on < 0.5) return [];
    return this.ducks.map((d) => ({
      y: d.y,
      draw: (c) => {
        const x = Math.round(d.x);
        const y = Math.round(d.y);
        const f = d.vx < 0 ? -1 : 1;
        c.fillStyle = ink("#6e5538");
        c.fillRect(x - 2, y - 2, 5, 2);
        c.fillStyle = ink("#2f6b3a");
        c.fillRect(x + f * 2, y - 4, 1, 2);
        c.fillStyle = ink("#d9b43c");
        c.fillRect(x + f * 3, y - 3, 1, 1);
        c.fillStyle = ink("#cfe3e6");
        c.fillRect(x - 3 - f, y, 7, 1);
      },
    }));
  }
}

/* ---------- all of them ---------- */

export class Fauna {
  private readonly herd = new Herd();
  private readonly rabbits: Rabbits;
  private readonly fox = new FoxOne();
  private readonly heron = new Heron();
  private readonly squirrel: Squirrel;
  private readonly owl: Owl;
  private readonly ducks = new Ducks();
  /** The marks left in the snow since the last call. */
  tracks: Track[] = [];

  constructor(flora: FloraData, colours: number[][]) {
    palette = colours;
    fitted.clear();
    paintDeer(ink);
    this.rabbits = new Rabbits(flora);
    this.squirrel = new Squirrel(flora);
    this.owl = new Owl(flora);
  }

  update(m: Moment) {
    this.tracks = [];
    this.herd.update(m, this.tracks);
    this.rabbits.update(m, this.tracks);
    this.fox.update(m, this.tracks);
    this.heron.update(m);
    this.squirrel.update(m);
    this.owl.update(m);
    this.ducks.update(m);
  }

  /** Every animal to draw, sorted by its feet. */
  actors(m: Moment): Actor[] {
    return [...this.herd.actors(m), ...this.rabbits.actors(m), ...this.fox.actors(m), ...this.heron.actors(m), ...this.squirrel.actors(), ...this.owl.actors(m), ...this.ducks.actors()].sort((a, b) => a.y - b.y);
  }
}
