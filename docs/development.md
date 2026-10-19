# Development

## Prerequisites

- Node.js 22 (CI and the Docker image use 22; `package.json` requires 20.9 or later)
- pnpm 10, through Corepack (`package.json` pins `pnpm@10.28.0`)
- PostgreSQL 16, for example in Docker
- Optional: a GitHub account or a GitHub App for testing against real repositories

## Setup

Start a local PostgreSQL that matches the default `DATABASE_URL` in `.env.example`. The `db` service in `docker-compose.yml` does not publish its port, so run a separate container:

```sh
docker run -d --name omakaze-db -p 5432:5432 \
  -e POSTGRES_USER=omakaze -e POSTGRES_PASSWORD=omakaze -e POSTGRES_DB=omakaze \
  postgres:16-alpine
```

Install dependencies and create `.env`:

```sh
corepack enable
pnpm install
cp .env.example .env
```

Set `APP_SECRET` in `.env` to the output of `openssl rand -hex 32`. Then start the development server:

```sh
pnpm dev
```

The app runs at http://localhost:3000. Migrations are applied on start and the background worker runs in the same process. The first account you create becomes the instance admin.

To work with GitHub locally, the simplest option is a personal access token connection in **Settings → GitHub**; set `AUTH_GITHUB_TOKEN_ENABLED=true` if you also want to sign in with a token. A GitHub App created from `/admin` takes its URLs from `APP_URL`. GitHub cannot deliver webhooks to `localhost`; use **Sync** on the pull request list instead. For built-in generation, configure an AI provider in **Settings → AI provider**; a local OpenAI-compatible server such as Ollama works without an API key.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js development server |
| `pnpm build` | Production build. With `NEXT_OUTPUT=standalone` (set in the Dockerfile) it also writes the standalone server to `.next/standalone`. |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint (`eslint-config-next` with the TypeScript rules) |
| `pnpm typecheck` | `next typegen` to generate route types, then `tsc --noEmit` |
| `pnpm test` | Vitest, once |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:e2e` | Playwright end-to-end tests against a seeded database (see [Demo data and end-to-end tests](#demo-data-and-end-to-end-tests)) |
| `pnpm e2e:serve` | The app as the end-to-end tests run it: seeded e2e database, mock GitHub API and `next dev` on `E2E_PORT` |
| `pnpm e2e:mock-github` | The mock GitHub API on its own |
| `pnpm db:generate` | Generate a SQL migration from changes to `src/db/schema.ts` (drizzle-kit) |
| `pnpm db:migrate` | Apply pending migrations to `DATABASE_URL` (loads `.env` if present) |
| `pnpm db:seed` | Apply migrations and replace the demo workspace in `DATABASE_URL` (loads `.env` if present) |
| `pnpm db:studio` | Drizzle Studio, a browser UI for the database |

CI (`.github/workflows/ci.yml`) runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm db:migrate` against PostgreSQL 16 and `pnpm build` on Node.js 22, and then builds the Docker image. A separate job builds the app and runs `pnpm test:e2e` against `next start`; when it fails, the Playwright report and the test results are uploaded as the `playwright-report` artifact. Pushes to `main` and `v*` tags also run `.github/workflows/release.yml`, which publishes the image to GitHub Container Registry (see [self-hosting.md](self-hosting.md#published-image)).

## Project structure

```text
src/
  app/                    Next.js App Router
    (auth)/               sign-in and sign-up pages and actions
    .well-known/          OAuth discovery documents
    account/              account page
    admin/                instance settings (/admin)
    api/                  route handlers: mcp, oauth, v1, auth, github, guides, assets, health, w
    invite/               invite links and email address confirmation
    new/                  create a workspace
    oauth/authorize/      OAuth consent screen
    settings/             redirects /settings/... to the current workspace
    w/[slug]/             workspace: pull requests, guide viewer and editor, repositories, activity, settings
  components/             React components (guide viewer and editor, markdown, settings, landing page)
  db/                     Drizzle schema, client and migration runner
  lib/
    ai/                   AI providers and the generation pipeline
    auth/                 sessions, users, sign-in methods
    diff/                 patch parsing, text rendering for models, file views, highlighting
    github/               API client, GitHub App, connections, pull requests, reviews, webhooks, summary comments
    guides/               guide service, refs and coverage, authoring guidelines, access checks
    jobs/                 job queue, worker and handlers
    mcp/                  MCP server: tools, prompt and instructions
    oauth/                OAuth 2.1 authorization server
    storage/              uploads and downloads from public URLs
    env.ts                environment variable schema
    *.ts                  shared helpers: crypto, http, workspaces, invites, mail, automation, activity
  instrumentation.ts      runs migrations and starts the worker
drizzle/                  SQL migrations and drizzle-kit metadata
scripts/
  migrate.ts              migration command used by pnpm db:migrate
  seed-demo.ts            demo seed used by pnpm db:seed
  demo-data/              demo users, pull requests and guides; repo/ holds the files the demo pull requests change
  subset-landing-font.mjs rebuilds the landing page's Japanese font subset in src/app/fonts
  demo/                   recording script for the demo video
tests/                    Vitest tests
e2e/                      Playwright end-to-end tests, fixtures and the mock GitHub API
playwright.config.ts      Playwright configuration
public/                   static files
```

[architecture.md](architecture.md) describes how the parts work together.

## Tests

Tests live in `tests/*.test.ts` and run with Vitest in a Node environment. `vitest.config.ts` sets the `@/` path alias and test values for `APP_SECRET` and `DATABASE_URL`; the tests do not connect to a database or to GitHub. They cover:

- unified diff parsing (`src/lib/diff/parse.ts`);
- ref parsing, serialization, validation and coverage (`src/lib/guides/refs.ts`);
- section matching, the unchanged test, interdiffs and visits across guide versions (`src/lib/guides/carryover.ts`);
- the viewer's row model: context rows, line selection and enclosing-block expansion (`src/components/guide/diff-model.ts`);
- encryption, signed payloads, password hashing, webhook signatures, pull request URL parsing, editor ref lines, redirects, slugs and the agent prompt;
- detection of abandoned guides, interval formatting, the public address check for downloads, client address selection from `X-Forwarded-For`, and the cleanup of summary comments.

Add tests for logic in `src/lib` and other code that can run without a database. Flows through the browser are covered by the end-to-end tests below; Vitest only picks up `tests/`.

## Demo data and end-to-end tests

### Demo data

`pnpm db:seed` fills the database in `DATABASE_URL` with a demo workspace. It applies pending migrations first, and it is idempotent: it deletes the demo workspace and the demo users, then creates them again. Other data in the database is left alone.

```sh
pnpm db:seed                 # the database from .env
pnpm db:seed --github=mock   # with a GitHub connection for the mock GitHub API (see below)
```

| User | Email | Role |
| --- | --- | --- |
| Alex Morgan | `demo@omakaze.dev` | owner, instance admin |
| Maya Chen | `maya@omakaze.dev` | admin |
| Sam Okafor | `sam@omakaze.dev` | member |

The password of every demo user is `omakaze-demo`.

The workspace `Acme` (`/w/demo`) follows the repository `acme/storefront`, a fictional store. Its pull requests are cached as if they had been synced from GitHub:

| Pull request | State | Guide |
| --- | --- | --- |
| #128 Apply promo codes at checkout | open | Two versions. Version 1 was written for an older head commit and is outdated; version 2 matches the current head. Five sections and an automatic "Other changes" section, with refs to whole files, hunks and line ranges, Mermaid diagrams, `diff:` links and a block moved between files. Maya and Sam reviewed sections of version 1; their marks on sections whose code did not change carried over to version 2, and Maya's "Validating a code" section is flagged for re-review. |
| #129 Round sales tax per line item | open | One version, written for an older head commit (outdated). |
| #127 Send order confirmation emails | merged | One version. |
| #131 Serve product images through the CDN resizer | open | None. |
| #130 Share wishlists by link | draft | None. |
| #124 Experiment: one-page checkout | closed | None. |

The seed also adds the comments and the review that members posted on #128 through Omakaze (`comments` rows) and an activity log. Key pages: `/w/demo` (dashboard), `/w/demo/acme/storefront` (repository), `/w/demo/acme/storefront/pull/128` (guide), `?v=1` for the older version, `/w/demo/acme/storefront/pull/128/edit` (editor) and `/w/demo/settings`.

The data lives in `scripts/demo-data/`: `index.ts` defines users, pull requests, guides, review marks and comments and exports the constants the tests use; `repo/` holds the base and head versions of the files the pull requests change, and the seed computes the diffs from them with `git diff --no-index`; `guides/` holds the guide texts, where `{{diff:name}}` placeholders become `diff:` links to line ranges found in the files. The seed checks every ref against the diff and fails on invalid ones. `review-carryover.ts` carries review marks to later versions after the seed's transaction, as publishing them in the app does.

Without `--github=mock` the repository has no GitHub connection, so the app never calls GitHub: the guides render from the stored diffs, without expandable context, and review comments are not shown. The repository's last sync time is set far in the future so the dashboard does not try to sync it.

### Running the end-to-end tests

The tests use Chromium. Install it once with `pnpm exec playwright install chromium` (`--with-deps` on a fresh Linux machine).

```sh
pnpm test:e2e                          # all specs
pnpm test:e2e e2e/guide.spec.ts        # one file
pnpm test:e2e --headed --debug         # step through in a visible browser
pnpm exec playwright show-report       # the HTML report of the last run
```

A run:

1. starts the app with `next dev` on `E2E_PORT` (default 3100) against `E2E_DATABASE_URL` (default `postgres://omakaze:omakaze@localhost:5432/omakaze_e2e`), creating the database if it does not exist. A server already listening on the port is reused, except in CI;
2. migrates and seeds the database (`scripts/seed-demo.ts --github=mock`), starts the mock GitHub API, creates a session for each demo user and requests the main pages once so `next dev` compiles them;
3. runs the specs in `e2e/*.spec.ts` one at a time (they share the database) at a 1440×900 viewport, with a video of every test and a trace and screenshot of every failure in `test-results/`.

For repeated runs, keep the app running in another terminal; `pnpm test:e2e` then reuses it and starts in seconds:

```sh
pnpm e2e:serve      # prints the URLs and credentials; Ctrl-C stops it
```

`pnpm e2e:serve` is also the way to browse the demo by hand with a working GitHub mock. Every run re-seeds the database, so sign in again afterwards; `E2E_SEED=0` keeps the data.

### Writing a spec

Import `test` and `expect` from `e2e/fixtures.ts`. Each test starts signed in as the owner; `test.use({ user: "admin" })` (or `"member"`, or `null` for signed out) changes that, and the `loginAs` fixture switches users in the middle of a test. The demo constants come from the same module.

```ts
import { DEMO_PRS, demoPaths, expect, mockGitHub, test } from "./fixtures";
import { pause, shot } from "./media";

test.use({ user: "member" });

test("posts a line comment", async ({ page }) => {
  await mockGitHub.clear();
  await page.goto(demoPaths.pull(DEMO_PRS.main, { section: 2 }));
  const row = page.locator('.diff-file[data-path="src/lib/promo.ts"] tr.diff-row').filter({ hasText: "export function checkPromo" });
  await row.hover();
  await row.getByRole("button", { name: "Comment on this line" }).click();
  await page.getByPlaceholder("Leave a comment").fill("Could `now` default to the request time?");
  await shot(page, "line-comment");
  await page.getByRole("button", { name: "Comment on GitHub" }).click();
  await expect(page.getByRole("status")).toContainText("Comment posted to GitHub");
  const [post] = await mockGitHub.requests({ method: "POST", path: "/repos/acme/storefront/pulls/128/comments" });
  expect(post.body).toMatchObject({ path: "src/lib/promo.ts", side: "RIGHT" });
  expect(post.user).toBe("samokafor");
  await pause(page);
});
```

`e2e/db.ts` gives direct database access for preparing or checking rows (`sql()`, `guideId(pr, version)`, `clearReviewMarks(user, pr, version)`). Leave the seeded data as you found it (reset what a test changes in `afterEach`, as `e2e/github-mock.spec.ts` does), since the specs share one database. `mockGitHub.reset()` restores the mock.

### Screenshots and videos

Set `MEDIA_DIR` to collect media; without it the helpers do nothing, so specs can call them unconditionally.

- `shot(page, name)` from `e2e/media.ts` saves `MEDIA_DIR/<name>.png`: the viewport by default, `{ fullPage: true }` for the whole page or `{ locator }` for one element. Screenshots are taken at a device scale factor of 2 when `MEDIA_DIR` is set (`E2E_SCALE` changes it).
- Every test's video is copied to `MEDIA_DIR/<describe and test title>.webm` and converted to `.mp4` when `ffmpeg` is installed. `videoName("…")` inside a test sets another name. For pages of extra browser contexts, call `saveVideo(page, name)`.
- `E2E_DEMO=1` makes recordings watchable: Playwright waits 250 ms between actions (`E2E_SLOWMO`), `pause(page, ms)` waits, a cursor and click ripples are drawn, and `caption(page, text)` shows a caption bar. Screenshots hide the cursor, the captions and the Next.js development indicator.

```sh
MEDIA_DIR=media E2E_DEMO=1 pnpm test:e2e e2e/guide.spec.ts
```

### Running several copies at once

Each copy needs its own port and database. Setting `E2E_PORT` is enough: the database name and the mock GitHub port are derived from it.

```sh
E2E_PORT=3110 pnpm e2e:serve     # database omakaze_e2e_3110, mock GitHub on 3209
E2E_PORT=3110 pnpm test:e2e      # reuses that server
```

Results go to `test-results-3110/` and `playwright-report-3110/`. `next dev` allows one server per checkout, so run a second copy from another worktree, or use `E2E_SERVER=start` after `pnpm build` (several `next start` servers can share one build). Each `next dev` server needs about 1 to 2 GB of memory.

### The mock GitHub API

`e2e/mock-github.ts` is a small HTTP server that answers like the GitHub REST API for `acme/storefront`. The global setup starts it on `E2E_GITHUB_PORT` (default `E2E_PORT` + 99, so 3199), and the app under test gets `GITHUB_API_URL` pointing at it. The seed gives the repository a token connection and every demo user a linked GitHub account with fake tokens that the mock accepts, so pages work as they do with GitHub: the pull request list syncs, file views load full contents (context expands) and review comments appear.

It serves users and repositories, pull requests and their files, compare, file contents, review comments (list, create, reply, edit, delete), reviews, issue comments, check runs and repository webhooks. A comment on a line outside the diff gets GitHub's 422. State such as comments lives in memory and starts from the demo data; objects the mock creates get IDs from 5000001 up. The tokens map to GitHub users: the connection to `storefront-bot`, and each member's linked account to `alexmorgan`, `mayachen` or `samokafor`. Requests it doesn't know get a 404 JSON response and a `[mock-github] no route` line in the test output.

Add an endpoint to the `routes` table:

```ts
routes.push({
  method: "POST",
  pattern: "/repos/:owner/:repo/pulls/:number/requested_reviewers",
  handle: (ctx) => {
    const pull = findPull(ctx);
    if (!pull) return { status: 404, json: { message: "Not Found" } };
    ctx.state.extra.reviewers = (ctx.body as { reviewers: string[] }).reviewers;
    return { status: 201, json: { number: pull.number } };
  },
});
```

`:name` matches one path segment and `*name` the rest of the path; `ctx` has `params`, `query`, `body`, `user` (the GitHub user of the token) and `state`. Routes answer 401 without a known token unless they set `public: true`.

Every request is recorded. In a spec, use `mockGitHub` from `e2e/fixtures.ts`:

| Call | Effect |
| --- | --- |
| `mockGitHub.requests({ method, path })` | Recorded requests (method, path, query, body, `user`, status), oldest first; `path` is a string or a RegExp |
| `mockGitHub.clear()` | Forget recorded requests |
| `mockGitHub.reset()` | Rebuild the state from the demo data and drop requests and stubs |
| `mockGitHub.stub({ method, path, status, json, times })` | Answer matching requests with a fixed response, e.g. a 422 or 500; `path` is exact or `re:<regexp>` |
| `mockGitHub.state()` | Review comments, issue comments, reviews, check runs and hooks as the mock holds them |

Over HTTP: `GET /__mock/requests` (`DELETE` clears), `POST /__mock/reset`, `POST /__mock/stub`, `GET /__mock/state`, `GET /__mock/health`. The app caches review comments for 10 seconds, so assert on what a page shows or on the requests the app sends rather than on the number of reads. GraphQL endpoints are not implemented.

To run the suite without a GitHub connection, set `E2E_GITHUB=none`; specs that need the mock skip themselves with `test.skip(E2E.github !== "mock")`.

### Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `E2E_PORT` | `3100` | Port of the app under test |
| `E2E_DATABASE_URL` | `…/omakaze_e2e`, or `…/omakaze_e2e_<port>` for another port | Database of the app under test; created, migrated and seeded by each run |
| `E2E_GITHUB_PORT` | `E2E_PORT` + 99 | Port of the mock GitHub API |
| `E2E_GITHUB` | `mock` | `none` seeds the repository without a GitHub connection |
| `E2E_SERVER` | `dev` | `start` runs `next start` (build first) |
| `E2E_SEED` | `1` | `0` keeps the database as it is |
| `E2E_WORKERS` | `1` | Parallel workers |
| `E2E_WARMUP` | `1` | `0` skips requesting the main pages before the tests |
| `E2E_WARMUP_PATHS` | | More paths to request before the tests, comma-separated (new pages compile on their first request in `next dev`) |
| `MEDIA_DIR` | | Directory for screenshots and videos |
| `E2E_DEMO` | | `1` for watchable recordings |
| `E2E_SLOWMO` | `250` in demo mode | Milliseconds between Playwright actions |
| `E2E_SCALE` | `2` with `MEDIA_DIR`, else `1` | Device scale factor |
| `E2E_SERVER_LOG` | | `1` prints the app's output |
| `E2E_CHROMIUM_PATH` | | Chromium executable, if Playwright can't find its own |

The app under test always runs with the e2e database, the e2e `APP_SECRET`, `GITHUB_API_URL` pointing at the mock and polling turned off; variables in your `.env` that would change this are overridden. Sign-in through the form is rate limited per address (10 attempts in 15 minutes per account), and the limit lives in the server's memory, so a reused server keeps counting; the fixtures sign in through stored sessions to avoid it.

## Adding a migration

1. Change the tables in `src/db/schema.ts`.
2. Run `pnpm db:generate`. drizzle-kit compares the schema with `drizzle/meta` and writes a new SQL file to `drizzle/`.
3. Read the generated SQL and adjust it if needed, for example to backfill data.
4. Apply it with `pnpm db:migrate`, or restart `pnpm dev`, which applies pending migrations on start.
5. Commit the SQL file and the updated files in `drizzle/meta` together with the schema change.

Released migrations are applied to existing installations on start, so do not edit them; add a new migration instead.

## Conventions

- Match the style of the surrounding code. TypeScript runs in strict mode; import from `src` with the `@/` alias.
- Next.js 16 differs from earlier versions. Check the guides in `node_modules/next/dist/docs/` before using a Next.js API (see `AGENTS.md`).
- Keep domain logic in `src/lib`; pages, actions and route handlers stay thin.
- Validate input with zod. Read JSON bodies with `readJson`, which turns malformed JSON into a 400. Route handlers return errors as `{ "error": "..." }` through `HttpError` and `errorResponse` (`src/lib/http.ts`).
- Check access in every entry point: `requireWorkspace` for pages, `assertWorkspaceRole` for actions, `requireGuideAccess` or `apiPrincipal` for route handlers. JSON routes that use the session cookie and change data call `assertSameOrigin`.
- Store secrets with `encrypt` and tokens as `sha256` hashes (`src/lib/crypto.ts`). Never log tokens or keys.
- Use `clientIp` (`src/lib/http.ts`) for the client's address, for example in rate limits.
- Use `env()` from `src/lib/env.ts` for configuration, and add new variables there, to `.env.example` and to [configuration.md](configuration.md).
- Interface text and documentation are brief and factual.
- Unused variables and arguments that are intentionally unused start with `_`.
