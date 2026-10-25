/* The deer as a rig in code (owner, 2026-10-24: "rig das deer damit es wirklich läuft und
   springt"): a body, a neck and head on the shoulders, a tail, and four legs on their hips, each
   a hinge. A gait sets where the hooves go and how the body rides over them; the legs are drawn
   from hip to hoof as one-pixel lines. The deer faces `facing` (-1 left); it was two thirds the
   wanderer's height and is a third bigger since 2026-10-25 (owner: "gerne etwas größer"), drawn
   anew at that size rather than scaled, so every pixel stays whole. The frames are sampled at
   POSE_FPS, like the wanderer's. */

export type DeerGait = "stand" | "walk" | "gallop";

export interface DeerPose {
  gait: DeerGait;
  /** The gait's phase, radians: a stride or a bound is one turn. */
  phase: number;
  /** The head, 0 up, 1 down to the grass. */
  head: number;
  t: number;
}

const INK = { body: "#7d5a34", belly: "#a68a5c", head: "#6e4d2b", leg: "#4a3620", hoof: "#2e2114", tail: "#efe6d2", shade: "rgba(20, 16, 8, 0.25)" };

/** Brings the deer's colours into the glade's: each ink through `fit` (lib/fauna.ts: muted and
    snapped to the painting's palette; owner, 2026-10-24: "von der Pixelfarbe passen die nicht
    ins Bild"). */
export function paintDeer(fit: (hex: string) => string) {
  for (const key of ["body", "belly", "head", "leg", "hoof", "tail"] as const) INK[key] = fit(INK[key]);
}
const FPS = 15;

/** The body, facing left, as rows: x from the chest (0) back to the rump (12), y up from the
    belly line. B body, b belly. */
const BODY = [
  "...BBBBBBBBBBB...",
  "..BBBBBBBBBBBBB..",
  ".BBBBBBBBBBBBBB..",
  "BBBBBBBBBBBBBBB..",
  "BBBBBbbbbbbbBBB..",
  ".BBBbbbbbbbbbBB..",
  "..BBBbbbbbbbbB...",
  "...BBbbbbbbbB....",
];
/** The body's middle column, the hips of the four legs along the body (x), and the shoulders
    where the neck rises. */
const MIDDLE = 8;
const HIPS = { frontNear: 3, frontFar: 4, hindNear: 13, hindFar: 14 };
const SHOULDER = 2;
const LEG = 9;

/** A leg in two parts (owner, 2026-10-24: "die Beine sehen aus wie Stöcker"): the thigh, two
    pixels wide, from the hip to the joint, and the shank, one pixel, from the joint to the hoof.
    A front leg's knee points forward, a hind leg's hock backward, and the joint bends out
    further the higher the hoof is lifted, so a leg folds as it swings and straightens as it
    carries. `forward` is the way the deer faces, +1 or -1 in x. */
function leg(c: CanvasRenderingContext2D, hx: number, hy: number, fx: number, fy: number, hind: boolean, lift: number, forward: number) {
  // The joint a little more than halfway down (a deer's hock sits low), out by a pixel, two
  // when the hoof is well up.
  // A leg that carries stands straight; the joint shows as the hoof lifts.
  const bend = lift < 0.3 ? 0 : (hind ? -1 : 1) * forward * (lift > 2.5 ? 2 : 1);
  const jx = Math.round(hx + (fx - hx) * 0.55) + bend;
  const jy = Math.round(hy + (fy - hy) * 0.55);
  c.fillStyle = INK.leg;
  line(c, hx, hy, jx, jy);
  line(c, jx, jy, fx, fy);
  // The thigh is broad only where it meets the body: two more pixels at the hip, behind the
  // knee's side, one below the other.
  const behind = hind ? forward : -forward;
  c.fillRect(hx + behind, hy, 1, 2);
  c.fillStyle = INK.hoof;
  c.fillRect(fx, fy, 1, 1);
}

