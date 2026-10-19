import { describe, expect, it } from "vitest";
import {
  countPulls,
  involvement,
  isPullFilter,
  matchesFilter,
  matchesState,
  parsePullFilter,
  pullListHref,
  type PullFacts,
} from "@/lib/dashboard";
import type { GhPull } from "@/lib/github/client";
import { applyPeopleEvent, includesLogin, loginKey, membersAmong, pullPeopleValues, sameLogin, type GitHubMember } from "@/lib/github/people";

const pull = (over: Partial<PullFacts> = {}): PullFacts => ({
  state: "open",
  merged: false,
  authorLogin: "devon-ko",
  reviewerLogins: [],
  assigneeLogins: [],
  progress: null,
  ...over,
});

const ghPull = (over: Partial<GhPull> = {}): GhPull => ({
  id: 1,
  number: 7,
  title: "Add checkout",
  body: null,
  state: "open",
  merged_at: null,
  closed_at: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-02T00:00:00Z",
  html_url: "https://github.com/acme/web/pull/7",
  user: { login: "devon-ko", avatar_url: "https://avatars.example/devon" },
  head: { ref: "feature", sha: "a".repeat(40), repo: { full_name: "acme/web" } },
  base: { ref: "main", sha: "b".repeat(40), repo: { full_name: "acme/web" } },
  ...over,
});

describe("filter parameters", () => {
  it("parses filters and falls back to all", () => {
    expect(parsePullFilter("needs-review")).toBe("needs-review");
    expect(parsePullFilter("mine")).toBe("mine");
    expect(parsePullFilter("assigned")).toBe("assigned");
    expect(parsePullFilter("bogus")).toBe("all");
    expect(parsePullFilter(["mine"])).toBe("all");
    expect(parsePullFilter(undefined)).toBe("all");
    expect(isPullFilter("all")).toBe(true);
    expect(isPullFilter("review")).toBe(false);
  });

  it("builds list links without default values", () => {
    expect(pullListHref("/w/acme", {})).toBe("/w/acme");
    expect(pullListHref("/w/acme", { state: "open", filter: "all", q: "" })).toBe("/w/acme");
    expect(pullListHref("/w/acme", { state: "merged", filter: "needs-review" })).toBe("/w/acme?filter=needs-review&state=merged");
    expect(pullListHref("/w/acme/acme/web", { filter: "mine", q: "promo codes" })).toBe("/w/acme/acme/web?filter=mine&q=promo+codes");
  });
});

describe("states", () => {
  it("matches open, merged, closed and all", () => {
    const open = pull();
    const merged = pull({ state: "closed", merged: true });
    const closed = pull({ state: "closed" });
    expect([open, merged, closed].map((p) => matchesState(p, "open"))).toEqual([true, false, false]);
    expect([open, merged, closed].map((p) => matchesState(p, "merged"))).toEqual([false, true, false]);
    expect([open, merged, closed].map((p) => matchesState(p, "closed"))).toEqual([false, false, true]);
    expect([open, merged, closed].every((p) => matchesState(p, "all"))).toBe(true);
  });
});

