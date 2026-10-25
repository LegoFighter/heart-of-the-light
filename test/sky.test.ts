import { describe, expect, it } from "vitest";
import { advance, DAY_SECONDS, phaseOf, skyAt, START_HOUR } from "../game/sky";
import { airOf, changeTo, createWeather, flashOf, KINDS, stepWeather } from "../game/weather";

/** A repeatable random, for weather that must come out the same every run. */
function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

describe("the day", () => {
  it("shows the painting as it is at its own hour", () => {
    const sky = skyAt(START_HOUR);
    expect(sky.light).toBeCloseTo(1);
    expect(sky.tint).toEqual([1, 1, 1]);
    expect(sky.night).toBe(0);
  });

  it("is dark and blue at midnight, bright at noon, and turns smoothly", () => {
    expect(skyAt(0).night).toBe(1);
    expect(skyAt(0).light).toBeLessThan(0.5);
    expect(skyAt(12).light).toBeGreaterThan(1);
    for (let h = 0; h < 24; h += 0.25) expect(Math.abs(skyAt(h + 0.25).light - skyAt(h).light)).toBeLessThan(0.15);
  });

  it("names the parts of the day and passes a day in DAY_SECONDS", () => {
    expect(phaseOf(6)).toBe("dawn");
    expect(phaseOf(13)).toBe("day");
    expect(phaseOf(19)).toBe("dusk");
    expect(phaseOf(23)).toBe("night");
    expect(advance(10, DAY_SECONDS)).toBeCloseTo(10);
    expect(advance(23, DAY_SECONDS / 12)).toBeCloseTo(1);
  });
});

describe("the weather", () => {
  it("blends from one kind into the next and says so once", () => {
    const w = createWeather("clear", seeded(1));
    const events = changeTo(w, "rain");
    expect(events).toEqual([{ type: "weather", kind: "rain" }]);
    expect(airOf(w).rain).toBe(0);
    stepWeather(w, 6, seeded(2));
    expect(airOf(w).rain).toBeGreaterThan(0.1);
    expect(airOf(w).rain).toBeLessThan(0.6);
    stepWeather(w, 7, seeded(3));
    expect(airOf(w).rain).toBeCloseTo(0.6);
  });

  it("changes by itself, to every kind in time, from every kind", () => {
    const rand = seeded(7);
    const w = createWeather("clear", rand);
    const seen = new Set<string>(["clear"]);
    for (let i = 0; i < 20000; i++)
      for (const event of stepWeather(w, 1, rand)) if (event.type === "weather") seen.add(event.kind);
    expect([...seen].sort()).toEqual([...KINDS].sort());
  });

  it("lays snow while it snows and melts it after", () => {
    const w = createWeather("snow", seeded(4));
    w.cover = 0;
    w.until = 1e9;
    for (let i = 0; i < 60; i++) stepWeather(w, 1, seeded(i));
    expect(w.cover).toBeGreaterThan(0.9);
    changeTo(w, "clear");
    for (let i = 0; i < 200; i++) stepWeather(w, 1, seeded(i));
    expect(w.cover).toBe(0);
  });

  it("stops the snow at once and melts it in seconds when the button switches it off", () => {
    const w = createWeather("snow", seeded(5));
    w.cover = 1;
    changeTo(w, "clear", seeded(6), true);
    for (let i = 0; i < 30; i++) stepWeather(w, 0.1, seeded(i));
    expect(airOf(w).snow).toBe(0);
    for (let i = 0; i < 60; i++) stepWeather(w, 0.1, seeded(i));
    expect(w.cover).toBe(0);
    expect(w.thaw).toBe(false);
  });

  it("lets snow come back and lie after a thaw", () => {
    const w = createWeather("snow", seeded(7));
    w.cover = 1;
    changeTo(w, "clear", seeded(8), true);
    for (let i = 0; i < 40; i++) stepWeather(w, 0.1, seeded(i));
    changeTo(w, "snow", seeded(9), true);
    for (let i = 0; i < 100; i++) stepWeather(w, 0.1, seeded(i));
    expect(w.cover).toBeGreaterThan(0.1);
  });

  it("throws lightning in a storm only, and flashes briefly", () => {
    const rand = seeded(9);
    const calm = createWeather("rain", rand);
    calm.until = 1e9;
    const storm = createWeather("storm", rand);
    storm.until = 1e9;
    let calmBolts = 0;
    let stormBolts = 0;
    for (let i = 0; i < 600; i++) {
      calmBolts += stepWeather(calm, 0.1, rand).filter((e) => e.type === "lightning").length;
      stormBolts += stepWeather(storm, 0.1, rand).filter((e) => e.type === "lightning").length;
    }
    expect(calmBolts).toBe(0);
    expect(stormBolts).toBeGreaterThan(2);
    storm.struck = 0;
    expect(flashOf(storm)).toBe(1);
    storm.struck = 1;
    expect(flashOf(storm)).toBe(0);
  });
});
