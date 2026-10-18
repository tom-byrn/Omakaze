# Configuration

Guided PRs is configured with environment variables (instance settings) and with settings that workspace admins change in the app (workspace settings).

## Environment variables

`src/lib/env.ts` validates the variables the first time they are needed. An invalid value fails with `Invalid environment configuration` and a list of the problems.

- `pnpm dev`, `pnpm build` and `pnpm start` load `.env` from the project root. `pnpm db:migrate` loads it if it exists. Docker Compose passes it to the app container with `env_file`.
- Boolean variables are true for `1`, `true`, `yes` or `on` (any case) and false for any other value. Unset or empty variables use the default.
- `.env.example` lists the common variables with comments.
- Values are read once per process. Restart the server after changing them.

### Core

| Variable | Default | Description |
| --- | --- | --- |
| `APP_URL` | `http://localhost:3000` | Public URL of the instance, without a trailing slash (trailing slashes are removed). Used for OAuth and GitHub callback URLs, webhook URLs, links in GitHub comments, upload URLs and the same-origin check. Session cookies are marked `Secure` when it starts with `https://`. |
| `APP_SECRET` | none, required | At least 32 characters. Keys derived from it encrypt stored secrets (AES-256-GCM), sign OAuth and installation state, and form the default repository webhook secret. Changing it makes stored GitHub tokens, AI keys, GitHub App credentials and invite links unreadable. Generate one with `openssl rand -hex 32`. |
| `DATABASE_URL` | none, required | PostgreSQL connection string. Docker Compose sets it for the app container. |
| `NODE_ENV` | `development` | Must be `development`, `test` or `production` when set. Next.js sets it for `pnpm build` and `pnpm start`, and the Docker image sets `production`. |

### GitHub

| Variable | Default | Description |
| --- | --- | --- |
| `GITHUB_URL` | `https://github.com` | Web URL of GitHub or GitHub Enterprise Server. Used for sign-in and for the app creation and installation pages. |
| `GITHUB_API_URL` | `https://api.github.com` | REST API base URL. For GitHub Enterprise Server: `https://<host>/api/v3`. |
| `GITHUB_APP_ID` | none | GitHub App ID. When set together with `GITHUB_APP_PRIVATE_KEY`, the app from these variables is used instead of one created on `/admin`. |
| `GITHUB_APP_SLUG` | none | GitHub App slug. Needed for the **Install on GitHub** link. |
| `GITHUB_APP_PRIVATE_KEY` | none | GitHub App private key in PEM format. Newlines may be written as `\n`; a base64-encoded PEM is also accepted. |
| `GITHUB_APP_WEBHOOK_SECRET` | none | Secret used to verify webhook deliveries from the GitHub App. |
| `GITHUB_CLIENT_ID` | none | Client ID for **Sign in with GitHub**: the GitHub App's client ID, or an OAuth App's when `GITHUB_APP_ID` is empty. |
| `GITHUB_CLIENT_SECRET` | none | The matching client secret. |
| `GITHUB_WEBHOOK_SECRET` | derived from `APP_SECRET` | Secret for repository webhooks created on the **Repositories** page. |

See [github-app.md](github-app.md) for how these fit together.

### Sign-in

| Variable | Default | Description |
| --- | --- | --- |
| `AUTH_EMAIL_ENABLED` | `true` | Email and password sign-up and sign-in. When false, neither is available. |
| `AUTH_GITHUB_TOKEN_ENABLED` | `false` | Sign in with a GitHub personal access token. |
| `AUTH_SIGNUP_ENABLED` | `true` | Allow new accounts. When false, accounts can only be created through an invite link; the first account on an empty instance can always be created. |
| `AUTH_ALLOWED_EMAIL_DOMAINS` | none | Comma-separated list of domains allowed for email sign-up, for example `example.com,example.org`. It is not checked for GitHub or token sign-in. |

**Sign in with GitHub** is available when a GitHub App with client credentials or an OAuth App is configured; there is no separate switch. If no sign-in method is available, the sign-in page says so.

### Email

| Variable | Default | Description |
| --- | --- | --- |
| `SMTP_URL` | none | SMTP connection URL, for example `smtps://user:password@smtp.example.com:465`. Without it, invites are shared as links only. |
| `SMTP_FROM` | `Guided PRs <no-reply@localhost>` | Sender address for invite emails. |

### Storage

| Variable | Default | Description |
| --- | --- | --- |
| `STORAGE_DRIVER` | `database` | `database` stores uploads in PostgreSQL; `filesystem` writes them to `STORAGE_DIR`. |
| `STORAGE_DIR` | `./data/uploads` | Directory for the `filesystem` driver. The Docker image sets `/app/data/uploads`. |
| `MAX_UPLOAD_MB` | `50` | Maximum size of an uploaded image, video or PDF in megabytes. |

### AI defaults

Instance-wide defaults for built-in generation. A workspace that selects its own provider in **Settings → AI provider** does not use them. See [ai.md](ai.md).