describe("needs my review", () => {
  it("includes pull requests where the viewer's review is requested", () => {
    const p = pull({ reviewerLogins: ["mayachen", "alexmorgan"] });
    expect(involvement(p, "alexmorgan")).toMatchObject({ requested: true, needsReview: true });
    expect(matchesFilter(p, "needs-review", "samokafor")).toBe(false);
  });

  it("matches logins without regard to case", () => {
    expect(matchesFilter(pull({ reviewerLogins: ["AlexMorgan"] }), "needs-review", "alexmorgan")).toBe(true);
    expect(matchesFilter(pull({ authorLogin: "MayaChen" }), "mine", "mayachen")).toBe(true);
    expect(matchesFilter(pull({ assigneeLogins: ["SAMOKAFOR"] }), "assigned", "samokafor")).toBe(true);
  });

  it("includes published guides with sections the viewer hasn't reviewed", () => {
    expect(matchesFilter(pull({ progress: { sections: 6, reviewed: 2 } }), "needs-review", "alexmorgan")).toBe(true);
    expect(matchesFilter(pull({ progress: { sections: 6, reviewed: 6 } }), "needs-review", "alexmorgan")).toBe(false);
    expect(matchesFilter(pull({ progress: { sections: 0, reviewed: 0 } }), "needs-review", "alexmorgan")).toBe(false);
    expect(matchesFilter(pull(), "needs-review", "alexmorgan")).toBe(false);
  });

  it("leaves out the author's own guide", () => {
    const own = pull({ authorLogin: "alexmorgan", progress: { sections: 3, reviewed: 0 } });
    expect(matchesFilter(own, "needs-review", "alexmorgan")).toBe(false);
    expect(matchesFilter(own, "needs-review", "mayachen")).toBe(true);
  });

  it("keeps a pending request when every section is marked", () => {
    const p = pull({ reviewerLogins: ["alexmorgan"], progress: { sections: 2, reviewed: 2 } });
    expect(involvement(p, "alexmorgan")).toMatchObject({ requested: true, unreviewed: false, needsReview: true });
  });

  it("only counts open pull requests", () => {
    const merged = pull({ state: "closed", merged: true, reviewerLogins: ["alexmorgan"], progress: { sections: 2, reviewed: 0 } });
    const closed = pull({ state: "closed", reviewerLogins: ["alexmorgan"] });
    expect(matchesFilter(merged, "needs-review", "alexmorgan")).toBe(false);
    expect(matchesFilter(closed, "needs-review", "alexmorgan")).toBe(false);
    // Drafts are open; a request on a draft still counts.
    expect(matchesFilter(pull({ reviewerLogins: ["alexmorgan"] }), "needs-review", "alexmorgan")).toBe(true);
  });

  it("uses only guide progress without a linked GitHub account", () => {
    const requested = pull({ reviewerLogins: ["alexmorgan"] });
    const guide = pull({ authorLogin: "alexmorgan", progress: { sections: 4, reviewed: 1 } });
    expect(matchesFilter(requested, "needs-review", null)).toBe(false);
    // The author can't be recognized either, so their own guide is listed.
    expect(matchesFilter(guide, "needs-review", null)).toBe(true);
    expect(matchesFilter(guide, "mine", null)).toBe(false);
    expect(matchesFilter(pull({ assigneeLogins: ["alexmorgan"] }), "assigned", null)).toBe(false);
  });
});

describe("mine, assigned and all", () => {
  it("matches the author and the assignees", () => {
    const p = pull({ authorLogin: "alexmorgan", assigneeLogins: ["alexmorgan", "mayachen"] });
    expect(matchesFilter(p, "mine", "alexmorgan")).toBe(true);
    expect(matchesFilter(p, "mine", "mayachen")).toBe(false);
    expect(matchesFilter(p, "assigned", "mayachen")).toBe(true);
    expect(matchesFilter(pull({ authorLogin: null }), "mine", "alexmorgan")).toBe(false);
    expect(matchesFilter(pull({ authorLogin: null }), "all", null)).toBe(true);
  });
});

describe("tab counts", () => {
  const pulls: PullFacts[] = [
    pull({ reviewerLogins: ["alexmorgan"] }),
    pull({ progress: { sections: 5, reviewed: 0 } }),
    pull({ authorLogin: "alexmorgan", assigneeLogins: ["alexmorgan"] }),
    pull({ state: "closed", merged: true, authorLogin: "alexmorgan", progress: { sections: 2, reviewed: 0 } }),
    pull({ state: "closed", assigneeLogins: ["alexmorgan"] }),
  ];

  it("counts every filter within the state and every state within the filter", () => {
    expect(countPulls(pulls, { state: "open", filter: "all", login: "alexmorgan" })).toEqual({
      states: { open: 3, merged: 1, closed: 1, all: 5 },
      filters: { "needs-review": 2, mine: 1, assigned: 1, all: 3 },
    });
    expect(countPulls(pulls, { state: "all", filter: "mine", login: "alexmorgan" })).toEqual({
      states: { open: 1, merged: 1, closed: 0, all: 2 },
      filters: { "needs-review": 2, mine: 2, assigned: 2, all: 5 },
    });
    expect(countPulls(pulls, { state: "merged", filter: "needs-review", login: "alexmorgan" }).states).toEqual({
      open: 2,
      merged: 0,
      closed: 0,
      all: 2,
    });
  });

  it("counts without a linked account", () => {
    expect(countPulls(pulls, { state: "open", filter: "needs-review", login: null }).filters).toEqual({
      "needs-review": 1,
      mine: 0,
      assigned: 0,
      all: 3,
    });
  });
});

