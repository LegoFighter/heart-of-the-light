// The four-quadrant video of the glade (owner, 2026-10-25: "cut a video … four quadrants with
// different views at the same time. Show the tree moving, how the deer run away, show the brook
// and waterfall, show the seasons condition on different day times"; "16:9 and mobile format"):
// four clips, each rendered frame by frame with the game's own page in a muted Chromium of its
// own (the page's clock is Playwright's, as in short.mjs), then laid in a 2x2 grid by ffmpeg
// with a small headline in each quadrant (drawn by the page itself, in its pixel font) and the
// no ending (CARD=4 appends the name on a dark ground).
//
//   node tools/promo/quad.mjs wide [out.mp4]     1920x1080, four 960x540 clips
//   node tools/promo/quad.mjs tall [out.mp4]     1080x1920, four 540x960 clips
//
// Writes tools/promo/quad-<format>.mp4 by default (not checked in). Needs the dev server
// (npm run dev; PORT=… for another port) and ffmpeg (FFMPEG=…). SECONDS=… shortens every clip
// for a quick look. No sound: the page is muted.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const FFMPEG = process.env.FFMPEG ?? "/opt/homebrew/bin/ffmpeg";
const [format = "wide", outArg] = process.argv.slice(2);
if (format !== "wide" && format !== "tall") throw new Error("format: wide or tall");
const out = outArg ?? `tools/promo/quad-${format}.mp4`;
const fps = 30;
const step = 1000 / fps;
const port = process.env.PORT ?? "8796";
const SECONDS = Number(process.env.SECONDS ?? 23);
/** No ending (owner, 2026-10-25: the video stops with the clips; CARD=4 in the environment
    appends the name on a dark ground for that many seconds). */
const CARD = Number(process.env.CARD ?? 0);
const TOTAL = SECONDS + CARD;

/** One quadrant's size and how many device pixels a painting pixel takes at `zoom` 1. */
const QUAD = format === "wide" ? { width: 960, height: 540 } : { width: 540, height: 960 };
const cover = Math.max(QUAD.width / 1024, QUAD.height / 576);
/** The zoom that shows the painting at `n` screen pixels per pixel (lib/camera.ts). */
const zoomFor = (n) => n / cover;

const ease = (k) => k * k * (3 - 2 * k);

/** The four clips. `query` opens the page; `cam` moves from `from` to `to` over the clip (or
    follows the wanderer with `hero`); `n` is the pixel size; `cues` press keys on the clip's
    clock (y: the next weather, t: three hours on); `titles` are the headlines with their
    seconds. */
