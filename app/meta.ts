import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Heart of the Light",
  description: "A small glade in dense pixel art: walk with a lantern, gather five lights and carry them into the glowing cave.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#1b2412",
};
