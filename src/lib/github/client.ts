import { createHash } from "node:crypto";
import { env } from "@/lib/env";

export class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
    public path: string,
    public body?: unknown,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

type GhInit = Omit<RequestInit, "body"> & {
  accept?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** Skip the conditional request cache. */
  noCache?: boolean;
};

type CacheEntry = { etag: string; body: unknown; link: string | null };
const etagCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 1000;

function cacheKey(token: string | null, url: string, accept: string): string {
  const who = token ? createHash("sha256").update(token).digest("hex").slice(0, 16) : "anon";
  return `${who}:${accept}:${url}`;
}

function remember(key: string, entry: CacheEntry) {
  if (etagCache.has(key)) etagCache.delete(key);
  etagCache.set(key, entry);
  if (etagCache.size > MAX_CACHE_ENTRIES) {
    const oldest = etagCache.keys().next().value;
    if (oldest) etagCache.delete(oldest);
  }
}

export function apiUrl(path: string, query?: GhInit["query"]): string {
  const base = path.startsWith("http") ? path : `${env().GITHUB_API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const url = new URL(base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function headersFor(token: string | null, accept: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "omakaze",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (hasBody) headers["Content-Type"] = "application/json";
  return headers;
}

async function toError(res: Response, path: string): Promise<GitHubError> {
  let body: unknown = null;
  let message = `GitHub API ${res.status}`;
  try {
    body = await res.json();
    const msg = (body as { message?: string })?.message;
    if (msg) message = `${msg} (GitHub ${res.status})`;
    const errors = (body as { errors?: { message?: string; code?: string }[] })?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      message += `: ${errors.map((e) => e.message ?? e.code).filter(Boolean).join("; ")}`;
    }
  } catch {
    // ignore
  }
  const retryAfter = Number(res.headers.get("retry-after") ?? "") || undefined;
  const remaining = res.headers.get("x-ratelimit-remaining");
  if ((res.status === 403 || res.status === 429) && remaining === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0);
    message = `GitHub rate limit exceeded. Resets at ${new Date(reset * 1000).toISOString()}.`;
  }
  return new GitHubError(message, res.status, path, body, retryAfter);
}

/** Low-level request returning the Response (throws on non-2xx except 304). */
export async function ghFetch(token: string | null, path: string, init: GhInit = {}): Promise<Response> {
  const { accept = "application/vnd.github+json", query, body, noCache, ...rest } = init;
  const url = apiUrl(path, query);
  const hasBody = body !== undefined;
  const res = await fetch(url, {
    ...rest,
    headers: { ...headersFor(token, accept, hasBody), ...(rest.headers as Record<string, string> | undefined) },
    body: hasBody ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: rest.signal ?? AbortSignal.timeout(30_000),
  });
  if (!res.ok && res.status !== 304) throw await toError(res, path);
  void noCache;
  return res;
}

/** JSON request with ETag-based conditional caching for GETs. */
export async function gh<T>(token: string | null, path: string, init: GhInit = {}): Promise<T> {
  return (await ghWithLink<T>(token, path, init)).data;
}

async function ghWithLink<T>(token: string | null, path: string, init: GhInit = {}): Promise<{ data: T; link: string | null }> {
  const method = (init.method ?? "GET").toUpperCase();
  const accept = init.accept ?? "application/vnd.github+json";
  const url = apiUrl(path, init.query);
  const key = cacheKey(token, url, accept);
  const cached = method === "GET" && !init.noCache ? etagCache.get(key) : undefined;
  const res = await ghFetch(token, path, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...(cached ? { "If-None-Match": cached.etag } : {}) },
  });
  if (res.status === 304 && cached) return { data: cached.body as T, link: cached.link };
  if (res.status === 204) return { data: undefined as T, link: null };
  const text = await res.text();
  const data = (text ? JSON.parse(text) : undefined) as T;
  const etag = res.headers.get("etag");
  if (method === "GET" && etag) remember(key, { etag, body: data, link: res.headers.get("link") });
  return { data, link: res.headers.get("link") };
}

function nextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = /<([^>]+)>;\s*rel="next"/.exec(part.trim());
    if (m) return m[1];
  }
  return null;
}

/** Follow `Link: rel="next"` pagination. `pick` extracts the array from wrapped responses. */
export async function ghPaginate<T, R = T[]>(
  token: string | null,
  path: string,
  init: GhInit & { maxItems?: number; pick?: (page: R) => T[] } = {},
): Promise<T[]> {
  const { maxItems = 1000, pick, ...rest } = init;
  const out: T[] = [];
  let url: string | null = apiUrl(path, { per_page: 100, ...rest.query });
  while (url && out.length < maxItems) {
    const { data, link }: { data: R; link: string | null } = await ghWithLink<R>(token, url, { ...rest, query: undefined });
    const items = pick ? pick(data) : (data as unknown as T[]);
    out.push(...items);
    url = nextLink(link);
  }
  return out.slice(0, maxItems);
}

/** Fetch raw file contents at a ref. Returns null for missing, binary or oversized files. */
export async function ghFileContent(
  token: string | null,
  owner: string,
  repo: string,
  path: string,
  ref: string,
  maxBytes = 2_000_000,
): Promise<string | null> {
  try {
    const res = await ghFetch(token, `/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
      accept: "application/vnd.github.raw",
      query: { ref },
    });
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > maxBytes) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) return null;
    if (buf.subarray(0, 8000).includes(0)) return null;
    return buf.toString("utf8");
  } catch (err) {
    if (err instanceof GitHubError && (err.status === 404 || err.status === 403)) return null;
    throw err;
  }
}

/* Common GitHub REST shapes (only the fields we use) */

export type GhUser = {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatar_url: string;
  html_url?: string;
  type?: string;
};

export type GhRepo = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string; type: string; avatar_url: string };
  private: boolean;
  default_branch: string;
  description: string | null;
  html_url: string;
  archived?: boolean;
  pushed_at?: string;
  permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
};

export type GhPull = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  draft?: boolean;
  merged_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  user: { login: string; avatar_url: string } | null;
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  base: { ref: string; sha: string; repo: { full_name: string } };
  additions?: number;
  deletions?: number;
  changed_files?: number;
  commits?: number;
  merged?: boolean;
  requested_reviewers?: { login: string; avatar_url?: string | null }[];
  requested_teams?: { name: string; slug?: string }[];
  assignees?: { login: string; avatar_url?: string | null }[];
};

export type GhPullFile = {
  sha: string | null;
  filename: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
};

export type GhReviewComment = {
  id: number;
  pull_request_review_id: number | null;
  in_reply_to_id?: number;
  path: string;
  line: number | null;
  original_line: number | null;
  start_line: number | null;
  side: "LEFT" | "RIGHT" | null;
  start_side?: "LEFT" | "RIGHT" | null;
  commit_id: string;
  original_commit_id: string;
  body: string;
  user: { login: string; avatar_url: string } | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  subject_type?: "line" | "file";
};

export type GhIssueComment = {
  id: number;
  body: string;
  user: { login: string; avatar_url: string } | null;
  created_at: string;
  html_url: string;
};
