/**
 * AI code reviewers: bots such as Claude Code Review (a GitHub Actions workflow), Greptile,
 * CodeRabbit or GitHub Copilot that review pull requests on GitHub. Automatic guides wait for
 * them (see wait.ts) and include their findings, and the viewer labels their comments.
 *
 * This file has no server imports, so client components can use the types and the matching.
 */

/** One AI reviewer as a workspace configures it. */
export type AiReviewerConfig = {
  /** Stable key: a preset key or `custom-<n>`. */
  key: string;
  name: string;
  /** GitHub logins it posts as (REST logins of bots end in `[bot]`; the suffix is optional here). */
  logins: string[];
  /**
   * Check runs (e.g. the Actions job) or commit statuses it reports on the head commit. A pending
   * one means a review is underway; a finished one means the review is done. Matched case-insensitively,
   * by name or by name followed by a space (matrix jobs such as "claude-review (ubuntu)").
   */
  checks: string[];
  enabled: boolean;
};

export const AI_REVIEWER_PRESETS: AiReviewerConfig[] = [
  {
    key: "claude",
    name: "Claude Code Review",
    logins: ["claude[bot]"],
    checks: ["claude-review", "Claude Code Review"],
    enabled: true,
  },
  {
    key: "greptile",
    name: "Greptile",
    logins: ["greptile-apps[bot]"],
    checks: ["Greptile Review"],
    enabled: true,
  },
  {
    key: "coderabbit",
    name: "CodeRabbit",
    logins: ["coderabbitai[bot]"],
    checks: ["CodeRabbit"],
    enabled: true,
  },
  {
    key: "copilot",
    name: "GitHub Copilot",
    logins: ["copilot-pull-request-reviewer[bot]", "Copilot"],
    checks: [],
    enabled: true,
  },
];

export const MAX_CUSTOM_REVIEWERS = 10;
export const DEFAULT_WAIT_MINUTES = 15;
export const MAX_WAIT_MINUTES = 120;
/**
 * How long a wait lasts at least: reviewers announce themselves with a check run, a commit status
 * or a review request, and those can take a minute or two to appear after a push.
 */
export const DISCOVERY_SECONDS = 120;

/**
 * The reviewers of a workspace: every preset (enabled unless the workspace turned it off) followed
 * by its own reviewers. `stored` is the workspace's `ai_reviewers` column; null means the presets.
 */
export function resolveAiReviewers(stored: AiReviewerConfig[] | null | undefined): AiReviewerConfig[] {
  const list = stored ?? [];
  const presets = AI_REVIEWER_PRESETS.map((p) => {
    const saved = list.find((s) => s.key === p.key);
    return { ...p, enabled: saved ? saved.enabled : p.enabled };
  });
  const custom = list.filter((s) => !AI_REVIEWER_PRESETS.some((p) => p.key === s.key));
  return [...presets, ...custom];
}

export function enabledAiReviewers(stored: AiReviewerConfig[] | null | undefined): AiReviewerConfig[] {
  return resolveAiReviewers(stored).filter((r) => r.enabled && (r.logins.length > 0 || r.checks.length > 0));
}

/** Login without the `[bot]` suffix, lower case: REST says `claude[bot]`, GraphQL and requests say `claude`. */
export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase().replace(/\[bot\]$/, "");
}

/** The reviewer that posts as `login`, if any. */
export function reviewerForLogin<R extends Pick<AiReviewerConfig, "logins">>(reviewers: R[], login: string | null | undefined): R | null {
  if (!login) return null;
  const l = normalizeLogin(login);
  return reviewers.find((r) => r.logins.some((x) => normalizeLogin(x) === l)) ?? null;
}

/** Whether a check run or commit status name is one of the reviewer's. */
export function matchesCheck(reviewer: Pick<AiReviewerConfig, "checks">, name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return reviewer.checks.some((c) => {
    const p = c.trim().toLowerCase();
    return p.length > 0 && (n === p || n.startsWith(`${p} `));
  });
}

/** Split a comma- or newline-separated list from a form field. */
export function splitList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
