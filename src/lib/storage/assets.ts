import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assetBlobs, assets } from "@/db/schema";
import { env } from "@/lib/env";

export type Asset = typeof assets.$inferSelect;

const ALLOWED = new Map<string, string>([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["avif", "image/avif"],
  ["svg", "image/svg+xml"],
  ["mp4", "video/mp4"],
  ["webm", "video/webm"],
  ["mov", "video/quicktime"],
  ["m4v", "video/mp4"],
  ["pdf", "application/pdf"],
]);

export class AssetError extends Error {}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const clean = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return clean || "file";
}

export function contentTypeFor(filename: string, declared?: string | null): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const byExt = ALLOWED.get(ext);
  if (byExt) return byExt;
  if (declared && [...ALLOWED.values()].includes(declared)) return declared;
  throw new AssetError(`Unsupported file type. Allowed: ${[...ALLOWED.keys()].join(", ")}.`);
}

export function assetUrl(asset: Pick<Asset, "id" | "filename">): string {
  return `${env().APP_URL}/api/assets/${asset.id}/${encodeURIComponent(asset.filename)}`;
}

export function markdownFor(asset: Pick<Asset, "id" | "filename" | "contentType">, alt?: string): string {
  const url = assetUrl(asset);
  if (asset.contentType.startsWith("video/")) return `<video src="${url}" controls></video>`;
  if (asset.contentType === "application/pdf") return `[${alt ?? asset.filename}](${url})`;
  return `![${(alt ?? asset.filename).replace(/[[\]]/g, "")}](${url})`;
}

function storageDir(): string {
  return path.resolve(env().STORAGE_DIR);
}

export async function storeAsset(input: {
  workspaceId: string;
  guideId?: string | null;
  filename: string;
  contentType?: string | null;
  data: Buffer;
  userId?: string | null;
}): Promise<Asset> {
  const filename = sanitizeFilename(input.filename);
  const contentType = contentTypeFor(filename, input.contentType);
  const max = env().MAX_UPLOAD_MB * 1024 * 1024;
  if (input.data.length === 0) throw new AssetError("The file is empty.");
  if (input.data.length > max) throw new AssetError(`Files are limited to ${env().MAX_UPLOAD_MB} MB.`);
  const driver = env().STORAGE_DRIVER;
  const [asset] = await db
    .insert(assets)
    .values({
      workspaceId: input.workspaceId,
      guideId: input.guideId ?? null,
      filename,
      contentType,
      size: input.data.length,
      storage: driver,
      createdByUserId: input.userId ?? null,
    })
    .returning();
  try {
    if (driver === "database") {
      await db.insert(assetBlobs).values({ assetId: asset.id, data: input.data });
    } else {
      const key = path.join(input.workspaceId, `${asset.id}-${filename}`);
      const full = path.join(storageDir(), key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, input.data);
      await db.update(assets).set({ storageKey: key }).where(eq(assets.id, asset.id));
      asset.storageKey = key;
    }
  } catch (err) {
    await db.delete(assets).where(eq(assets.id, asset.id));
    throw err;
  }
  return asset;
}

export async function getAsset(id: string): Promise<Asset | null> {
  const [a] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  return a ?? null;
}

export async function readAssetData(asset: Asset): Promise<Buffer> {
  if (asset.storage === "database") {
    const [blob] = await db.select().from(assetBlobs).where(eq(assetBlobs.assetId, asset.id)).limit(1);
    if (!blob) throw new AssetError("Asset data missing");
    return Buffer.from(blob.data);
  }
  if (!asset.storageKey) throw new AssetError("Asset data missing");
  const full = path.join(storageDir(), asset.storageKey);
  if (!full.startsWith(storageDir())) throw new AssetError("Invalid asset path");
  return readFile(full);
}

export async function deleteAsset(asset: Asset): Promise<void> {
  if (asset.storage === "filesystem" && asset.storageKey) {
    await unlink(path.join(storageDir(), asset.storageKey)).catch(() => undefined);
  }
  await db.delete(assets).where(eq(assets.id, asset.id));
}

/** Download a remote image/video for upload_asset(url). */
export async function fetchRemoteAsset(url: string): Promise<{ data: Buffer; contentType: string | null; filename: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AssetError("Invalid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new AssetError("Only http(s) URLs are supported");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\])/.test(parsed.hostname)) {
    throw new AssetError("Private network addresses are not allowed");
  }
  const res = await fetch(parsed, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new AssetError(`Download failed (${res.status})`);
  const max = env().MAX_UPLOAD_MB * 1024 * 1024;
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > max) throw new AssetError(`Files are limited to ${env().MAX_UPLOAD_MB} MB.`);
  const data = Buffer.from(await res.arrayBuffer());
  return {
    data,
    contentType: res.headers.get("content-type")?.split(";")[0] ?? null,
    filename: sanitizeFilename(parsed.pathname.split("/").pop() || "download"),
  };
}
