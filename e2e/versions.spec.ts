import { DEMO_PRS, DEMO_SHAS, DEMO_USERS, demoPaths, expect, test } from "./fixtures";
import { pause, shot } from "./media";

test.describe("Guide versions", () => {
  test("switches to an older version and shows the outdated notice", async ({ page }) => {
    await page.goto(demoPaths.pull(DEMO_PRS.main));
    await expect(page.getByText("Guided PR · v2")).toBeVisible();
    await expect(page.getByText(/This guide covers/)).toHaveCount(0);

    await page.getByLabel("Guide version").selectOption("1");
    await expect(page).toHaveURL(/v=1/);
    await expect(page.getByText("Guided PR · v1")).toBeVisible();
    await expect(
      page.getByText(`This guide covers ${DEMO_SHAS.pr128v1.slice(0, 7)}. The pull request now points to ${DEMO_SHAS.pr128v2.slice(0, 7)}.`),
    ).toBeVisible();
    await expect(page.getByText("Version 2 is available by Claude Code.")).toBeVisible();
    await shot(page, "guide-outdated-version");
    await pause(page);

    // Other members reviewed sections of version 1.
    await page.getByRole("navigation", { name: "Guide sections" }).getByRole("button", { name: /Promo codes table/ }).click();
    await expect(page.getByText("Reviewed by")).toBeVisible();
    await expect(page.getByTitle(DEMO_USERS.admin.name)).toBeVisible();
    await shot(page, "guide-reviewed-by");
    await pause(page);

    await page.getByRole("link", { name: "View version 2" }).click();
    await expect(page.getByText("Guided PR · v2")).toBeVisible();
  });

  test("marks an outdated guide on the dashboard", async ({ page }) => {
    await page.goto(demoPaths.pull(DEMO_PRS.outdated));
    await expect(page.getByText(/This guide covers .+\. The pull request now points to/)).toBeVisible();
  });
});