/** A one-pixel line between two points, by Bresenham. */
function line(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    c.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Where a hoof stands under its hip for the gait: `swing` -1..1 back to forward (forward is
    towards the chest, -x in the body's frame), `lift` pixels off the ground. */
function hoof(gait: DeerGait, phase: number, offset: number): { swing: number; lift: number } {
  if (gait === "stand") return { swing: 0, lift: 0 };
  const p = phase + offset;
  const s = Math.sin(p);
  if (gait === "walk") {
    // A leg swings forward through the air in the first half, carries the body back in the second.
    return { swing: s * 1.0, lift: Math.max(0, Math.cos(p)) * 2 * Math.max(0, Math.sin(p + Math.PI / 2)) };
  }
  // The gallop: the legs reach far and leave the ground together with each bound.
  return { swing: s * 1.6, lift: Math.max(0, -Math.cos(p)) * 4 };
}

/** Draws the deer with its hooves at `y` and the middle of its body at `x` (the same point the
    along-view stands on, so turning from one view to the other does not move it), on `c`. */
export function drawDeer(c: CanvasRenderingContext2D, x: number, y: number, facing: -1 | 1, pose: DeerPose) {
  const frame = Math.floor(pose.t * FPS) / FPS;
  const { gait, phase, head } = pose;
  // The body rides over the legs: a gallop bounds, a walk hardly rocks, standing it breathes.
  const bound = gait === "gallop" ? Math.max(0, Math.sin(phase)) * 4 : gait === "walk" ? Math.abs(Math.sin(phase)) * 0.5 : 0;
  const bodyBottom = y - LEG - Math.round(bound);
  // In a bound the body tilts: the chest up as it leaps, down as it lands.
  const tilt = gait === "gallop" ? Math.round(Math.cos(phase) * 1.5) : 0;
  const px = (bx: number) => x + (bx - MIDDLE) * -facing;

  c.fillStyle = INK.shade;
  c.fillRect(Math.min(px(1), px(15)), y - 1, 15, 1);

  // The far legs first, then the body, then the near legs, so the body covers the far ones.
  const legs: [number, number, boolean][] = [
    [HIPS.frontFar, 0.0 + Math.PI, false],
    [HIPS.hindFar, Math.PI / 2 + Math.PI, false],
    [HIPS.frontNear, 0.0, true],
    [HIPS.hindNear, Math.PI / 2, true],
  ];
  // In a gallop the two front legs move nearly together, and the two hind legs, half a bound apart.
  if (gait === "gallop") {
    legs[0][1] = 0.3;
    legs[2][1] = 0;
    legs[1][1] = Math.PI + 0.3;
    legs[3][1] = Math.PI;
  }
  const drawLeg = ([hipX, offset]: [number, number, boolean]) => {
    const { swing, lift } = hoof(gait, phase, offset);
    const hx = px(hipX);
    const hy = bodyBottom + (hipX < MIDDLE ? tilt : -tilt) - 1;
    // Forward is the way it faces.
    const footX = Math.round(hx + facing * swing * 3);
    const footY = y - Math.round(lift);
    leg(c, hx, hy, footX, footY, hipX >= 6, lift, facing);
  };
  legs.filter((leg) => !leg[2]).forEach(drawLeg);

  // The body, with its tilt: the front rows a pixel up or down against the back rows.
  BODY.forEach((row, j) => {
    const by = bodyBottom - (BODY.length - 1 - j);
    for (let i = 0; i < row.length; i++) {
      const k = row[i];
      if (k === ".") continue;
      c.fillStyle = k === "b" ? INK.belly : INK.body;
      c.fillRect(px(i), by + (i < MIDDLE ? tilt : -tilt), 1, 1);
    }
  });
  // The tail: a pale tip, flicking now and then, up in a flight.
  const flick = gait === "stand" && Math.floor(frame * 2) % 7 === 0 ? -1 : 0;
  c.fillStyle = INK.tail;
  c.fillRect(px(16), bodyBottom - 5 - tilt + flick + (gait === "gallop" ? -1 : 0), 1, 2);

  // The neck from the shoulder up and forward, the head on it: up it looks ahead, down it
  // reaches the grass; the head bobs a little with a walk.
  const bob = gait === "walk" ? Math.round(Math.sin(phase * 2) * 0.6) : 0;
  // A deer's neck leans forward more than up: three pixels forward and three up with the head
  // raised, down to the grass with it lowered.
  const neckTopX = px(SHOULDER - 4 - Math.round(head * 0.7));
  const neckTopY = bodyBottom - 5 - Math.round((1 - head) * 4) + Math.round(head * 8) + bob + tilt;
  c.fillStyle = INK.head;
  line(c, px(SHOULDER + 1), bodyBottom - 5 + tilt, neckTopX + facing, neckTopY);
  line(c, px(SHOULDER), bodyBottom - 5 + tilt, neckTopX, neckTopY);
  line(c, px(SHOULDER - 1), bodyBottom - 5 + tilt, neckTopX, neckTopY);
  // The head: four by three, the muzzle a pixel further forward (down to the grass when it
  // grazes), an ear up.
  const forward = facing < 0 ? -1 : 1;
  c.fillRect(facing < 0 ? neckTopX - 3 : neckTopX, neckTopY - 2, 4, 3);
  c.fillRect(neckTopX + forward * 4, neckTopY + (head > 0.5 ? 1 : 0) - 1, 1, 2);
  c.fillRect(neckTopX, neckTopY - 4 + Math.round(head), 1, 2);
  c.fillRect(neckTopX - forward, neckTopY - 4 + Math.round(head), 1, 2);
  legs.filter((leg) => leg[2]).forEach(drawLeg);
}

/** The deer seen along its length: going away (`towards` false, the rump and the tail to us,
    the head up beyond) or coming towards us (the chest, the head with both ears). Narrow: five
    pixels, two legs seen on each side. Hooves at `y`, the middle at `x`. */
export function drawDeerAlong(c: CanvasRenderingContext2D, x: number, y: number, towards: boolean, pose: DeerPose) {
  const { gait, phase, head } = pose;
  const bound = gait === "gallop" ? Math.max(0, Math.sin(phase)) * 4 : gait === "walk" ? Math.abs(Math.sin(phase)) * 0.5 : 0;
  const bodyBottom = y - LEG - Math.round(bound);
  // The legs: the far pair (a pixel in from the edges) then the body, then the near pair.
  // Seen along, a leg's joint shows as a kink to the side, out as the hoof lifts.
  const pair = (dx: number, offset: number) => {
    const { lift } = hoof(gait, phase, offset);
    const lean = gait === "stand" ? 0 : Math.round(Math.sin(phase + offset) * 0.8);
    const fx = x + dx + lean;
    const fy = y - Math.round(lift);
    const jx = x + dx + Math.sign(dx) * (lift > 0.8 ? 1 : 0);
    const jy = Math.round((bodyBottom - 1 + fy) / 2);
    c.fillStyle = INK.leg;
    line(c, x + dx, bodyBottom - 1, jx, jy);
    line(c, jx, jy, fx, fy);
    c.fillStyle = INK.hoof;
    c.fillRect(fx, fy, 1, 1);
  };
  pair(-1, Math.PI);
  pair(1, Math.PI / 2 + Math.PI);
  // The body: seven wide, eight tall, the belly lighter low down.
  for (let j = 0; j < 8; j++) {
    const w = j === 0 || j === 7 ? 3 : j === 1 || j === 6 ? 5 : 7;
    c.fillStyle = j >= 4 ? INK.belly : INK.body;
    c.fillRect(x - (w >> 1), bodyBottom - 7 + j, w, 1);
  }
  if (towards) {
    // The chest and the head above it: the head four wide, two ears, the muzzle a pixel down.
    const ny = bodyBottom - 9 - Math.round((1 - head) * 3) + Math.round(head * 5);
    c.fillStyle = INK.head;
    c.fillRect(x - 1, bodyBottom - 8, 2, 3);
    c.fillRect(x - 2, ny - 1, 4, 3);
    c.fillRect(x - 1, ny + 2, 2, 1);
    c.fillRect(x - 3, ny - 3, 1, 2);
    c.fillRect(x + 2, ny - 3, 1, 2);
  } else {
    // The rump with the tail's pale tip, the neck rising beyond it, the head looking on.
    c.fillStyle = INK.tail;
    c.fillRect(x, bodyBottom - 5 + (gait === "gallop" ? -1 : 0), 1, 2);
    const ny = bodyBottom - 10 - Math.round((1 - head) * 3) + Math.round(head * 5);
    c.fillStyle = INK.head;
    c.fillRect(x - 1, bodyBottom - 9, 2, 3);
    c.fillRect(x - 2, ny, 4, 3);
    c.fillRect(x - 2, ny - 2, 1, 2);
    c.fillRect(x + 1, ny - 2, 1, 2);
  }
  pair(-3, 0);
  pair(3, Math.PI / 2);
}
