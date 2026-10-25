// Renders the phone video of the glade (owner, 2026-10-24: "nimm mal mit einer eher dynamischen
// Kamera selber ein Handy-Format auf, wo Objekte in Szene cinematischer gezeigt werden und
// verschiedene Weather"): 1080x1920, 30 fps, drawn frame by frame with the game's own page and
// renderer in a muted Chromium of its own. The page's clock is Playwright's and moves on by one
// frame's time before each picture, so the walk, the weather, the day and the camera run on the
// video's time whatever the machine does. The camera is the video's (?promo=1: the page aims
// where window.hotlCamera says, easing there as it does after the wanderer): slow moves over the
// falls, the cottage, the glade, the deer and the wanderer, through snow, rain, storm, fog and
// the night. The HUD is hidden; the last seconds carry the name and the site.
//
//   node tools/promo/short.mjs [out.mp4] [fps=30]
//
// Writes tools/promo/short.mp4 by default (not checked in). Needs the dev server (npm run dev;
// PORT=… for another port) and ffmpeg (FFMPEG=… for another path). No sound: the page is muted.
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const FFMPEG = process.env.FFMPEG ?? "/opt/homebrew/bin/ffmpeg";
const [out = "tools/promo/short.mp4", fpsArg = "30"] = process.argv.slice(2);
const fps = Number(fpsArg);
const step = 1000 / fps;
const port = process.env.PORT ?? "8796";

/** The shots: the camera moves from `from` to `to` (the painting's pixels) over the shot, at a
    zoom (1: four screen pixels per pixel on a phone, 1.5: five); `hero` aims at the wanderer. */
const SHOTS = [
  { from: 0, to: 8, cam: { from: [205, 95], to: [195, 300] }, zoom: 1 }, // the falls, frozen, in snow
  { from: 8, to: 15, cam: { from: [430, 330], to: [560, 400] }, zoom: 1 }, // the meadow, the snow going
  { from: 15, to: 23, cam: { from: [740, 340], to: [820, 250] }, zoom: 1.5 }, // the cottage in rain
  { from: 23, to: 30, cam: { from: [500, 290], to: [600, 360] }, zoom: 1 }, // the glade in the storm
  { from: 30, to: 37, cam: { from: [290, 350], to: [350, 330] }, zoom: 1.5 }, // the deer in the fog
  { from: 37, to: 46, hero: true, zoom: 1.5 }, // night: the wanderer and the lantern
];
const END = 46;
/** Keys and buttons on the video's clock: y is the next weather (snow → clear → clouds → rain →
    storm → fog), t moves the day on three hours. */
const CUES = [
  { at: 8.0, tap: "y" }, // clear: the snow thaws
  { at: 9.0, hold: "ArrowUp", until: 14.0 },
  { at: 14.5, tap: "y" }, // clouds
  { at: 16.0, tap: "y" }, // rain
  { at: 22.5, tap: "y" }, // storm
  { at: 24.0, hold: "ArrowLeft", until: 29.0 },
  { at: 29.5, tap: "y" }, // fog
  { at: 35.5, tap: "t" }, // 16:00
  { at: 36.2, tap: "t" }, // 19:00
  { at: 36.9, tap: "t" }, // 22:00
  { at: 38.0, hold: "ArrowUp", until: 45.5 },
];

const ease = (k) => k * k * (3 - 2 * k);
const shotAt = (s) => SHOTS.find((shot) => s >= shot.from && s < shot.to) ?? SHOTS[SHOTS.length - 1];

const browser = await chromium.launch({ args: ["--mute-audio", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && !m.text().includes("GL Driver") && console.log("[" + m.type() + "]", m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
// The page's clock is ours from the start: it stands still unless moved.
await page.clock.install({ time: 0 });
await page.clock.pauseAt(1000);
await page.goto(`http://127.0.0.1:${port}/?promo=1&hour=13&weather=snow&at=560,440`);
await page.addStyleTag({
  content: `
    .hotl-lights, .hotl-corner, .hotl-caption { display: none !important; }
    .hotl-card[data-gone] { display: none !important; }
    .promo-end { position: fixed; left: 0; right: 0; top: 0; bottom: 0; z-index: 20; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 18px;
      background: rgba(10, 8, 4, 0.55); font-family: var(--pixel), monospace; color: #f4ecd2; text-align: center;
      text-shadow: 0 2px 0 #1a1408; opacity: 0; transition: opacity 1.5s; pointer-events: none; }
    .promo-end[data-on] { opacity: 1; }
    .promo-end b { font-size: 34px; font-weight: normal; color: #f2c94c; line-height: 1.2; }
    .promo-end span { font-size: 16px; opacity: 0.9; }
  `,
});
// The page loads in real time while its clock moves a frame at a time, until Begin can be pressed.
const ready = page.locator(".hotl-stage[data-ready]");
for (let k = 0; k < 6000 && !(await ready.count()); k++) await page.clock.runFor(17);
await page.focus(".hotl-stage");
await page.keyboard.press("ArrowDown");
await page.evaluate(() => {
  const end = document.createElement("div");
  end.className = "promo-end";
  end.innerHTML = "<b>Heart of the Light</b><span>a glade, a day, every weather</span><span>play free at minigames.world</span>";
  document.body.append(end);
});
for (let i = 0; i < 20; i++) await page.clock.runFor(step);

const frames = Math.round(END * fps);
const ffmpeg = spawn(FFMPEG, ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(fps), "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
const done = new Promise((resolve, reject) => ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg " + code)))));

const held = new Set();
const t0 = Date.now();
let endShown = false;
for (let k = 0; k < frames; k++) {
  const now = k / fps;
  for (const cue of CUES) {
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
  const shot = shotAt(now);
  const k01 = ease(Math.max(0, Math.min(1, (now - shot.from) / (shot.to - shot.from))));
  const aim = shot.hero
    ? await page.evaluate(() => {
        const [x, y] = (document.querySelector(".hotl-stage")?.dataset.hero ?? "512,288").split(",").map(Number);
        return { x, y: y - 16 };
      })
    : { x: shot.cam.from[0] + (shot.cam.to[0] - shot.cam.from[0]) * k01, y: shot.cam.from[1] + (shot.cam.to[1] - shot.cam.from[1]) * k01 };
  await page.evaluate((cam) => {
    window.hotlCamera = cam;
  }, { ...aim, zoom: shot.zoom });
  if (!endShown && now >= END - 4) {
    endShown = true;
    await page.evaluate(() => document.querySelector(".promo-end")?.setAttribute("data-on", ""));
  }
  await page.clock.runFor(step);
  const png = await page.screenshot({ type: "png" });
  if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
  if (k % 150 === 0) console.log(`${k}/${frames} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
ffmpeg.stdin.end();
await done;
console.log(JSON.stringify(await page.evaluate(() => ({ ...document.querySelector(".hotl-stage").dataset }))));
await browser.close();
console.log(out);
