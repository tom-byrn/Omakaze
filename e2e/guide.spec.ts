import { DEMO_PRS, demoPaths, expect, test } from "./fixtures";
import { caption, pause, shot } from "./media";

test.describe("Guide viewer", () => {
  test("opens the guide and moves between sections", async ({ page }) => {
    await page.goto(demoPaths.dashboard);
    await page.getByRole("listitem").filter({ hasText: `#${DEMO_PRS.main}` }).getByRole("link", { name: "Open guide" }).click();
    await expect(page).toHaveURL(demoPaths.pull(DEMO_PRS.main));

    // Overview: summary, section list and coverage.
    await expect(page.getByText("Guided PR · v2")).toBeVisible();
    await expect(page.getByText("Covered by sections")).toBeVisible();
    await expect(page.getByText("100%")).toBeVisible();
    await caption(page, "The overview: summary, sections and coverage", "Guide");
    await shot(page, "guide-overview");
    await pause(page, 1200);

    const steps = page.getByRole("navigation", { name: "Guide sections" });
    await steps.getByRole("button", { name: /Promo codes table/ }).click();
    await expect(page.getByText("Section 01 / 06")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Promo codes table" })).toBeVisible();
    const migration = page.locator('.diff-file[data-path="db/migrations/0018_promo_codes.sql"]');
    await expect(migration).toContainText('CREATE TABLE "promo_codes"');
    await caption(page, "Each section explains part of the change next to its code", "Section 01");
    await shot(page, "guide-section");
    await pause(page);

    // Keyboard: → and ] go forward, ← and [ go back.
    await caption(page, "Arrow keys move between sections", "Keyboard");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("Section 02 / 06")).toBeVisible();
    await expect(page.locator("figure.md-mermaid svg")).toBeVisible();
    await expect(page).toHaveURL(/section=2/);
    await shot(page, "guide-section-mermaid");
    await pause(page);
    await page.keyboard.press("]");
    await expect(page.getByText("Section 03 / 06")).toBeVisible();
    await expect(page.getByRole("button", { name: /Moved from/ }).first()).toBeVisible();
    await pause(page);
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByText("Section 02 / 06")).toBeVisible();
    await caption(page);
  });

  test("diff links highlight the referenced lines", async ({ page }) => {
    await page.goto(demoPaths.pull(DEMO_PRS.main, { section: 2 }));
    await page.getByRole("link", { name: "checkPromo", exact: true }).click();
    await expect(page.locator('.diff-file[data-path="src/lib/promo.ts"]')).toContainText("export function checkPromo");
    await pause(page);
  });

  test("shows every changed file", async ({ page }) => {
    await page.goto(demoPaths.pull(DEMO_PRS.main));
    await page.getByRole("button", { name: "All files" }).click();
    await expect(page.getByRole("heading", { name: "Every change in the pull request." })).toBeVisible();
    await expect(page).toHaveURL(/section=files/);
    await shot(page, "guide-all-files");
    // Files further down load as they scroll into view.
    await page.locator('[data-path="src/components/checkout/OrderSummary.tsx"]').scrollIntoViewIfNeeded();
    await expect(page.locator('.diff-file[data-path="src/components/checkout/OrderSummary.tsx"]')).toContainText("src/components/cart/Summary.tsx →");
  });
});
