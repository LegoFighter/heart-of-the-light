// Takes pictures of the glade, in a muted Chromium of its own (never a shared browser).
//
//   node tools/shot.mjs <out-dir> <width> <height> <name>=<keys>[@seconds] ...
//   node tools/shot.mjs shots 1280 720 title=@1 walk="ArrowUp:2,ArrowLeft:1@1"
//
// Each picture opens the page, presses Begin unless the name starts with "title", holds the keys
// of `Code:seconds,…` one after another (several at once with ~), waits the given seconds (1 if
// left out) and saves <out-dir>/<name>.png. Needs the dev server (npm run dev). QUERY="?hour=22"
// in the environment opens the page with that address (hour, weather, at, zoom).
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const [out, width, height, ...shots] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--mute-audio"] });
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") console.log("[" + message.type() + "]", message.text());
});
page.on("pageerror", (error) => console.log("[pageerror]", error.message));
for (const shot of shots) {
  const [name, rest] = shot.split(/=(.*)/s);
  const [keys, seconds] = rest.split("@");
  await page.goto("http://127.0.0.1:" + (process.env.PORT ?? 8796) + "/" + (process.env.QUERY ?? ""));
  await page.waitForSelector(".hotl-stage[data-ready]", { timeout: 60000 });
  await page.focus(".hotl-stage");
  await page.keyboard.press("ArrowDown");
  for (const hold of keys.split(",").filter(Boolean)) {
    const [codes, s] = hold.split(":");
    for (const code of codes.split("~")) await page.keyboard.down(code);
    await page.waitForTimeout(Number(s ?? 1) * 1000);
    for (const code of codes.split("~")) await page.keyboard.up(code);
  }
  await page.waitForTimeout(Number(seconds ?? 1) * 1000);
  await page.screenshot({ path: out + "/" + name + ".png" });
  const data = await page.evaluate(() => ({ ...document.querySelector(".hotl-stage").dataset }));
  console.log(name, JSON.stringify(data));
}
await browser.close();
