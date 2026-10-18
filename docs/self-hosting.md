# Self-hosting

Guided PRs is one Next.js server process and a PostgreSQL database. The server also runs database migrations on start and a background worker for AI generation, polling and GitHub comments. This page covers running it with Docker Compose or directly with Node.js. Every environment variable is listed in [configuration.md](configuration.md).

## Requirements

- Docker with Docker Compose, or Node.js 22 with pnpm. The Docker image and CI use Node.js 22; `package.json` requires Node.js 20.9 or later.
- PostgreSQL 16. `docker-compose.yml` includes it, and CI tests against it.
- GitHub access for the repositories you want to review: a GitHub App (recommended), a personal access token, or a GitHub account. See [github-app.md](github-app.md).
- A public HTTPS URL if GitHub should deliver webhooks. Without one, pull requests are refreshed when people open the app and, for repositories with automatic guides, by polling.
- Optional: an SMTP server for invite emails and an API key for an AI provider.

## Docker Compose

`docker-compose.yml` defines two services:

| Service | Details |
| --- | --- |
| `app` | Built from the `Dockerfile` (image name `ghcr.io/tom-byrn/guided-prs:latest`). Reads `.env` through `env_file`. Listens on port 3000 inside the container and is published on `${PORT:-3000}`. Stores files in the `app-data` volume at `/app/data`. |
| `db` | `postgres:16-alpine` with user `guided`, database `guided_prs` and password `${POSTGRES_PASSWORD:-guided}`. Data is in the `db-data` volume. Its port is not published. |

Compose sets `DATABASE_URL` for the app to `postgres://guided:${POSTGRES_PASSWORD:-guided}@db:5432/guided_prs`, which overrides any `DATABASE_URL` in `.env`. The app starts after the database reports healthy.

```sh
git clone https://github.com/tom-byrn/guided-prs.git
cd guided-prs
cp .env.example .env
# Edit .env: set APP_SECRET (openssl rand -hex 32) and APP_URL.
docker compose up -d --build
docker compose logs -f app
```

`--build` builds the image from your checkout. Open `APP_URL` and create the first account; it becomes the instance admin. Then set up GitHub as described in [github-app.md](github-app.md).

Notes:

- Set `POSTGRES_PASSWORD` (in `.env` or the shell) to a random value before the first start, for example from `openssl rand -hex 16`. It is inserted into `DATABASE_URL` as is, so avoid characters that have a meaning in URLs. The Postgres image applies it only when the `db-data` volume is created.
- `PORT` changes the published host port. Set it in the shell (`PORT=8080 docker compose up -d`), not in `.env`: the app container also receives `.env`, and a `PORT` there changes the port the server listens on inside the container, which the `3000` port mapping and the image health check do not follow. Update `APP_URL` to match.
- The image runs `node server.js` as the unprivileged user `app`, with `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0` and `STORAGE_DIR=/app/data/uploads`.
- The image has a `HEALTHCHECK` that requests `/api/health` every 30 seconds.

## Running without Docker

```sh
git clone https://github.com/tom-byrn/guided-prs.git
cd guided-prs
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
# Edit .env: set APP_SECRET, APP_URL and DATABASE_URL.
pnpm build
pnpm start
```

- `pnpm build`, `pnpm start` and `pnpm dev` load `.env` from the project root. The Dockerfile passes placeholder `DATABASE_URL` and `APP_SECRET` values during its build.
- `pnpm start` runs `next start`, which listens on `PORT` (default 3000). Set `PORT` in the process environment, not in `.env`; Next.js reads it before loading `.env`. Next.js logs a warning that `next start` is not meant for `output: "standalone"` builds; the server still starts. The Docker image runs the standalone server (`node server.js`) instead.
- Keep the process running with your process manager of choice, and put a reverse proxy with TLS in front of it.

## Database migrations

Migrations are SQL files in `drizzle/`. On start, `src/instrumentation.ts` applies pending migrations with a single connection to `DATABASE_URL`, then starts the worker. If a migration fails, the error is logged as `[startup] migrations failed` and rethrown from the startup hook; fix the cause before serving traffic.

- Set `RUN_MIGRATIONS_ON_START=false` to skip this step and run migrations yourself.
- Run them from a checkout with `pnpm db:migrate` (it loads `.env` if present). The migration folder defaults to `drizzle/` in the working directory; `MIGRATIONS_DIR` overrides it.
- With several app instances, consider disabling migrations on start and running `pnpm db:migrate` once per deployment.

## HTTPS and reverse proxies

Terminate TLS at a reverse proxy or load balancer and forward requests to port 3000.

- `APP_URL` must be the public URL that browsers use, including scheme and port if it is not the default (a trailing slash is removed). Guided PRs uses it for OAuth issuer and redirect URLs, the GitHub sign-in callback, the URLs in the GitHub App manifest, links in GitHub comments, upload URLs, and the same-origin check on API requests from the browser. Session cookies get the `Secure` attribute when `APP_URL` starts with `https://`.
- Preserve the `Host` header or set `X-Forwarded-Host`. All forms in the app are Next.js Server Actions, which reject requests whose `Origin` does not match that host.
- Set `X-Forwarded-For` to the client address and replace any value the client sent. Guided PRs uses the first address in this header for sign-in and client registration rate limits and for the session list on the account page.
- Allow request bodies of at least `MAX_UPLOAD_MB` (default 50 MB) for uploads. Uploads through MCP are base64-encoded and therefore larger.
- Allow long requests on `/api/mcp`; the route declares a maximum duration of 300 seconds. Tools that read large diffs from GitHub can take a while.

