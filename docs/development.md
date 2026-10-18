# Development

## Prerequisites

- Node.js 22 (CI and the Docker image use 22; `package.json` requires 20.9 or later)
- pnpm 10, through Corepack (`package.json` pins `pnpm@10.28.0`)
- PostgreSQL 16, for example in Docker
- Optional: a GitHub account or a GitHub App for testing against real repositories

## Setup

Start a local PostgreSQL that matches the default `DATABASE_URL` in `.env.example`. The `db` service in `docker-compose.yml` does not publish its port, so run a separate container:

```sh
docker run -d --name guided-prs-db -p 5432:5432 \
  -e POSTGRES_USER=guided -e POSTGRES_PASSWORD=guided -e POSTGRES_DB=guided_prs \
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
| `pnpm build` | Production build (`output: "standalone"`) |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint (`eslint-config-next` with the TypeScript rules) |
| `pnpm typecheck` | `next typegen` to generate route types, then `tsc --noEmit` |
| `pnpm test` | Vitest, once |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm db:generate` | Generate a SQL migration from changes to `src/db/schema.ts` (drizzle-kit) |
| `pnpm db:migrate` | Apply pending migrations to `DATABASE_URL` (loads `.env` if present) |
| `pnpm db:studio` | Drizzle Studio, a browser UI for the database |

CI (`.github/workflows/ci.yml`) runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm db:migrate` against PostgreSQL 16 and `pnpm build` on Node.js 22, and then builds the Docker image.

## Project structure

```text
src/
  app/                    Next.js App Router
    (auth)/               sign-in and sign-up pages and actions
    .well-known/          OAuth discovery documents
    account/              account page
    admin/                instance settings (/admin)
    api/                  route handlers: mcp, oauth, v1, auth, github, guides, assets, health, w
    invite/               invite links
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
    storage/              uploads
    env.ts                environment variable schema
    *.ts                  shared helpers: crypto, http, workspaces, invites, mail, automation, activity
  instrumentation.ts      runs migrations and starts the worker
drizzle/                  SQL migrations and drizzle-kit metadata
scripts/migrate.ts        migration command used by pnpm db:migrate
tests/                    Vitest tests
public/                   static files
```

[architecture.md](architecture.md) describes how the parts work together.

## Tests

Tests live in `tests/*.test.ts` and run with Vitest in a Node environment. `vitest.config.ts` sets the `@/` path alias and test values for `APP_SECRET` and `DATABASE_URL`; the tests do not connect to a database or to GitHub. They cover:

- unified diff parsing (`src/lib/diff/parse.ts`);
- ref parsing, validation and coverage (`src/lib/guides/refs.ts`);
- the viewer's row model: context rows, line selection and enclosing-block expansion (`src/components/guide/diff-model.ts`);
- encryption, signed payloads, password hashing, webhook signatures, pull request URL parsing, editor ref lines, redirects, slugs and the agent prompt.

Add tests for logic in `src/lib` and other code that can run without a database.

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
- Validate input with zod. Route handlers return errors as `{ "error": "..." }` through `HttpError` and `errorResponse` (`src/lib/http.ts`).
- Check access in every entry point: `requireWorkspace` for pages, `assertWorkspaceRole` for actions, `requireGuideAccess` or `apiPrincipal` for route handlers. JSON routes that use the session cookie and change data call `assertSameOrigin`.
- Store secrets with `encrypt` and tokens as `sha256` hashes (`src/lib/crypto.ts`). Never log tokens or keys.
- Use `env()` from `src/lib/env.ts` for configuration, and add new variables there, to `.env.example` and to [configuration.md](configuration.md).
- Interface text and documentation are brief and factual.
- Unused variables and arguments that are intentionally unused start with `_`.
