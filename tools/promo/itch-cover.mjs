// Takes the cover for itch.io (630x500, what itch recommends; owner, 2026-10-24: "ein schönes
// Ingame-Cover"): the glade at golden hour with the wanderer on the path, the name lettered over
// it in the game's own type, drawn at two screen pixels per pixel and halved, so the cover keeps
// the game's pure pixels. Muted Chromium of its own.
//
//   node tools/promo/itch-cover.mjs [out.png] [at=x,y] [hour=17.5]
//
// Writes tools/promo/itch-cover.png by default. Needs the dev server (npm run dev).
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const [out = "tools/promo/itch-cover.png", ...rest] = process.argv.slice(2);
const opts = Object.fromEntries(rest.map((a) => a.split(/=(.*)/s)));
const browser = await chromium.launch({ args: ["--mute-audio", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 630, height: 500 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
const query = `zoom=1.5&hour=${opts.hour ?? 17.5}&weather=clear&at=${opts.at ?? "560,330"}`;
await page.goto("http://127.0.0.1:" + (process.env.PORT ?? 8796) + "/?" + query);
await page.waitForSelector(".hotl-stage[data-ready]", { timeout: 60000 });
await page.focus(".hotl-stage");
await page.keyboard.press("ArrowDown");
await page.addStyleTag({
  content: `
    .hotl-panel { display: none !important; }
    .cover-title { position: fixed; left: 0; right: 0; top: 9%; z-index: 20; text-align: center; font-family: var(--pixel), monospace;
      color: #f2c94c; font-size: 62px; line-height: 1.1; letter-spacing: 0.01em; pointer-events: none;
      text-shadow: 0 3px 0 #2a1d08, 0 0 14px rgba(0,0,0,0.75), 0 0 2px #1a1408; }
  `,
});
await page.evaluate(() => {
  const title = document.createElement("div");
  title.className = "cover-title";
  title.textContent = "Heart of the Light";
  document.body.append(title);
});
await page.waitForTimeout(1800);
const png = await page.screenshot({ type: "png" });
await browser.close();
// Halved by whole pixels with sips (every pixel is two screen pixels wide, so nothing is blurred).
writeFileSync(out, png);
execFileSync("sips", ["-z", "500", "630", out], { stdio: "ignore" });
console.log(out);
