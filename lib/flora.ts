/* The experiment of 2026-10-24: the glade's trees and bushes as objects of their own.

   Each plant is a sprite cut from a sheet (public/assets/flora.png, built by tools/art/flora.py)
   that stands on the ground at a foot point; it is sorted by that foot among the wanderer and the
   deer, so one can walk behind a trunk and in front of a bush. The crown is rigged in bands: the
   trunk stands still, and every band of the crown above it shifts by whole pixels, more the
   higher it is, with a slow sway of its own, the gusts that roll over the wood from the west,
   and a small rustle in a gust. Pure pixels: every offset is a whole pixel, nothing is scaled.

   Since 2026-10-25 every tree is one of the new kind (owner: "ersetze alle Bäume mit der neuen
   Baumart, erstelle jeden Baum einen individuellen Stamm"): a painted bare trunk of its own
   from public/assets/trunks.png (56 of them, tools/art/trunks.py) with the twigs and leaves of
   lib/tree.ts grown on it. The sheet's tree sprites are not drawn any more; the placements, the
   bushes and the rocks stay.

   Since 2026-10-26 a tree is posed and drawn as the study's tree is (owner: "die Bäume sollen so
   aussehen wie bei dem einzelnen Baum", with the wave shader gone): its twigs bend about their
   bases and carry their leaves, and the leaves flutter one by one in a gust, instead of the whole
   rendered tree shifting in bands. Each tree is drawn into a sprite of its own (`TreeSprite`)
   POSE_FPS times a second, the trees in turn, not all in the same frame; out of a gust, where
   no twig trembles and no leaf flutters, only when the wind on it has changed enough to move a
   pixel; and not at all while it is out of the camera's sight. */

import { paintedTree, paintTree, shadedPicture, SHEET_BARK, SHEET_LEAF, TreeSprite, windAt, type Painted, type Tree } from "./tree";

/** One painted bare trunk in the atlas (tools/art/trunks.py). */
export interface TrunkSprite {
  x: number;
  y: number;
  w: number;
  h: number;
  foot: { x: number; y: number };
  /** How wide the trunk is at the ground. */
  trunk: number;
  tips: { x: number; y: number; dir: number }[];
  twigs: [number, number][];
}

export interface TrunksData {
  trees: TrunkSprite[];
}

export interface Sprite {
  kind: "conifer" | "broadleaf" | "bush" | "rock";
  x: number;
  y: number;
  w: number;
  h: number;
  /** The foot's x inside the sprite; the foot's y is the sprite's bottom row. */
  foot: number;
  /** How wide the trunk is at the ground. */
  trunk: number;
  autumn?: boolean;
}

export interface Placed {
  sprite: number;
  x: number;
  y: number;
  /** A tree's height as it is drawn (the rendered tree, leaves and all); set by `Flora`. */
  h?: number;
}

export interface FloraData {
  sprites: Sprite[];
  /** Sorted by y (the foot). */
  placed: Placed[];
}

/** A band of the crown is this many rows. */
const BAND = 6;

/** The gusts: the same waves from the west as the shader's `gust`, so what the crowns do in code
    and what the shader does over their pixels is one wind. The wind's strength scales how far
    things go, never how fast the waves run (owner, 2026-10-25: "beim Wetterwechseln rastet der
    Wind immer kurz aus": a pace that followed the wind made every wave's phase slide while the
    weather changed, and the whole wood whipped to and fro). */
export function gust(x: number, y: number, t: number, wind: number): number {
  const s = x * 0.94 + y * 0.34;
  const a = 0.5 + 0.5 * Math.sin(s * 0.0055 - t * 0.38);
  const env = 0.6 + 0.8 * (0.5 + 0.5 * Math.sin(t * 0.3 + 1.0));
  return a ** 3 * env;
}

/** The study's big tree is 293 px tall; a glade tree's twigs and leaves are set smaller by its
    size. */
const STUDY_HEIGHT = 293;
/** The room round a painted trunk that its leaves may take. */
const MARGIN = 14;
/** How often a tree is posed anew, as the wanderer and the deer are (lib/puppet.ts). */
const POSE_FPS = 15;
/** How far outside what the camera shows a tree is still posed: the camera glides a few pixels a
    frame, and a puddle mirrors what stands some rows above it. */
const SIGHT = 40;
/** How much of its leaves a tree still has at each step of the winter, in leaf to bare. */
const SHARES = [1, 0.72, 0.45, 0.2, 0];
/** The step for the snow that lies: the leaves go as the snow settles, most of them before it
    lies deep (owner, 2026-10-25: the shedding was too slow to see), the last with half the
    cover, and they come back as it melts. */
export function stageOf(cover: number): number {
  return cover < 0.05 ? 0 : cover < 0.15 ? 1 : cover < 0.3 ? 2 : cover < 0.5 ? 3 : 4;
}

