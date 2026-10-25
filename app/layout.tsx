import { fontClass } from "./fonts";
import { metadata as gameMetadata, viewport as gameViewport } from "./meta";
import "./globals.css";

export const metadata = gameMetadata;
export const viewport = gameViewport;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontClass || undefined}>
      <body>{children}</body>
    </html>
  );
}
