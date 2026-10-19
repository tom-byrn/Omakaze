import { describe, expect, it } from "vitest";
import { buildGuideCheck, checkRunBody, commitStatusBody, CHECK_RUN_NAME, STATUS_CONTEXT } from "@/lib/guides/check";
import { computeReviewProgress, type ProgressSection } from "@/lib/guides/progress";
import { missingGuideCheckPermissions } from "@/lib/github/app";

const sections: ProgressSection[] = [
  { id: "s1", title: "Promo codes table" },
  { id: "s2", title: "Checkout | totals" },
  { id: "s3", title: "Other changes" },
];
const url = "https://omakaze.example/w/demo/acme/storefront/pull/128";
const names = { maya: "Maya Chen", sam: "Sam Okafor", alex: "Alex Morgan" };

describe("review progress", () => {
  it("counts sections with enough reviewers", () => {
    const p = computeReviewProgress(sections, [
      { sectionId: "s1", userId: "maya" },
      { sectionId: "s1", userId: "sam" },
      { sectionId: "s2", userId: "maya" },
    ]);
    expect(p).toMatchObject({ reviewed: 2, total: 3, required: 1, complete: false });
    expect(p.sections.map((s) => s.reviewers)).toEqual([["maya", "sam"], ["maya"], []]);
    expect(p.sections.map((s) => s.done)).toEqual([true, true, false]);
  });

  it("needs N reviewers per section when required", () => {
    const marks = [
      { sectionId: "s1", userId: "maya" },
      { sectionId: "s1", userId: "sam" },
      { sectionId: "s2", userId: "maya" },
      { sectionId: "s3", userId: "maya" },
      { sectionId: "s3", userId: "alex" },
    ];
    expect(computeReviewProgress(sections, marks, { required: 2 })).toMatchObject({ reviewed: 2, complete: false });
    expect(computeReviewProgress(sections, [...marks, { sectionId: "s2", userId: "alex" }], { required: 2 }).complete).toBe(true);
  });

  it("ignores former members, duplicate marks and unknown sections", () => {
    const p = computeReviewProgress(
      sections,
      [
        { sectionId: "s1", userId: "left" },
        { sectionId: "s2", userId: "maya" },
        { sectionId: "s2", userId: "maya" },
        { sectionId: "gone", userId: "maya" },
      ],
      { memberIds: ["maya", "sam"] },
    );
    expect(p.sections.map((s) => s.reviewers)).toEqual([[], ["maya"], []]);
    expect(p.reviewed).toBe(1);
  });

  it("treats a guide without sections as complete and clamps the reviewer count", () => {
    expect(computeReviewProgress([], [], { required: 3 })).toMatchObject({ total: 0, reviewed: 0, complete: true });
    expect(computeReviewProgress(sections, [], { required: 0 }).required).toBe(1);
  });
});

