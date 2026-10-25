/* The picture, put together each frame. The glade itself moves in the shader (lib/stage.ts); what
   is drawn here goes on top of it, on two clear canvases the shader lays over the glade: the
   overlay before the hour's light and the weather (the wanderer, a puppet pressed into pixels by
   lib/puppet.ts, and their shadow; leaves falling from the autumn trees; butterflies by day; glints
   on the water and spray at the foot of the falls), and the glow after them, for what shines by
   itself (the five lights' cores, fireflies at dusk and by night). Without WebGL2 the plain picture
   stands, with all of that on it. */

import { asset } from "./asset";
import { Fauna, type Actor } from "./fauna";
import { drawDeer, drawDeerAlong } from "./deer";
import { Cloth, FEET_X, FEET_Y, Pendulum, Puppet, type Rig, type ViewName } from "./puppet";
import { Stage } from "./stage";
import { caveOpen, lightCount, type Facing, type Play } from "../game/play";
import type { Sky } from "../game/sky";
import type { Air } from "../game/weather";
import { CAVE, H, MOTES, PLUNGE, W, setTrunks, walkable } from "../game/world";
import { Flora, type FloraData, type TrunksData } from "./flora";

export interface Art {
  scene: HTMLImageElement;
  masks: HTMLImageElement;
  flow: HTMLImageElement;
  parts: HTMLImageElement;
  rig: Rig;
  /** Scene pixels (index y*W+x): open water, foam and falls, and autumn leaves to drop. */
  water: Uint32Array;
  foam: Uint32Array;
  autumn: Uint32Array;
  /** The colours the glade is painted in. */
  colours: number[][];
  /** The masks' pixels (masks.png: leaves, grass or path, water, falls), for what is underfoot
      and where the crowns are. */
  kinds: Uint8ClampedArray;
  /** Some pixels of the crowns, for snow to fall from. */
  crowns: Uint32Array;
  /** The trees and bushes, as objects (the experiment of 2026-10-24), and their pixels as they
      stand still (for a falling leaf's colour). */
  flora: Flora;
  plantPixels: Uint8ClampedArray;
}

export type Ground = "grass" | "path" | "other";

/** The figure's colour toned to the glade: a little darker and less clean, so it does not stand
    out from the painting. The lantern's glass (the yellows) keeps its light. */
/** The atlas's colour as the figure wears it. The lantern's light stays as it is; the cloak's
    greens become rust (owner, 2026-10-24: "der Charakter braucht mehr Kontrast zur Welt": a green
    cloak on a green glade was camouflage, and rust is the green's opposite, warm and still cosy);
    everything else is toned a little, not snapped to the glade's colours any more. */
export function tone([r, g, b]: number[]): number[] {
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  if (r > 200 && g > 150 && b < 110) return [r, g, b];
  if (g >= r * 0.95 && g > b * 1.3) return [Math.min(255, Math.round(l * 1.4)), Math.round(l * 0.72), Math.round(l * 0.5)];
  return [r, g, b].map((v) => Math.round((v * 0.85 + l * 0.15) * 0.92));
}

/** The nearest of `colours` to `c`. */
export function nearest(c: number[], colours: number[][]): number[] {
  let best = colours[0];
  let bestD = Infinity;
  for (const k of colours) {
    const d = (k[0] - c[0]) ** 2 + (k[1] - c[1]) ** 2 + (k[2] - c[2]) ** 2;
    if (d < bestD) [best, bestD] = [k, d];
  }
  return best;
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load " + src));
    image.src = src;
  });
}

function pixelsOf(image: HTMLImageElement): Uint8ClampedArray {
  const probe = document.createElement("canvas");
  probe.width = W;
  probe.height = H;
  const c = probe.getContext("2d", { willReadFrequently: true })!;
  c.drawImage(image, 0, 0);
  return c.getImageData(0, 0, W, H).data;
}

