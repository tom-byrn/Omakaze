import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image sets NEXT_OUTPUT=standalone and runs `node server.js`; `pnpm start` serves a regular build.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  serverExternalPackages: ["postgres", "shiki", "nodemailer"],
  // With browser log forwarding on, each forwarded console message made `next dev` rebuild and reload
  // the page, which logged again: an endless reload loop (Next.js 16.4).
  logging: { browserToTerminal: false },
  experimental: {
    serverActions: {
      bodySizeLimit: "60mb",
    },
  },
  async redirects() {
    // LANDING_ONLY=true (see src/lib/landing-only.ts): only / is served. Build output, Vercel's own
    // paths and files with an extension (icons, robots.txt) are left alone.
    if (!["1", "true", "yes", "on"].includes((process.env.LANDING_ONLY ?? "").toLowerCase())) return [];
    return [{ source: "/:path((?!_next/|_vercel/)(?!.*\\.[a-z0-9]+$).+)", destination: "/", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
