import type { GuideCheckConclusion, GuideCheckMode } from "@/db/schema";
import { plural, shortSha } from "@/lib/format";
import type { ReviewProgress } from "./progress";

/** Name of the check run (GitHub App connections). */
export const CHECK_RUN_NAME = "Omakaze guide";
/** Context of the commit status (token and account connections). */
export const STATUS_CONTEXT = "omakaze/guide";

const MAX_ROWS = 100;
const MAX_DESCRIPTION = 140;

/** What the check reports on, for the pull request's current head commit. */
export type GuideCheckSubject =
  | { kind: "none"; headSha: string }
  | { kind: "generating"; headSha: string }
  | { kind: "outdated"; headSha: string; version: number; guideSha: string; progress: ReviewProgress }
  | { kind: "current"; headSha: string; version: number; progress: ReviewProgress }
  /** The check was turned off after something was posted: a last, non-blocking update. */
  | { kind: "off"; headSha: string };

export type GuideCheckReport = {
  conclusion: GuideCheckConclusion;
  title: string;
  /** Markdown, shown as the check run's summary (and in Omakaze). */
  summary: string;
  /** Check run fields. */
  run: { status: "in_progress" | "completed"; conclusion: "success" | "neutral" | "action_required" | null };
  /** Commit status fields; commit statuses have no neutral state. */
  status: { state: "success" | "pending"; description: string };
};

export type GuideCheckInput = {
  mode: Exclude<GuideCheckMode, "off">;
  subject: GuideCheckSubject;
  /** The pull request's page in Omakaze. */
  url: string;
  /** Reviewers each section needs (the workspace setting), for the text of the rule. */
  required?: number;
  /** Display names by user ID. */
  names?: Record<string, string>;
};

function cell(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
}

function linkText(text: string): string {
  return cell(text).replace(/([[\]])/g, "\\$1");
}

function progressTitle(p: ReviewProgress): string {
  const by = p.required > 1 ? ` by ${p.required} members` : "";
  if (p.total === 0) return "No sections to review";
  if (p.complete) return p.total === 1 ? `The section is reviewed${by}` : `All ${p.total} sections reviewed${by}`;
  return `${p.reviewed} of ${plural(p.total, "section")} reviewed${by}`;
}

function progressTable(p: ReviewProgress, url: string, names: Record<string, string>): string[] {
  if (p.total === 0) return [];
  const rows = p.sections.slice(0, MAX_ROWS).map((s, i) => {
    const n = String(i + 1).padStart(2, "0");
    const state = s.done ? "Reviewed" : s.reviewers.length === 0 ? "Not reviewed" : `${s.reviewers.length} of ${p.required} reviews`;
    const who = s.reviewers.map((id) => cell(names[id] ?? "Former member")).join(", ") || "–";
    return `| ${n} | [${linkText(s.title)}](${url}?section=${i + 1}) | ${state} | ${who} |`;
  });
  const more = p.sections.length > MAX_ROWS ? [``, `…and ${p.sections.length - MAX_ROWS} more sections.`] : [];
  return ["| # | Section | Status | Reviewed by |", "| --- | --- | --- | --- |", ...rows, ...more];
}

function rule(mode: GuideCheckInput["mode"], required: number): string {
  return mode === "required"
    ? `This check passes when every section is marked as reviewed by at least ${plural(required, "member")} in Omakaze.`
    : "Informational: this check does not block merging.";
}

/**
 * The check run and commit status for a pull request: title, markdown summary and conclusion.
 * Pure, so the rules are unit-tested; posting happens in src/lib/github/guide-check.ts.
 */
export function buildGuideCheck(input: GuideCheckInput): GuideCheckReport {
  const { mode, subject, url } = input;
  const names = input.names ?? {};
  const required = Math.max(1, input.required ?? 1);
  const blocking = mode === "required";
  const open = `[Open the guide in Omakaze](${url})`;
  let conclusion: GuideCheckConclusion;
  let title: string;
  let body: string[];

  switch (subject.kind) {
    case "none":
      conclusion = blocking ? "action_required" : "neutral";
      title = "No guide yet";
      body = [
        `This pull request has no guide for \`${shortSha(subject.headSha)}\` yet. Ask your coding agent to write one over MCP, generate it with the built-in AI, or write it in the editor.`,
        "",
        rule(mode, required),
        "",
        `[Open the pull request in Omakaze](${url})`,
      ];
      break;
    case "generating":
      conclusion = "in_progress";
      title = "Writing the guide";
      body = [`A guide for \`${shortSha(subject.headSha)}\` is being written. This check is updated when it is published.`, "", open];
      break;
    case "outdated": {
      conclusion = blocking ? "action_required" : "neutral";
      title = "Guide is outdated";
      body = [
        `The latest guide (version ${subject.version}) covers \`${shortSha(subject.guideSha)}\`, but the pull request now points to \`${shortSha(subject.headSha)}\`. Regenerate the guide, or ask your agent to write a new version for the current commit.`,
        "",
        `Progress on version ${subject.version}: ${subject.progress.reviewed} of ${plural(subject.progress.total, "section")} reviewed.`,
        "",
        rule(mode, required),
        "",
        open,
      ];
      break;
    }
    case "current": {
      const p = subject.progress;
      conclusion = blocking ? (p.complete ? "success" : "action_required") : "neutral";
      title = progressTitle(p);
      body = [`Guide version ${subject.version} for \`${shortSha(subject.headSha)}\`.`, "", ...progressTable(p, url, names), "", rule(mode, required), "", open];
      break;
    }
    case "off":
      conclusion = "off";
      title = "Guide check turned off";
      body = [`The guide check was turned off in Omakaze, so this check no longer reports review progress.`, "", open];
      break;
  }

  const description = title.length > MAX_DESCRIPTION ? `${title.slice(0, MAX_DESCRIPTION - 1)}…` : title;
  return {
    conclusion,
    title,
    summary: body.join("\n"),
    run:
      conclusion === "in_progress"
        ? { status: "in_progress", conclusion: null }
        : { status: "completed", conclusion: conclusion === "off" ? "neutral" : conclusion },
    status: { state: conclusion === "in_progress" || conclusion === "action_required" ? "pending" : "success", description },
  };
}

/** Body for POST /repos/{owner}/{repo}/check-runs (add `head_sha`) or PATCH …/check-runs/{id}. */
export function checkRunBody(report: GuideCheckReport, opts: { detailsUrl: string; externalId: string; now?: Date }) {
  return {
    name: CHECK_RUN_NAME,
    details_url: opts.detailsUrl,
    external_id: opts.externalId,
    status: report.run.status,
    ...(report.run.conclusion ? { conclusion: report.run.conclusion, completed_at: (opts.now ?? new Date()).toISOString() } : {}),
    output: { title: report.title, summary: report.summary },
  };
}

/** Body for POST /repos/{owner}/{repo}/statuses/{sha}. */
export function commitStatusBody(report: GuideCheckReport, targetUrl: string) {
  return { state: report.status.state, target_url: targetUrl, description: report.status.description, context: STATUS_CONTEXT };
}

/** Labels for the conclusions, as Omakaze shows them. */
export const CONCLUSION_LABELS: Record<GuideCheckConclusion, string> = {
  success: "Passing",
  neutral: "Informational",
  action_required: "Action required",
  in_progress: "In progress",
  off: "Turned off",
};
