import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

export const newsreader = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-italic.woff2",
      style: "italic",
    },
  ],
  variable: "--font-newsreader",
  weight: "200 800",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

export const geistSans = GeistSans;
export const geistMono = GeistMono;
