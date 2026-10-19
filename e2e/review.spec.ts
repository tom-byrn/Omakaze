import { clearReviewMarks } from "./db";
import { DEMO_PRS, demoPaths, expect, test } from "./fixtures";
import { pause, shot } from "./media";

test.describe("Review progress", () => {
  test.beforeEach(() => clearReviewMarks("owner", DEMO_PRS.main, 2));
  test.afterEach(() => clearReviewMarks("owner", DEMO_PRS.main, 2));

  test("marks sections as reviewed", async ({ page }) => {
    await page.goto(demoPaths.pull(DEMO_PRS.main, { section: 1 }));
    await expect(page.getByText("0/6 reviewed")).toBeVisible();

    await page.getByRole("button", { name: "Mark reviewed and continue" }).click();
    await expect(page.getByText("Section 02 / 06")).toBeVisible();
    await expect(page.getByText("1/6 reviewed")).toBeVisible();
    await pause(page);

    // R marks the current section.
    await page.keyboard.press("r");
    await expect(page.getByText("2/6 reviewed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reviewed", exact: true })).toBeVisible();
    await shot(page, "review-progress");
    await pause(page);

    // Progress is saved.
    await page.reload();
    await expect(page.getByText("2/6 reviewed")).toBeVisible();

    await page.getByRole("navigation", { name: "Guide sections" }).getByRole("button", { name: /Finish review/ }).click();
    await expect(page.getByText("You reviewed 2 of 6 sections.")).toBeVisible();
    await shot(page, "review-finish");
  });
});
