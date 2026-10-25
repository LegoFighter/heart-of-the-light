import { describe, expect, it } from "vitest";
import { caveOpen, compass, createPlay, lightCount, nearestGoal, SPEED, step, walkOn } from "../game/play";
import { say, LOCALES } from "../game/text";
import { CAVE, MOTES, PLACES, SPAWN, walkable, W, H } from "../game/world";

/** Every walkable cell reachable from the start, on a 2-pixel grid. */
function reachable(open: boolean): Set<string> {
  const seen = new Set<string>();
  const queue: [number, number][] = [[SPAWN[0], SPAWN[1]]];
  seen.add(`${SPAWN[0]},${SPAWN[1]}`);
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const [nx, ny] = [x + dx, y + dy];
      const key = `${nx},${ny}`;
      if (seen.has(key) || nx < 0 || ny < 0 || nx > W || ny > H || !walkable(nx, ny, open)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

const near = (cells: Set<string>, x: number, y: number, r: number) =>
  [...cells].some((key) => {
    const [cx, cy] = key.split(",").map(Number);
    return Math.hypot(cx - x, cy - y) <= r;
  });

describe("the glade", () => {
  const closed = reachable(false);
  const open = reachable(true);

  it("starts on walkable ground", () => {
    expect(walkable(SPAWN[0], SPAWN[1], false)).toBe(true);
  });

  it("lets the wanderer reach every light", () => {
    for (const [x, y] of MOTES) expect(near(closed, x, y, 10), `light at ${x},${y}`).toBe(true);
  });

  it("lets the wanderer reach every place", () => {
    for (const place of PLACES) expect(near(closed, place.x, place.y, place.r - 4), place.id).toBe(true);
  });

  it("keeps the cave shut until all lights are gathered, then lets them in", () => {
    expect(near(closed, CAVE.x, CAVE.inside - 2, 4)).toBe(false);
    expect(near(open, CAVE.x, CAVE.inside - 2, 4)).toBe(true);
  });
});

describe("walking", () => {
  it("walks at its speed and faces the way it goes", () => {
    const play = createPlay();
    step(play, 0, -1, 0.5);
    expect(play.hero.y).toBeCloseTo(SPAWN[1] - SPEED / 2, 0);
    expect(play.hero.facing).toBe("up");
    expect(play.hero.walking).toBe(true);
  });

  it("slides along an edge instead of stopping", () => {
    const play = createPlay();
    play.hero.x = 600;
    play.hero.y = 560;
    // Down-left into the south edge: the feet keep going left.
    for (let i = 0; i < 20; i++) step(play, -1, 1, 0.05);
    expect(play.hero.x).toBeLessThan(600);
  });

  it("says when the way is blocked", () => {
    const play = createPlay();
    play.hero.y = 571;
    const events = step(play, 0, 1, 0.1);
    expect(events.some((e) => e.type === "bump")).toBe(true);
  });
});

describe("the lights", () => {
  it("gathers a light under the feet, opens the cave with the fifth, and takes the wanderer in", () => {
    const play = createPlay();
    const seen: string[] = [];
    MOTES.forEach(([x, y]) => {
      play.hero.x = x;
      play.hero.y = y;
      for (const event of step(play, 0, 0, 0.016)) seen.push(event.type);
    });
    expect(lightCount(play)).toBe(5);
    expect(caveOpen(play)).toBe(true);
    expect(seen.filter((t) => t === "gather")).toHaveLength(5);
    expect(seen).toContain("open");

    play.hero.x = CAVE.x;
    play.hero.y = CAVE.threshold - 2;
    let home = false;
    for (let i = 0; i < 60 && !home; i++) home = step(play, 0, -1, 0.05).some((e) => e.type === "home");
    expect(home).toBe(true);
    walkOn(play);
    expect(play.home).toBe(false);
    expect(play.hero.y).toBeGreaterThan(CAVE.threshold);
  });

  it("points to the nearest light, then to the cave", () => {
    const play = createPlay();
    const goal = nearestGoal(play);
    expect(goal.kind).toBe("light");
    expect(compass(goal.dx, goal.dy)).toMatch(/up/);
    play.gathered = play.gathered.map(() => true);
    expect(nearestGoal(play).kind).toBe("cave");
  });
});

describe("the words", () => {
  it("has every line in every language", () => {
    for (const locale of LOCALES) expect(say(locale, "lights", { n: 3 })).toContain("3");
  });
});
