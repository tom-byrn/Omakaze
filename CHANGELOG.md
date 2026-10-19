# Changelog

All notable changes to Omakaze are recorded in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## 0.1.0 — Unreleased

Initial release.

### Added

- Guided walkthroughs for GitHub pull requests: ordered sections with a markdown explanation and the parts of the diff they cover (whole files, hunks, line ranges, or line ranges within hunks).
- Diff snapshots per head commit, so hunk numbers in a guide stay valid; guide versions; an outdated notice when the pull request has newer commits. Guides are only created on the head commit the author read (`head_sha`).
- Coverage of changed lines and an automatic "Other changes" section for uncovered changes. `create_guide`, `finish_guide` and `POST /api/v1/guides` report what the author's own sections cover.
- Guide viewer with syntax highlighting, expandable context (20 lines at a time, enclosing block, whole file), an all-files view, line wrapping, move and copy detection that links moved or copied blocks to where they came from, `diff:` links, Mermaid diagrams, math, images and videos, and keyboard navigation.
- Review features: line and multi-line comments, replies, deleting your own comments, approve, request changes and comment, all posted to GitHub; per-section review progress. Reviews and comments made on GitHub are picked up through webhooks.
- "Needs my review": the pull request list and repository pages filter by **Needs my review** (your review is requested on GitHub, or a published guide has sections you haven't reviewed), **Mine**, **Assigned** and **All**, with counts, combined with the state tabs and the search and kept in the URL (`?filter=`). Rows show the requested reviewers and teams and your section progress. Requested reviewers, requested teams and assignees are cached on pull requests from syncs and from `review_requested`, `review_request_removed`, `assigned` and `unassigned` webhooks, and matched to members through their linked GitHub account. `GET /api/v1/pulls` takes the same `filter` for the token's user and returns `requested_reviewers`, `requested_teams`, `assignees` and `review_progress`.
- Review progress across versions: marks carry over to sections of a new version whose changed lines are identical ("Reviewed in v1, unchanged"); sections that changed since a member reviewed them are flagged for re-review with an interdiff, and the new lines are marked in the diff. The overview shows reviewed, carried over and to re-review sections. A banner shows versions published since your last visit, with new and changed sections and new review comments marked.
- Guide editor for writing or changing guides by hand, with uploads of images, videos and PDFs, and a ref syntax that keeps captions and context expansion.
- Guide templates: an ordered outline of sections (title, guidance, required or optional) and writing instructions per workspace in **Settings → Guide template**, with **Feature**, **Bug fix** and **Migration** starters. Repositories can use their own outline and add instructions on a new **Repository settings** page. Built-in generation asks for the template's sections and asks once more when a required one is missing; `get_pull_request` and the `create_guided_pr` prompt include the template; `create_guide`, `finish_guide` and `POST /api/v1/guides` report missing required sections without failing; **Start a draft** pre-fills the template's sections with their guidance as placeholder text; members see missing required sections above a guide. The workspace's extra instructions became the template's writing instructions and now also reach MCP agents.
- MCP server at `/api/mcp` with 17 tools and the `create_guided_pr` prompt, authenticated with OAuth 2.1 (discovery, dynamic client registration, PKCE, resource indicators, refresh token rotation, revocation) or API tokens.
- `upload_asset` downloads from public URLs only, with address checks on every redirect and a size limit.
- Optional built-in AI generation through the Vercel AI SDK with Anthropic, OpenAI, Google, OpenRouter, Ollama, LM Studio and OpenAI-compatible servers, a provider picker and model lists loaded from the provider, with a separate pipeline for large pull requests; retries continue the same guide version; workspace instructions work with the instance default provider.
- ChatGPT plans: members can generate guides on their own ChatGPT Plus or Pro plan through Sign in with ChatGPT, in workspaces whose admins allow it. Only guides a member starts use their plan; automation uses the workspace provider. `CHATGPT_PLAN_ENABLED` turns the feature off per instance.
- Guides left in the `generating` state for 60 minutes without changes are marked as failed and no longer block new versions.
- REST API: `GET /api/v1/pulls` (with a `repo` filter), `GET` and `POST /api/v1/guides`, `POST /api/v1/generate`.
- Automation: guides for new pull requests, new versions on push, skipping drafts, polling at a configurable interval, and a summary comment on the pull request.
- Workspaces with owner, admin and member roles, invite links (optionally emailed through SMTP, and optionally restricted to an email address that the account has confirmed), API tokens and an activity log.
- GitHub access through a GitHub App (created from `/admin` with the manifest flow), personal access tokens or linked GitHub accounts; GitHub App and repository webhooks; polling; GitHub Enterprise Server support. Repositories and guides are kept when a connection is removed, and repositories are reconnected when a connection that can access them is added.
- Sign-in with email and password, GitHub, or a GitHub personal access token; invite-only mode and allowed email domains.
- Rate limits for sign-in, sign-up and OAuth client registration, with `TRUST_PROXY_HOPS` to select the client address behind reverse proxies.
- Uploads stored in PostgreSQL or on the file system.
- Background job queue in PostgreSQL with retries, run inside the app process.
- Demo data (`pnpm db:seed`): a workspace with three members, a repository with seven pull requests, guides with two versions, review marks, review requests and assignees, comments and activity. End-to-end tests with Playwright (`pnpm test:e2e`, also in CI) against a seeded database and a mock GitHub API, with helpers for screenshots and videos.
- Docker image, `docker-compose.yml` with PostgreSQL 16, migrations on start, a health check endpoint at `/api/health`, and a release workflow that publishes the image to GitHub Container Registry.
