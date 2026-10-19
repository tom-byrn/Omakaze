/**
 * Import `test` and `expect` from here instead of @playwright/test.
 *
 *   import { test, expect, demoPaths, DEMO_PRS } from "./fixtures";
 *
 *   test.use({ user: "admin" });            // sign in as owner (default), admin, member, or null
 *   test("…", async ({ page, loginAs }) => {
 *     await page.goto(demoPaths.pull(DEMO_PRS.main));
 *     await loginAs("member");              // switch the signed-in user of this context
 *   });
 *
 * Every test starts signed in through a saved session (no sign-in form), so specs stay fast and
 * don't hit the sign-in rate limit. With MEDIA_DIR set, the test's video is saved there.
 */
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { DEMO_PASSWORD, DEMO_USERS, type DemoUserKey } from "../scripts/demo-data";
import { E2E } from "./config";
import { DEMO_OVERLAY } from "./demo-overlay";
import { saveVideo, testVideoName } from "./media";
import { readStorageState, storageStatePath } from "./setup";

export { expect };
export {
  DEMO_COMMENTS,
  DEMO_CONNECTION,
  DEMO_PASSWORD,
  DEMO_PRS,
  DEMO_REPO,
  DEMO_SHAS,
  DEMO_USERS,
  DEMO_WORKSPACE,
  demoPaths,
  type DemoUserKey,
} from "../scripts/demo-data";
export { mockGitHub } from "./mock-github";
export { E2E } from "./config";

type Options = {
  /** Demo user the test starts signed in as; null starts signed out. */
  user: DemoUserKey | null;
};

type Fixtures = {
  /** Sign a browser context (default: the test's) in as another demo user. */
  loginAs: (user: DemoUserKey, context?: BrowserContext) => Promise<void>;
};

export const test = base.extend<Options & Fixtures>({
  user: ["owner", { option: true }],
  storageState: async ({ user }, use) => {
    await use(user ? storageStatePath(user) : { cookies: [], origins: [] });
  },
  page: async ({ page }, use, testInfo) => {
    if (E2E.demo) await page.addInitScript(DEMO_OVERLAY);
    await use(page);
    if (E2E.mediaDir) await saveVideo(page, testVideoName(testInfo));
  },
  loginAs: async ({ context }, use) => {
    await use(async (user, ctx = context) => {
      await ctx.clearCookies();
      await ctx.addCookies(readStorageState(user).cookies);
    });
  },
});

/** Sign in through the form, as a person would (used by the sign-in spec). */
export async function signIn(page: Page, user: DemoUserKey, password = DEMO_PASSWORD): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_USERS[user].email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
