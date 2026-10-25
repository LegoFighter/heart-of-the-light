// A sheet of the deer's poses, eight times enlarged, to look at the rig: node tools/deer-sheet.mjs OUT.png
// (needs the dev server; the page hands drawDeer out as window.hotlDeer in dev).
import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--mute-audio"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 500 } });
await page.goto("http://127.0.0.1:8796/");
await page.waitForSelector(".hotl-stage[data-ready]", { timeout: 60000 });
await page.waitForFunction(() => window.hotlDeer);
await page.evaluate(() => {
  const canvas = document.createElement("canvas");
  canvas.width = 1600; canvas.height = 500; canvas.id = "sheet";
  canvas.style.cssText = "position:fixed;left:0;top:0;z-index:99999;background:#5f7a3a";
  document.body.appendChild(canvas);
  const c = canvas.getContext("2d");
  c.imageSmoothingEnabled = false;
  c.scale(8, 8);
  const { drawDeer, drawDeerAlong } = window.hotlDeer;
  const poses = [
    ["stand", 0, 0], ["stand", 0, 1], ["walk", 0, 0], ["walk", 1.6, 0], ["walk", 3.1, 0], ["gallop", 0.8, 0], ["gallop", 2.4, 0], ["gallop", 4.0, 0],
  ];
  poses.forEach(([gait, phase, head], i) => drawDeer(c, 12 + i * 24, 26, -1, { gait, phase, head, t: 0 }));
  poses.forEach(([gait, phase, head], i) => drawDeerAlong(c, 12 + i * 24, 50, i % 2 === 0, { gait, phase, head, t: 0 }));
});
await page.locator("#sheet").screenshot({ path: process.argv[2] });
await browser.close();
