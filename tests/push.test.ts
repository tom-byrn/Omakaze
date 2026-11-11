import { describe, expect, it } from "vitest";
import { isExpoPushToken, pushMessage, wantsPush } from "@/lib/notifications/push";
import type { NotificationData } from "@/lib/notifications/types";

const prefs = { push: true, guideReady: true, newVersion: true, replies: true, pullActivity: true };
const base: NotificationData = {
  workspaceName: "Acme",
  repo: "acme/web",
  prTitle: "Add checkout endpoint",
  url: "https://omakaze.example.com/w/acme/acme/web/pull/412?v=2&section=3",
};

describe("push notifications", () => {
  it("accepts Expo push tokens only", () => {
    expect(isExpoPushToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[abc-DEF_123]")).toBe(true);
    expect(isExpoPushToken("fcm-token")).toBe(false);
    expect(isExpoPushToken("ExponentPushToken[bad token]")).toBe(false);
  });

  it("follows the push switch and the per-kind switches shared with email", () => {
    expect(wantsPush(prefs, "reply")).toBe(true);
    expect(wantsPush({ ...prefs, push: false }, "reply")).toBe(false);
    expect(wantsPush({ ...prefs, replies: false }, "reply")).toBe(false);
    expect(wantsPush({ ...prefs, replies: false }, "guide_ready")).toBe(true);
    expect(wantsPush({ ...prefs, pullActivity: false }, "pull_activity")).toBe(false);
  });

  it("titles the message with the pull request and describes the event in the body", () => {
    const m = pushMessage({ type: "guide_ready", workspaceId: "ws1", prNumber: 412, actorName: "Maya", data: { ...base, version: 2, sections: 5, reason: "requested" } });
    expect(m.title).toBe("acme/web#412 · Add checkout endpoint");
    expect(m.body).toBe("Maya published version 2 of the guide with 5 sections. Your review is requested.");
    expect(m.data).toEqual({ type: "guide_ready", workspaceId: "ws1", repo: "acme/web", prNumber: 412, url: base.url });
  });

  it("quotes comments on one line and names suggestions", () => {
    const body = "Looks good, but:\n\n```suggestion\nconst x = 1;\n```\nthanks";
    const m = pushMessage({
      type: "reply",
      workspaceId: "ws1",
      prNumber: 412,
      actorName: "sam",
      data: { ...base, comment: { kind: "reply", body, path: "src/a.ts", line: 10, ownRoot: true } },
    });
    expect(m.body).toBe("sam replied to your comment on src/a.ts:10\n“Looks good, but: [Suggested change] thanks”");
  });

  it("does not quote reviews and cuts long titles", () => {
    const m = pushMessage({
      type: "pull_activity",
      workspaceId: "ws1",
      prNumber: 7,
      actorName: "priya",
      data: { ...base, prTitle: "x".repeat(200), comment: { kind: "review", body: "Nice", path: null, line: null, state: "APPROVED" } },
    });
    expect(m.body).toBe("priya approved this pull request.");
    expect(m.title.length).toBeLessThanOrEqual("acme/web#7 · ".length + 80);
    expect(m.title.endsWith("…")).toBe(true);
  });
});
