/* The rules, without a picture or a sound: the wanderer walks, slides along what stops them,
   gathers the lights, and once all five are in the lantern the cave lets them in. step() returns
   what happened, so the view and the sound can answer it. */

import { CAVE, MOTES, PLACES, SPAWN, walkable, type PlaceId } from "./world";

export type Facing = "down" | "left" | "right" | "up";

/** Pixels per second: an easy walk for a figure 30 pixels tall. The meadow is about 400 across:
    some ten seconds of walking. */
export const SPEED = 42;
/** How near the feet come to the ground under a light to take it. */
export const REACH = 13;

export interface Hero {
  x: number;
  y: number;
  facing: Facing;
  walking: boolean;
  /** Seconds walked, for the stride. */
  stride: number;
}

export interface Play {
  hero: Hero;
  gathered: boolean[];
  /** The place the wanderer stands at, if any. */
  place: PlaceId | null;
  /** The cave takes the wanderer in once per visit: armed again when they walk back out. */
  armed: boolean;
  /** Inside the light: the finale stands until the player walks on. */
  home: boolean;
}

export type PlayEvent =
  | { type: "gather"; index: number; count: number }
  | { type: "open" }
  | { type: "place"; id: PlaceId }
  | { type: "home" }
  | { type: "bump" };

export function createPlay(): Play {
  return {
    hero: { x: SPAWN[0], y: SPAWN[1], facing: "up", walking: false, stride: 0 },
    gathered: MOTES.map(() => false),
    place: null,
    armed: true,
    home: false,
  };
}

export function lightCount(play: Play): number {
  return play.gathered.filter(Boolean).length;
}

export function caveOpen(play: Play): boolean {
  return lightCount(play) === MOTES.length;
}

function facingOf(dx: number, dy: number, was: Facing): Facing {
  if (dx === 0 && dy === 0) return was;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

/** One tick: `dx`, `dy` is where the player pushes (any length; it is cut to one). */
export function step(play: Play, dx: number, dy: number, dt: number): PlayEvent[] {
  const events: PlayEvent[] = [];
  const hero = play.hero;
  if (play.home) {
    hero.walking = false;
    return events;
  }
  const length = Math.hypot(dx, dy);
  if (length > 1) {
    dx /= length;
    dy /= length;
  }
  hero.facing = facingOf(dx, dy, hero.facing);
  hero.walking = false;
  if (length > 0.05) {
    const open = caveOpen(play);
    const nx = hero.x + dx * SPEED * dt;
    const ny = hero.y + dy * SPEED * dt;
    // Whole step, else slide along the edge on one axis, else stand.
    if (walkable(nx, ny, open)) [hero.x, hero.y] = [nx, ny];
    else if (dx !== 0 && walkable(nx, hero.y, open)) hero.x = nx;
    else if (dy !== 0 && walkable(hero.x, ny, open)) hero.y = ny;
    else events.push({ type: "bump" });
    hero.walking = events.length === 0;
    if (hero.walking) hero.stride += dt;
  }

  MOTES.forEach(([mx, my], index) => {
    if (play.gathered[index] || Math.hypot(hero.x - mx, hero.y - my) > REACH) return;
    play.gathered[index] = true;
    events.push({ type: "gather", index, count: lightCount(play) });
    if (caveOpen(play)) events.push({ type: "open" });
  });

  const place = PLACES.find((p) => Math.hypot(hero.x - p.x, hero.y - p.y) < p.r)?.id ?? null;
  if (place !== play.place) {
    play.place = place;
    if (place) events.push({ type: "place", id: place });
  }

  if (!play.armed && hero.y > CAVE.threshold + 16) play.armed = true;
  if (play.armed && hero.y < CAVE.inside) {
    play.armed = false;
    play.home = true;
    hero.walking = false;
    events.push({ type: "home" });
  }
  return events;
}

/** Out of the light again: back on the cave's step, facing the glade. */
export function walkOn(play: Play) {
  play.home = false;
  play.hero.x = CAVE.x;
  play.hero.y = CAVE.threshold + 6;
  play.hero.facing = "down";
}

/** What a blind player asks for with H: the nearest light still out, or the cave once all are in. */
export function nearestGoal(play: Play): { kind: "light" | "cave"; dx: number; dy: number; distance: number } {
  const { x, y } = play.hero;
  if (caveOpen(play)) {
    const dx = CAVE.x - x;
    const dy = CAVE.y - y;
    return { kind: "cave", dx, dy, distance: Math.hypot(dx, dy) };
  }
  let best = { kind: "light" as const, dx: 0, dy: 0, distance: Infinity };
  MOTES.forEach(([mx, my], index) => {
    if (play.gathered[index]) return;
    const distance = Math.hypot(mx - x, my - y);
    if (distance < best.distance) best = { kind: "light", dx: mx - x, dy: my - y, distance };
  });
  return best;
}

export type Compass = "up" | "upRight" | "right" | "downRight" | "down" | "downLeft" | "left" | "upLeft";

/** The eight screen directions, from a vector. */
export function compass(dx: number, dy: number): Compass {
  const order: Compass[] = ["right", "downRight", "down", "downLeft", "left", "upLeft", "up", "upRight"];
  const turn = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return order[(turn + 8) % 8];
}

export function nearness(distance: number): "veryClose" | "close" | "far" {
  return distance < 40 ? "veryClose" : distance < 140 ? "close" : "far";
}
