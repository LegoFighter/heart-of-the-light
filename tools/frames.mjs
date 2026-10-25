// Takes a run of frames of the glade, to see what moves (muted Chromium of its own).
//
//   node tools/frames.mjs <out-dir> <count> <ms-between> [keys=Code:seconds,...] [hold=Code] [zoom=1] [wait=ms] [at=x,y]
//   [query=hour=22;weather=rain] (more of the page's pins, ; between them)
//
// Opens the page at 1024x576 with the camera's zoom taken out (?zoom=1 by default shows the whole
// glade one to one), presses Begin, holds the keys, then saves <out-dir>/frame-<n>.png, with the
// key `hold` down while it does.
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const [out, count, gap, ...rest] = process.argv.slice(2);
const opts = Object.fromEntries(rest.map((a) => a.split(/=(.*)/s)));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--mute-audio", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && console.log("[" + m.type() + "]", m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("http://127.0.0.1:" + (process.env.PORT ?? 8796) + "/?zoom=" + (opts.zoom ?? "1") + (opts.at ? "&at=" + opts.at : "") + (opts.query ? "&" + opts.query.replaceAll(";", "&") : ""));
await page.waitForSelector(".hotl-stage[data-ready]", { timeout: 60000 });
await page.focus(".hotl-stage");
await page.keyboard.press("ArrowDown");
for (const hold of (opts.keys ?? "").split(",").filter(Boolean)) {
  const [codes, s] = hold.split(":");
  for (const code of codes.split("~")) await page.keyboard.down(code);
  await page.waitForTimeout(Number(s ?? 1) * 1000);
  for (const code of codes.split("~")) await page.keyboard.up(code);
}
await page.waitForTimeout(Number(opts.wait ?? 1500));
if (opts.hold) await page.keyboard.down(opts.hold);
for (let i = 0; i < Number(count); i++) {
  await page.screenshot({ path: `${out}/frame-${i}.png` });
  await page.waitForTimeout(Number(gap));
}
console.log(JSON.stringify(await page.evaluate(() => ({ ...document.querySelector(".hotl-stage").dataset }))));
await browser.close();
