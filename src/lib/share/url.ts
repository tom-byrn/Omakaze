/** URL helpers for share links, used by the server and by the viewer in the browser. */

/** Query parameter that carries a share token to the routes a read-only viewer calls. */
export const SHARE_PARAM = "share";

export function withShareToken(url: string, token: string | null | undefined): string {
  if (!token) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${SHARE_PARAM}=${encodeURIComponent(token)}`;
}

/**
 * Upload URLs in guide markdown (`<APP_URL>/api/assets/…` or `/api/assets/…`) with the token added,
 * so images and videos load for a viewer without a session. Other URLs are left alone.
 */
export function shareAssetUrl(url: string, token: string, appUrl: string): string {
  const path = url.startsWith(`${appUrl}/`) ? url.slice(appUrl.length) : url;
  return path.startsWith("/api/assets/") ? withShareToken(url, token) : url;
}
