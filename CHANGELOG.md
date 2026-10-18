# Changelog

All notable changes to Guided PRs are recorded in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## 0.1.0 — Unreleased

Initial release.

### Added

- Guided walkthroughs for GitHub pull requests: ordered sections with a markdown explanation and the parts of the diff they cover (whole files, hunks or line ranges).
- Diff snapshots per head commit, so hunk numbers in a guide stay valid; guide versions; an outdated notice when the pull request has newer commits.
- Coverage of changed lines and an automatic "Other changes" section for uncovered changes.
- Guide viewer with syntax highlighting, expandable context (20 lines at a time, enclosing block, whole file), an all-files view, line wrapping, `diff:` links, Mermaid diagrams, math, images and videos, and keyboard navigation.
- Review features: line and multi-line comments, replies, deleting your own comments, approve, request changes and comment, all posted to GitHub; per-section review progress.
- Guide editor for writing or changing guides by hand, with image and video uploads.
- MCP server at `/api/mcp` with 17 tools and the `create_guided_pr` prompt, authenticated with OAuth 2.1 (discovery, dynamic client registration, PKCE, refresh token rotation, revocation) or API tokens.
- Built-in AI generation with OpenRouter, Anthropic, OpenAI and OpenAI-compatible servers, with a separate pipeline for large pull requests.
- REST API: `GET /api/v1/pulls`, `GET` and `POST /api/v1/guides`, `POST /api/v1/generate`.
- Automation: guides for new pull requests, new versions on push, skipping drafts, and a summary comment on the pull request.
- Workspaces with owner, admin and member roles, invite links (optionally by email through SMTP), API tokens and an activity log.
- GitHub access through a GitHub App (created from `/admin` with the manifest flow), personal access tokens or linked GitHub accounts; GitHub App and repository webhooks; polling; GitHub Enterprise Server support.
- Sign-in with email and password, GitHub, or a GitHub personal access token; invite-only mode and allowed email domains.
- Uploads stored in PostgreSQL or on the file system.
- Background job queue in PostgreSQL with retries, run inside the app process.
- Docker image, `docker-compose.yml` with PostgreSQL 16, migrations on start, and a health check endpoint at `/api/health`.
