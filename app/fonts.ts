import localFont from "next/font/local";

const pixel = localFont({
  src: [{ path: "../public/fonts/pixelify.woff2", weight: "400 700", style: "normal" }],
  variable: "--font-pixel",
  display: "swap",
});

/** The font variable for <html>: the game's own layout and the minigames.world page both set it. */
export const fontClass: string = pixel.variable;
