/** Static export: `npm run build` writes the whole game to `out/`.
    BASE_PATH=/heart-of-the-light   when it is served from a known subfolder.
    RELATIVE=1                      when the folder is not known in advance (itch.io and the
                                    like): every path then starts from the page itself. */
import { readFileSync } from "node:fs";

const relative = process.env.RELATIVE === "1";
const basePath = relative ? "" : (process.env.BASE_PATH ?? "");
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/** @type {import("next").NextConfig} */
export default {
  output: "export",
  basePath,
  assetPrefix: relative ? "." : undefined,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: relative ? "." : basePath, NEXT_PUBLIC_BUILD: version },
  devIndicators: false,
};
