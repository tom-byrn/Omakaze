import { createHash, randomBytes } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { guideId, sql } from "./db";
import { DEMO_PRS, DEMO_REPO, DEMO_USERS, E2E, expect, mockNotify, test, type DemoUserKey } from "./fixtures";

/** The /api/mobile routes the mobile app uses (docs/mobile.md), and push notifications. */

const TOKEN_NAME = "e2e mobile";
/** Review marks this spec adds, removed again afterwards (the seeded marks stay). */
const addedMarks: { guideId: string; sectionId: string; userId: string }[] = [];
const PUSH_TOKEN = "ExponentPushToken[e2eMobileDevice0001]";

async function tokenFor(user: DemoUserKey): Promise<string> {
  const token = `omk_e2e_${randomBytes(16).toString("hex")}`;
  await sql()`
    insert into api_tokens (id, user_id, workspace_id, name, kind, token_hash, token_prefix)
    select ${`tok_${randomBytes(6).toString("hex")}`}, u.id, w.id, ${TOKEN_NAME}, 'personal', ${createHash("sha256").update(token).digest("hex")}, ${token.slice(0, 12)}
    from users u, workspaces w where lower(u.email) = ${DEMO_USERS[user].email} and w.slug = 'demo'`;
  return token;
}

async function call<T = Record<string, unknown>>(request: APIRequestContext, token: string, method: string, path: string, data?: unknown): Promise<{ status: number; body: T }> {
  const res = await request.fetch(path, { method, headers: { Authorization: `Bearer ${token}` }, data, timeout: 120_000 });
  const text = await res.text();
  return { status: res.status(), body: (text ? JSON.parse(text) : null) as T };
}

async function restore(): Promise<void> {
  const extra = await sql()`
    select g.id from guides g join workspaces w on w.id = g.workspace_id where w.slug = 'demo' and g.pr_number = ${DEMO_PRS.noGuide}`;
  for (const g of extra) {
    await sql()`delete from activity where guide_id = ${g.id}`;
    await sql()`delete from guides where id = ${g.id}`;
  }
  await sql()`delete from push_devices where token like 'ExponentPushToken[e2e%'`;
  await sql()`delete from notifications where event_key like 'guide:%' and created_at > now() - interval '1 hour'`;
  await sql()`delete from jobs where type in ('notify_event', 'send_notification_email', 'post_notification_webhook', 'send_push')`;
  await sql()`delete from notification_preferences where user_id in (select id from users where lower(email) in ${sql()(Object.values(DEMO_USERS).map((u) => u.email))})`;
  await sql()`delete from api_tokens where name = ${TOKEN_NAME}`;
  for (const m of addedMarks.splice(0)) {
    await sql()`delete from section_reviews where guide_id = ${m.guideId} and section_id = ${m.sectionId} and user_id = ${m.userId}`;
  }
}

test.beforeEach(restore);
test.afterEach(restore);

