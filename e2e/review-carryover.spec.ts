import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import { guideId, sql } from "./db";
import { DEMO_PRS, DEMO_REPO, DEMO_USERS, demoPaths, E2E, expect, test, type DemoUserKey } from "./fixtures";
import { caption, pause, shot, videoName } from "./media";

const PR = DEMO_PRS.main;

async function userId(user: DemoUserKey): Promise<string> {
  const [row] = await sql()`select id from users where lower(email) = ${DEMO_USERS[user].email}`;
  return row.id as string;
}

/** Review marks and page views of #128, so every test can leave them as it found them. */
type Saved = { guides: string[]; reviews: postgres.Row[]; views: postgres.Row[] };

async function save(): Promise<Saved> {
  const guides = [await guideId(PR, 1), await guideId(PR, 2)];
  return {
    guides,
    reviews: [...(await sql()`select * from section_reviews where guide_id in ${sql()(guides)}`)],
    views: [...(await sql()`select * from guide_views where guide_id in ${sql()(guides)}`)],
  };
}

async function restore(saved: Saved): Promise<void> {
  // Versions a test published (see "publishing a new version").
  const extra = await sql()`
    select g.id from guides g join workspaces w on w.id = g.workspace_id
    where w.slug = 'demo' and g.pr_number = ${PR} and g.version > 2`;
  for (const g of extra) {
    await sql()`delete from activity where guide_id = ${g.id}`;
    await sql()`delete from guides where id = ${g.id}`;
  }
  await sql()`delete from section_reviews where guide_id in ${sql()(saved.guides)}`;
  await sql()`delete from guide_views where guide_id in ${sql()(saved.guides)}`;
  if (saved.reviews.length > 0) await sql()`insert into section_reviews ${sql()(saved.reviews)}`;
  if (saved.views.length > 0) await sql()`insert into guide_views ${sql()(saved.views)}`;
}

/** Maya as she was before version 2: marks on v1 only, last visit when she reviewed v1 two days ago. */
async function beforeVersionTwo(): Promise<void> {
  const maya = await userId("admin");
  const v2 = await guideId(PR, 2);
  await sql()`delete from section_reviews where guide_id = ${v2} and user_id = ${maya}`;
  await sql()`delete from guide_views where guide_id = ${v2} and user_id = ${maya}`;
}

async function marks(user: DemoUserKey, version: number) {
  return sql()`
    select s.title, r.carried_from_version from section_reviews r join guide_sections s on s.id = r.section_id
    where r.guide_id = ${await guideId(PR, version)} and r.user_id = ${await userId(user)}
    order by s.position`;
}

let saved: Saved;
test.beforeEach(async () => {
  saved = await save();
});
test.afterEach(async () => {
  await restore(saved);
});

