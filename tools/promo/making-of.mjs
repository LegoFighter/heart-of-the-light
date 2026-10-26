// The making-of video (owner, 2026-10-25, for a question on Reddit: how the scene was made): the
// stages one after another, about two minutes, 1920x1080. A still is the picture with a caption
// (the raw painting, the masks, the ground without plants), a clip is the game's own page or the
// tree study rendered frame by frame in a muted Chromium of its own (the clock is Playwright's,
// as in quad.mjs), each with a caption drawn by the page in its pixel font; ffmpeg joins them.
//
//   node tools/promo/making-of.mjs [out.mp4]
//
// Writes tools/promo/making-of.mp4 by default (not checked in). Needs the dev server (npm run
// dev; PORT=… for another port) and ffmpeg (FFMPEG=…). SPEED=0.2 shortens every stage to a fifth
// for a quick look (not SECONDS: that is the shell's own integer), STAGES=0,3 renders only those
// stages. No sound.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const FFMPEG = process.env.FFMPEG ?? "/opt/homebrew/bin/ffmpeg";
const out = process.argv[2] ?? "tools/promo/making-of.mp4";
const fps = 30;
const step = 1000 / fps;
const port = process.env.PORT ?? "8796";
const SCALE = Number(process.env.SPEED ?? 1);
const OUT = { width: 1920, height: 1080 };
/** The clips are rendered at half size and doubled (pixel for pixel), as the quadrant video is. */
const CLIP = { width: 960, height: 540 };
const cover = Math.max(CLIP.width / 1024, CLIP.height / 576);
const zoomFor = (n) => n / cover;
const ease = (k) => k * k * (3 - 2 * k);
const S = (s) => s * SCALE;

const CAPTION_CSS = `
  .mk-cap { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; padding: 14px 22px 16px; font-family: var(--pixel), monospace;
    color: #f4ecd2; background: rgba(20, 15, 8, 0.78); border-top: 2px solid #e9d79a; pointer-events: none; }
  .mk-cap b { display: block; font-weight: normal; color: #f2c94c; }
  .mk-cap span { display: block; opacity: 0.95; }
`;

/** The stages. A `card` is words on a dark ground, a `still` a picture (a file, shown pixel for
    pixel as far as it fits), a `clip` the game at `query` with the camera gliding from `from`
    to `to`, a `tree` the tree study at `query`; `cues` press keys at seconds, `caps` are the
    captions with their seconds ([from, to, heading, line]). */
const STAGES = [
  { kind: "card", seconds: 4, lines: ["Heart of the Light", "how the glade was made"] },
  {
    kind: "still", seconds: 9, file: "tools/art/raw/scene.png",
    cap: ["1 · One picture", "A static scene from OpenAI's image model, drawn after one reference screenshot. Nothing moves yet."],
  },
  {
    kind: "still", seconds: 8, file: "tools/art/raw/old-masks.png",
    cap: ["2 · The masks", "A colour per kind of pixel: leaves and grass sway, water runs, stone, wood and walls stand still."],
  },
  {
    kind: "clip", seconds: 14, query: "hour=13&weather=clear&at=520,470", from: [470, 450], to: [540, 440], n: 3, cues: [],
    caps: [[0, 99, "3 · The wave", "A slow gust runs across the glade; only the pixels the mask allows move with it."]],
  },
  {
    kind: "clip", seconds: 21, query: "hour=5&weather=clear&at=640,300", from: [760, 290], to: [780, 290], n: 2,
    cues: [
      { at: 5, tap: "t" }, { at: 5.3, tap: "t" }, // 11:00
      { at: 10, tap: "t" }, { at: 10.3, tap: "t" }, // 17:00
      { at: 15, tap: "t" }, // 20:00
      { at: 18, tap: "t" }, // 23:00
    ],
    caps: [
      [0, 5, "4 · Light", "The hours tint the whole frame through one palette made of the painting's own colours. Dawn."],
      [5, 10, "4 · Light", "Morning: the sun's patches and the crowns' shade on the grass."],
      [10, 15, "4 · Light", "The golden hour."],
      [15, 18, "4 · Light", "Dusk: the windows and the lantern come on."],
      [18, 99, "4 · Light", "Night: the lantern's glow is laid under the palette, so it stays in the same colours."],
    ],
  },
  {
    kind: "clip", seconds: 18, query: "hour=11&weather=clear&at=560,440", from: [210, 70], to: [230, 330], n: 2,
    cues: [{ at: 5, tap: "y" }, { at: 5.3, tap: "y" }, { at: 12, tap: "y" }, { at: 12.3, tap: "y" }, { at: 12.6, tap: "y" }],
    caps: [
      [0, 5, "5 · Weather", "Six kinds of weather over the same picture. Clear."],
      [5, 12, "5 · Weather", "Rain: every drop lands somewhere, and splashes after what it hits."],
      [12, 99, "5 · Weather", "Snow settles, the falls freeze from their edges."],
    ],
  },
  {
    kind: "still", seconds: 8, file: "tools/art/raw/ground-2x.png",
    cap: ["6 · The ground alone", "A tester asked: is it all one static image? So the painting was redone without plants, and the trees, bushes and rocks became objects."],
  },
  {
    kind: "tree", seconds: 17, query: "bare=1&wind=0.8", cues: [{ at: 6, tap: "l" }],
    caps: [
      [0, 6, "7 · A tree", "A bare tree painted by the image model, cut out from magenta; its twig tips are marked."],
      [6, 99, "7 · A tree", "A rig in code grows twigs and leaves on those tips. Each leaf is lit by how free it is to the sun, and the crown takes the wind."],
    ],
  },
  {
    kind: "clip", seconds: 16, query: "hour=15&weather=clouds&at=520,470", from: [470, 450], to: [540, 440], n: 3,
    cues: [{ at: 4, tap: "y" }, { at: 4.3, tap: "y" }, { at: 4.6, tap: "y" }, { at: 4.9, tap: "y" }],
    caps: [
      [0, 4, "8 · The glade with the new trees", "Every tree in the glade is now such a rig on a painted trunk of its own."],
      [4, 99, "8 · The glade with the new trees", "Winter comes: the leaves let go as the snow settles."],
    ],
  },
  { kind: "card", seconds: 5, lines: ["Heart of the Light", "play free at minigames.world", "no engine · Next.js, one canvas, one shader"] },
];