export class Flora {
  /** The rigged tree for each placed tree, by its index in `placed`: in leaf, and shedding its
      leaves in steps down to bare (owner, 2026-10-25: "im Winter sollen die Bäume ihre Blätter
      verlieren, und kahler werden"), the step picked by how much snow lies; with the size it is
      drawn at, leaves and all. */
  private readonly trees = new Map<number, { stages: Tree[]; trunk: number; w: number; h: number; sprite: TreeSprite; turn: number; frame: number; stage: number; still: string }>();
  /** How much snow lies, 0..1; the view sets it each frame. */
  cover = 0;
  /** What the camera shows, in the painting's pixels; unset, everything. */
  seen?: { x: number; y: number; w: number; h: number };

  constructor(
    private readonly sheet: HTMLImageElement,
    readonly data: FloraData,
    trunks?: { sheet: HTMLImageElement; data: TrunksData },
  ) {
    if (!trunks || !trunks.data.trees.length) return;
    paintTree(SHEET_LEAF, SHEET_BARK);
    let k = 0;
    data.placed.forEach((p, i) => {
      const s = data.sprites[p.sprite];
      if (s.kind !== "conifer" && s.kind !== "broadleaf") return;
      // Each tree its own trunk, in turn through the atlas.
      const t = trunks.data.trees[k % trunks.data.trees.length];
      k++;
      const painted: Painted = {
        image: shadedPicture(trunks.sheet, t.x, t.y, t.w, t.h),
        w: t.w,
        h: t.h,
        foot: t.foot,
        tips: t.tips,
        twigs: t.twigs,
      };
      const tree = paintedTree(painted, i + 1, 2, t.h / STUDY_HEIGHT);
      // Each leaf has a phase of its own; the leaves with the highest go first, so a tree sheds
      // the same leaves in the same order every winter.
      const stages = SHARES.map((share) => ({ ...tree, leaves: tree.leaves.filter((l) => l.phase < share * 6.2832) }));
      // The trees take their turns to be posed spread over the frame of POSE_FPS.
      this.trees.set(i, { stages, trunk: t.trunk, w: t.w + MARGIN * 2, h: t.h + MARGIN, sprite: new TreeSprite(painted, MARGIN), turn: (k * 0.618) % 1, frame: -1, stage: -1, still: "" });
      p.h = t.h + MARGIN;
    });
  }

  /** How wide the trunk of the tree at `placed[i]` is at the ground (the sprite's when it is not
      one of the new trees). */
  trunkWidth(i: number): number {
    return this.trees.get(i)?.trunk ?? this.data.sprites[this.data.placed[i].sprite].trunk;
  }

  /** Draws the plants of `placed[from..to)` on `c`, in order, posed for the moment `t`. */
  draw(c: CanvasRenderingContext2D, from: number, to: number, t: number, wind: number) {
    const { sprites, placed } = this.data;
    for (let i = from; i < to; i++) {
      const p = placed[i];
      const s = sprites[p.sprite];
      const own = this.trees.get(i);
      if (own) {
        const stage = stageOf(this.cover);
        const frame = Math.floor(t * POSE_FPS + own.turn);
        const left = p.x - own.sprite.foot.x;
        const top = p.y - own.sprite.foot.y;
        const v = this.seen;
        const inSight = !v || (left < v.x + v.w + SIGHT && left + own.w > v.x - SIGHT && top < v.y + v.h + SIGHT && p.y > v.y - SIGHT);
        if (inSight && (frame !== own.frame || stage !== own.stage)) {
          own.frame = frame;
          // Out of a gust (lib/tree.ts trembles and flutters above 0.2) the pose is the sway and
          // the gust alone: in steps of a sixteenth, which move a tip a fraction of a pixel.
          const { sway, g } = windAt(p.x, p.y, t, wind);
          const still = g > 0.2 ? "" : Math.round(sway * 16) + "," + Math.round(g * 16);
          if (stage !== own.stage || !still || still !== own.still) {
            own.sprite.draw(own.stages[stage], p.x, p.y, t, wind);
            own.stage = stage;
            own.still = still;
          }
        }
        c.drawImage(own.sprite.canvas, left, top);
      } else this.plant(c, this.sheet, s, p, t, wind);
    }
  }

