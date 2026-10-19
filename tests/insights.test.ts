import { describe, expect, it } from "vitest";
import { compactNumber, labelEvery, niceStep, niceTicks } from "@/lib/insights/chart";
import { csvCell, hours, pct, toCsv } from "@/lib/insights/csv";
import {
  bucketLabel,
  bucketStart,
  bucketStarts,
  completionState,
  coverageBin,
  coverageShare,
  createdUnit,
  emptyStats,
  fillBuckets,
  formatDuration,
  GUIDE_ORIGINS,
  guideOrigin,
  insightsQuery,
  median,
  parseRange,
  percent,
  rangeWindow,
  speedBuckets,
  speedUnit,
  totalStats,
  visibleMembers,
} from "@/lib/insights/model";

const d = (iso: string) => new Date(iso);

describe("ranges and buckets", () => {
  it("accepts 7, 30 and 90 days and falls back to 30", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange(90)).toBe(90);
    expect(parseRange("14")).toBe(30);
    expect(parseRange(undefined)).toBe(30);
    expect(parseRange(["7"])).toBe(7);
  });

  it("truncates to UTC days and Monday weeks, like date_trunc", () => {
    expect(bucketStart(d("2026-10-19T23:59:00Z"), "day")).toEqual(d("2026-10-19T00:00:00Z"));
    // 2026-10-19 is a Monday, 2026-10-25 a Sunday.
    expect(bucketStart(d("2026-10-19T08:00:00Z"), "week")).toEqual(d("2026-10-19T00:00:00Z"));
    expect(bucketStart(d("2026-10-25T23:00:00Z"), "week")).toEqual(d("2026-10-19T00:00:00Z"));
    expect(bucketStart(d("2026-10-18T12:00:00Z"), "week")).toEqual(d("2026-10-12T00:00:00Z"));
  });

  it("covers today and the days before it", () => {
    const { since, until } = rangeWindow(7, d("2026-10-19T15:30:00Z"));
    expect(since).toEqual(d("2026-10-13T00:00:00Z"));
    expect(until).toEqual(d("2026-10-20T00:00:00Z"));
    expect(bucketStarts(since, until, "day")).toHaveLength(7);
    // 90 days in weeks: the first week starts before the range.
    const w = rangeWindow(90, d("2026-10-19T15:30:00Z"));
    const weeks = bucketStarts(w.since, w.until, "week");
    expect(weeks[0].getTime()).toBeLessThanOrEqual(w.since.getTime());
    expect(weeks.at(-1)).toEqual(d("2026-10-19T00:00:00Z"));
    expect(weeks).toHaveLength(14);
  });

  it("uses days for short ranges and weeks for medians over longer ones", () => {
    expect(createdUnit(30)).toBe("day");
    expect(createdUnit(90)).toBe("week");
    expect(speedUnit(7)).toBe("day");
    expect(speedUnit(30)).toBe("week");
    expect(bucketLabel(d("2026-10-12T00:00:00Z"), "week")).toBe("Week of Oct 12");
    expect(bucketLabel(d("2026-10-12T00:00:00Z"), "day")).toBe("Oct 12");
  });

  it("fills missing buckets and keys with zeros", () => {
    const starts = [d("2026-10-17T00:00:00Z"), d("2026-10-18T00:00:00Z"), d("2026-10-19T00:00:00Z")];
    const filled = fillBuckets(starts, ["a", "b"] as const, [
      { bucket: d("2026-10-18T00:00:00Z"), key: "a", n: 2 },
      { bucket: d("2026-10-18T00:00:00Z"), key: "a", n: 1 },
      { bucket: d("2026-10-19T00:00:00Z"), key: "b", n: 4 },
      { bucket: d("2026-10-01T00:00:00Z"), key: "b", n: 9 },
    ]);
    expect(filled.map((b) => b.values)).toEqual([
      { a: 0, b: 0 },
      { a: 3, b: 0 },
      { a: 0, b: 4 },
    ]);
  });

  it("builds query strings without the default range", () => {
    expect(insightsQuery({ days: 30 })).toBe("");
    expect(insightsQuery({ days: 7, repo: "acme/storefront" })).toBe("?days=7&repo=acme%2Fstorefront");
  });
});

describe("guide sources", () => {
  it("tells MCP agents, the REST API, built-in AI, ChatGPT plans and manual guides apart", () => {
    expect(guideOrigin({ source: "agent", createdVia: "mcp", aiSource: null })).toBe("mcp");
    expect(guideOrigin({ source: "agent", createdVia: "api", aiSource: null })).toBe("api");
    expect(guideOrigin({ source: "ai", createdVia: "webhook", aiSource: "workspace" })).toBe("ai");
    // Built-in AI started through POST /api/v1/generate is still written by the built-in AI.
    expect(guideOrigin({ source: "ai", createdVia: "api", aiSource: null })).toBe("ai");
    expect(guideOrigin({ source: "ai", createdVia: "ui", aiSource: "chatgpt" })).toBe("chatgpt");
    expect(guideOrigin({ source: "manual", createdVia: "ui", aiSource: null })).toBe("manual");
    expect(GUIDE_ORIGINS).toEqual(["mcp", "ai", "chatgpt", "api", "manual"]);
  });
});