const CLIPS = [
  {
    name: "trees",
    query: "hour=15&weather=clouds&at=520,470",
    cam: { from: [470, 450], to: [540, 440] },
    n: format === "wide" ? 3 : 4,
    // The crowns in the wind; then winter comes (the quick changes of the button, on through
    // rain, storm and fog to snow) and the trees shed their leaves as the snow settles (owner,
    // 2026-10-25: show how the trees lose their leaves).
    cues: [
      { at: 6, tap: "y" }, // rain
      { at: 6.3, tap: "y" }, // storm
      { at: 6.6, tap: "y" }, // fog
      { at: 6.9, tap: "y" }, // snow
    ],
    titles: [
      [0, 6, "Trees in the wind"],
      [6, SECONDS, "Winter comes, the leaves fall"],
    ],
  },
  {
    name: "deer",
    query: "hour=13&weather=clear&at=400,320",
    cam: { from: [330, 330], to: [250, 330] },
    n: 2,
    // The wanderer walks towards the herd by the stream; it looks up, then bolts west through
    // the water and up the far bank.
    cues: [{ at: 1.5, hold: "ArrowLeft", until: 9 }, { at: 9, hold: "ArrowUp", until: 10.5 }, { at: 10.5, hold: "ArrowLeft", until: 14 }],
    titles: [[0, SECONDS, "The deer take flight"]],
  },
  {
    name: "falls",
    query: "hour=11&weather=clear&at=560,440",
    cam: { from: [210, 70], to: [230, 330] },
    n: 2,
    // The weather turns over the falls: clear, then rain, then snow (through a moment of storm
    // and fog, the quick changes of the button).
    cues: [
      { at: 8, tap: "y" }, // clouds
      { at: 8.3, tap: "y" }, // rain
      { at: 16, tap: "y" }, // storm
      { at: 16.3, tap: "y" }, // fog
      { at: 16.6, tap: "y" }, // snow
    ],
    titles: [
      [0, 8, "The falls and the brook"],
      [8, 16, "Rain"],
      [16, SECONDS, "Snow"],
    ],
  },
  {
    name: "day",
    query: "hour=5&weather=clear&at=640,300",
    cam: { from: [760, 290], to: [780, 290] },
    n: 2,
    // The hours at the cottage: dawn, the morning, the golden hour, dusk and the night with the
    // windows lit (T moves the day on three hours).
    cues: [
      { at: 5, tap: "t" }, // 8:00
      { at: 5.3, tap: "t" }, // 11:00
      { at: 10, tap: "t" }, // 14:00
      { at: 10.3, tap: "t" }, // 17:00
      { at: 15, tap: "t" }, // 20:00
      { at: 19, tap: "t" }, // 23:00
    ],
    titles: [
      [0, 5, "Dawn"],
      [5, 10, "Morning"],
      [10, 15, "Golden hour"],
      [15, 19, "Dusk"],
      [19, SECONDS, "Night"],
    ],
  },
];

