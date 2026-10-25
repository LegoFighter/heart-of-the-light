import { describe, expect, it } from "vitest";
import { createCamera, follow, pixelSize } from "../lib/camera";
import { H, W } from "../game/world";

const WINDOWS: [number, number, number][] = [
  [1920, 1080, 1],
  [1440, 900, 1],
  [1512, 945, 2],
  [1366, 768, 1.25],
  [390, 844, 3],
  [844, 390, 3],
  [638, 297, 1],
  [1024, 576, 1],
];

describe("the camera", () => {
  it("shows every pixel of the painting as the same whole number of screen pixels, and covers the window", () => {
    for (const [width, height, dpr] of WINDOWS) {
      const n = pixelSize(width, height, dpr, 1.4);
      expect(Number.isInteger(n)).toBe(true);
      expect(W * n).toBeGreaterThanOrEqual(width * dpr);
      expect(H * n).toBeGreaterThanOrEqual(height * dpr);
    }
  });

  it("comes as near to the zoom as whole pixels allow", () => {
    expect(pixelSize(1920, 1080, 1, 1.4)).toBe(3); // 2.625
    expect(pixelSize(1440, 900, 1, 1.4)).toBe(2); // 2.19
    expect(pixelSize(1512, 945, 2, 1.4)).toBe(5); // 4.59
    expect(pixelSize(844, 390, 3, 1.4)).toBe(3); // 3.46
  });

  it("shows the whole glade one to one at ?zoom=1 in a window its size", () => {
    expect(pixelSize(1024, 576, 1, 1)).toBe(1);
    expect(pixelSize(1024, 576, 2, 1)).toBe(2);
  });

  it("stands on whole device pixels inside the glade wherever the wanderer goes", () => {
    for (const [width, height, dpr] of WINDOWS) {
      const camera = createCamera();
      for (let i = 0; i < 400; i++) {
        const x = (i * 37.3) % W;
        const y = (i * 19.7) % H;
        const { scale, left, top } = follow(camera, x, y, width, height, dpr, 1.4, 1 / 60);
        expect(Math.abs(scale * dpr - Math.round(scale * dpr))).toBeLessThan(1e-9);
        const n = scale * dpr;
        expect(Math.abs(left * n - Math.round(left * n))).toBeLessThan(1e-6);
        expect(Math.abs(top * n - Math.round(top * n))).toBeLessThan(1e-6);
        expect(left).toBeGreaterThanOrEqual(0);
        expect(top).toBeGreaterThanOrEqual(0);
        expect((W - left) * scale).toBeGreaterThanOrEqual(width - 1e-6);
        expect((H - top) * scale).toBeGreaterThanOrEqual(height - 1e-6);
      }
    }
  });

  it("keeps the wanderer still on screen while it follows a steady walk", () => {
    const camera = createCamera();
    let x = 400;
    const offsets: number[] = [];
    // Frames a little uneven, as a browser gives them; the walk stays clear of the glade's edge.
    for (let frame = 0; frame < 300; frame++) {
      const dt = (1 + 0.08 * Math.sin(frame * 1.7)) / 60;
      x += 42 * dt;
      const { left } = follow(camera, x, 300, 1920, 1080, 1, 1.4, dt);
      offsets.push(Math.round(x) - left);
    }
    // Once the camera has caught up with the walk, the wanderer stands where it is on screen to
    // within a device pixel (a third of a painting pixel here).
    const settled = offsets.slice(120);
    expect(Math.max(...settled) - Math.min(...settled)).toBeLessThan(1 / 3 + 1e-6);
  });

  it("glides in device pixels, not in steps of a whole painting pixel", () => {
    const camera = createCamera();
    follow(camera, 400, 300, 1920, 1080, 1, 1.4, 1 / 60);
    const lefts: number[] = [];
    for (let frame = 0; frame < 60; frame++) lefts.push(follow(camera, 460, 300, 1920, 1080, 1, 1.4, 1 / 60).left);
    const steps = lefts.slice(1).map((l, i) => l - lefts[i]).filter((d) => d > 0);
    expect(steps.length).toBeGreaterThan(20);
    // Every step is a whole third (one device pixel at three per painting pixel), and most are
    // smaller than a painting pixel.
    for (const d of steps) expect(Math.abs(d * 3 - Math.round(d * 3))).toBeLessThan(1e-6);
    expect(steps.filter((d) => d < 1 - 1e-6).length).toBeGreaterThan(steps.length / 2);
  });
});