describe("guide check report", () => {
  const partial = computeReviewProgress(sections, [
    { sectionId: "s1", userId: "maya" },
    { sectionId: "s2", userId: "sam" },
  ]);
  const complete = computeReviewProgress(sections, [
    { sectionId: "s1", userId: "maya" },
    { sectionId: "s2", userId: "sam" },
    { sectionId: "s3", userId: "maya" },
  ]);
  const current = (progress = partial) => ({ kind: "current" as const, headSha: "a1b2c3d4e5", version: 2, progress });

  it("requires review: action required until every section is reviewed", () => {
    const r = buildGuideCheck({ mode: "required", subject: current(), url, names });
    expect(r.conclusion).toBe("action_required");
    expect(r.title).toBe("2 of 3 sections reviewed");
    expect(r.run).toEqual({ status: "completed", conclusion: "action_required" });
    expect(r.status).toEqual({ state: "pending", description: "2 of 3 sections reviewed" });

    const done = buildGuideCheck({ mode: "required", subject: current(complete), url, names });
    expect(done.conclusion).toBe("success");
    expect(done.title).toBe("All 3 sections reviewed");
    expect(done.status.state).toBe("success");
  });

  it("is neutral in informational mode, whatever the progress", () => {
    for (const progress of [partial, complete]) {
      const r = buildGuideCheck({ mode: "informational", subject: current(progress), url, names });
      expect(r.run.conclusion).toBe("neutral");
      expect(r.status.state).toBe("success");
    }
    expect(buildGuideCheck({ mode: "informational", subject: { kind: "none", headSha: "abc" }, url }).run.conclusion).toBe("neutral");
  });

  it("names the number of reviewers when more than one is needed", () => {
    const p = computeReviewProgress(sections, [{ sectionId: "s1", userId: "maya" }], { required: 2 });
    const r = buildGuideCheck({ mode: "required", subject: current(p), url, names, required: 2 });
    expect(r.title).toBe("0 of 3 sections reviewed by 2 members");
    expect(r.summary).toContain("| 01 | [Promo codes table](" + url + "?section=1) | 1 of 2 reviews | Maya Chen |");
    expect(r.summary).toContain("at least 2 members");
  });

  it("lists sections with who reviewed them and escapes table cells", () => {
    const r = buildGuideCheck({ mode: "required", subject: current(), url, names });
    expect(r.summary).toContain("Guide version 2 for `a1b2c3d`.");
    expect(r.summary).toContain("| # | Section | Status | Reviewed by |");
    expect(r.summary).toContain(`| 02 | [Checkout \\| totals](${url}?section=2) | Reviewed | Sam Okafor |`);
    expect(r.summary).toContain(`| 03 | [Other changes](${url}?section=3) | Not reviewed | – |`);
    expect(r.summary).toContain(`[Open the guide in Omakaze](${url})`);
  });

  it("blocks on outdated guides and pull requests without a guide when review is required", () => {
    const outdated = buildGuideCheck({
      mode: "required",
      subject: { kind: "outdated", headSha: "ffff0000aa", version: 1, guideSha: "1234567890", progress: complete },
      url,
    });
    expect(outdated).toMatchObject({ conclusion: "action_required", title: "Guide is outdated" });
    expect(outdated.summary).toContain("covers `1234567`, but the pull request now points to `ffff000`");
    expect(outdated.status.state).toBe("pending");

    const none = buildGuideCheck({ mode: "required", subject: { kind: "none", headSha: "ffff0000aa" }, url });
    expect(none).toMatchObject({ conclusion: "action_required", title: "No guide yet" });
  });

  it("reports a guide being written as in progress, and the final update after turning off as neutral", () => {
    const writing = buildGuideCheck({ mode: "required", subject: { kind: "generating", headSha: "abc" }, url });
    expect(writing.run).toEqual({ status: "in_progress", conclusion: null });
    expect(writing.status.state).toBe("pending");

    const off = buildGuideCheck({ mode: "informational", subject: { kind: "off", headSha: "abc" }, url });
    expect(off).toMatchObject({ conclusion: "off", title: "Guide check turned off" });
    expect(off.run.conclusion).toBe("neutral");
    expect(off.status.state).toBe("success");
  });

  it("builds the check run and commit status bodies", () => {
    const r = buildGuideCheck({ mode: "required", subject: current(), url, names });
    const now = new Date("2026-10-19T10:00:00Z");
    expect(checkRunBody(r, { detailsUrl: url, externalId: "repo:128", now })).toEqual({
      name: CHECK_RUN_NAME,
      details_url: url,
      external_id: "repo:128",
      status: "completed",
      conclusion: "action_required",
      completed_at: "2026-10-19T10:00:00.000Z",
      output: { title: "2 of 3 sections reviewed", summary: r.summary },
    });
    const writing = buildGuideCheck({ mode: "required", subject: { kind: "generating", headSha: "abc" }, url });
    expect(checkRunBody(writing, { detailsUrl: url, externalId: "x" })).not.toHaveProperty("conclusion");
    expect(commitStatusBody(r, url)).toEqual({ state: "pending", target_url: url, description: "2 of 3 sections reviewed", context: STATUS_CONTEXT });
  });

  it("lists at most 100 sections", () => {
    const many = computeReviewProgress(
      Array.from({ length: 120 }, (_, i) => ({ id: `s${i}`, title: `Section ${i}` })),
      [],
    );
    const r = buildGuideCheck({ mode: "required", subject: current(many), url });
    expect(r.summary).toContain("| 100 | [Section 99]");
    expect(r.summary).not.toContain("[Section 100]");
    expect(r.summary).toContain("…and 20 more sections.");
  });
});

describe("GitHub App permissions for the guide check", () => {
  it("lists what an older app is missing", () => {
    expect(missingGuideCheckPermissions({ contents: "read", pull_requests: "write" })).toEqual(["Checks", "Commit statuses"]);
    expect(missingGuideCheckPermissions({ checks: "read", statuses: "write" })).toEqual(["Checks"]);
    expect(missingGuideCheckPermissions({ checks: "write", statuses: "write" })).toEqual([]);
  });
});
