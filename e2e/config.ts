/**
 * Settings for the end-to-end harness, read from the environment. Used by playwright.config.ts,
 * the global setup, the fixtures and `pnpm e2e:serve`.
 *
 * Setting E2E_PORT alone gives an isolated copy: the database name and the mock GitHub port are
 * derived from it unless E2E_DATABASE_URL or E2E_GITHUB_PORT are set.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const truthy = (v: string | undefined) => ["1", "true", "yes", "on"].includes((v ?? "").toLowerCase());

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const port = Number(process.env.E2E_PORT || 3100);
const defaultPort = port === 3100;
const mediaDir = process.env.MEDIA_DIR ? path.resolve(process.env.MEDIA_DIR) : null;
const demo = truthy(process.env.E2E_DEMO);

export const E2E = {
  /** Port of the app under test. */
  port,
  appUrl: `http://localhost:${port}`,
  /** Port of the mock GitHub API (default: E2E_PORT + 99, so 3199). */
  githubPort: Number(process.env.E2E_GITHUB_PORT || port + 99),
  /** Database used by the app under test. Created, migrated and seeded by the global setup. */
  databaseUrl:
    process.env.E2E_DATABASE_URL ||
    `postgres://omakaze:omakaze@localhost:5432/${defaultPort ? "omakaze_e2e" : `omakaze_e2e_${port}`}`,
  /** "mock" (default): the repository has a token connection served by the mock GitHub API. "none": no connection. */
  github: (process.env.E2E_GITHUB || "mock") as "mock" | "none",
  /** Fake SMTP server that keeps notification email (default: E2E_PORT + 400). See e2e/mock-notify.ts. */
  smtpPort: Number(process.env.E2E_SMTP_PORT || port + 400),
  /** Receiver of Slack and JSON webhooks, and the HTTP API of the fake SMTP server (default: E2E_PORT + 300). */
  notifyPort: Number(process.env.E2E_NOTIFY_PORT || port + 300),
  /** "sink" (default): the app sends email to the fake SMTP server. "none": no SMTP, so email notifications are off. */
  smtp: (process.env.E2E_SMTP || "sink") as "sink" | "none",
  /** "dev" (default) runs `next dev`; "start" runs `next start` and needs `pnpm build` first. */
  server: (process.env.E2E_SERVER || "dev") as "dev" | "start",
  /** Slower, watchable runs for recordings: slowMo, pauses, a visible cursor and captions. */
  demo,
  slowMo: Number(process.env.E2E_SLOWMO || (demo ? 250 : 0)),
  /** Where shot() and the video fixture write files. Unset: no media is saved. */
  mediaDir,
  /** Device scale factor of the browser (default 2 when MEDIA_DIR is set, for sharp screenshots). */
  scale: Number(process.env.E2E_SCALE || (mediaDir ? 2 : 1)),
  secret: process.env.E2E_APP_SECRET || "e2e-secret-0123456789abcdef0123456789abcdef",
  /** Per-port, so isolated copies in one checkout don't overwrite each other. */
  outputDir: path.join(ROOT, defaultPort ? "test-results" : `test-results-${port}`),
  reportDir: path.join(ROOT, defaultPort ? "playwright-report" : `playwright-report-${port}`),
  authDir: path.join(ROOT, "e2e", ".auth", String(port)),
  /** Skip re-seeding in the global setup (keeps data from an earlier run). */
  seed: process.env.E2E_SEED !== "0",
};

export const githubApiUrl = `http://127.0.0.1:${E2E.githubPort}`;

/**
 * Environment of the app under test. Variables a developer's .env might set and that would change
 * the app's behavior are pinned, since Next.js only fills in variables that are not set already.
 */
export function appEnv(): Record<string, string> {
  return {
    NODE_ENV: E2E.server === "dev" ? "development" : "production",
    DATABASE_URL: E2E.databaseUrl,
    APP_URL: E2E.appUrl,
    APP_SECRET: E2E.secret,
    GITHUB_API_URL: githubApiUrl,
    GITHUB_URL: "https://github.com",
    GITHUB_APP_ID: "",
    GITHUB_APP_SLUG: "",
    GITHUB_APP_PRIVATE_KEY: "",
    GITHUB_APP_WEBHOOK_SECRET: "",
    GITHUB_CLIENT_ID: "",
    GITHUB_CLIENT_SECRET: "",
    AUTH_EMAIL_ENABLED: "true",
    AUTH_SIGNUP_ENABLED: "true",
    AUTH_GITHUB_TOKEN_ENABLED: "false",
    AUTH_ALLOWED_EMAIL_DOMAINS: "",
    SMTP_URL: E2E.smtp === "sink" ? `smtp://127.0.0.1:${E2E.smtpPort}` : "",
    SMTP_FROM: "Omakaze <notifications@omakaze.dev>",
    NOTIFICATIONS_ENABLED: "true",
    // Long enough for a burst in one test to share an email; specs send it right away with flushEmail().
    NOTIFICATIONS_GROUP_SECONDS: "30",
    // The fake Slack webhook listens on 127.0.0.1.
    WEBHOOKS_ALLOW_PRIVATE_NETWORK: "true",
    STORAGE_DRIVER: "database",
    LANDING_ONLY: "false",
    RUN_MIGRATIONS_ON_START: "true",
    WORKER_ENABLED: "true",
    POLL_INTERVAL_SECONDS: "0",
    NEXT_TELEMETRY_DISABLED: "1",
    DEMO_NOW: process.env.DEMO_NOW ?? String(Date.now()),
  };
}
