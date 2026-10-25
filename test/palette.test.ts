import { describe, expect, it } from "vitest";
import { buildLut, buildPalette, grade, LUT_SIZE, nearestIndex, type RGB } from "../lib/palette";

const c = (r: number, g: number, b: number): RGB => [r / 255, g / 255, b / 255];
const bytes = ([r, g, b]: RGB) => [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];

// A handful of the painting's colours: its grass, its plaster, its path, an autumn crown, a rock.
const PAINTED = [[165, 153, 49], [236, 234, 199], [216, 174, 96], [180, 97, 40], [101, 102, 98], [8, 13, 10], [28, 59, 48]];

describe("the grade", () => {
  it("turns the painting's olive grass green and its cream white", () => {
    const [r, g, b] = bytes(grade(c(165, 153, 49)));
    expect(g).toBeGreaterThan(r + 20);
    expect(g).toBeGreaterThan(b);
    const [wr, wg, wb] = bytes(grade(c(236, 234, 199)));
    expect(Math.max(wr, wg, wb) - Math.min(wr, wg, wb)).toBeLessThan(8);
  });

  it("keeps the path brown and the autumn trees orange", () => {
    const [r, g, b] = bytes(grade(c(216, 174, 96)));
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    const [ar, ag] = bytes(grade(c(180, 97, 40)));
    expect(ar).toBeGreaterThan(ag + 60);
  });

  it("leaves a cool colour as it is: the night and the snow have no cast to take off", () => {
    for (const cool of [c(60, 72, 110), c(199, 204, 214), c(20, 30, 50)]) expect(bytes(grade(cool))).toEqual(bytes(cool));
  });
});

describe("the palette and its cube", () => {
  const palette = buildPalette(PAINTED);

  it("holds every painted colour graded, under every light, with no colour twice", () => {
    expect(palette.length).toBeGreaterThan(PAINTED.length * 10);
    const keys = new Set(palette.map((p) => bytes(p).join(",")));
    expect(keys.size).toBe(palette.length);
    for (const p of PAINTED) {
      const graded = bytes(grade(c(p[0], p[1], p[2])));
      expect(keys.has(graded.join(","))).toBe(true);
    }
  });

  it("finds a palette colour as its own nearest", () => {
    for (const p of palette.slice(0, 40)) expect(palette[nearestIndex(p, palette)]).toEqual(p);
  });

  it("is a cube of LUT_SIZE slices whose cells are palette colours, the grass cell green", () => {
    const lut = buildLut(palette);
    expect(lut.length).toBe(LUT_SIZE * LUT_SIZE * LUT_SIZE * 4);
    const keys = new Set(palette.map((p) => bytes(p).join(",")));
    const n = LUT_SIZE;
    const cell = (r: number, g: number, b: number) => {
      const at = (g * n * n + b * n + r) * 4;
      return [lut[at], lut[at + 1], lut[at + 2]];
    };
    for (const [r, g, b] of [[0, 0, 0], [n - 1, n - 1, n - 1], [20, 19, 6], [5, 9, 20]]) {
      const got = cell(r, g, b);
      expect(keys.has(got.join(","))).toBe(true);
    }
    const [r, g, b] = cell(Math.round((165 / 255) * (n - 1)), Math.round((153 / 255) * (n - 1)), Math.round((49 / 255) * (n - 1)));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });
});
