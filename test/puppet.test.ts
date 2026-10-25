import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { apply, FEET_X, FEET_Y, layout, Pendulum, pixelate, paletteTable, poseOf, SPRITE_H, SPRITE_W, type Rig, type ViewName } from "../lib/puppet";

const rig = JSON.parse(readFileSync(new URL("../public/assets/hero-rig.json", import.meta.url), "utf8")) as Rig;
const VIEWS: ViewName[] = ["front", "side", "back"];

function corners(rigPart: { rect: [number, number, number, number] }, m: Parameters<typeof apply>[0]) {
  const [, , w, h] = rigPart.rect;
  return [apply(m, 0, 0), apply(m, w, 0), apply(m, 0, h), apply(m, w, h)];
}

describe("the puppet", () => {
  it("has every piece of every view on the atlas, and every child's parent", () => {
    for (const view of VIEWS) {
      const names = new Set(rig.views[view].parts.map((p) => p.name));
      for (const part of rig.views[view].parts) if (part.parent) expect(names.has(part.parent), `${view}/${part.name}`).toBe(true);
      expect(names.has("lantern")).toBe(true);
    }
  });

  it("stands with its feet on the ground and its head high", () => {
    for (const view of VIEWS) {
      const placed = layout(rig, view, poseOf(view, { phase: 0, walk: 0, t: 0, wind: 0, swing: 0, cloak: 0, hem: 0 }));
      const ys = placed.flatMap(({ part, matrix }) => corners(part, matrix).map(([, y]) => y / rig.scale));
      expect(Math.max(...ys), view).toBeGreaterThan(FEET_Y - 1);
      expect(Math.max(...ys), view).toBeLessThan(FEET_Y + 2);
      expect(FEET_Y - Math.min(...ys), view).toBeGreaterThan(rig.height - 3);
    }
  });

  it("keeps every piece in the sprite's box through the walk, the swing and the wind", () => {
    for (const view of VIEWS)
      for (const mirrored of [false, true])
        for (let phase = 0; phase < Math.PI * 2; phase += 0.4)
          for (const swing of [-0.9, 0, 0.9])
            for (const wind of [-1, 1]) {
              const placed = layout(rig, view, poseOf(view, { phase, walk: 1, t: phase, wind, swing, cloak: 0.2, hem: 0.3 }), mirrored);
              for (const { part, matrix } of placed)
                for (const [x, y] of corners(part, matrix)) {
                  const where = `${view} ${part.name} phase ${phase.toFixed(1)} swing ${swing}`;
                  expect(x / rig.scale, where).toBeGreaterThanOrEqual(0);
                  expect(x / rig.scale, where).toBeLessThanOrEqual(SPRITE_W);
                  expect(y / rig.scale, where).toBeGreaterThanOrEqual(0);
                  expect(y / rig.scale, where).toBeLessThanOrEqual(SPRITE_H);
                }
            }
  });

  it("hangs the lantern straight down whatever the arm does", () => {
    for (const view of VIEWS) {
      const placed = layout(rig, view, poseOf(view, { phase: 1.2, walk: 1, t: 0, wind: 0, swing: 0, cloak: 0, hem: 0 }));
      const lantern = placed.find((p) => p.part.name === "lantern")!;
      // The matrix's first column is the piece's x axis: level when it hangs straight (the arm's
      // stretch tilts it a hair).
      expect(Math.abs(lantern.matrix[1]), view).toBeLessThan(0.02);
    }
  });

  it("mirrors the side view about the feet", () => {
    const pose = poseOf("side", { phase: 0.7, walk: 1, t: 0, wind: 0, swing: 0.2, cloak: 0, hem: 0 });
    const right = layout(rig, "side", pose, false);
    const left = layout(rig, "side", pose, true);
    right.forEach((r, i) => {
      const [x] = apply(r.matrix, 3, 5);
      const [mx] = apply(left[i].matrix, 3, 5);
      expect(x + mx).toBeCloseTo(2 * FEET_X * rig.scale, 6);
    });
  });
});

