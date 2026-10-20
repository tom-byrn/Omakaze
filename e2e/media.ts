/**
 * Screenshots and videos for documentation and pull requests.
 *
 * Set MEDIA_DIR to collect them; without it every helper here is a no-op, so specs can call them
 * unconditionally. E2E_DEMO=1 makes runs watchable (slowMo, pauses, a visible cursor, captions).
 *
 *   import { caption, pause, shot } from "./media";
 *   await shot(page, "guide-overview");            // MEDIA_DIR/guide-overview.png (viewport)
 *   await shot(page, "dashboard", { fullPage: true });
 *   await shot(page, "diff", { locator: page.locator("[data-path]").first() });
 *
 * Videos: with MEDIA_DIR set, the `page` fixture in fixtures.ts copies each test's recording to
 * MEDIA_DIR/<name>.webm and, when ffmpeg is installed, converts it to <name>.mp4. The name is the
 * test title as a slug (describe blocks included); `videoName("...")` inside a test overrides it.
 */
import { execFile, spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { E2E } from "./config";

/** CSS applied while taking screenshots: hides the demo cursor, captions and the Next.js dev indicator. */
export const HIDE_OVERLAY = "#e2e-cursor, #e2e-ripple, #e2e-caption, nextjs-portal { display: none !important; }";

export function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function mediaPath(name: string, ext: string): string {
  mkdirSync(E2E.mediaDir!, { recursive: true });
  return path.join(E2E.mediaDir!, `${slug(name) || "media"}.${ext}`);
}

/**
 * Save a PNG to MEDIA_DIR/<name>.png (no-op without MEDIA_DIR). Viewport by default; `fullPage`
 * for the whole page, `locator` for one element. Returns the file path or null.
 */
export async function shot(page: Page, name: string, opts: { fullPage?: boolean; locator?: Locator } = {}): Promise<string | null> {
  if (!E2E.mediaDir) return null;
  const file = mediaPath(name, "png");
  // Let fonts and pending layout settle so screenshots don't catch a half-rendered frame.
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  if (opts.locator) await opts.locator.screenshot({ path: file, animations: "disabled", style: HIDE_OVERLAY });
  else await page.screenshot({ path: file, fullPage: opts.fullPage ?? false, animations: "disabled", style: HIDE_OVERLAY });
  return file;
}

/** Wait a moment in demo mode (E2E_DEMO=1) so viewers can follow the video. No-op otherwise. */
export async function pause(page: Page, ms = 800): Promise<void> {
  if (E2E.demo) await page.waitForTimeout(ms);
}

/** Show a caption bar at the bottom of the page in demo mode; call with no text to hide it. */
export async function caption(page: Page, text?: string, label?: string): Promise<void> {
  if (!E2E.demo) return;
  await page.evaluate(([t, l]) => (window as unknown as { __e2eCaption?: (t?: string, l?: string) => void }).__e2eCaption?.(t, l), [text, label] as const).catch(() => {});
}

/** Name the current test's video (MEDIA_DIR/<name>.webm/.mp4) instead of using its title. */
export function videoName(name: string): void {
  test.info().annotations.push({ type: "video", description: name });
}

let ffmpeg: boolean | null = null;
function hasFfmpeg(): boolean {
  ffmpeg ??= spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
  return ffmpeg;
}

/**
 * Copy a page's recording to MEDIA_DIR/<name>.webm and convert it to .mp4 when ffmpeg exists.
 * Closes the page (a video is only complete then). The fixture calls this for the default page;
 * call it yourself for pages of extra contexts. Returns the saved paths.
 */
export async function saveVideo(page: Page, name: string): Promise<string[]> {
  const video = page.video();
  if (!E2E.mediaDir || !video) return [];
  if (!page.isClosed()) await page.close();
  const webm = mediaPath(name, "webm");
  await video.saveAs(webm);
  const out = [webm];
  if (hasFfmpeg()) {
    const mp4 = mediaPath(name, "mp4");
    await promisify(execFile)("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
    if (statSync(mp4).size > 0) out.push(mp4);
  }
  return out;
}

/** Video name for a test: the `video` annotation, or describe titles and test title as a slug. */
export function testVideoName(info: TestInfo): string {
  const custom = info.annotations.find((a) => a.type === "video")?.description;
  const base = custom ?? info.titlePath.slice(1).join(" ");
  return info.retry > 0 ? `${base} retry ${info.retry}` : base;
}