Caddy:

```text
guided-prs.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

nginx:

```nginx
server {
    listen 443 ssl;
    server_name guided-prs.example.com;
    # ssl_certificate and ssl_certificate_key omitted

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

## Webhooks and polling

GitHub sends webhooks to `<APP_URL>/api/github/webhook`, from the GitHub App or from repository webhooks created on the **Repositories** page. This requires a URL that GitHub can reach. `/admin` lists the most recent deliveries.

Without webhooks:

- The pull request list refreshes when someone opens the workspace and the cached data is older than 60 seconds, or clicks **Sync**.
- The worker polls repositories that have automatic guides turned on (see [ai.md](ai.md#automation)). `POLL_INTERVAL_SECONDS` sets the interval (default 300; `0` turns polling off). The scheduler wakes at most every 300 seconds and at least 30 seconds apart, so values outside 30 to 300 behave like the nearest bound.

## File storage

Uploaded images, videos and PDFs are stored according to `STORAGE_DRIVER`:

| Driver | Where files go | Back up |
| --- | --- | --- |
| `database` (default) | PostgreSQL (`asset_blobs` table) | The database |
| `filesystem` | `STORAGE_DIR/<workspace id>/<asset id>-<filename>`; metadata stays in PostgreSQL | The database and `STORAGE_DIR` |

Each upload records the driver it was written with, so changing `STORAGE_DRIVER` later only affects new uploads; older files are still read from where they were stored. In the Docker image, `STORAGE_DIR` is `/app/data/uploads` on the `app-data` volume. With several app instances, use the `database` driver or a shared directory.

## Backups

Back up the database:

```sh
docker compose exec -T db pg_dump -U guided -d guided_prs -Fc > guided-prs.dump
```

With `STORAGE_DRIVER=filesystem`, also back up the `app-data` volume. Compose prefixes volume names with the project name, which defaults to the directory name; check with `docker volume ls`.

```sh
docker run --rm -v guided-prs_app-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/app-data.tgz -C /data .
```

Keep a copy of `.env`, in particular `APP_SECRET`. Stored GitHub tokens, AI keys, GitHub App credentials and invite links are encrypted with a key derived from it and cannot be read with a different secret.

Restore into a stopped app:

```sh
docker compose stop app
docker compose exec -T db pg_restore -U guided -d guided_prs --clean --if-exists < guided-prs.dump
docker compose up -d
```

## Upgrading

```sh
git pull
docker compose up -d --build
```

Pending migrations are applied when the new container starts. Back up the database first and read [CHANGELOG.md](../CHANGELOG.md). Without Docker, run `git pull`, `pnpm install --frozen-lockfile` and `pnpm build`, then restart the server.

## Outbound HTTP proxy

When outbound traffic must go through an HTTP proxy, make Node.js's built-in `fetch` use the standard proxy variables:

```sh
NODE_USE_ENV_PROXY=1
HTTPS_PROXY=http://proxy.internal:3128
HTTP_PROXY=http://proxy.internal:3128
NO_PROXY=localhost,127.0.0.1
```

This covers requests to GitHub, AI providers (including the Anthropic SDK, which uses `fetch`) and `upload_asset` downloads. It needs a Node.js release that supports `NODE_USE_ENV_PROXY`, such as the Node.js 22 in the Docker image. SMTP and PostgreSQL connections do not use the proxy. Add internal hosts, such as a local model server set in `AI_BASE_URL`, to `NO_PROXY`.

## GitHub Enterprise Server

Set both URLs:

```sh
GITHUB_URL=https://github.example.com
GITHUB_API_URL=https://github.example.com/api/v3
```

`GITHUB_URL` is used for sign-in, for creating the GitHub App from `/admin` and for installing it. `GITHUB_API_URL` is used for every API call. Pull request URLs on the Enterprise host (`https://github.example.com/owner/repo/pull/1`) are accepted by the MCP server and the REST API.

## Health check

`GET /api/health` needs no authentication. It returns `200 {"ok":true}` when the database answers a query and `503 {"ok":false}` otherwise.

## Instance administration

`/admin` is visible to instance admins only. It shows the GitHub App configuration (or the form that creates it), counts of users, workspaces and guides, the enabled sign-in methods, the storage driver, worker and polling status, the webhook URL, the 15 most recent webhook deliveries and the 10 most recent jobs (completed polling jobs are hidden).

The first account on an instance is the instance admin. There is no page for granting this to other users; set the flag in the database:

```sh
docker compose exec db psql -U guided -d guided_prs \
  -c "update users set is_instance_admin = true where lower(email) = 'admin@example.com';"
```

## Running more than one instance

- All state is in PostgreSQL. Jobs are claimed with `FOR UPDATE SKIP LOCKED`, so several workers can share the queue.
- Set `WORKER_ENABLED=false` on instances that should only serve requests. At least one instance must run the worker, otherwise AI generation, summary comments and polling do not run.
- Rate limits and caches (GitHub responses, installation tokens, rendered file views) are kept in memory per process.
- Use `STORAGE_DRIVER=database` or a shared `STORAGE_DIR`.
