import type { Metadata, Viewport } from "next";
import { ThemeSync } from "@/components/theme/ThemeSync";
import { themeScript } from "@/lib/theme";
import { geistMono, geistSans, newsreader } from "./fonts";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Omakaze",
    template: "%s · Omakaze",
  },
  description: "Open-source, self-hostable guided walkthroughs for pull requests.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#fcfcfc",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set by themeScript before the first paint, so it can differ from the server's.
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-paper text-fg antialiased">
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
