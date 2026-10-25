import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--mute-audio"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("http://127.0.0.1:8796/" + (process.env.QUERY ?? ""));
await page.waitForSelector(".hotl-stage[data-ready]", { timeout: 60000 });
await page.focus(".hotl-stage");
await page.keyboard.press("ArrowDown");
const dump = () => page.evaluate(() => {
  const f = window.hotlView.fauna;
  const h = f.herd;
  return `${h.state} exit=${h.exit} heron=${f.heron.state} fox=${f.fox.fox.active} ` + h.deer.map((d) => `${d.x.toFixed(0)},${d.y.toFixed(0)}/${d.gait}`).join(" ");
});
for (let i = 0; i < Number(process.env.N ?? 6); i++) {
  await page.waitForTimeout(700);
  if (i === 1 && process.env.KEY) { await page.keyboard.down(process.env.KEY); await page.waitForTimeout(1200); await page.keyboard.up(process.env.KEY); }
  console.log((i * 0.7).toFixed(1) + "s", await dump());
}
await page.screenshot({ path: process.env.OUT ?? "/tmp/fauna.png" });
await browser.close();
