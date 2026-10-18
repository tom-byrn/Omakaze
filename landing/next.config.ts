import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Plain static HTML in out/, so it can go on Vercel, Netlify, GitHub Pages or any static host.
  output: "export",
  images: { unoptimized: true },
  // The repo root has its own lockfile; without this Next treats the whole repo as the project.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