describe("people on pull requests", () => {
  it("compares logins without regard to case", () => {
    expect(loginKey(" AlexMorgan ")).toBe("alexmorgan");
    expect(sameLogin("AlexMorgan", "alexmorgan")).toBe(true);
    expect(sameLogin(null, null)).toBe(false);
    expect(includesLogin([{ login: "MayaChen", avatarUrl: null }], "mayachen")).toBe(true);
    expect(includesLogin(["mayachen"], null)).toBe(false);
  });

  it("maps a GitHub pull request to cached columns", () => {
    const values = pullPeopleValues(
      ghPull({
        requested_reviewers: [{ login: "alexmorgan", avatar_url: "https://avatars.example/alex" }],
        requested_teams: [{ name: "Frontend", slug: "frontend" }],
        assignees: [{ login: "mayachen" }],
      }),
    );
    expect(values).toEqual({
      requestedReviewers: [{ login: "alexmorgan", avatarUrl: "https://avatars.example/alex" }],
      requestedTeams: ["Frontend"],
      assignees: [{ login: "mayachen", avatarUrl: null }],
    });
  });

  it("leaves columns alone when a payload has no lists", () => {
    expect(pullPeopleValues(ghPull())).toEqual({});
    expect(pullPeopleValues(ghPull({ assignees: [] }))).toEqual({ assignees: [] });
  });

  it("applies review request and assignment webhooks", () => {
    const alex = { login: "alexmorgan", avatar_url: "a" };
    const maya = { login: "mayachen", avatar_url: "m" };
    const team = { name: "Frontend", slug: "frontend" };
    // A delivery processed after a later one: the payload's list doesn't have the reviewer yet.
    const requested = applyPeopleEvent(ghPull({ requested_reviewers: [maya] }), { action: "review_requested", requested_reviewer: alex });
    expect(requested.requested_reviewers?.map((r) => r.login)).toEqual(["mayachen", "alexmorgan"]);
    const again = applyPeopleEvent(requested, { action: "review_requested", requested_reviewer: { login: "AlexMorgan" } });
    expect(again.requested_reviewers).toHaveLength(2);

    const removed = applyPeopleEvent(ghPull({ requested_reviewers: [maya, alex] }), { action: "review_request_removed", requested_reviewer: alex });
    expect(removed.requested_reviewers?.map((r) => r.login)).toEqual(["mayachen"]);

    const teamAdded = applyPeopleEvent(ghPull(), { action: "review_requested", requested_team: team });
    expect(teamAdded.requested_teams).toEqual([team]);
    expect(teamAdded.requested_reviewers).toBeUndefined();
    expect(applyPeopleEvent(teamAdded, { action: "review_request_removed", requested_team: team }).requested_teams).toEqual([]);

    expect(applyPeopleEvent(ghPull({ assignees: [] }), { action: "assigned", assignee: maya }).assignees).toEqual([maya]);
    expect(applyPeopleEvent(ghPull({ assignees: [maya] }), { action: "unassigned", assignee: maya }).assignees).toEqual([]);

    const other = ghPull({ requested_reviewers: [maya] });
    expect(applyPeopleEvent(other, { action: "synchronize", requested_reviewer: alex })).toBe(other);
  });

  it("finds workspace members among GitHub people", () => {
    const member = (login: string): GitHubMember => ({ userId: `u-${login}`, name: login, avatarUrl: null, role: "member", login });
    const members = new Map([member("alexmorgan"), member("mayachen")].map((m) => [loginKey(m.login), m]));
    const found = membersAmong([{ login: "AlexMorgan", avatarUrl: null }, "devon-ko", "mayachen", "alexmorgan"], members);
    expect(found.map((m) => m.userId)).toEqual(["u-alexmorgan", "u-mayachen"]);
  });
});