/** Opens a page at `size` with the stage hidden and the game's font there, for cards and stills. */
async function blank(browser, size) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector(".hotl-stage", { timeout: 120000 });
  await page.addStyleTag({
    content: `
      html, body { background: #0f0c06 !important; margin: 0; }
      .hotl-stage { display: none !important; }
      .card { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px;
        background: #0f0c06; font-family: var(--pixel), monospace; color: #f4ecd2; text-align: center; text-shadow: 0 2px 0 #1a1408; }
      .card b { font-size: 84px; font-weight: normal; color: #f2c94c; }
      .card span { font-size: 36px; opacity: 0.95; }
      .still { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: #0f0c06; }
      .still img { image-rendering: pixelated; }
      ${CAPTION_CSS}
      .mk-cap b { font-size: 44px; } .mk-cap span { font-size: 30px; }
    `,
  });
  return page;
}

async function pngToVideo(png, seconds, file) {
  const src = file + ".png";
  writeFileSync(src, png);
  console.log("still", src, png.length, "bytes,", seconds, "s");
  await run([
    "-v", "warning", "-y", "-loop", "1", "-framerate", String(fps), "-t", String(seconds), "-i", src,
    "-vf", `scale=${OUT.width}:${OUT.height}:flags=neighbor,format=yuv420p`, "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-r", String(fps), file,
  ]);
}

async function renderCard(browser, stage, file) {
  const page = await blank(browser, OUT);
  await page.evaluate((lines) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = lines.map((l, i) => (i === 0 ? `<b>${l}</b>` : `<span>${l}</span>`)).join("");
    document.body.append(card);
  }, stage.lines);
  await page.waitForTimeout(800);
  await pngToVideo(await page.screenshot({ type: "png" }), S(stage.seconds), file);
  await page.close();
}

async function renderStill(browser, stage, file) {
  const page = await blank(browser, OUT);
  const data = "data:image/png;base64," + readFileSync(stage.file).toString("base64");
  await page.evaluate(([src, cap]) => {
    const box = document.createElement("div");
    box.className = "still";
    const img = document.createElement("img");
    img.src = src;
    box.append(img);
    const c = document.createElement("div");
    c.className = "mk-cap";
    c.innerHTML = `<b>${cap[0]}</b><span>${cap[1]}</span>`;
    document.body.append(box, c);
    return new Promise((resolve) => {
      img.onload = () => {
        // As big as it goes at a whole number of screen pixels per pixel, or the whole frame
        // when the picture is wider than it (the 2x paintings shown at half).
        const n = Math.floor(Math.min(1920 / img.naturalWidth, 1080 / img.naturalHeight));
        if (n >= 1) { img.style.width = img.naturalWidth * n + "px"; img.style.height = img.naturalHeight * n + "px"; }
        else { img.style.width = "1920px"; img.style.height = (1920 * img.naturalHeight) / img.naturalWidth + "px"; }
        resolve();
      };
    });
  }, [data, stage.cap]);
  await page.waitForTimeout(800);
  await pngToVideo(await page.screenshot({ type: "png" }), S(stage.seconds), file);
  await page.close();
}

