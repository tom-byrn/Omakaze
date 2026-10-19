import { DEMO_USERS, demoPaths, expect, signIn, test } from "./fixtures";
import { pause, shot } from "./media";

test.describe("Sign in", () => {
  test.use({ user: null });

  test("signs in with email and password", async ({ page }) => {
    await page.goto(demoPaths.login);
    await expect(page.getByRole("heading", { name: "Sign in to Omakaze." })).toBeVisible();
    await shot(page, "sign-in");
    await signIn(page, "owner");
    await expect(page).toHaveURL(demoPaths.dashboard);
    await expect(page.getByRole("heading", { name: "Pull requests." })).toBeVisible();
    await page.getByLabel("Account menu").click();
    await expect(page.getByText(DEMO_USERS.owner.email)).toBeVisible();
    await pause(page);
  });

  test("shows an error for a wrong password", async ({ page }) => {
    // An address without an account, so this doesn't count against a demo user's sign-in limit.
    await page.goto(demoPaths.login);
    await page.getByLabel("Email").fill("nobody@omakaze.dev");
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  });

  test("sends signed-out visitors to the sign-in page", async ({ page }) => {
    await page.goto(demoPaths.pull());
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});