describe("the pixel filter", () => {
  const palette = [[255, 0, 0], [0, 255, 0], [0, 0, 0], [128, 0, 0]];
  const run = (big: Uint8ClampedArray, bigW: number, w: number, h: number) => {
    const small = new Uint8ClampedArray(w * h * 4);
    pixelate(big, bigW, small, w, h, 2, palette, paletteTable(palette), 0.5);
    return small;
  };

  it("gives a block the colour that covers most of it, keeps it when half is covered, darkens the edge", () => {
    const big = new Uint8ClampedArray(4 * 4 * 4);
    // Top-left block: three red pixels and a green one; top-right: one green pixel only.
    for (const [x, y] of [[0, 0], [1, 0], [0, 1]]) big.set([250, 10, 10, 255], (y * 4 + x) * 4);
    big.set([10, 250, 10, 255], (1 * 4 + 1) * 4);
    big.set([10, 250, 10, 255], (0 * 4 + 2) * 4);
    const small = run(big, 4, 2, 2);
    // Red, and on the edge: the darker red.
    expect([...small.slice(0, 4)]).toEqual([128, 0, 0, 255]);
    expect(small[7]).toBe(0);
  });

  it("shows each colour as `shown` has it, the edge in the darker shade's own slot", () => {
    const big = new Uint8ClampedArray(6 * 6 * 4);
    for (let i = 0; i < 36; i++) big.set([250, 10, 10, 255], i * 4);
    const small = new Uint8ClampedArray(3 * 3 * 4);
    const shown = [[0, 0, 255], [0, 255, 0], [0, 0, 0], [0, 0, 128]];
    pixelate(big, 6, small, 3, 3, 2, palette, paletteTable(palette), 0.5, shown);
    expect([...small.slice(16, 20)]).toEqual([0, 0, 255, 255]);
    expect([...small.slice(0, 4)]).toEqual([0, 0, 128, 255]);
  });

  it("leaves a pixel inside the figure its own colour", () => {
    const big = new Uint8ClampedArray(6 * 6 * 4);
    for (let i = 0; i < 36; i++) big.set([250, 10, 10, 255], i * 4);
    const small = run(big, 6, 3, 3);
    expect([...small.slice(16, 20)]).toEqual([255, 0, 0, 255]);
  });
});

describe("the lantern's pendulum", () => {
  it("swings back when the hand stops and settles", () => {
    const p = new Pendulum();
    for (let i = 0; i < 30; i++) p.step(i * 1.2, 0, 1 / 60);
    for (let i = 0; i < 10; i++) p.step(36, 0, 1 / 60);
    expect(Math.abs(p.angle)).toBeGreaterThan(0.02);
    for (let i = 0; i < 600; i++) p.step(36, 0, 1 / 60);
    expect(Math.abs(p.angle)).toBeLessThan(0.01);
  });
});

describe("the cloak as cloth", () => {
  it("blows out behind in a walk, swings back and settles when the walk stops", async () => {
    const { Cloth } = await import("../lib/puppet");
    const cloth = new Cloth();
    for (let i = 0; i < 120; i++) cloth.step(1, 0, 1 / 60);
    const walking = cloth.angle;
    expect(walking).toBeGreaterThan(0.1);
    cloth.step(0, 0, 1 / 60);
    expect(cloth.angle).toBeLessThan(walking + 1e-9);
    for (let i = 0; i < 240; i++) cloth.step(0, 0, 1 / 60);
    expect(Math.abs(cloth.angle)).toBeLessThan(0.03);
    expect(Math.abs(cloth.hem)).toBeLessThan(0.05);
  });

  it("is pushed by the wind and shears the hem after the swing", async () => {
    const { Cloth } = await import("../lib/puppet");
    const cloth = new Cloth();
    for (let i = 0; i < 180; i++) cloth.step(0, 1, 1 / 60);
    expect(cloth.angle).toBeGreaterThan(0.15);
    expect(cloth.hem).toBeGreaterThan(0.2);
  });
});