export async function loadArt(onProgress?: (share: number) => void): Promise<Art> {
  let done = 0;
  const tick = <T>(p: Promise<T>) => p.then((v) => (onProgress?.(++done / 9), v));
  const [scene, masks, flow, parts, rig, floraSheet, floraData, trunkSheet, trunkData] = await Promise.all([
    tick(load(asset("scene.png"))),
    tick(load(asset("masks.png"))),
    tick(load(asset("flow.png"))),
    tick(load(asset("hero-parts.png"))),
    tick(fetch(asset("hero-rig.json")).then((r) => r.json() as Promise<Rig>)),
    tick(load(asset("flora.png"))),
    tick(fetch(asset("flora.json")).then((r) => r.json() as Promise<FloraData>)),
    tick(load(asset("trunks.png"))),
    tick(fetch(asset("trunks.json")).then((r) => r.json() as Promise<TrunksData>)),
  ]);
  // Every tree a painted trunk of its own with the rig's leaves (lib/tree.ts), rendered once here.
  const flora = new Flora(floraSheet, floraData, { sheet: trunkSheet, data: trunkData });
  // The crowns as they stand still: some of their pixels for snow to drop from, and the autumn
  // ones for leaves to fall from (the scene itself has no crowns since 0.2.0).
  const still = document.createElement("canvas");
  still.width = W;
  still.height = H;
  const sc = still.getContext("2d", { willReadFrequently: true })!;
  flora.draw(sc, 0, floraData.placed.length, 0, 0);
  const plantPixels = sc.getImageData(0, 0, W, H).data;
  // A trunk blocks the feet; a bush is walked round as well.
  setTrunks(floraData.placed.map((p, i) => {
    const sp = floraData.sprites[p.sprite];
    // A rock's block sits a little up in it, so the feet come close behind its top and stand
    // hidden there.
    if (sp.kind === "rock") return { x: p.x, y: p.y - sp.h * 0.2, rx: sp.w * 0.42, ry: Math.max(4, sp.h * 0.3) };
    const half = sp.kind === "bush" ? sp.w * 0.4 : flora.trunkWidth(i) / 2 + 3;
    return { x: p.x, y: p.y - 1, rx: half, ry: sp.kind === "bush" ? 5 : 4 };
  }));
  const colour = pixelsOf(scene);
  const kind = pixelsOf(masks);
  const water: number[] = [];
  const foam: number[] = [];
  const autumn: number[] = [];
  const seen = new Set<number>();
  const crowns: number[] = [];
  for (let i = 0; i < W * H; i++) {
    const k = i * 4;
    seen.add((colour[k] << 16) | (colour[k + 1] << 8) | colour[k + 2]);
    if (kind[k + 2] === 255) water.push(i);
    else if (kind[k + 2] > 100 || kind[k + 3] > 128) foam.push(i);
    if (plantPixels[k + 3] > 0 && i % 7 === 0) {
      crowns.push(i);
      const [r, g, b] = [plantPixels[k], plantPixels[k + 1], plantPixels[k + 2]];
      if (r > 150 && r > g * 1.15 && g > b * 1.4) autumn.push(i);
    }
  }
  const colours = [...seen].map((v) => [v >> 16, (v >> 8) & 255, v & 255]);
  return { scene, masks, flow, parts, rig, water: Uint32Array.from(water), foam: Uint32Array.from(foam), autumn: Uint32Array.from(autumn), colours, kinds: kind, crowns: Uint32Array.from(crowns), flora, plantPixels };
}

interface Glint {
  at: number;
  born: number;
  life: number;
  falls: boolean;
}

interface Leaf {
  x: number;
  y: number;
  floor: number;
  vx: number;
  vy: number;
  spin: number;
  colour: string;
  born: number;
  landed: number;
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
}

/** A breath in the cold: a little cloud that rises, drifts with the wind and thins. */
interface Puff {
  x: number;
  y: number;
  vx: number;
  born: number;
  life: number;
}

/** A footprint in the snow, filled in again by the snow and the wind. `across`: walking left or
    right, so the print lies across the screen. */
interface Print {
  x: number;
  y: number;
  across: boolean;
  born: number;
}

/** A clump of snow come loose from a branch, or a drop from the eave when it thaws. */
interface Clump {
  x: number;
  y: number;
  vy: number;
  floor: number;
  born: number;
  landed: number;
  drop: boolean;
}

/** A bird flushed from a crown as the wanderer comes near. */
interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
}

/** The eave of the cottage that drips in a thaw. */
const EAVE = { x0: 742, x1: 922, y: 169 };
const POOL_MIDDLE: [number, number] = [246, 256];
const STUMP_TOP: [number, number] = [507, 330];


interface Wing {
  x: number;
  y: number;
  heading: number;
  colour: string;
  phase: number;
}

interface Fly {
  x: number;
  y: number;
  phase: number;
  speed: number;
}

/** The wind where something stands, about -1..1 times `strength`: the shader's gusts, without
    their noise. */
export function windAt(x: number, y: number, t: number, strength = 1): number {
  const s = x * 0.94 + y * 0.34;
  // The strength scales the wind, never its pace: a pace that followed the strength slid every
  // wave's phase while the weather changed (owner, 2026-10-25).
  const a = 0.5 + 0.5 * Math.sin(s * 0.011 - t * 0.9);
  const b = 0.5 + 0.5 * Math.sin(s * 0.027 - t * 1.7 + 1.3);
  return (Math.pow(a, 4) * 1.1 + Math.pow(b, 6) * 0.35 + Math.sin(t * 1.25 + x * 0.012) * 0.3 - 0.35) * strength;
}

/** The hour and the weather, as the picture needs them. */
export interface Surroundings {
  sky: Sky;
  air: Air;
  cover: number;
  wet: number;
  flash: number;
  /** The hour, 0..24: where the sun stands, for the shadows and the shader's light. */
  hour: number;
}

const VIEW_OF: Record<Facing, [ViewName, boolean]> = {
  down: ["front", false],
  up: ["back", false],
  right: ["side", false],
  left: ["side", true],
};

/** Walk cycles (two steps each) a second at full stride: the feet do not slide at SPEED. */
const CYCLES = 1.9;