test.describe("Review carry-over", () => {
  test.use({ user: "admin" });

  test("carries reviews of unchanged sections to a new version and flags changed ones", async ({ page }) => {
    test.setTimeout(E2E.demo ? 300_000 : 90_000);
    videoName("review-carryover-walkthrough");
    await beforeVersionTwo();

    await page.goto(demoPaths.pull(PR));
    const banner = page.getByRole("region", { name: "New since your last visit" });
    await expect(banner).toContainText("Version 2 was published since your last visit 2 days ago.");
    await expect(banner).toContainText("Compared to version 1: 2 changed sections, 4 new comments.");
    await caption(page, "Maya reviewed version 1 two days ago. Since then, new commits produced version 2.", "New since your last visit");
    await pause(page, 2500);

    // Opening the new version carried her marks on sections whose code did not change.
    expect([...(await marks("admin", 2))]).toEqual([
      { title: "Promo codes table", carried_from_version: 1 },
      { title: "Discounts in cart totals", carried_from_version: 1 },
    ]);
    const progress = page.getByRole("group", { name: "Your review progress" });
    await expect(progress).toContainText("0 reviewed");
    await expect(progress).toContainText("2 carried over");
    await expect(progress).toContainText("1 to re-review");
    await expect(progress).toContainText("3 not reviewed");
    const steps = page.getByRole("navigation", { name: "Guide sections" });
    await expect(steps.getByRole("button", { name: /Promo codes table/ })).toContainText("01 · carried");
    await expect(steps.getByRole("button", { name: /Validating a code/ })).toContainText("02 · re-review");
    await expect(steps.getByRole("button", { name: /Discounts in cart totals/ })).toContainText("03 · carried");
    await expect(steps.getByRole("button", { name: /Checkout endpoint/ })).toContainText("04 · changed");
    await expect(steps.getByRole("button", { name: /Promo code field/ })).toContainText("05");
    await expect(steps.getByRole("button", { name: /Promo code field/ })).not.toContainText("·");
    await caption(page, "Her marks carried over where the code is unchanged; one section she reviewed changed", "Progress");
    await shot(page, "01-overview-banner-and-progress");
    await pause(page, 2500);

    // A carried section says where the mark came from.
    await steps.getByRole("button", { name: /Promo codes table/ }).click();
    await expect(page.getByText("Reviewed in v1, unchanged.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reviewed", exact: true })).toBeVisible();
    await expect(page.getByTitle(`${DEMO_USERS.member.name} (reviewed in v1, unchanged)`)).toBeVisible();
    await expect(page.locator('.diff-file[data-path="db/migrations/0018_promo_codes.sql"]')).toContainText('CREATE TABLE "promo_codes"');
    await caption(page, "Reviewed in v1, unchanged: the section covers the same changed lines", "Carried over");
    await shot(page, "02-carried-section");
    await pause(page, 2000);

    // The section that changed shows an interdiff against the version she reviewed.
    await steps.getByRole("button", { name: /Validating a code/ }).click();
    const notice = page.getByRole("note", { name: "Changed since you reviewed" });
    await expect(notice).toContainText("Changed since you reviewed v1");
    await expect(notice).toContainText("3 lines new or changed and 2 removed in src/lib/promo.ts; 6 lines new or changed in tests/promo.test.ts");
    const changes = page.getByRole("region", { name: "What changed" });
    await expect(changes).toContainText("Changed since you reviewed v1");
    const promo = changes.locator('[data-interdiff-path="src/lib/promo.ts"]');
    await expect(promo.locator("tr[data-op=removed]").filter({ hasText: "promo.redemptions > promo.maxRedemptions" })).toContainText("v1");
    await expect(promo.locator("tr[data-op=added]").filter({ hasText: "promo.redemptions >= promo.maxRedemptions" })).toContainText("v2");
    await expect(changes.locator('[data-interdiff-path="tests/promo.test.ts"]')).toContainText("rejects a code that reached its redemption limit");
    // The same lines are marked in the section's diff.
    const diff = page.locator('.diff-file[data-path="src/lib/promo.ts"]');
    await expect(diff.locator("tr.row-since").filter({ hasText: "promo.redemptions >= promo.maxRedemptions" })).toHaveCount(1);
    await expect(diff.locator("tr.row-since")).toHaveCount(3);
    await caption(page, "Changed since she reviewed it: an interdiff shows the new and removed lines", "Re-review");
    await shot(page, "03-rereview-interdiff");
    await pause(page, 3000);

    await notice.getByRole("button", { name: "Show what changed" }).click();
    await page.getByRole("button", { name: "Mark reviewed and continue" }).click();
    await expect(page.getByText("Section 03 / 06")).toBeVisible();
    await expect(steps.getByRole("button", { name: /Validating a code/ })).toContainText("02 · done");
    await expect.poll(async () => [...(await marks("admin", 2))].map((m) => `${m.title}:${m.carried_from_version ?? "here"}`)).toEqual([
      "Promo codes table:1",
      "Validating a code:here",
      "Discounts in cart totals:1",
    ]);
    await caption(page, "After re-reviewing, the mark belongs to version 2", "Re-review");
    await pause(page, 1500);

    // Comments posted by others since the last visit are marked.
    const thread = page.locator("div").filter({ hasText: "already caps the discount" }).filter({ has: page.getByRole("button", { name: "Reply…" }) }).last();
    await expect(thread.getByText("New", { exact: true })).toBeVisible();
    await thread.scrollIntoViewIfNeeded();
    await caption(page, "Comments posted since her last visit are marked New", "Comments");
    await shot(page, "04-new-comment-since-last-visit");
    await pause(page, 2000);

    // A section she didn't review, changed since her last visit.
    await steps.getByRole("button", { name: /Checkout endpoint/ }).click();
    await expect(page.getByRole("note", { name: "New since your last visit" })).toContainText("Changed since your last visit");
    await expect(page.getByRole("region", { name: "What changed" })).toContainText("Changed since your last visit · v1");
    await expect(page.getByRole("region", { name: "What changed" })).toContainText('return "used_up" as const;');
    await caption(page, "Sections she hadn't reviewed show what changed since her last visit", "Since your last visit");
    await shot(page, "05-changed-since-last-visit");
    await pause(page, 2500);

    await steps.getByRole("button", { name: /Finish review/ }).click();
    await expect(page.getByText("You reviewed 3 of 6 sections. 2 of them carried over from an earlier version.")).toBeVisible();
    await expect(page.getByText("Reviewed in v1, unchanged").first()).toBeVisible();
    await caption(page, "The summary separates marks made here from marks carried over", "Finish review");
    await shot(page, "06-finish-review");
    await pause(page, 2500);

    // The banner stays for the rest of the visit.
    await page.reload();
    await expect(page.getByRole("region", { name: "New since your last visit" })).toContainText("Version 2 was published since your last visit 2 days ago.");
    await caption(page);
  });

  test("does not carry a mark again after the member removes it", async ({ page }) => {
    await page.goto(demoPaths.pull(PR, { section: 1 }));
    await expect(page.getByText("Reviewed in v1, unchanged.")).toBeVisible();
    await page.getByRole("button", { name: "Reviewed", exact: true }).click();
    await expect(page.getByRole("button", { name: "Mark reviewed and continue" })).toBeVisible();
    await expect.poll(async () => [...(await marks("admin", 2))].map((m) => m.title)).toEqual(["Discounts in cart totals"]);

    await page.reload();
    await expect(page.getByRole("button", { name: "Mark reviewed and continue" })).toBeVisible();
    await expect(page.getByText("Reviewed in v1, unchanged.")).toHaveCount(0);
    expect([...(await marks("admin", 2))].map((m) => m.title)).toEqual(["Discounts in cart totals"]);
  });

  test("shows the banner and a re-review flag on a phone", async ({ page }) => {
    await beforeVersionTwo();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(demoPaths.pull(PR, { section: 2 }));
    await expect(page.getByRole("region", { name: "New since your last visit" })).toContainText("4 new comments");
    const notice = page.getByRole("note", { name: "Changed since you reviewed" });
    await notice.scrollIntoViewIfNeeded();
    await expect(notice).toBeInViewport();
    await expect(page.getByRole("region", { name: "What changed" })).toContainText("src/lib/promo.ts");
    await shot(page, "07-mobile-rereview");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

test.describe("Publishing a new version", () => {
  test("carries every member's marks on unchanged sections", async ({ request }) => {
    test.skip(E2E.github !== "mock", "needs E2E_GITHUB=mock");
    // The REST API route compiles on its first request in `next dev`.
    test.setTimeout(150_000);
    const token = `omk_e2e_${randomBytes(16).toString("hex")}`;
    const [ws] = await sql()`select id from workspaces where slug = 'demo'`;
    await sql()`
      insert into api_tokens (id, user_id, workspace_id, name, kind, token_hash, token_prefix)
      values (${`tok_${randomBytes(6).toString("hex")}`}, ${await userId("owner")}, ${ws.id}, 'e2e carry-over', 'personal', ${createHash("sha256").update(token).digest("hex")}, ${token.slice(0, 12)})`;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const pr = `${DEMO_REPO.fullName}#${PR}`;
      const current = await request.get(`/api/v1/guides?pr=${encodeURIComponent(pr)}`, { headers, timeout: 120_000 });
      expect(current.status()).toBe(200);
      const v2 = (await current.json()) as { sections: { title: string; body: string; refs: unknown[]; automatic: boolean }[] };
      // The same guide again, with the "Validating a code" section narrowed to one file: its code changes.
      const sections = v2.sections
        .filter((s) => !s.automatic)
        .map((s) => (s.title === "Validating a code" ? { ...s, refs: ["tests/promo.test.ts"] } : s));
      const created = await request.post("/api/v1/guides", { headers, data: { pr, sections }, timeout: 120_000 });
      expect(created.status()).toBe(201);
      const { version, id } = (await created.json()) as { version: number; id: string };
      expect(version).toBe(3);

      // Marks carried twice still name the version that was reviewed.
      expect([...(await marks("admin", 3))]).toEqual([
        { title: "Promo codes table", carried_from_version: 1 },
        { title: "Discounts in cart totals", carried_from_version: 1 },
      ]);
      expect([...(await marks("member", 3))]).toEqual([{ title: "Promo codes table", carried_from_version: 1 }]);
      const [guide] = await sql()`select events from guides where id = ${id}`;
      expect((guide.events as { message: string }[]).map((e) => e.message)).toContain("Carried 3 review marks over from earlier versions");
    } finally {
      await sql()`delete from api_tokens where name = 'e2e carry-over'`;
    }
  });
});