| Variable | Default | Description |
| --- | --- | --- |
| `AI_PROVIDER` | none | `openrouter`, `anthropic`, `openai` or `openai-compatible`. Without it, workspaces must configure their own provider. |
| `AI_MODEL` | the provider's default | `anthropic/claude-opus-5.5` for OpenRouter and `claude-opus-5-5` for Anthropic. Required for `openai` and `openai-compatible`. |
| `AI_API_KEY` | none | Required for `openrouter`, `anthropic` and `openai`; optional for `openai-compatible`. |
| `AI_BASE_URL` | the provider's default | API base URL, for example `http://ollama:11434/v1` for an OpenAI-compatible server. |

### Background worker

| Variable | Default | Description |
| --- | --- | --- |
| `WORKER_ENABLED` | `true` | Run the job worker in this process. At least one instance must run it for AI generation, summary comments and polling. |
| `WORKER_CONCURRENCY` | `3` | Number of jobs this process runs at the same time. |
| `POLL_INTERVAL_SECONDS` | `300` | How often to poll GitHub for pull requests in repositories with automatic guides. `0` turns polling off. The scheduler wakes at most every 300 seconds and at least 30 seconds apart, so values outside 30 to 300 behave like the nearest bound. |

### Database and runtime

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_POOL_SIZE` | `10` | Maximum number of connections in the application's database pool. Migrations use one separate connection. |
| `RUN_MIGRATIONS_ON_START` | migrations run | Set to `false` to skip applying migrations when the server starts. |
| `MIGRATIONS_DIR` | `drizzle` in the working directory | Folder with the SQL migrations. |
| `PORT` | `3000` | Port the server listens on. For `pnpm start` and `pnpm dev`, set it in the process environment (`PORT=8080 pnpm start`); Next.js reads it before loading `.env`. The Docker image sets `3000`. |
| `NODE_USE_ENV_PROXY` | none | Node.js setting. `1` makes `fetch` use `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY`. See [self-hosting.md](self-hosting.md#outbound-http-proxy). |

### Docker Compose

These are read by `docker-compose.yml` itself:

| Variable | Default | Description |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `guided` | Password of the `db` service, also used in the app's `DATABASE_URL`. The Postgres image applies it only when its data volume is created. |
| `PORT` | `3000` | Published host port. Set it in the shell rather than in `.env`; see [self-hosting.md](self-hosting.md#docker-compose). |

## Instance settings and workspace settings

| Instance settings | Workspace settings |
| --- | --- |
| Environment variables, read at startup | Changed in the app by workspace admins |
| `/admin` for instance admins: create or remove the GitHub App, status, webhook deliveries, recent jobs | **Settings** and **Repositories** in each workspace |
| GitHub App and OAuth credentials, sign-in methods, SMTP, storage, worker and polling, default AI provider | Name and URL, members and invites, GitHub connections, AI provider, automation, API tokens, followed repositories |

### Workspace settings pages

| Page | Contents |
| --- | --- |
| **General** | Name and URL (`/w/<slug>`). Leave the workspace. Owners can delete it. |
| **Members** | Invite links (optionally restricted to one email address, emailed when SMTP is configured, valid for 14 days, usable once), roles, pending invites. |
| **GitHub** | Connections: GitHub App installation, personal access token, linked GitHub account. See [github-app.md](github-app.md). |
| **AI provider** | Provider, model, API key (encrypted, never shown again), base URL and extra instructions for built-in generation, with **Test connection** and **Remove provider**. The page shows whether the workspace or the instance default is in effect. |
| **Automation** | The four automation switches below. |
| **API tokens & MCP** | MCP server URL, client configuration, setup prompt, API tokens and OAuth clients. |

The **Repositories** page lists followed repositories. Admins add and remove them, create repository webhooks for token and account connections, and override automatic guides per repository (**Workspace default**, **On** or **Off**).

### Automation switches

| Switch | Default | Effect |
| --- | --- | --- |
| Create a guide for every new pull request | Off | Generate a guide with the AI provider when a pull request opens. |
| Create a new version when commits are pushed | Off | When automatic guides are on, generate a new version when the head commit changes. |
| Skip draft pull requests | On | Do not generate for drafts; generate once the pull request is ready for review. |
| Post a summary comment on GitHub | Off | Post a comment with the guide summary and section list when a guide is published, and update it for new versions. |

The exact conditions are in [ai.md](ai.md#automation).

### Roles

| Action | Member | Admin | Owner |
| --- | --- | --- | --- |
| See repositories, pull requests and guides; comment, review and mark sections as reviewed | Yes | Yes | Yes |
| Create and edit guides (MCP, REST API, editor, **Generate with AI**) | Yes | Yes | Yes |
| Create API tokens and authorize MCP clients; revoke their own tokens | Yes | Yes | Yes |
| Follow a new repository implicitly by passing its pull request to MCP or the REST API | No | Yes | Yes |
| Manage connections, repositories, AI provider, automation, invites and members; rename the workspace; see and revoke all tokens | No | Yes | Yes |
| Make someone an owner, change or remove owners, delete the workspace | No | No | Yes |

A workspace always keeps at least one owner. Invites grant the member or admin role.
