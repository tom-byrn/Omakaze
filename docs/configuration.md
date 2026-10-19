# Configuration

Omakaze is configured with environment variables (instance settings) and with settings that workspace admins change in the app (workspace settings).

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
| `GITHUB_API_URL` | `https://api.github.com` | REST API base URL. For GitHub Enterprise Server: `https://<host>/api/v3`. The GraphQL endpoint is derived from it: `<base>/graphql`, or `https://<host>/api/graphql` for a base ending in `/api/v3`. |
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
| `AUTH_ALLOWED_EMAIL_DOMAINS` | none | Comma-separated list of domains for new accounts, for example `example.com,example.org`. Email sign-up needs an address in one of them; GitHub and token sign-up need a verified GitHub email in one of them. A valid invite link skips the check. Existing accounts are not affected. |
| `TRUST_PROXY_HOPS` | `1` | Number of reverse proxies in front of the app that append to `X-Forwarded-For`, a whole number from 1 to 10. The client address used for rate limits and the session list is the header entry this many places from the right (`X-Real-IP` when the header is missing). Without a reverse proxy that sets the header, clients can choose this address. See [self-hosting.md](self-hosting.md#https-and-reverse-proxies). |

**Sign in with GitHub** is available when a GitHub App with client credentials or an OAuth App is configured; there is no separate switch. If no sign-in method is available, the sign-in page says so.

### Share links

| Variable | Default | Description |
| --- | --- | --- |
| `SHARE_LINKS_ENABLED` | `true` | Read-only share links to guides (`/s/<token>`), for people without an account. When false, no link can be created or opened, existing links show "Share links are turned off", and requests with a share token get 404. Links are not revoked, so they work again when the variable is turned back on. Workspaces can also turn links off; see [Share links](#share-links-1). |

### Email

| Variable | Default | Description |
| --- | --- | --- |
| `SMTP_URL` | none | SMTP connection URL, for example `smtps://user:password@smtp.example.com:465`. Used for invite emails, for links that confirm an address, and for [email notifications](#notifications). Without it, invites are shared as links only, an email-restricted invite can only be accepted with an address that is verified on GitHub, and email notifications are off (the account page says so). |
| `SMTP_FROM` | `Omakaze <no-reply@localhost>` | Sender address for these emails. |

### Notifications

| Variable | Default | Description |
| --- | --- | --- |
| `NOTIFICATIONS_ENABLED` | `true` | Email notifications, Slack and JSON webhooks for the whole instance. When false, nothing is sent and the settings pages say so. |
| `NOTIFICATIONS_GROUP_SECONDS` | `300` | How long the first email notification waits for others, for members who get email "within a few minutes". Notifications that arrive in that time are sent as one email. A whole number from 0 to 3600. |
| `WEBHOOKS_ALLOW_PRIVATE_NETWORK` | `false` | Let Slack and JSON webhooks reach loopback and private network addresses, for example a Mattermost server on your network. By default, like downloads for `upload_asset`, only public addresses are allowed, so workspace admins can't use webhooks to probe your network. |

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
| `AI_PROVIDER` | none | `anthropic`, `openai`, `google`, `openrouter`, `ollama`, `lmstudio` or `openai-compatible`. Without it, built-in generation is off unless a workspace configures its own provider. Guides from agents over MCP, the REST API and the editor work either way. |
| `AI_MODEL` | the provider's default | `claude-opus-5-5` for Anthropic and `anthropic/claude-opus-5.5` for OpenRouter. Required for the other providers. |
| `AI_API_KEY` | none | Required for `anthropic`, `openai`, `google` and `openrouter`; optional for `ollama`, `lmstudio` and `openai-compatible`. |
| `AI_BASE_URL` | the provider's default | API base URL, for example `http://ollama:11434/v1` for Ollama in Docker Compose. |
| `CHATGPT_PLAN_ENABLED` | `true` | Lets users connect their own ChatGPT plan with Sign in with ChatGPT, in workspaces that allow it. See [ai.md](ai.md#chatgpt-plans). Turn it off, or request access from OpenAI, if you offer Omakaze as a paid or hosted service. |

### Background worker

| Variable | Default | Description |
| --- | --- | --- |
| `WORKER_ENABLED` | `true` | Run the job worker in this process. At least one instance must run it for AI generation, summary comments, the guide check, polling and the cleanup of abandoned guides. |
| `WORKER_CONCURRENCY` | `3` | Number of jobs this process runs at the same time. |
| `POLL_INTERVAL_SECONDS` | `300` | Seconds between polls of GitHub for pull requests in repositories with automatic guides. A whole number; `0` turns polling off, and values from 1 to 29 are raised to 30. One poll runs per interval across all instances. |

### Database and runtime

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_POOL_SIZE` | `10` | Maximum number of connections in the application's database pool. Migrations use one separate connection. |
| `RUN_MIGRATIONS_ON_START` | migrations run | Set to `false` to skip applying migrations when the server starts. |
| `MIGRATIONS_DIR` | `drizzle` in the working directory | Folder with the SQL migrations. |
| `PORT` | `3000` | Port the server listens on. For `pnpm start` and `pnpm dev`, set it in the process environment (`PORT=8080 pnpm start`); Next.js reads it before loading `.env`. The Docker image sets `3000`. |
| `NODE_USE_ENV_PROXY` | none | Node.js setting. `1` makes `fetch` use `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY`. See [self-hosting.md](self-hosting.md#outbound-http-proxy). |
| `NEXT_OUTPUT` | none | Read by `pnpm build`. `standalone` also writes the standalone server (`.next/standalone/server.js`) that the Docker image runs. |
| `LANDING_ONLY` | `false` | Read by `pnpm build` and the server. `true` serves only the landing page: no database, `APP_SECRET`, sign-in or worker is needed, every other page redirects to `/`, and the sign-in buttons link to the self-hosting guide. Use it for a marketing deploy, for example on Vercel. |

### Docker Compose

These are read by `docker-compose.yml` itself:

| Variable | Default | Description |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `omakaze` | Password of the `db` service, also used in the app's `DATABASE_URL`. The Postgres image applies it only when its data volume is created. |
| `PORT` | `3000` | Published host port, from `.env` or the shell. The server inside the container always listens on 3000; see [self-hosting.md](self-hosting.md#docker-compose). |

## Instance settings and workspace settings

| Instance settings | Workspace settings |
| --- | --- |
| Environment variables, read at startup | Changed in the app by workspace admins |
| `/admin` for instance admins: create or remove the GitHub App, status, webhook deliveries, recent jobs | **Settings** and **Repositories** in each workspace |
| GitHub App and OAuth credentials, sign-in methods, SMTP and notifications, storage, worker and polling, default AI provider | Name and URL, members and invites, GitHub connections, guide template, AI provider, automation, Slack and JSON webhooks, API tokens, followed repositories |

### Workspace settings pages

| Page | Contents |
| --- | --- |
| **General** | Name and URL (`/w/<slug>`). Leave the workspace. Owners can delete it. |
| **Members** | Invite links, roles and pending invites. See [Invites](#invites). |
| **GitHub** | Connections: GitHub App installation, personal access token, linked GitHub account. See [github-app.md](github-app.md). |
| **Guide template** | The outline of sections guides follow (from the **Feature**, **Bug fix** or **Migration** starter, or your own), and writing instructions. Applies to built-in generation, MCP agents, the REST API and the editor; repositories can override it. See [ai.md](ai.md#guide-templates). |
| **AI provider** | Provider, model, API key (encrypted, never shown again) and base URL for built-in generation, with **Test connection** and **Remove provider**. The page shows whether the workspace or the instance default is in effect. |
| **Automation** | The four automation switches below, the [guide check](#guide-check) and its most recent updates on GitHub. |
| **Share links** | Whether share links work in the workspace, who can create them, and every active link with its creator, expiry and last use. See [Share links](#share-links-1). |
| **Notifications** | Every member: whether they get email about this workspace. Admins: a Slack incoming webhook and a JSON webhook, the events each one receives, **Send test message** and a preview of the Slack messages. See [Notifications](#notifications). |
| **API tokens & MCP** | MCP server URL, client configuration, setup prompt, API tokens and OAuth clients. **Reviews by agents** says how agents post on GitHub, and admins can allow agents to approve pull requests (off by default; see [mcp.md](mcp.md#approvals-by-agents)). |

The **Repositories** page lists followed repositories. Admins add and remove them, create repository webhooks for token and account connections, and override automatic guides (**Workspace default**, **On** or **Off**) and the guide check (**Workspace default**, **Off**, **Informational** or **Require review**) per repository. **Settings** next to a repository opens its own page with the same switch and the repository's [guide template](ai.md#guide-templates). Repositories whose connection was removed show "No GitHub connection"; see [github-app.md](github-app.md#repositories-without-a-connection).

### Invites

Admins create invite links on **Members** with the member or admin role. Each link is valid for 14 days and can be used once; admins can copy pending links again or revoke them.

- **Without an email address**, anyone with the link can join.
- **With an email address**, the link is emailed there when SMTP is configured, and only an account with that address can use it. The address must also be confirmed on the account: either it is a verified email of the user's GitHub account (checked when they sign up, sign in or link GitHub), or the user opens a confirmation link that Omakaze emails to the address when they accept the invite. The confirmation link (`/invite/<token>/confirm`) is valid for 24 hours and must be opened while signed in as the same user. Without SMTP, only a verified GitHub email works.
- Changing the email address on the **Account** page removes its confirmation.
- Signing up with a valid invite link is possible even when `AUTH_SIGNUP_ENABLED` is false or the address is outside `AUTH_ALLOWED_EMAIL_DOMAINS`.

### Share links

**Share** on a guide creates a read-only link for people outside the workspace. Anyone with the link can open the guide without signing in.

- **What it shows.** Either the version the link was created for, or always the latest published version of the pull request; a link to the latest version can also switch to earlier published versions. Drafts and failed versions are never shown. The shared view has the sections, explanations, diffs, context expansion and moved code, and loads the uploads the guide shows. It has no review marks, comment composer, resolving, version menu (for a link to one version), edit or regenerate buttons, and no names or avatars of members. Review comments from GitHub, with GitHub usernames, are shown read-only only when **Include review comments from GitHub** was checked; GitHub is never written to through a link.
- **Expiry.** 1 day, 7 days (the default), 30 days or never.
- **The link is shown once**, when it is created. Omakaze stores only a hash of its secret, so it can't show the link again; create a new one instead.
- **Who can create links.** Admins and owners by default; **Settings → Share links** can allow all members. Members can revoke the links they created, admins and owners any link. Creating and revoking a link is recorded in the activity log.
- **Turning links off.** Clearing **Allow share links in this workspace** stops every link of the workspace from opening, without revoking it, and hides **Share** on guides. `SHARE_LINKS_ENABLED=false` does the same for the whole instance.
- Opening a revoked or expired link shows a page that says so. Deleting a guide version or its repository deletes the links to it.

See [architecture.md](architecture.md#security-model) for how tokens are checked.

### Automation switches

| Switch | Default | Effect |
| --- | --- | --- |
| Create a guide for every new pull request | Off | Generate a guide with the AI provider when a pull request is opened, reopened or marked ready for review, or when polling finds one without a guide. |
| Create a new version when commits are pushed | Off | When automatic guides are on, generate a new version when the head commit changes. |
| Skip draft pull requests | On | Do not generate for drafts; generate once the pull request is ready for review. |
| Post a summary comment on GitHub | Off | Post a comment with the guide summary and section list when a guide is published, and update it for new versions. |

The exact conditions are in [ai.md](ai.md#automation).

### Guide check

**Settings → Automation → Guide check on GitHub** reports review progress on the head commit of each open pull request: a check run named `Omakaze guide` for GitHub App installations, or a commit status named `omakaze/guide` for token and account connections.

| Setting | Default | Effect |
| --- | --- | --- |
| Off, Informational or Require review | Off | **Informational** shows progress such as "3 of 6 sections reviewed" and never blocks merging. **Require review** passes only when every section of the latest guide for the head commit is reviewed by enough members; until then, and for pull requests without a guide or with an outdated one, a check run asks for action and a commit status stays pending. |
| Reviewers per section | 1 | How many members must mark a section as reviewed (1 to 10). Marks by people who left the workspace don't count. |

Repositories can override the mode on the **Repositories** page. Saving either setting updates the check of every open pull request it affects. The rules, what is shown on GitHub and how to make the check required for merging are in [github-app.md](github-app.md#guide-check).

### Notifications

**Email** goes to members, about pull requests in workspaces they belong to. Each member chooses on the **Account** page which of these they get (all are on by default):

| Notification | Who gets it |
| --- | --- |
| A guide is ready | Members whose review is requested on GitHub, or who are assigned to the pull request, when a guide version is published. Matched through their linked GitHub account. |
| A new version of a guide I reviewed | Members who marked sections as reviewed in an earlier version, or submitted a review through Omakaze, when a new version is published. The email lists the sections they reviewed whose code changed (with links) and how many carried over unchanged, using the same comparison as the guide viewer (see [architecture.md](architecture.md#review-progress-across-versions)). |
| Replies to my comments | Everyone who wrote in a review conversation before, when someone replies in Omakaze or on GitHub (through `pull_request_review_comment` webhooks). |
| Comments and reviews on my pull requests | The pull request's author, for line comments, replies, conversation comments and reviews posted in its guide. GitHub tells authors about activity on GitHub itself. |

- Nobody is told about what they did themselves, and each member gets one notification per event.
- Email is only sent to a confirmed address (`users.email_verified_at`): a verified GitHub email, or one confirmed with **Send confirmation link** on the **Account** page (a signed link, valid 24 hours, opened by the same signed-in user).
- **Grouping.** The first notification waits `NOTIFICATIONS_GROUP_SECONDS` (default 5 minutes), an hour or a day, as the member chooses, and everything that arrives meanwhile is one email, grouped by pull request. Of several new versions of one guide, only the newest is mentioned.
- **Muting.** A member can turn off email for a workspace on the **Account** page or in the workspace's **Settings → Notifications**. Preferences and mutes are checked again when an email is sent.
- **Unsubscribing.** Every email has a link to mute its workspace and one to stop all notification email, and `List-Unsubscribe` and `List-Unsubscribe-Post` headers for one-click unsubscribe in mail clients (RFC 8058). The links are signed (HMAC with a key derived from `APP_SECRET`), valid for a year and need no sign-in. The page they open asks before unsubscribing, so link scanners in mail filters can't unsubscribe anyone.
- Emails are sent by the job worker and retried when the SMTP server fails. Pending notifications older than 7 days are dropped.

**Slack and JSON webhooks** are set up per workspace by admins in **Settings → Notifications**, each with its own events:

| Event | When |
| --- | --- |
| Guide published | The first guide for a pull request is published. |
| New version | A new version of a guide is published. The message lists the sections whose code changed compared to the previous version and how many are new. |
| Review completed | A review is submitted (approve, request changes, or comment with text), through Omakaze or on GitHub (`pull_request_review` webhooks). |

- **Slack.** Paste an incoming webhook URL (Slack: **Apps → Incoming Webhooks**; Slack-compatible webhooks such as Mattermost's work too). Messages use Block Kit, with **Open the guide** and **View on GitHub** buttons. The panel shows a preview of each message built from the workspace's latest guide.
- **JSON webhook.** Omakaze POSTs the event as JSON (`event`, `id`, `sent_at`, `workspace`, `repository`, `pull_request`, `guide`, `actor`, `review`; the settings page shows an example) with an `X-Omakaze-Event` header and `X-Omakaze-Signature-256: sha256=<HMAC-SHA256 of the body>`, keyed with the signing secret shown to admins. `id` is the same for a retried delivery.
- **Send test message** posts to the URL being entered, or the saved one, and shows the answer.
- Webhook URLs and the signing secret are encrypted at rest; the page shows only the start of a saved URL. Deliveries are retried on timeouts, HTTP 408, 429 and 5xx; other refusals (a deleted Slack webhook answers 404) are not, and the panel shows the last error.
- Requests go only to public addresses unless `WEBHOOKS_ALLOW_PRIVATE_NETWORK` is set, and redirects are not followed.

### Roles

| Action | Member | Admin | Owner |
| --- | --- | --- | --- |
| See repositories, pull requests and guides; comment, review and mark sections as reviewed | Yes | Yes | Yes |
| Create and edit guides (MCP, REST API, editor, **Generate with AI**) | Yes | Yes | Yes |
| Create API tokens and authorize MCP clients; revoke their own tokens | Yes | Yes | Yes |
| Create share links and revoke their own | When allowed in **Settings → Share links** | Yes | Yes |
| Revoke any share link; change the share link settings | No | Yes | Yes |
| See **Insights** with their own numbers and the team's totals | Yes | Yes | Yes |
| See every member's numbers in **Insights** | No | Yes | Yes |
| Follow a new repository, or reconnect one without a connection, by passing its pull request to MCP or the REST API | No | Yes | Yes |
| Turn their own email about the workspace on or off | Yes | Yes | Yes |
| Manage connections, repositories, AI provider, guide templates, automation, Slack and JSON webhooks, invites and members; rename the workspace; see and revoke all tokens | No | Yes | Yes |
| Make someone an owner, change or remove owners, delete the workspace | No | No | Yes |

A workspace always keeps at least one owner. Invites grant the member or admin role.
