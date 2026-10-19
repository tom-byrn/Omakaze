/** The CSV file of each insights panel: the same rows as the panel's table. */
import type { Role } from "@/db/schema";
import { hours, pct, toCsv } from "./csv";
import { COMPLETION_LABELS, COMPLETION_STATES, GUIDE_ORIGINS, isoDate, ORIGIN_LABELS, share } from "./model";
import {
  completion,
  coverage,
  guidesCreated,
  hotFiles,
  hotSections,
  memberStats,
  reviewSpeed,
  templateCompliance,
  unreviewedSections,
  type InsightScope,
} from "./queries";

export const INSIGHT_PANELS = [
  "guides",
  "review-speed",
  "completion",
  "unreviewed-sections",
  "hot-sections",
  "hot-files",
  "coverage",
  "members",
  "templates",
] as const;
export type InsightPanel = (typeof INSIGHT_PANELS)[number];

export function isInsightPanel(v: string): v is InsightPanel {
  return (INSIGHT_PANELS as readonly string[]).includes(v);
}

export async function panelCsv(panel: InsightPanel, scope: InsightScope, viewer: { userId: string; role: Role }): Promise<string> {
  switch (panel) {
    case "guides": {
      const d = await guidesCreated(scope);
      return toCsv(
        [d.unit === "day" ? "day" : "week_starting", ...GUIDE_ORIGINS.map((o) => ORIGIN_LABELS[o]), "total"],
        d.buckets.map((b) => [isoDate(b.start), ...GUIDE_ORIGINS.map((o) => b.values[o]), b.total]),
      );
    }
    case "review-speed": {
      const d = await reviewSpeed(scope);
      return toCsv(
        [d.unit === "day" ? "day" : "week_starting", "guides_published", "guides_reviewed", "median_hours_to_first_review", "guides_fully_reviewed", "median_hours_to_all_sections_reviewed"],
        d.buckets.map((b) => [isoDate(b.start), b.published, b.reviewed, hours(b.firstMedian), b.completed, hours(b.allMedian)]),
      );
    }
    case "completion": {
      const d = await completion(scope);
      return toCsv(
        ["state", "guides", "share_percent"],
        COMPLETION_STATES.map((s) => [COMPLETION_LABELS[s], d.states[s], pct(share(d.states[s], d.guides))]),
      );
    }
    case "unreviewed-sections": {
      const d = await unreviewedSections(scope, 100);
      return toCsv(
        ["section", "left_unreviewed", "guides_with_section", "unreviewed_percent"],
        d.map((s) => [s.title, s.unreviewed, s.appearances, pct(s.share)]),
      );
    }
    case "hot-sections": {
      const d = await hotSections(scope, 100);
      return toCsv(
        ["repository", "pull_request", "version", "section", "title", "comments", "commenters"],
        d.map((s) => [s.repoFullName, s.prNumber, s.version, s.position, s.title, s.comments, s.people]),
      );
    }
    case "hot-files": {
      const d = await hotFiles(scope, 100);
      return toCsv(["repository", "path", "comments", "pull_requests"], d.map((f) => [f.repoFullName, f.path, f.comments, f.pulls]));
    }
    case "coverage": {
      const d = await coverage(scope);
      return toCsv(
        ["covered_by_own_sections", ...GUIDE_ORIGINS.map((o) => ORIGIN_LABELS[o]), "total"],
        d.bins.map((b) => [b.label, ...GUIDE_ORIGINS.map((o) => b.values[o]), b.total]),
      );
    }
    case "members": {
      const d = await memberStats(scope, viewer);
      return toCsv(
        ["member", "sections_reviewed", "marks_carried_over", "comments", "reviews_submitted", "conversations_resolved", "guides_started"],
        [...d.rows, d.total].map((r) => [r.name, r.reviewed, r.carried, r.comments, r.reviews, r.resolved, r.guides]),
      );
    }
    case "templates": {
      const d = await templateCompliance(scope);
      return toCsv(
        ["template", "required_section", "guides_missing_it", "guides_with_template"],
        d.sections.map((s) => [s.template, s.title, s.missing, d.guides]),
      );
    }
  }
}
