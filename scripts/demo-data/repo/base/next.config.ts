import type { NextConfig } from "next";

const config: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.acme-storefront.com" }],
  },
};

export default config;
