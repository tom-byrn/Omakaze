/**
 * Review insights: ranges, time buckets, guide sources and the arithmetic behind each panel. Kept
 * free of database imports so it can be unit tested; the queries are in queries.ts.
 */
import type { Role } from "@/db/schema";

/* ------------------------------------------------------------------ */
/* Range and buckets                                                   */
/* ------------------------------------------------------------------ */

export const INSIGHT_RANGES = [7, 30, 90] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];
export const DEFAULT_RANGE: InsightRange = 30;

export function parseRange(value: unknown): InsightRange {
  const n = Number(value);
  return (INSIGHT_RANGES as readonly number[]).includes(n) ? (n as InsightRange) : DEFAULT_RANGE;
}

/** Query string for the page and its CSV files, leaving out the default range. */
export function insightsQuery(opts: { days: InsightRange; repo?: string | null }): string {
  const params = new URLSearchParams();
  if (opts.days !== DEFAULT_RANGE) params.set("days", String(opts.days));
  if (opts.repo) params.set("repo", opts.repo);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export type BucketUnit = "day" | "week";

const DAY_MS = 86_400_000;

/** Start of the UTC day, or of the UTC week (Monday) containing `d`, like Postgres `date_trunc(unit, d, 'UTC')`. */
export function bucketStart(d: Date, unit: BucketUnit): Date {
  const day = Math.floor(d.getTime() / DAY_MS) * DAY_MS;
  if (unit === "day") return new Date(day);
  // 1970-01-01 was a Thursday; Monday-based weeks start 3 days later in the cycle.
  const weekday = (new Date(day).getUTCDay() + 6) % 7;
  return new Date(day - weekday * DAY_MS);
}

/**
 * The window a range covers: today (UTC) and the `days - 1` days before it. `since` is inclusive;
 * `until` is the start of tomorrow.
 */
export function rangeWindow(days: InsightRange, now: Date = new Date()): { since: Date; until: Date } {
  const today = bucketStart(now, "day").getTime();
  return { since: new Date(today - (days - 1) * DAY_MS), until: new Date(today + DAY_MS) };
}

/** Every bucket that starts in or overlaps [since, until), oldest first. */
export function bucketStarts(since: Date, until: Date, unit: BucketUnit): Date[] {
  const step = unit === "day" ? DAY_MS : 7 * DAY_MS;
  const out: Date[] = [];
  for (let t = bucketStart(since, unit).getTime(); t < until.getTime(); t += step) out.push(new Date(t));
  return out;
}

/** Guides created per day for 7 and 30 days, per week for 90. */
export function createdUnit(days: InsightRange): BucketUnit {
  return days === 90 ? "week" : "day";
}

/** Review speed per day for 7 days, otherwise per week (a day rarely has enough guides for a median). */
export function speedUnit(days: InsightRange): BucketUnit {
  return days === 7 ? "day" : "week";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 14" (UTC). */
export function shortDate(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Oct 14" for a day, "Week of Oct 13" for a week. */
export function bucketLabel(start: Date, unit: BucketUnit): string {
  return unit === "day" ? shortDate(start) : `Week of ${shortDate(start)}`;
}

/** "2026-10-14" (UTC), for CSV files. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * One value per bucket and key, from grouped rows. Rows outside the buckets are ignored; missing
 * combinations are 0.
 */
export function fillBuckets<K extends string>(
  starts: Date[],
  keys: readonly K[],
  rows: { bucket: Date; key: K; n: number }[],
): { start: Date; values: Record<K, number> }[] {
  const index = new Map(starts.map((s, i) => [s.getTime(), i]));
  const out = starts.map((start) => ({ start, values: Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number> }));
  for (const r of rows) {
    const i = index.get(r.bucket.getTime());
    if (i === undefined || !(r.key in out[i].values)) continue;
    out[i].values[r.key] += r.n;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Guide sources                                                       */
/* ------------------------------------------------------------------ */

export const GUIDE_ORIGINS = ["mcp", "ai", "chatgpt", "api", "manual"] as const;
export type GuideOrigin = (typeof GUIDE_ORIGINS)[number];

export const ORIGIN_LABELS: Record<GuideOrigin, string> = {
  mcp: "MCP agent",
  ai: "Built-in AI",
  chatgpt: "ChatGPT plan",
  api: "REST API",
  manual: "Manual",
};

/**
 * Who wrote a guide, from the columns recorded when it was started: `source` (agent, ai, manual),
 * `created_via` (mcp, api, ui, webhook, poll) and `ai_source` (the AI configuration a built-in AI
 * guide was written with). Built-in AI started through `POST /api/v1/generate` counts as built-in AI:
 * the AI wrote it. Guides posted complete through `POST /api/v1/guides` are "REST API".
 */
export function guideOrigin(g: { source: string; createdVia: string; aiSource: string | null }): GuideOrigin {
  if (g.source === "manual") return "manual";
  if (g.source === "ai") return g.aiSource === "chatgpt" ? "chatgpt" : "ai";
  return g.createdVia === "api" ? "api" : "mcp";
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

/** Median of the finite values; null when there are none. */
export function median(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** 0.42 → "42%"; null → "–". */
export function percent(share: number | null): string {
  if (share === null || !Number.isFinite(share)) return "–";
  return `${Math.round(share * 100)}%`;
}

/** n / total, or null without a total. */
export function share(n: number, total: number): number | null {
  return total > 0 ? n / total : null;
}

/** "12 min", "3.5 h", "2.1 days"; null → "–". */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "–";
  const s = Math.max(0, seconds);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 48 * 3600) return `${round1(s / 3600)} h`;
  return `${round1(s / 86_400)} days`;
}

function round1(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/* ------------------------------------------------------------------ */
/* Review speed                                                        */
/* ------------------------------------------------------------------ */

/** One published guide: seconds from publishing to its first review mark, and to every section having one. */
export type GuideSpeed = { publishedAt: Date; firstSeconds: number | null; allSeconds: number | null };

export type SpeedBucket = {
  start: Date;
  published: number;
  /** Guides with at least one review mark made on this version. */
  reviewed: number;
  firstMedian: number | null;
  /** Guides where every section has a mark made on this version. */
  completed: number;
  allMedian: number | null;
};

export function speedBuckets(starts: Date[], unit: BucketUnit, rows: GuideSpeed[]): SpeedBucket[] {
  const groups = new Map(starts.map((s) => [s.getTime(), [] as GuideSpeed[]]));
  for (const r of rows) groups.get(bucketStart(r.publishedAt, unit).getTime())?.push(r);
  return starts.map((start) => {
    const g = groups.get(start.getTime())!;
    return {
      start,
      published: g.length,
      reviewed: g.filter((r) => r.firstSeconds !== null).length,
      firstMedian: median(g.map((r) => r.firstSeconds)),
      completed: g.filter((r) => r.allSeconds !== null).length,
      allMedian: median(g.map((r) => r.allSeconds)),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Completion                                                          */
/* ------------------------------------------------------------------ */

export const COMPLETION_STATES = ["full", "partial", "none"] as const;
export type CompletionState = (typeof COMPLETION_STATES)[number];
export const COMPLETION_LABELS: Record<CompletionState, string> = {
  full: "Fully reviewed",
  partial: "Partly reviewed",
  none: "Not reviewed",
};

export function completionState(sections: number, reviewed: number): CompletionState {
  if (sections > 0 && reviewed >= sections) return "full";
  return reviewed > 0 ? "partial" : "none";
}

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

/** Share of changed lines in the author's own sections, in bins. The last bin is exactly 100%. */
export const COVERAGE_BINS = [
  { key: "lt50", label: "< 50%", min: 0, max: 0.5 },
  { key: "50", label: "50–69%", min: 0.5, max: 0.7 },
  { key: "70", label: "70–79%", min: 0.7, max: 0.8 },
  { key: "80", label: "80–89%", min: 0.8, max: 0.9 },
  { key: "90", label: "90–99%", min: 0.9, max: 1 },
  { key: "100", label: "100%", min: 1, max: Infinity },
] as const;
export type CoverageBin = (typeof COVERAGE_BINS)[number]["key"];

export function coverageShare(changed: number, covered: number): number | null {
  return changed > 0 ? Math.min(1, Math.max(0, covered / changed)) : null;
}

export function coverageBin(share: number): CoverageBin {
  // Shares are rounded to whole percents first, so 99.6% is not reported as "90–99%" next to a "100%" label.
  const s = Math.round(share * 100) / 100;
  return COVERAGE_BINS.find((b) => s >= b.min && s < b.max)?.key ?? "lt50";
}

/* ------------------------------------------------------------------ */
/* Members                                                             */
/* ------------------------------------------------------------------ */

export type MemberStats = {
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  /** Review marks made in Omakaze. */
  reviewed: number;
  /** Marks carried over from an earlier version (counted separately, not as reviews). */
  carried: number;
  comments: number;
  reviews: number;
  resolved: number;
  guides: number;
};

export const MEMBER_METRICS = ["reviewed", "carried", "comments", "reviews", "resolved", "guides"] as const;

export function emptyStats(userId: string | null, name: string, avatarUrl: string | null = null): MemberStats {
  return { userId, name, avatarUrl, reviewed: 0, carried: 0, comments: 0, reviews: 0, resolved: 0, guides: 0 };
}

export function totalStats(rows: MemberStats[], name = "Team total"): MemberStats {
  const t = emptyStats(null, name);
  for (const r of rows) for (const k of MEMBER_METRICS) t[k] += r[k];
  return t;
}

/** Owners and admins see every member; members see the team total and their own row. */
export function seesEveryone(role: Role): boolean {
  return role === "owner" || role === "admin";
}

export function visibleMembers(role: Role, viewerId: string, rows: MemberStats[]): { rows: MemberStats[]; total: MemberStats; everyone: boolean } {
  const everyone = seesEveryone(role);
  return {
    rows: everyone ? rows : rows.filter((r) => r.userId === viewerId),
    total: totalStats(rows),
    everyone,
  };
}
