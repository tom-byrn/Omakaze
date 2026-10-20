import type { NextConfig } from "next";

const config: NextConfig = {
  images: {
    loader: "custom",
    loaderFile: "./src/lib/images.ts",
    remotePatterns: [{ protocol: "https", hostname: "images.acme-storefront.com" }],
  },
};

export default config;
