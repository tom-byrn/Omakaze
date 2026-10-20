/**
 * Review requests and assignees of the demo pull requests, and a pull request opened by the demo
 * owner, for the "Needs my review", "Mine" and "Assigned" filters. Used by the seed (columns of the
 * cached pull requests) and the mock GitHub API (`requested_reviewers`, `requested_teams`, `assignees`).
 *
 * The owner (alexmorgan) is requested on #128 and #131 and has not reviewed #129's guide, opened
 * #126, and is assigned #126 and #129. Logins are the GitHub logins in DEMO_GITHUB_PEOPLE.
 */
import type { PullDef } from "./index";

/** Pull request opened by the demo owner. */
export const DEMO_OWNER_PR = 126;

/** Pull requests added to DEMO_PULLS by this module. */
export const REVIEW_DEMO_PULLS: PullDef[] = [
  {
    number: DEMO_OWNER_PR,
    title: "Show an error when checkout can't reach the store",
    author: "alexmorgan",
    state: "open",
    merged: false,
    draft: false,
    headRef: "alex/checkout-network-error",
    createdHoursAgo: 26,
    updatedHoursAgo: 8,
    commits: 1,
    body: "A failed `fetch` left the button disabled with no message. The button now shows an error and can be pressed again.",
    heads: [
      {
        label: "pr126",
        layers: ["pr126"],
        files: [{ path: "src/components/cart/CheckoutButton.tsx", status: "modified" }],
        pushedHoursAgo: 26,
      },
    ],
  },
];

export type DemoPeople = { reviewers: string[]; teams: string[]; assignees: string[] };

/** By pull request number; pull requests that are not listed have nobody requested or assigned. */
export const DEMO_REVIEW_REQUESTS: Record<number, DemoPeople> = {
  // Alex asked for changes on v1; Maya pushed fixes and asked Alex again.
  128: { reviewers: ["alexmorgan"], teams: [], assignees: ["mayachen"] },
  131: { reviewers: ["alexmorgan", "samokafor"], teams: ["Frontend"], assignees: ["devon-ko"] },
  129: { reviewers: ["mayachen"], teams: [], assignees: ["samokafor", "alexmorgan"] },
  126: { reviewers: ["mayachen", "samokafor"], teams: [], assignees: ["alexmorgan"] },
  130: { reviewers: [], teams: [], assignees: ["priya-s"] },
  127: { reviewers: [], teams: [], assignees: ["mayachen"] },
};

export function demoPeople(prNumber: number): DemoPeople {
  const p = DEMO_REVIEW_REQUESTS[prNumber];
  return p ? { reviewers: [...p.reviewers], teams: [...p.teams], assignees: [...p.assignees] } : { reviewers: [], teams: [], assignees: [] };
}

/** The `pull_requests` columns for a demo pull request. `avatar` gives a login's avatar URL. */
export function demoPeopleColumns(prNumber: number, avatar: (login: string) => string) {
  const p = demoPeople(prNumber);
  return {
    requestedReviewers: p.reviewers.map((login) => ({ login, avatarUrl: avatar(login) })),
    requestedTeams: p.teams,
    assignees: p.assignees.map((login) => ({ login, avatarUrl: avatar(login) })),
  };
}