/** A clip of the game (or the tree study), frame by frame on Playwright's clock. */
async function renderClip(browser, stage, file) {
  const tree = stage.kind === "tree";
  const page = await browser.newPage({ viewport: CLIP, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  page.setDefaultTimeout(180000);
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await page.goto(`http://127.0.0.1:${port}/${tree ? "tree" : ""}?promo=1&${stage.query}`);
  await page.addStyleTag({
    content: `
      .hotl-lights, .hotl-corner { display: none !important; }
      ${CAPTION_CSS}
      .mk-cap { padding: 8px 12px 9px; }
      .mk-cap b { font-size: 22px; } .mk-cap span { font-size: 15px; }
    `,
  });
  if (tree) {
    await page.waitForSelector(".hotl-tree-canvas");
    for (let k = 0; k < 90; k++) await page.clock.runFor(17); // the painted tree and the colours load
  } else {
    const ready = page.locator(".hotl-stage[data-ready]");
    for (let k = 0; k < 6000 && !(await ready.count()); k++) await page.clock.runFor(17);
    await page.focus(".hotl-stage");
    await page.keyboard.press("ArrowDown");
    await page.evaluate((cam) => (window.hotlCamera = cam), { x: stage.from[0], y: stage.from[1], zoom: zoomFor(stage.n) });
    for (let i = 0; i < 40; i++) await page.clock.runFor(step);
  }
  await page.evaluate(() => {
    const c = document.createElement("div");
    c.className = "mk-cap";
    document.body.append(c);
  });

  const seconds = S(stage.seconds);
  const frames = Math.round(seconds * fps);
  const ffmpeg = spawn(FFMPEG, [
    "-v", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
    "-vf", `scale=${OUT.width}:${OUT.height}:flags=neighbor,format=yuv420p`, "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-r", String(fps), file,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg " + code)))));
  const t0 = Date.now();
  for (let k = 0; k < frames; k++) {
    const now = k / fps / SCALE;
    for (const cue of stage.cues ?? []) if (cue.tap && Math.abs(S(cue.at) - k / fps) < 0.5 / fps) await page.keyboard.press(cue.tap);
    if (!tree) {
      const k01 = ease(Math.min(1, k / frames));
      const aim = { x: stage.from[0] + (stage.to[0] - stage.from[0]) * k01, y: stage.from[1] + (stage.to[1] - stage.from[1]) * k01, zoom: zoomFor(stage.n) };
      await page.evaluate((cam) => (window.hotlCamera = cam), aim);
    }
    const cap = stage.caps.find(([a, b]) => now >= a && now < b);
    await page.evaluate((cap) => {
      const el = document.querySelector(".mk-cap");
      const html = cap ? `<b>${cap[2]}</b><span>${cap[3]}</span>` : "";
      if (el && el.innerHTML !== html) el.innerHTML = html;
    }, cap);
    await page.clock.runFor(step);
    const png = await page.screenshot({ type: "png" });
    if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
    if (k % 150 === 0) console.log(`${stage.kind} ${stage.query}: ${k}/${frames} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  ffmpeg.stdin.end();
  await done;
  await page.close();
}

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ["ignore", "inherit", "inherit"] });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg " + code))));
  });
}

const dir = mkdtempSync(join(tmpdir(), "hotl-making-"));
console.log("segments in", dir);
const browser = await chromium.launch({ args: ["--mute-audio", "--ignore-gpu-blocklist"] });
const files = [];
const only = process.env.STAGES?.split(",").map(Number);
for (const [i, stage] of STAGES.entries()) {
  if (only && !only.includes(i)) continue;
  const file = join(dir, `s${String(i).padStart(2, "0")}.mp4`);
  if (stage.kind === "card") await renderCard(browser, stage, file);
  else if (stage.kind === "still") await renderStill(browser, stage, file);
  else await renderClip(browser, stage, file);
  files.push(file);
}
await browser.close();
const list = join(dir, "list.txt");
writeFileSync(list, files.map((f) => `file '${f}'`).join("\n"));
await run(["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out]);
rmSync(dir, { recursive: true, force: true });
console.log(out);