async function render(clip, file) {
  const browser = await chromium.launch({ args: ["--mute-audio", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: QUAD.width, height: QUAD.height }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  // A loaded machine may take a while over a frame; the clock is ours, so nothing is lost.
  page.setDefaultTimeout(180000);
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await page.goto(`http://127.0.0.1:${port}/?promo=1&${clip.query}`);
  await page.addStyleTag({
    content: `
      .hotl-lights, .hotl-corner { display: none !important; }
      .promo-title { position: fixed; left: 14px; top: 14px; z-index: 20; padding: 8px 12px; font-family: var(--pixel), monospace;
        font-size: ${format === "wide" ? 26 : 24}px; color: #f4ecd2; background: rgba(20, 15, 8, 0.72); border: 2px solid #e9d79a;
        box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.5); pointer-events: none; white-space: nowrap; }
    `,
  });
  // The page loads in real time while its clock moves a frame at a time, until the art is in.
  const ready = page.locator(".hotl-stage[data-ready]");
  for (let k = 0; k < 6000 && !(await ready.count()); k++) await page.clock.runFor(17);
  await page.focus(".hotl-stage");
  await page.keyboard.press("ArrowDown");
  await page.evaluate(() => {
    const title = document.createElement("div");
    title.className = "promo-title";
    document.body.append(title);
  });
  // The camera stands on its first mark before the first frame.
  await page.evaluate((cam) => (window.hotlCamera = cam), { x: clip.cam.from[0], y: clip.cam.from[1], zoom: zoomFor(clip.n) });
  for (let i = 0; i < 40; i++) await page.clock.runFor(step);

  const frames = Math.round(TOTAL * fps);
  const ffmpeg = spawn(FFMPEG, ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-", "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(fps), file], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg " + code)))));
  const held = new Set();
  const t0 = Date.now();
  for (let k = 0; k < frames; k++) {
    const now = k / fps;
    for (const cue of clip.cues) {
      if (cue.tap && Math.abs(cue.at - now) < 0.5 / fps) await page.keyboard.press(cue.tap);
      if (cue.hold) {
        const on = now >= cue.at && now < cue.until;
        if (on && !held.has(cue.hold)) {
          held.add(cue.hold);
          await page.keyboard.down(cue.hold);
        } else if (!on && held.has(cue.hold) && now >= cue.until) {
          held.delete(cue.hold);
          await page.keyboard.up(cue.hold);
        }
      }
    }
    const k01 = ease(Math.min(1, now / SECONDS));
    const aim = { x: clip.cam.from[0] + (clip.cam.to[0] - clip.cam.from[0]) * k01, y: clip.cam.from[1] + (clip.cam.to[1] - clip.cam.from[1]) * k01, zoom: zoomFor(clip.n) };
    await page.evaluate((cam) => (window.hotlCamera = cam), aim);
    const title = clip.titles.find(([a, b]) => now >= a && now < b)?.[2] ?? "";
    await page.evaluate((text) => {
      const el = document.querySelector(".promo-title");
      if (el && el.textContent !== text) el.textContent = text;
    }, title);
    await page.clock.runFor(step);
    const png = await page.screenshot({ type: "png" });
    if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
    if (k % 150 === 0) console.log(`${clip.name}: ${k}/${frames} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  ffmpeg.stdin.end();
  await done;
  await browser.close();
}

const dir = mkdtempSync(join(tmpdir(), "hotl-quad-"));
console.log("clips in", dir);
const files = [];
for (const clip of CLIPS) {
  const file = join(dir, clip.name + ".mp4");
  await render(clip, file);
  files.push(file);
}

// The grid: a two-pixel frame round each clip, the four side by side; with CARD, the name on a
// dark ground after the clips (drawn by the browser at the grid's size).
const grid = { width: QUAD.width * 2, height: QUAD.height * 2 };
const cardFile = join(dir, "card.png");
const framed = CLIPS.map((clip, i) => `[${i}:v]pad=iw+4:ih+4:2:2:color=#140f08[q${i}]`).join(";");
const base = `${framed};[q0][q1][q2][q3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0[g];[g]scale=${grid.width}:${grid.height}:flags=neighbor`;
if (CARD > 0) {
  const browser = await chromium.launch({ args: ["--mute-audio"] });
  const page = await browser.newPage({ viewport: grid, deviceScaleFactor: 1 });
  // On the game's own page, so its pixel font is there; the glade itself is hidden and the
  // ground left clear.
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector(".hotl-stage", { timeout: 60000 });
  await page.addStyleTag({
    content: `
      html, body { background: transparent !important; }
      .hotl-stage { display: none !important; }
      .card { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px;
        background: #0f0c06; font-family: var(--pixel), monospace; color: #f4ecd2; text-align: center; text-shadow: 0 2px 0 #1a1408; }
      .card b { font-size: ${format === "wide" ? 72 : 64}px; font-weight: normal; color: #f2c94c; }
      .card span { font-size: ${format === "wide" ? 32 : 30}px; opacity: 0.95; }
    `,
  });
  await page.evaluate(() => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = "<b>Heart of the Light</b><span>a glade, a day, every weather</span><span>play free at minigames.world</span>";
    document.body.append(card);
  });
  await page.waitForTimeout(800);
  writeFileSync(cardFile, await page.screenshot({ type: "png", omitBackground: true }));
  await browser.close();
}
const filter = CARD > 0
  ? `${base}[gs];[4:v]format=rgba,fade=t=in:st=${SECONDS - 1}:d=1:alpha=1[c];[gs][c]overlay=0:0:enable='gte(t,${SECONDS - 1})'[v]`
  : `${base}[v]`;
const cardInput = CARD > 0 ? ["-loop", "1", "-t", String(TOTAL), "-i", cardFile] : [];
await new Promise((resolve, reject) => {
  const p = spawn(FFMPEG, ["-v", "error", "-y", ...files.flatMap((f) => ["-i", f]), ...cardInput, "-filter_complex", filter, "-map", "[v]", "-t", String(TOTAL), "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: "inherit" });
  p.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg " + code))));
});
rmSync(dir, { recursive: true, force: true });
console.log(out);