describe("statistics", () => {
  it("takes the median of finite values", () => {
    expect(median([])).toBeNull();
    expect(median([null, undefined])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, null, 3, 2])).toBe(2.5);
  });

  it("formats durations and shares", () => {
    expect(formatDuration(null)).toBe("–");
    expect(formatDuration(20)).toBe("1 min");
    expect(formatDuration(45 * 60)).toBe("45 min");
    expect(formatDuration(3 * 3600 + 30 * 60)).toBe("3.5 h");
    expect(formatDuration(5 * 3600)).toBe("5 h");
    expect(formatDuration(3 * 86_400)).toBe("3 days");
    expect(percent(0.426)).toBe("43%");
    expect(percent(null)).toBe("–");
  });

  it("groups review speed per bucket, with medians of the guides that got that far", () => {
    const starts = [d("2026-10-12T00:00:00Z"), d("2026-10-19T00:00:00Z")];
    const buckets = speedBuckets(starts, "week", [
      { publishedAt: d("2026-10-13T10:00:00Z"), firstSeconds: 3600, allSeconds: 7200 },
      { publishedAt: d("2026-10-14T10:00:00Z"), firstSeconds: 10_800, allSeconds: null },
      { publishedAt: d("2026-10-15T10:00:00Z"), firstSeconds: null, allSeconds: null },
      { publishedAt: d("2026-10-19T10:00:00Z"), firstSeconds: 600, allSeconds: 600 },
    ]);
    expect(buckets[0]).toMatchObject({ published: 3, reviewed: 2, firstMedian: 7200, completed: 1, allMedian: 7200 });
    expect(buckets[1]).toMatchObject({ published: 1, reviewed: 1, firstMedian: 600, completed: 1, allMedian: 600 });
  });

  it("classifies completion", () => {
    expect(completionState(4, 4)).toBe("full");
    expect(completionState(4, 1)).toBe("partial");
    expect(completionState(4, 0)).toBe("none");
    expect(completionState(0, 0)).toBe("none");
  });

  it("bins coverage, with 100% on its own", () => {
    expect(coverageShare(0, 0)).toBeNull();
    expect(coverageShare(200, 150)).toBe(0.75);
    expect(coverageBin(0.2)).toBe("lt50");
    expect(coverageBin(0.5)).toBe("50");
    expect(coverageBin(0.75)).toBe("70");
    expect(coverageBin(0.899)).toBe("90");
    expect(coverageBin(0.93)).toBe("90");
    expect(coverageBin(1)).toBe("100");
    expect(coverageBin(0.996)).toBe("100");
  });
});

describe("members", () => {
  const rows = [
    { ...emptyStats("u1", "Alex"), reviewed: 4, comments: 2 },
    { ...emptyStats("u2", "Maya"), reviewed: 1, carried: 3, resolved: 1 },
    { ...emptyStats(null, "Former members"), comments: 5 },
  ];

  it("adds up the team, including people who left", () => {
    expect(totalStats(rows)).toMatchObject({ name: "Team total", reviewed: 5, carried: 3, comments: 7, resolved: 1 });
  });

  it("shows owners and admins everyone, and members only themselves and the total", () => {
    expect(visibleMembers("admin", "u1", rows).rows).toHaveLength(3);
    expect(visibleMembers("owner", "u1", rows).everyone).toBe(true);
    const member = visibleMembers("member", "u2", rows);
    expect(member.everyone).toBe(false);
    expect(member.rows.map((r) => r.name)).toEqual(["Maya"]);
    expect(member.total.comments).toBe(7);
  });
});

describe("CSV", () => {
  it("quotes cells that need it and keeps numbers as they are", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", twice')).toBe('"say ""hi"", twice"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(null)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
  });

  it("keeps text from running as a spreadsheet formula", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-sum")).toBe("'-sum");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });

  it("writes rows with CRLF line ends", () => {
    expect(toCsv(["a", "b"], [[1, "x"], [null, "y,z"]])).toBe('a,b\r\n1,x\r\n,"y,z"\r\n');
    expect(hours(5400)).toBe(1.5);
    expect(hours(null)).toBeNull();
    expect(pct(0.4567)).toBe(45.7);
  });
});

describe("chart scales", () => {
  it("picks round steps", () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(1.6)).toBe(2);
    expect(niceStep(2.3)).toBe(2.5);
    expect(niceStep(4)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(32)).toBe(50);
    expect(niceStep(0)).toBe(1);
  });

  it("makes ticks from zero to a round maximum", () => {
    expect(niceTicks(9)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(niceTicks(9, 4, { integer: true })).toEqual([0, 3, 6, 9]);
    expect(niceTicks(3, 4, { integer: true })).toEqual([0, 1, 2, 3]);
    expect(niceTicks(0)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceTicks(0, 4, { integer: true })).toEqual([0, 1]);
    expect(niceTicks(22)).toEqual([0, 10, 20, 30]);
  });

  it("thins out axis labels from the newest one", () => {
    expect([...labelEvery(30, 3)].sort((a, b) => a - b)).toEqual([2, 5, 8, 11, 14, 17, 20, 23, 26, 29]);
    expect([...labelEvery(5, 0.5)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(labelEvery(0, 2).size).toBe(0);
  });

  it("writes compact numbers", () => {
    expect(compactNumber(3)).toBe("3");
    expect(compactNumber(2.5)).toBe("2.5");
    expect(compactNumber(1200)).toBe("1.2K");
    expect(compactNumber(2000)).toBe("2K");
  });
});