export class View {
  private readonly overlay: HTMLCanvasElement;
  private readonly o: CanvasRenderingContext2D;
  private readonly glow: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  /** The ground canvas: what presses the snow down (footprints); the shader reads it where the
      snow lies. And the behind canvas: what stands among the trees (the deer), laid under the
      crowns in front of it. */
  private readonly ground: HTMLCanvasElement;
  private readonly gr: CanvasRenderingContext2D;
  private readonly behind: HTMLCanvasElement;
  private readonly b: CanvasRenderingContext2D;
  /** The front canvas: the plants that stand in front of the wanderer, over the overlay. */
  private readonly front: HTMLCanvasElement;
  private readonly fr: CanvasRenderingContext2D;
  private readonly stage: Stage | null = null;
  private readonly flat: CanvasRenderingContext2D | null = null;
  private readonly puppet: Puppet;
  private readonly pendulum = new Pendulum();
  private readonly cloth = new Cloth();
  private walk = 0;
  private phase = 0;
  private last = -1;
  private homeLevel = 0;
  private glints: Glint[] = [];
  private leaves: Leaf[] = [];
  private drops: Drop[] = [];
  private puffs: Puff[] = [];
  private nextBreath = 0;
  private prints: Print[] = [];
  private lastFall = -1;
  private clumps: Clump[] = [];
  private lastCover = 0;
  private birds: Bird[] = [];
  private nextFlush = 0;
  // The glade's others are there from the start, whatever the hour and the weather (owner,
  // 2026-10-24: "it should be all active at once, without any url manipulations").
  private readonly fauna: Fauna;
  private nextFlyover = 4;
  private beetleHeading = 0;
  private fishFlick = 0;
  private beetle: [number, number] = [STUMP_TOP[0], STUMP_TOP[1]];
  private wings: Wing[] = [];
  private flies: Fly[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    private readonly art: Art,
  ) {
    this.overlay = document.createElement("canvas");
    this.overlay.width = W;
    this.overlay.height = H;
    this.o = this.overlay.getContext("2d")!;
    this.o.imageSmoothingEnabled = false;
    this.glow = document.createElement("canvas");
    this.glow.width = W;
    this.glow.height = H;
    this.g = this.glow.getContext("2d")!;
    this.ground = document.createElement("canvas");
    this.ground.width = W;
    this.ground.height = H;
    this.gr = this.ground.getContext("2d")!;
    this.behind = document.createElement("canvas");
    this.behind.width = W;
    this.behind.height = H;
    this.b = this.behind.getContext("2d")!;
    this.front = document.createElement("canvas");
    this.front.width = W;
    this.front.height = H;
    this.fr = this.front.getContext("2d")!;
    try {
      this.stage = new Stage(canvas, art, this.overlay, this.glow, this.ground, this.behind, this.front);
    } catch (error) {
      console.warn("Heart of the Light draws without WebGL2:", error);
      canvas.width = W;
      canvas.height = H;
      this.flat = canvas.getContext("2d");
    }
    // The wanderer's colours: toned (the cloak rust, see `tone`), with a darker edge than the
    // atlas's so the figure reads against the glade; the palette filter in the shader brings
    // them into the glade's palette after.
    this.fauna = new Fauna(art.flora.data, art.colours);
    if (process.env.NODE_ENV !== "production") Object.assign(window, { hotlView: this, hotlDeer: { drawDeer, drawDeerAlong } });
    this.puppet = new Puppet(art.parts, { ...art.rig, edge: Math.min(art.rig.edge, 0.42), shown: art.rig.palette.map(tone) });
    for (let i = 0; i < 22; i++)
      this.flies.push({ x: 380 + Math.random() * 480, y: 160 + Math.random() * 330, phase: Math.random() * 10, speed: 0.4 + Math.random() * 0.6 });
    const colours = ["#f4f1de", "#f2c94c", "#e9874a"];
    for (let i = 0; i < 3; i++) this.wings.push({ x: 480 + i * 90, y: 260 + i * 60, heading: Math.random() * 6.3, colour: colours[i], phase: Math.random() * 6 });
  }