test.describe("Mobile API", () => {
  test("needs a workspace token", async ({ request }) => {
    const res = await request.get("/api/mobile/me");
    expect(res.status()).toBe(401);
  });

  test("the app's screens: account, pull requests, a guide and its review marks", async ({ request }) => {
    const token = await tokenFor("member");
    const me = await call<{ workspace: { slug: string }; role: string; repos: { fullName: string }[]; features: { push: boolean } }>(request, token, "GET", "/api/mobile/me");
    expect(me.status).toBe(200);
    expect(me.body.workspace.slug).toBe("demo");
    expect(me.body.role).toBe("member");
    expect(me.body.repos.map((r) => r.fullName)).toContain(DEMO_REPO.fullName);
    expect(me.body.features.push).toBe(true);

    const pulls = await call<{ filterCounts: Record<string, number>; pulls: { number: number }[] }>(request, token, "GET", "/api/mobile/pulls?state=open&filter=all");
    expect(pulls.status).toBe(200);
    expect(pulls.body.pulls.map((p) => p.number)).toContain(DEMO_PRS.main);
    expect(pulls.body.filterCounts.all).toBe(pulls.body.pulls.length);
    expect((await call(request, token, "GET", "/api/mobile/pulls?filter=nope")).status).toBe(400);

    type Detail = { guide: { id: string; version: number; sections: { id: string; reviewedBy: string[] }[]; files: { path: string }[] }; me: { id: string } };
    const detail = await call<Detail>(request, token, "GET", `/api/mobile/pull?repo=${DEMO_REPO.fullName}&number=${DEMO_PRS.main}&v=2`);
    expect(detail.status).toBe(200);
    const g = detail.body.guide;
    expect(g.id).toBe(await guideId(DEMO_PRS.main, 2));
    expect(g.sections.length).toBeGreaterThan(1);
    expect(g.files.length).toBeGreaterThan(0);

    // Marking a section reviewed with the app's token shows in the next load.
    const userId = detail.body.me.id;
    const index = g.sections.findIndex((s) => !s.reviewedBy.includes(userId));
    expect(index).toBeGreaterThanOrEqual(0);
    const section = g.sections[index];
    addedMarks.push({ guideId: g.id, sectionId: section.id, userId });
    expect((await call(request, token, "POST", `/api/guides/${g.id}/progress`, { sectionId: section.id, reviewed: true })).status).toBe(200);
    const again = await call<Detail>(request, token, "GET", `/api/mobile/pull?repo=${DEMO_REPO.fullName}&number=${DEMO_PRS.main}&v=2`);
    expect(again.body.guide.sections[index].reviewedBy).toContain(userId);

    // The diff of a file, as the section view loads it.
    const file = await call<{ path: string; hunks: unknown[] }>(request, token, "GET", `/api/guides/${g.id}/file?path=${encodeURIComponent(g.files[0].path)}`);
    expect(file.status).toBe(200);
    expect(file.body.hunks.length).toBeGreaterThan(0);

    for (const path of ["/api/mobile/activity", "/api/mobile/insights?days=7", "/api/mobile/members", "/api/mobile/share-links"]) {
      expect((await call(request, token, "GET", path)).status, path).toBe(200);
    }
    expect((await call(request, token, "GET", "/api/mobile/pull?repo=acme/unknown&number=1")).status).toBe(404);
  });

  test("notification settings and push notifications", async ({ request }) => {
    test.skip(E2E.github !== "mock", "needs the mock GitHub API");
    await mockNotify.reset();
    const sam = await tokenFor("member");
    const maya = await tokenFor("admin");

    // Settings change in part; the rest stay.
    const off = await call<{ preferences: { push: boolean; replies: boolean; guideReady: boolean } }>(request, sam, "PATCH", "/api/mobile/notifications", { push: false, replies: false });
    expect(off.status).toBe(200);
    expect(off.body.preferences).toMatchObject({ push: false, replies: false, guideReady: true });
    await call(request, sam, "PATCH", "/api/mobile/notifications", { push: true, replies: true });

    expect((await call(request, sam, "POST", "/api/mobile/push-devices", { token: "not-an-expo-token", platform: "ios" })).status).toBe(400);
    expect((await call(request, sam, "POST", "/api/mobile/push-devices", { token: PUSH_TOKEN, platform: "ios", deviceName: "e2e" })).status).toBe(200);

    // Maya publishes a guide for #131, where Sam is a requested reviewer: Sam's phone gets a push right away.
    const res = await request.post("/api/v1/guides", {
      headers: { Authorization: `Bearer ${maya}` },
      data: { pr: `${DEMO_REPO.fullName}#${DEMO_PRS.noGuide}`, sections: [{ title: "Resizer URLs", refs: ["src/lib/images.ts"] }] },
      timeout: 120_000,
    });
    expect(res.status(), await res.text()).toBe(201);
    await expect.poll(async () => (await mockNotify.hooks({ path: "/expo/push" })).length, { timeout: 30_000 }).toBe(1);
    const [push] = await mockNotify.hooks({ path: "/expo/push" });
    const [message] = push.body as { to: string; title: string; body: string; data: Record<string, unknown> }[];
    expect(message.to).toBe(PUSH_TOKEN);
    expect(message.title).toBe(`${DEMO_REPO.fullName}#${DEMO_PRS.noGuide} · Serve product images through the CDN resizer`);
    expect(message.body).toBe("Maya Chen published a guide with 2 sections. Your review is requested.");
    expect(message.data).toMatchObject({ type: "guide_ready", repo: DEMO_REPO.fullName, prNumber: DEMO_PRS.noGuide });
    expect(String(message.data.url)).toContain(`/pull/${DEMO_PRS.noGuide}?v=1`);

    // Signing out removes the device.
    expect((await call(request, sam, "DELETE", `/api/mobile/push-devices?token=${encodeURIComponent(PUSH_TOKEN)}`)).status).toBe(200);
    const [{ n }] = await sql()`select count(*)::int as n from push_devices where token = ${PUSH_TOKEN}`;
    expect(n).toBe(0);
  });
});
