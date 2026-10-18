import localFont from "next/font/local";

/**
 * Shippori Mincho for the Japanese side notes on the landing page, subset to the characters in
 * src/components/landing/notes.ts (scripts/subset-landing-font.mjs). Imported only by the landing page,
 * so other pages don't load it. License: ./fonts/OFL-ShipporiMincho.txt.
 */
export const shipporiMincho = localFont({
  src: "./fonts/shippori-mincho-landing.woff2",
  variable: "--font-shippori",
  weight: "400",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Hiragino Mincho ProN", "Yu Mincho", "serif"],
});