  draw(play: Play, t: number, around: Surroundings) {
    const dt = this.last < 0 ? 0 : Math.min(0.05, t - this.last);
    this.last = t;
    const { sky, air } = around;
    this.o.clearRect(0, 0, W, H);
    this.g.clearRect(0, 0, W, H);
    this.gr.clearRect(0, 0, W, H);
    this.b.clearRect(0, 0, W, H);
    this.fr.clearRect(0, 0, W, H);
    this.drawWater(t, dt, around.cover);
    this.drawFish(t, around.cover);
    this.art.flora.ground(this.gr, t, air.wind, around.hour);
    this.drawPrints(play, t, around.cover, air.snow);
    this.drawMotes(play, t, "ground");
    // The animals move, and leave their marks in the snow.
    const moment = { t, dt, heroX: play.hero.x, heroY: play.hero.y, hour: around.hour, night: sky.night, rain: air.rain, cover: around.cover };
    this.fauna.update(moment);
    for (const track of this.fauna.tracks) this.prints.push({ x: track.x, y: track.y, across: true, born: t });
    // The plants and the animals, sorted by their feet among the wanderer: behind the wanderer on
    // the behind canvas, in front of them on the front canvas.
    const flora = this.art.flora;
    flora.cover = around.cover;
    const heroY = Math.round(play.hero.y);
    this.b.imageSmoothingEnabled = false;
    this.drawSorted(this.fauna.actors(moment), flora, heroY, t, air.wind);
    this.drawBeetle(t, dt, around.cover);
    const lantern = this.drawHero(play, t, dt, air.wind, around.hour, sky.night);
    this.drawBreath(play, t, dt, air.wind, Math.max(air.snow, around.cover * 1.5, sky.night * around.cover * 2.0));
    this.drawClumps(t, dt, air, around.cover, sky.light);
    this.drawBirds(play, t, dt);
    this.drawMotes(play, t, "air");
    this.drawLeaves(t, dt, air.wind, around.cover);
    // Butterflies keep to dry daylight and stay in while snow lies (a tester saw them in a
    // blizzard); fireflies come out at dusk and keep out of rain and snow.
    const shelter = Math.max(air.rain, air.snow, air.storm, around.cover * 1.5);
    this.drawWings(t, dt, Math.max(0, 1 - sky.night * 2.5 - shelter * 2));
    this.drawFlies(t, Math.min(1, sky.night * 1.6) * (1 - shelter));

    this.homeLevel += ((play.home ? 1 : 0) - this.homeLevel) * Math.min(1, dt / (play.home ? 0.9 : 0.25));
    const count = lightCount(play);
    if (this.stage) {
      this.stage.render({
        t,
        lantern: [lantern[0], lantern[1], (0.46 + count * 0.07) * (0.9 + 0.1 * Math.sin(t * 13) * Math.sin(t * 7.3))],
        motes: MOTES.map(([x, y], i) => [x, y - 15 + Math.sin(t * 2.1 + i * 1.7) * 2, play.gathered[i] ? 0 : 1, Math.sin(t * 5 + i)]),
        lights: count,
        open: caveOpen(play) ? 1 : 0,
        home: this.homeLevel,
        // Weather takes light from the day; at night there is little left to take.
        light: sky.light * (1 - air.dark * (1 - sky.night * 0.6)),
        tint: sky.tint,
        night: sky.night,
        rain: air.rain,
        snow: air.snow,
        cover: around.cover,
        fog: air.fog,
        clouds: air.clouds,
        wind: air.wind,
        wet: around.wet,
        flash: around.flash,
        hour: around.hour,
        hero: [play.hero.x, play.hero.y],
        behindFeet: 0,
      });
    } else if (this.flat) {
      this.flat.drawImage(this.art.scene, 0, 0);
      this.flat.drawImage(this.behind, 0, 0);
      this.flat.drawImage(this.overlay, 0, 0);
      this.flat.drawImage(this.front, 0, 0);
      this.flat.drawImage(this.glow, 0, 0);
      if (this.homeLevel > 0.01) {
        this.flat.fillStyle = `rgba(255, 238, 200, ${(this.homeLevel * 0.82).toFixed(3)})`;
        this.flat.fillRect(0, 0, W, H);
      }
    }
  }

  /** Plants and animals in one order by their feet: what stands at or above the wanderer's feet
      goes on the behind canvas, the rest on the front canvas. */
  private drawSorted(actors: Actor[], flora: Flora, heroY: number, t: number, wind: number) {
    const { placed } = flora.data;
    let pi = 0;
    let ai = 0;
    while (pi < placed.length || ai < actors.length) {
      const plantY = pi < placed.length ? placed[pi].y : Infinity;
      const actorY = ai < actors.length ? actors[ai].y : Infinity;
      if (plantY <= actorY) {
        flora.draw(plantY <= heroY ? this.b : this.fr, pi, pi + 1, t, wind);
        pi++;
      } else {
        actors[ai].draw(actorY <= heroY ? this.b : this.fr);
        ai++;
      }
    }
  }

  /** What is under the wanderer's feet, for the sound of the steps. */
  groundAt(x: number, y: number): Ground {
    const g = this.art.kinds[((Math.round(y) * W + Math.round(x)) | 0) * 4 + 1];
    return g > 180 ? "grass" : g > 60 ? "path" : "other";
  }

