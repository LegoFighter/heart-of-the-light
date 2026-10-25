/* The camera, in whole pixels (owner, 2026-10-24: "make it pure"), and smooth (owner, the same
   day: "mach die kamera doch flüssig"). The glade is shown at a whole number of screen pixels per
   pixel of the painting (never 2.6, which makes some of its pixels two screen pixels wide and
   others three), so every pixel on screen is the same size and none is cut. The camera itself
   moves in screen pixels, not in pixels of the painting: the painting's grid slides by one screen
   pixel at a time, so the glide after the wanderer is smooth where steps of a whole painting pixel
   (three or four screen pixels) were a stutter. What is shown is the pixel the wanderer is drawn on
   less the eased offset, so the wanderer never shivers against the glade: the two step together,
   and the camera's own motion is the offset's glide. */

import { H, W } from "../game/world";

/** Where the camera stands: the painting's pixel at the window's top left, unrounded. */
export interface Camera {
  x: number;
  y: number;
  placed: boolean;
}

export const createCamera = (): Camera => ({ x: 0, y: 0, placed: false });

/** Device pixels per pixel of the painting: the whole number nearest to `zoom` times what covers
    the window, and never less than what covers it. */
export function pixelSize(width: number, height: number, dpr: number, zoom: number): number {
  const cover = Math.max(width / W, height / H) * dpr;
  return Math.max(1, Math.ceil(cover - 1e-6), Math.round(cover * zoom));
}

/** Moves `camera` towards keeping `x`, `y` (the painting's pixels) in the middle of a window of
    `width` x `height` CSS pixels, and says how to show the canvas there: `scale` CSS pixels per
    pixel of the painting, and the point of it at the window's top left, on a whole device pixel
    (a multiple of 1 / `pixelSize`). */
export function follow(camera: Camera, x: number, y: number, width: number, height: number, dpr: number, zoom: number, dt: number) {
  const n = pixelSize(width, height, dpr, zoom);
  const scale = n / dpr;
  const viewW = width / scale;
  const viewH = height / scale;
  const ease = camera.placed ? Math.min(1, dt * 4) : 1;
  camera.x += (clamp(x - viewW / 2, W - viewW) - camera.x) * ease;
  camera.y += (clamp(y - viewH / 2, H - viewH) - camera.y) * ease;
  camera.placed = true;
  // The wanderer's pixel less the offset, the offset on whole device pixels.
  const dx = Math.round((x - camera.x) * n) / n;
  const dy = Math.round((y - camera.y) * n) / n;
  return {
    scale,
    left: clamp(Math.round(x) - dx, Math.floor((W - viewW) * n + 1e-6) / n),
    top: clamp(Math.round(y) - dy, Math.floor((H - viewH) * n + 1e-6) / n),
  };
}

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
