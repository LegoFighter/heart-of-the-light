import { describe, expect, it } from "vitest";
import { bandShift, drawTree, growTree, leafTree, paintedTree, pose, windAt } from "../lib/tree";

/* The tree rigged in code (owner, 2026-10-25): a bare skeleton, leaves set on it by code, the
   branches and their leaves moving in the glade's wind. */

/** A 2D context that only counts what is filled. */
function counter() {
  const rects: [number, number, number, number][] = [];
  let fillStyle = "";
  const c = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v: string) {
      fillStyle = v;
    },
    fillRect: (x: number, y: number, w: number, h: number) => rects.push([x, y, w, h]),
  };
  return { c: c as unknown as CanvasRenderingContext2D, rects };
}

describe("the tree", () => {
  it("grows the same from the same seed, a trunk and forks thinner and shorter outwards", () => {
    const a = growTree(12);
    const b = growTree(12);
    expect(a.branches).toEqual(b.branches);
    expect(a.leaves).toEqual([]);
    expect(a.branches[0].parent).toBe(-1);
    expect(a.branches.length).toBeGreaterThan(60);
    expect(a.branches.filter((b) => b.root).length).toBeGreaterThanOrEqual(3);
    for (const branch of a.branches.slice(1)) {
      const parent = a.branches[branch.parent];
      expect(branch.depth).toBe(parent.depth + 1);
      expect(branch.width).toBeLessThanOrEqual(parent.width);
      expect(branch.length).toBeLessThan(parent.length);
    }
    expect(a.height).toBeGreaterThan(160);
    expect(a.height).toBeLessThan(290);
  });

  it("gets its leaves by code, on the outer branches only", () => {
    const tree = leafTree(growTree(12), 12);
    expect(tree.leaves.length).toBeGreaterThan(200);
    for (const leaf of tree.leaves) {
      expect(tree.branches[leaf.branch].depth).toBeGreaterThanOrEqual(2);
      expect(tree.branches[leaf.branch].root).toBeUndefined();
    }
    // Many shades, from the crown's dark depths to the lit yellows, as the glade's trees have.
    expect(new Set(tree.leaves.map((l) => l.shade)).size).toBeGreaterThanOrEqual(8);
  });

  it("only breathes on a calm day and bends its twigs more than its trunk in a gust", () => {
    const { branches } = growTree(12);
    const rest = pose(branches, 100, 160, 0, 0);
    // The glade's crowns keep a slow breath even at wind 0; the tips of a tree this size go under
    // a few pixels, nothing a tree of the glade's height would show as more than two.
    let calm = 0;
    for (let t = 0; t < 30; t += 0.5) {
      const posed = pose(branches, 100, 160, t, 0);
      posed.forEach((p, i) => (calm = Math.max(calm, Math.abs(p.tipX - rest[i].tipX))));
    }
    expect(calm).toBeLessThan(6);
    let trunkMove = 0;
    let twigMove = 0;
    let moved = false;
    for (let t = 0; t < 30; t += 0.5) {
      const posed = pose(branches, 100, 160, t, 1);
      trunkMove = Math.max(trunkMove, Math.abs(posed[0].tipX - rest[0].tipX));
      branches.forEach((b, i) => {
        if (b.depth >= 4) twigMove = Math.max(twigMove, Math.abs(posed[i].tipX - rest[i].tipX));
      });
      if (posed.some((p, i) => Math.round(p.tipX) !== Math.round(rest[i].tipX))) moved = true;
    }
    expect(moved).toBe(true);
    expect(twigMove).toBeGreaterThan(trunkMove);
    expect(twigMove).toBeGreaterThan(calm);
    expect(trunkMove).toBeLessThan(3);
  });

  it("carries a branch's children with it when it bends", () => {
    const { branches } = growTree(12);
    const child = branches.findIndex((b) => b.parent === 0 && b.at === 1);
    const rest = pose(branches, 100, 160, 0, 0);
    const bent = pose([{ ...branches[0], flex: 0.3 }, ...branches.slice(1)], 100, 160, 4, 1);
    const trunkShift = bent[0].tipX - rest[0].tipX;
    expect(Math.abs(trunkShift)).toBeGreaterThan(1);
    // The child's base is the trunk's tip, wherever that went.
    expect(bent[child].x).toBeCloseTo(bent[0].tipX, 6);
    expect(bent[child].y).toBeCloseTo(bent[0].tipY, 6);
  });

  it("draws whole pixels, the leaves round their branches", () => {
    const tree = leafTree(growTree(12), 12);
    const { c, rects } = counter();
    drawTree(c, tree, 160, 282, 1.5, 1);
    expect(rects.length).toBeGreaterThan(tree.leaves.length);
    for (const [x, y, w, h] of rects) {
      expect(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(w) && Number.isInteger(h)).toBe(true);
      expect(x).toBeGreaterThan(0);
      expect(x + w).toBeLessThan(320);
      expect(y).toBeGreaterThan(0);
      expect(y + h).toBeLessThanOrEqual(300);
    }
  });
});

describe("the rig on the painted tree", () => {
  const painted = {
    image: {} as CanvasImageSource,
    w: 194,
    h: 293,
    foot: { x: 97, y: 292 },
    tips: [
      { x: 40, y: 60, dir: -0.6 },
      { x: 100, y: 20, dir: 0 },
      { x: 150, y: 70, dir: 0.7 },
      { x: 120, y: 120, dir: 1.2 },
    ],
    twigs: [[60, 90], [110, 50], [140, 110]] as [number, number][],
  };

  it("grows twigs out of the picture's tips in their direction, and leaves on them and on the picture", () => {
    const tree = paintedTree(painted, 12, 1);
    const starts = tree.branches.filter((b) => b.base);
    expect(starts.length).toBe(painted.tips.length);
    for (const [i, b] of starts.entries()) {
      expect(b.base).toEqual({ x: painted.tips[i].x - 97, y: painted.tips[i].y - 292 });
      expect(Math.abs(b.angle - painted.tips[i].dir)).toBeLessThan(0.2);
    }
    expect(tree.branches.length).toBeGreaterThan(starts.length);
    expect(tree.leaves.some((l) => l.fixed)).toBe(true);
    expect(tree.leaves.some((l) => !l.fixed)).toBe(true);
    expect(tree.painted).toBe(painted);
  });

  it("carries a twig's base along with the picture's band in the wind", () => {
    const tree = paintedTree(painted, 12, 1);
    const rest = pose(tree.branches, 180, 332, 0, 0, painted);
    let shifted = false;
    for (let t = 0; t < 30 && !shifted; t += 0.5) {
      const posed = pose(tree.branches, 180, 332, t, 1, painted);
      const i = tree.branches.findIndex((b) => b.base);
      const { sway, g } = windAt(180, 332, t, 1);
      const shift = bandShift(tree.branches[i].base!.y + painted.foot.y, painted.h, sway, g, t);
      expect(posed[i].x - rest[i].x).toBeCloseTo(shift - bandShift(tree.branches[i].base!.y + painted.foot.y, painted.h, windAt(180, 332, 0, 0).sway, 0, 0), 6);
      if (shift !== 0) shifted = true;
    }
    expect(shifted).toBe(true);
  });

  it("never shifts the trunk's rows", () => {
    for (let t = 0; t < 30; t += 0.5) {
      const { sway, g } = windAt(180, 332, t, 1);
      expect(bandShift(painted.h - 1, painted.h, sway, g, t)).toBe(0);
      expect(bandShift(Math.round(painted.h * 0.8), painted.h, sway, g, t)).toBe(0);
    }
  });
});