  /** What every plant and rock puts on the ground canvas: its shadow (blue) to the lower right,
      and under a crown the sun's patches (green) that move with the sway. The sun stands to the
      upper left in the painting, so the shadow goes that way whatever the hour; it only
      lengthens a little towards evening. */
  ground(c: CanvasRenderingContext2D, t: number, wind: number, hour: number) {
    const { sprites, placed } = this.data;
    const long = 1 + Math.max(0, Math.abs(hour - 13) - 3) * 0.12;
    placed.forEach((p, pi) => {
      const own = this.trees.get(pi);
      const s = own ? { ...sprites[p.sprite], w: own.w, h: own.h } : sprites[p.sprite];
      const tree = s.kind !== "bush" && s.kind !== "rock";
      const rx = s.kind === "rock" ? s.w * 0.5 : tree ? s.w * 0.4 : s.w * 0.45;
      const ry = s.kind === "rock" ? Math.max(2, s.h * 0.22) : tree ? Math.max(3, s.h * 0.1) : 3;
      const cx = p.x + rx * 0.35 * long;
      const cy = p.y - 1 + (tree ? 1 : 0);
      if (tree) {
        // The crown's shade on the grass (owner, 2026-10-25: "da wo die Bäume stehen ist die
        // Wiese hell, das Gras muss dunkel sein"): a wide ellipse under the whole crown, a
        // little to the lower right, dark in the middle and lighter in three steps outwards.
        const crx = s.w * 0.5 * (0.95 + 0.1 * long);
        const cry = Math.max(8, crx * 0.5);
        const ccx = p.x + crx * 0.22 * long;
        const ccy = p.y + cry * 0.15;
        for (const [share, alpha] of [[1.45, 0.22], [1.15, 0.45], [0.9, 0.7], [0.65, 0.9], [0.4, 1]] as const) {
          c.fillStyle = `rgba(0, 0, 255, ${alpha})`;
          const erx = crx * share;
          const ery = cry * share;
          for (let dy = -Math.round(ery); dy <= Math.round(ery); dy++) {
            const half = Math.round(erx * Math.sqrt(Math.max(0, 1 - (dy / (ery + 0.5)) ** 2)));
            if (half > 0) c.fillRect(Math.round(ccx) - half, Math.round(ccy) + dy, half * 2, 1);
          }
        }
      }
      c.fillStyle = "rgba(0, 0, 255, 0.55)";
      // Whole pixels: the ellipse as rows of rects, no anti-aliasing.
      for (let dy = -Math.round(ry); dy <= Math.round(ry); dy++) {
        const half = Math.round(rx * long * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.5)) ** 2)));
        if (half > 0) c.fillRect(Math.round(cx) - half, Math.round(cy) + dy, half * 2, 1);
      }
      if (!tree) return;
      // The light through the crown: a few patches that drift with the sway.
      const phase = (p.x * 0.94 + p.y * 0.34) * 0.0055;
      const sway = Math.sin(t * 0.45 - phase) * (0.35 + 0.35 * wind) + gust(p.x, p.y, t, wind) * wind * 1.0;
      c.fillStyle = "rgba(0, 255, 0, 0.6)";
      for (let i = 0; i < 7; i++) {
        const h = ((p.sprite * 31 + i * 17 + p.x) % 97) / 97;
        const k = ((p.sprite * 13 + i * 29 + p.y) % 89) / 89;
        const px = Math.round(cx + (h - 0.5) * rx * 1.6 * long + sway * 1.5);
        const py = Math.round(cy + (k - 0.5) * ry * 1.6);
        c.fillRect(px, py, 2 + (i % 2), 1);
      }
    });
  }

  private plant(c: CanvasRenderingContext2D, source: CanvasImageSource, s: Sprite, p: Placed, t: number, wind: number) {
    const left = p.x - s.foot;
    const top = p.y - s.h + 1;
    if (s.kind === "rock") {
      c.drawImage(source, s.x, s.y, s.w, s.h, left, top, s.w, s.h);
      return;
    }
    const g = gust(p.x, p.y, t, wind) * wind;
    // The wood sways as one: the phase runs with the wind across the glade (neighbours move
    // alike, the far side a little later), not by chance per tree.
    const phase = (p.x * 0.94 + p.y * 0.34) * 0.0055;
    // A slow sway, a breath of some fourteen seconds, and the gust on top (calmer since
    // 2026-10-25, owner: "die Baumbewegung ruhiger").
    const sway = Math.sin(t * 0.45 - phase) * (0.35 + 0.35 * wind);
    const reach = s.kind === "bush" ? 1.0 : s.kind === "conifer" ? 1.6 : 2.0;
    // The trunk: the bottom rows stand still (a bush has no trunk to speak of).
    const trunkRows = s.kind === "bush" ? 2 : Math.round(s.h * 0.1);
    const crownTop = s.h - trunkRows;
    c.drawImage(source, s.x, s.y + crownTop, s.w, trunkRows, left, top + crownTop, s.w, trunkRows);
    // The crown in bands from the trunk up: the higher the band, the further it goes.
    for (let row = crownTop; row > 0; row -= BAND) {
      const h = Math.min(BAND, row);
      const y0 = row - h;
      const height = (s.h - y0) / s.h; // 0 at the foot, 1 at the top
      const amount = height * height * reach;
      const rustle = g > 0.2 ? Math.sin(t * 2.2 + y0 * 0.5 + phase) * 0.25 * g : 0;
      const dx = Math.round((sway + g * 1.0 + rustle) * amount);
      const dy = Math.round(Math.abs(sway) * 0.25 * amount * (s.kind === "conifer" ? 0.5 : 1));
      c.drawImage(source, s.x, s.y + y0, s.w, h, left + dx, top + y0 + dy, s.w, h);
    }
  }

  /** The first index in `placed` whose foot is below `y` (binary search). */
  split(y: number): number {
    const { placed } = this.data;
    let lo = 0;
    let hi = placed.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (placed[mid].y <= y) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