  /** The wanderer: walk and breath into a pose, the pose into pixels. Returns the lantern's spot. */
  private drawHero(play: Play, t: number, dt: number, strength: number, hour: number, night: number): [number, number] {
    const { x, y, facing, walking } = play.hero;
    const [view, mirrored] = VIEW_OF[facing];
    this.walk += ((walking ? 1 : 0) - this.walk) * Math.min(1, dt * (walking ? 7 : 5));
    if (this.walk > 0.02) this.phase += dt * Math.PI * 2 * CYCLES * Math.max(0.35, this.walk);
    else this.phase = 0;
    const wind = windAt(x, y, t, strength);
    const sway = view === "side" ? Math.sin(this.phase) * 3 * this.walk * (mirrored ? -1 : 1) : Math.sin(this.phase) * 0.6 * this.walk;
    this.pendulum.step(x + sway, wind, dt);
    // The wind on the cloak, from behind or ahead as the figure faces: it blows out behind
    // walking into the wind too, as the walk's own draught is the stronger.
    const facingWind = view === "side" ? (mirrored ? -wind : wind) : wind * 0.5;
    this.cloth.step(this.walk, facingWind, dt);
    this.puppet.update(view, mirrored, { phase: this.phase, walk: this.walk, t, wind, swing: this.pendulum.angle, cloak: this.cloth.angle, hem: this.cloth.hem });

    const fx = Math.round(x);
    const fy = Math.round(y);
    const o = this.o;
    // Into the cave the figure darkens before the light takes it.
    o.globalAlpha = Math.max(0.25, Math.min(1, (y - CAVE.inside + 4) / (CAVE.threshold - CAVE.inside)));
    // The shadow follows the sun: long to the left in the morning (the sun over the cottage),
    // short at noon, long to the right in the evening (the sun over the falls); the moon's is faint.
    o.fillStyle = `rgba(20, 16, 8, ${(0.3 - night * 0.16).toFixed(2)})`;
    o.fillRect(fx - 3, fy - 1, 6, 2);
    const sun = -Math.cos(((hour - 6) / 12) * Math.PI);
    const reach = Math.round((3 + 10 * Math.abs(sun)) * (1 - night * 0.6));
    const dir = sun < 0 ? -1 : 1;
    for (let i = 1; i <= reach; i++) o.fillRect(fx + i * dir - (dir < 0 ? 1 : 0), fy - 1, 1, i < reach * 0.6 ? 2 : 1);
    o.drawImage(this.puppet.sprite, fx - FEET_X, fy - FEET_Y);
    o.globalAlpha = 1;
    const [lx, ly] = this.puppet.lantern;
    return [fx - FEET_X + lx, fy - FEET_Y + ly];
  }

  /** Footprints in the lying snow (owner, 2026-10-24: "i need those foot step in the snow"): one
      a step, left and right of the way, each a hollow in shade at its top and lighter at its
      foot. They fill in again over a minute, sooner while it snows, and go with the snow. */
  private drawPrints(play: Play, t: number, cover: number, snow: number) {
    const { x, y, walking, stride, facing } = play.hero;
    const step = Math.floor(stride * 4);
    if (walking && step !== this.lastFall) {
      this.lastFall = step;
      const across = facing === "left" || facing === "right";
      const side = step % 2 ? 1 : -1;
      if (cover > 0.25) this.prints.push({ x: x + (across ? 0 : side * 2), y: y + (across ? side : 0), across, born: t });
      if (this.prints.length > 400) this.prints.shift();
    }
    const fill = 60 / (1 + snow * 2);
    this.prints = this.prints.filter((print) => t - print.born < fill);
    const deep = Math.min(1, (cover - 0.15) * 2.5);
    if (deep <= 0) return;
    // On the ground canvas, read by the shader where the snow lies: the alpha is how far the
    // snow is pressed down (the hollow, deepest at its top), the red the snow pushed up at its
    // foot, which catches the light.
    const gr = this.gr;
    for (const print of this.prints) {
      const k = deep * (1 - (t - print.born) / fill);
      const width = print.across ? 3 : 2;
      const px = Math.round(print.x) - (print.across ? 1 : 0);
      const py = Math.round(print.y) - 1;
      const depth = print.across ? 1 : 2;
      gr.fillStyle = `rgba(0, 0, 0, ${(0.95 * k).toFixed(3)})`;
      gr.fillRect(px, py, width, 1);
      gr.fillStyle = `rgba(0, 0, 0, ${(0.6 * k).toFixed(3)})`;
      gr.fillRect(px, py + 1, width, depth);
      gr.fillStyle = `rgba(255, 0, 0, ${(0.5 * k).toFixed(3)})`;
      gr.fillRect(px, py + 1 + depth, width, 1);
    }
  }

  /** Snow comes loose from the branches in a gust and falls in clumps; in a thaw the eave drips. */
  private drawClumps(t: number, dt: number, air: Air, cover: number, light: number) {
    const { crowns } = this.art;
    const thawing = cover < this.lastCover - 1e-7 && air.snow < 0.1 && light > 0.7 && cover > 0.05;
    this.lastCover = cover;
    if (crowns.length && cover > 0.35 && Math.random() < dt * (0.4 + 3 * Math.max(0, windAt(500, 300, t, air.wind)))) {
      const at = crowns[(Math.random() * crowns.length) | 0];
      this.clumps.push({ x: at % W, y: (at / W) | 0, vy: 0, floor: ((at / W) | 0) + 8 + Math.random() * 22, born: t, landed: -1, drop: false });
    }
    if (thawing && Math.random() < dt * 2.5) {
      const x = EAVE.x0 + Math.random() * (EAVE.x1 - EAVE.x0);
      this.clumps.push({ x, y: EAVE.y, vy: 30, floor: EAVE.y + 14 + Math.random() * 30, born: t, landed: -1, drop: true });
    }
    this.clumps = this.clumps.filter((clump) => clump.landed < 0 || t - clump.landed < 0.3);
    const o = this.o;
    for (const clump of this.clumps) {
      if (clump.landed < 0) {
        clump.vy += 110 * dt;
        clump.y += clump.vy * dt;
        if (clump.y >= clump.floor) clump.landed = t;
      }
      const cx = Math.round(clump.x);
      const cy = Math.round(Math.min(clump.y, clump.floor));
      if (clump.drop) {
        o.fillStyle = clump.landed < 0 ? "rgba(200, 216, 236, 0.85)" : "rgba(200, 216, 236, 0.4)";
        o.fillRect(cx, cy, 1, clump.landed < 0 ? 2 : 1);
      } else if (clump.landed < 0) {
        o.fillStyle = "rgba(236, 240, 250, 0.92)";
        o.fillRect(cx, cy, 2, 2);
      } else {
        o.fillStyle = "rgba(236, 240, 250, 0.6)";
        o.fillRect(cx - 1, cy + 1, 4, 1);
      }
    }
  }

