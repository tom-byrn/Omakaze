import { E2E } from "./config";
import { prepareRun } from "./setup";

/**
 * Runs after the web server is up (Playwright starts webServer first): seeds the database, starts
 * the mock GitHub API, signs the demo users in and warms up `next dev`. The returned function is
 * the global teardown.
 */
export default async function globalSetup() {
  return prepareRun({ warmUp: E2E.server === "dev" && process.env.E2E_WARMUP !== "0" });
}
