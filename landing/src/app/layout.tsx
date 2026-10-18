import type { Metadata, Viewport } from "next";
import { geistMono, geistSans, newsreader } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Omakaze",
  description: "Open-source, self-hostable guided walkthroughs for pull requests.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#fcfcfc",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable}`}>
      <body className="min-h-screen bg-paper text-fg antialiased">{children}</body>
    </html>
  );
}
