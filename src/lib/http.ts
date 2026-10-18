import { env } from "@/lib/env";

/** Only allow same-site relative redirects. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** Reject cross-site requests to cookie-authenticated JSON endpoints. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients
  const allowed = new URL(env().APP_URL).origin;
  const self = new URL(req.url).origin;
  if (origin !== allowed && origin !== self) {
    throw new HttpError(403, "Cross-origin request rejected");
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
  const message = err instanceof Error ? err.message : "Unexpected error";
  console.error("[api]", err);
  return Response.json({ error: message }, { status: 500 });
}

export function absoluteUrl(path: string): string {
  return `${env().APP_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Tiny in-memory rate limiter (per process) for login attempts and similar. */
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }
  return b.count <= limit;
}
