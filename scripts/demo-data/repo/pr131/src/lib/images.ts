const CDN = "https://cdn.acme-storefront.com";

/**
 * next/image loader that sends product images through the CDN's resizer. Responses are cached at
 * the edge for a year; a new upload gets a new path, so nothing needs purging.
 */
export default function cdnLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  const path = src.replace(/^https:\/\/images\.acme-storefront\.com/, "");
  return CDN + "/resize/w=" + width + ",q=" + (quality ?? 75) + path;
}
