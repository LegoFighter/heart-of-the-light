// A sheet of the wanderer's walk, six times enlarged, to look at the rig: node tools/hero-sheet.mjs OUT.png
// (needs the dev server; the page hands the view out as window.hotlView in dev).
import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--mute-audio"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
await page.goto("http://127.0.0.1:8796/");
await page.waitForSelector(".hotl-stage[data-ready]", { timeout: 60000 });
await page.waitForFunction(() => window.hotlView);
await page.evaluate(() => {
  const canvas = document.createElement("canvas");
  canvas.width = 1400; canvas.height = 700; canvas.id = "sheet";
  canvas.style.cssText = "position:fixed;left:0;top:0;z-index:99999;background:#5f7a3a";
  document.body.appendChild(canvas);
  const c = canvas.getContext("2d");
  c.imageSmoothingEnabled = false;
  c.scale(6, 6);
  const puppet = window.hotlView.puppet;
  ["front", "side", "back"].forEach((view, row) => {
    for (let i = 0; i < 8; i++) {
      puppet.update(view, false, { phase: (i / 8) * Math.PI * 2, walk: 1, t: row * 10 + i, wind: 0, swing: 0, cloak: 0, hem: 0 });
      c.drawImage(puppet.sprite, 4 + i * 28, 4 + row * 38);
    }
  });
});
await page.locator("#sheet").screenshot({ path: process.argv[2] });
await browser.close();
