// Takes the cover for minigames.world (muted Chromium of its own): the glade at golden hour without
// the words over it, a part of it at two screen pixels per pixel, so the cover keeps the game's pure
// pixels. Writes tools/promo/cover.png (1000x750); the site's copy is apps/web/public/covers/
// heart-of-the-light.jpg.
//
//   node tools/promo/cover.mjs [left,top] [at=x,y] [hour=17.5]
//
// Needs the dev server (npm run dev).
import path from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const opts = Object.fromEntries(args.filter((a) => a.includes("=")).map((a) => a.split(/=(.*)/s)));
const [left, top] = (args.find((a) => !a.includes("=")) ?? "370,40").split(",").map(Number);
const out = path.join(import.meta.dirname, "cover.png");

const browser = await chromium.launch({ args: ["--mute-audio", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1024, height: 576 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
const query = `zoom=1&hour=${opts.hour ?? 17.5}&weather=clear&at=${opts.at ?? "600,250"}`;
await page.goto("http://127.0.0.1:" + (process.env.PORT ?? 8796) + "/?" + query);
await page.waitForSelector(".hotl-card .hotl-button:not([disabled])", { timeout: 60000 });
await page.locator(".hotl-card .hotl-button").click();
await page.addStyleTag({ content: ".hotl-panel { display: none !important; }" });
await page.waitForTimeout(2500);
// 500x375 pixels of the glade, each two screen pixels: 1000x750.
await page.screenshot({ path: out, clip: { x: left, y: top, width: 500, height: 375 } });
console.log(out);
await browser.close();
