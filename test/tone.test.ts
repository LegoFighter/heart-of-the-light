import { describe, expect, it } from "vitest";
import { nearest, tone } from "../lib/view";

/* The wanderer's colours (owner, 2026-10-24: first toned to the glade, then "der Charakter braucht
   mehr Kontrast zur Welt": the cloak rust against the green). */

describe("the figure's colours", () => {
  it("come out a little darker and less clean than the atlas has them", () => {
    const [r, g, b] = tone([175, 120, 61]);
    expect(r + g + b).toBeLessThan(175 + 120 + 61);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(175 - 61);
  });

  it("turn the cloak's greens to rust, light and dark alike", () => {
    for (const green of [[153, 150, 66], [61, 70, 37], [70, 150, 60]]) {
      const [r, g, b] = tone(green);
      expect(r).toBeGreaterThan(g * 1.5);
      expect(g).toBeGreaterThan(b);
    }
    const [lr] = tone([153, 150, 66]);
    const [dr] = tone([61, 70, 37]);
    expect(lr).toBeGreaterThan(dr + 60);
  });

  it("keep the lantern's light as it is", () => {
    expect(tone([255, 196, 80])).toEqual([255, 196, 80]);
  });

  it("snap to the nearest of the glade's colours", () => {
    const glade = [
      [10, 10, 10],
      [100, 110, 60],
      [240, 230, 200],
    ];
    expect(nearest([90, 100, 70], glade)).toEqual([100, 110, 60]);
    expect(nearest([250, 250, 250], glade)).toEqual([240, 230, 200]);
  });
});