  /** Birds burst out of a crown the wanderer walks up to, and fly off over the trees; now and
      then a few cross the glade from one crown to another on their own. */
  private drawBirds(play: Play, t: number, dt: number) {
    const { x, y, walking } = play.hero;
    const { crowns } = this.art;
    if (t > this.nextFlyover && crowns.length) {
      this.nextFlyover = t + 9 + Math.random() * 12;
      const at = crowns[(Math.random() * crowns.length) | 0];
      const bx = at % W;
      const by = (at / W) | 0;
      const away = bx < W / 2 ? 1 : -1;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.birds.push({ x: bx + (Math.random() - 0.5) * 8, y: by + (Math.random() - 0.5) * 4, vx: away * (45 + Math.random() * 20), vy: -12 - Math.random() * 10, born: t });
    }
    if (walking && t > this.nextFlush) {
      const { kinds } = this.art;
      for (const [dx, dy] of [[-18, -14], [18, -14], [0, -28]]) {
        const px = Math.round(x + dx);
        const py = Math.round(y + dy);
        if (px < 0 || py < 0 || px >= W || py >= H || kinds[(py * W + px) * 4] < 60) continue;
        this.nextFlush = t + 3 + Math.random() * 4;
        const away = dx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dx);
        for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) this.birds.push({ x: px + (Math.random() - 0.5) * 6, y: py, vx: away * (20 + Math.random() * 25), vy: -40 - Math.random() * 30, born: t });
        break;
      }
    }
    this.birds = this.birds.filter((bird) => t - bird.born < 6 && bird.x > -4 && bird.x < W + 4 && bird.y > -4);
    const o = this.o;
    o.fillStyle = "rgba(28, 26, 22, 0.9)";
    for (const bird of this.birds) {
      bird.x += bird.vx * dt;
      bird.y += bird.vy * dt;
      bird.vy += 8 * dt;
      const bx = Math.round(bird.x);
      const by = Math.round(bird.y);
      const flap = Math.floor(t * 11 + bird.born * 7) % 2;
      o.fillRect(bx - 1, by - flap, 1, 1);
      o.fillRect(bx, by, 1, 1);
      o.fillRect(bx + 1, by - flap, 1, 1);
    }
  }


  /** A fish in the pool, a dark dash under the water, flicking at the surface now and then; gone
      under the ice. */
  private drawFish(t: number, cover: number) {
    if (cover > 0.3) return;
    const x = Math.round(POOL_MIDDLE[0] + Math.sin(t * 0.27) * 46 + Math.sin(t * 0.9) * 4);
    const y = Math.round(POOL_MIDDLE[1] + Math.cos(t * 0.21) * 13);
    const o = this.o;
    if (t > this.fishFlick + 11 && Math.random() < 0.004) this.fishFlick = t;
    const flick = t - this.fishFlick < 0.5;
    o.fillStyle = flick ? "rgba(214, 226, 230, 0.85)" : "rgba(30, 52, 56, 0.6)";
    o.fillRect(x - 1, y, 3, 1);
    if (flick) o.fillRect(x, y - 1, 1, 1);
  }

  /** A beetle wanders over the stump, turning now and then; it keeps under cover while snow
      lies on it. */
  private drawBeetle(t: number, dt: number, cover: number) {
    if (cover > 0.3) return;
    const [bx, by] = this.beetle;
    this.beetleHeading += (Math.random() - 0.5) * 6 * dt;
    let nx = bx + Math.cos(this.beetleHeading) * 2.5 * dt;
    let ny = by + Math.sin(this.beetleHeading) * 1.2 * dt;
    // At the stump's rim it turns back.
    if (Math.abs(nx - STUMP_TOP[0]) > 7 || Math.abs(ny - STUMP_TOP[1]) > 3) {
      this.beetleHeading += Math.PI;
      nx = bx;
      ny = by;
    }
    this.beetle = [nx, ny];
    this.o.fillStyle = "rgba(24, 20, 16, 0.9)";
    this.o.fillRect(Math.round(nx), Math.round(ny), 1, 1);
  }

  /** The wanderer's breath, seen when it is cold (`cold` 0..1): a puff every few seconds, more
      often walking, from the mouth towards where the face looks. */
  private drawBreath(play: Play, t: number, dt: number, wind: number, cold: number) {
    const { x, y, facing, walking } = play.hero;
    if (cold > 0.3 && t > this.nextBreath && !play.home) {
      this.nextBreath = t + (walking ? 1.6 : 2.8) + Math.random() * 0.8;
      const side = facing === "left" ? -3 : facing === "right" ? 3 : 0;
      // Breathing away from us, the cloud is behind the head: smaller, and only a little shows.
      if (facing !== "up" || Math.random() < 0.4) this.puffs.push({ x: x + side, y: y - 24 + (facing === "up" ? -2 : 0), vx: side * 2 + wind * 4, born: t, life: 1.1 + Math.random() * 0.4 });
    }
    this.puffs = this.puffs.filter((puff) => t - puff.born < puff.life);
    const o = this.o;
    for (const puff of this.puffs) {
      const age = (t - puff.born) / puff.life;
      puff.x += (puff.vx + wind * 3) * dt;
      puff.y -= 6 * dt;
      const px = Math.round(puff.x);
      const py = Math.round(puff.y);
      const fade = (1 - age) * Math.min(1, cold);
      // Grows from a dot to a small ragged cloud, drawn in two tones, thinning as it goes.
      o.fillStyle = `rgba(228, 234, 240, ${(0.55 * fade).toFixed(3)})`;
      if (age < 0.25) o.fillRect(px, py, 1, 1);
      else {
        const r = age < 0.6 ? 1 : 2;
        o.fillRect(px - r, py, r * 2 + 1, 1);
        o.fillRect(px, py - 1, 1, 3);
        if (r > 1) {
          o.fillStyle = `rgba(228, 234, 240, ${(0.3 * fade).toFixed(3)})`;
          o.fillRect(px - 1, py - 1, 3, 3);
        }
      }
    }
  }

  private drawWater(t: number, dt: number, cover: number) {
    const { water, foam } = this.art;
    const o = this.o;
    // The ice takes the glints and the spray with it (lib/stage.ts freezes the falls and the pool).
    const open = 1 - Math.max(0, Math.min(1, (cover - 0.2) / 0.75));
    if (water.length && Math.random() < open) for (let k = 0; k < 2; k++) this.glints.push({ at: water[(Math.random() * water.length) | 0], born: t, life: 0.3 + Math.random() * 0.5, falls: false });
    if (foam.length && Math.random() < open) for (let k = 0; k < 2; k++) this.glints.push({ at: foam[(Math.random() * foam.length) | 0], born: t, life: 0.2 + Math.random() * 0.3, falls: true });
    this.glints = this.glints.filter((g) => t - g.born < g.life);
    for (const g of this.glints) {
      const age = (t - g.born) / g.life;
      const gy = (g.at / W) | 0;
      const fallen = g.falls && gy < 214 ? Math.round(age * 7) : 0;
      o.fillStyle = `rgba(240, 252, 255, ${(Math.sin(age * Math.PI) * 0.85).toFixed(3)})`;
      o.fillRect(g.at % W, gy + fallen, g.falls ? 1 : 2, 1);
    }
    // Spray where the falls strike the pool.
    if (dt > 0 && Math.random() < open) {
      for (let k = 0; k < 2; k++)
        this.drops.push({ x: PLUNGE[0] + (Math.random() - 0.5) * 34, y: PLUNGE[1] + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 30, vy: -14 - Math.random() * 22, born: t });
    }
    this.drops = this.drops.filter((d) => t - d.born < 0.7);
    for (const d of this.drops) {
      d.vy += 70 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      o.fillStyle = `rgba(236, 248, 250, ${(0.8 * (1 - (t - d.born) / 0.7)).toFixed(3)})`;
      o.fillRect(Math.round(d.x), Math.round(d.y), 1, 1);
    }
  }

  private drawMotes(play: Play, t: number, layer: "ground" | "air") {
    const o = this.o;
    MOTES.forEach(([x, y], i) => {
      if (play.gathered[i]) return;
      if (layer === "ground") {
        o.fillStyle = "rgba(30, 24, 10, 0.25)";
        o.fillRect(x - 3, y - 1, 7, 2);
        return;
      }
      // The core shines by itself: it goes on the glow, over the night and the weather.
      const g = this.g;
      const hover = Math.round(y - 15 + Math.sin(t * 2.1 + i * 1.7) * 2);
      const blink = 0.75 + 0.25 * Math.sin(t * 5 + i);
      g.fillStyle = `rgba(255, 214, 120, ${(0.6 * blink).toFixed(3)})`;
      g.fillRect(x - 2, hover - 1, 5, 3);
      g.fillRect(x - 1, hover - 2, 3, 5);
      g.fillStyle = "#fff8dc";
      g.fillRect(x - 1, hover - 1, 3, 3);
      g.fillStyle = "#ffffff";
      g.fillRect(x, hover, 1, 1);
    });
  }

  /** Leaves come loose from the autumn crowns, drift with the wind, tumble, lie and fade. */
  private drawLeaves(t: number, dt: number, strength: number, cover: number) {
    const { autumn, crowns } = this.art;
    const o = this.o;
    // The autumn crowns drop a leaf now and then; while the snow settles every crown sheds
    // (lib/flora.ts: the trees go bare in steps), so the leaves come down thick from all of them
    // until the cover is whole.
    const shedding = cover > 0.03 && cover < 0.9 && crowns.length > 0;
    const from = shedding ? crowns : autumn;
    const rate = shedding ? 9 : 0.7 + 2.2 * Math.max(0, windAt(500, 300, t, strength));
    if (from.length && Math.random() < dt * rate * (shedding ? 1 : 1 - cover * 0.8)) {
      const at = from[(Math.random() * from.length) | 0];
      const x = at % W;
      const y = (at / W) | 0;
      // A crown pixel may be bark: only a leaf (green over red) comes down.
      const k = at * 4;
      if (shedding && this.art.plantPixels[k + 1] <= this.art.plantPixels[k]) return this.fallLeaves(t, dt, strength);
      this.leaves.push({
        x,
        y,
        floor: y + 18 + Math.random() * 40,
        vx: 4 + Math.random() * 6,
        vy: 7 + Math.random() * 6,
        spin: Math.random() * 6,
        colour: leafColour(this.art.plantPixels, x, y),
        born: t,
        landed: -1,
      });
    }
    this.fallLeaves(t, dt, strength);
  }

  /** The leaves in the air come down, and the landed ones fade. */
  private fallLeaves(t: number, dt: number, strength: number) {
    const o = this.o;
    this.leaves = this.leaves.filter((leaf) => leaf.landed < 0 || t - leaf.landed < 2.5);
    for (const leaf of this.leaves) {
      if (leaf.landed < 0) {
        const wind = windAt(leaf.x, leaf.y, t, strength);
        leaf.x += (leaf.vx + wind * 16 + Math.sin(t * 3 + leaf.spin) * 6) * dt;
        leaf.y += (leaf.vy + Math.cos(t * 3.7 + leaf.spin) * 4) * dt;
        if (leaf.y >= leaf.floor) leaf.landed = t;
      }
      const x = Math.round(leaf.x);
      const y = Math.round(leaf.y);
      o.globalAlpha = leaf.landed < 0 ? 1 : Math.max(0, 1 - (t - leaf.landed) / 2.5);
      o.fillStyle = leaf.colour;
      const turn = leaf.landed < 0 ? Math.floor(t * 7 + leaf.spin) % 4 : 0;
      if (turn === 0) o.fillRect(x, y, 2, 1);
      else if (turn === 1) o.fillRect(x, y, 1, 1);
      else if (turn === 2) o.fillRect(x, y, 1, 2);
      else {
        o.fillRect(x, y, 1, 1);
        o.fillRect(x + 1, y + 1, 1, 1);
      }
    }
    o.globalAlpha = 1;
  }

  /** Butterflies wander over the meadow, wings opening and closing; `out` of 1 are about. */
  private drawWings(t: number, dt: number, out: number) {
    const o = this.o;
    this.wings.forEach((b, i) => {
      if (i >= Math.floor(out * this.wings.length + 0.25)) return;
      b.heading += (Math.sin(t * 0.9 + b.phase) * 1.6 + Math.sin(t * 2.3 + b.phase * 2) * 0.8) * dt;
      const nx = b.x + Math.cos(b.heading) * 14 * dt;
      const ny = b.y + Math.sin(b.heading) * 9 * dt;
      if (walkable(nx, ny, false)) [b.x, b.y] = [nx, ny];
      else b.heading += Math.PI * 0.6;
      const x = Math.round(b.x);
      const y = Math.round(b.y - 8 - Math.sin(t * 2.6 + b.phase) * 2);
      const open = Math.floor(t * 9 + b.phase) % 2 === 0;
      o.fillStyle = "rgba(20, 16, 8, 0.2)";
      o.fillRect(x, Math.round(b.y), 1, 1);
      o.fillStyle = b.colour;
      if (open) {
        o.fillRect(x - 1, y, 1, 1);
        o.fillRect(x + 1, y, 1, 1);
        o.fillRect(x - 1, y - 1, 1, 1);
        o.fillRect(x + 1, y - 1, 1, 1);
      } else o.fillRect(x, y - 1, 1, 1);
      o.fillStyle = "#3a2a18";
      o.fillRect(x, y, 1, 1);
    });
  }

  /** Fireflies, `out` of 1 of them about: a blink of their own light, a faint halo round it. */
  private drawFlies(t: number, out: number) {
    const g = this.g;
    this.flies.forEach((f, i) => {
      if (i >= Math.round(out * this.flies.length)) return;
      const x = Math.round(f.x + Math.sin(t * f.speed + f.phase) * 18);
      const y = Math.round(f.y + Math.cos(t * f.speed * 0.7 + f.phase) * 10);
      const on = Math.sin(t * 1.7 + f.phase * 3);
      if (on < 0.2) return;
      g.fillStyle = `rgba(200, 255, 120, ${(on * 0.25).toFixed(3)})`;
      g.fillRect(x - 1, y, 3, 1);
      g.fillRect(x, y - 1, 1, 3);
      g.fillStyle = `rgba(240, 255, 170, ${(on * 0.95).toFixed(3)})`;
      g.fillRect(x, y, 1, 1);
    });
  }
}


/** The colour of the crown a leaf falls from. */
function leafColour(pixels: Uint8ClampedArray, x: number, y: number): string {
  const k = (y * W + x) * 4;
  const [r, g, b] = [pixels[k], pixels[k + 1], pixels[k + 2]];
  return `rgb(${Math.min(255, r + 20)}, ${Math.min(255, g + 12)}, ${b})`;
}
