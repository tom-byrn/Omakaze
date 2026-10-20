import { defineConfig } from "@playwright/test";
import { appEnv, E2E } from "./e2e/config";

// One time anchor for the whole run, so the seed and the mock GitHub API agree on timestamps.
process.env.DEMO_NOW ??= String(Date.now());

const server =
  E2E.server === "start" ? `pnpm exec next start --port ${E2E.port}` : `pnpm exec next dev --port ${E2E.port}`;

/** End-to-end tests. See docs/development.md#demo-data-and-end-to-end-tests. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  outputDir: E2E.outputDir,
  timeout: E2E.demo ? 180_000 : 60_000,
  // `next dev` compiles a route on its first request, which can take longer than 10 seconds.
  expect: { timeout: E2E.server === "dev" ? 15_000 : 10_000 },
  // The specs share one database; run them one at a time unless E2E_WORKERS says otherwise.
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS || 1),
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"], ["html", { open: "never", outputFolder: E2E.reportDir }], ...(process.env.CI ? [["github"] as ["github"]] : [])],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    browserName: "chromium",
    baseURL: E2E.appUrl,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: E2E.scale,
    video: { mode: process.env.CI ? "retain-on-failure" : "on", size: { width: 1440, height: 900 } },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
    launchOptions: {
      slowMo: E2E.slowMo,
      // Escape hatch for machines where the pinned Playwright version can't find its Chromium.
      executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
    },
  },
  webServer: {
    command: `pnpm exec tsx e2e/prepare-db.ts && ${server}`,
    url: `${E2E.appUrl}/api/health`,
    env: appEnv(),
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: process.env.E2E_SERVER_LOG ? "pipe" : "ignore",
    stderr: "pipe",
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
