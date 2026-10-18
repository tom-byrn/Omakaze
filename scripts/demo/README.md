# Demo recording

These scripts record a product walkthrough video. They are not part of the application.

| File | Purpose |
| --- | --- |
| `record.mjs` | Drives Chromium with Playwright through the walkthrough: landing page, sign-in, GitHub connection, pull requests, an agent writing a guide over MCP, reviewing it, commenting on GitHub, inviting a teammate, settings. |
| `hearth-guide.json` | The guide the agent writes: a summary and 15 sections for [tom-byrn/omakaze#1](https://github.com/tom-byrn/omakaze/pull/1), the "Hearth: add home buying" demo pull request. Claude Code wrote it after reading that diff. |
| `recorder.mjs` | Captures frames with the Chrome DevTools screencast and encodes H.264 with ffmpeg at a constant frame rate. It can switch between browser pages, so the invited teammate's browser appears in the same video. |
| `helpers.mjs` | A visible cursor, click ripples and the caption bar, injected into every page. |

The agent step is a script using the official MCP TypeScript SDK. It registers itself with dynamic client registration, opens the consent screen like Claude Code or Cursor would, exchanges the code with PKCE and then calls the same tools an agent uses: `get_pull_request`, `get_diff`, `upload_asset`, `start_guide`, `add_section` and `finish_guide`. Everything else in the recording is the real application talking to GitHub.

## Running it

Requirements: a running instance (production build), `ffmpeg`, the Playwright Chromium browser, a GitHub token that can read and comment on the demo pull request, and the screenshots and recording referenced by `hearth-guide.json` in `MEDIA_DIR`.

```sh
pnpm build
AUTH_GITHUB_TOKEN_ENABLED=true pnpm start   # on a fresh database

GITHUB_TOKEN=… MEDIA_DIR=path/to/media OUT_DIR=demo-output node scripts/demo/record.mjs
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:3000` | Instance to record |
| `GITHUB_TOKEN` | | Token used for "Sign in with a GitHub token" |
| `DEMO_REPO`, `DEMO_PR` | `tom-byrn/omakaze`, `1` | Pull request to guide |
| `GUIDE_FILE` | `scripts/demo/hearth-guide.json` | Guide content |
| `MEDIA_DIR` | `demo-media` | Images and videos uploaded with `upload_asset` |
| `OUT_DIR` | `demo-output` | `raw.mp4` and the final `omakaze-demo.mp4` |
| `SKIP_GITHUB_WRITES` | | `1` skips posting the line comment and the review |
| `STOP_AT` | | Stop after a step, e.g. `dashboard` |

The script posts one line comment and one review to the pull request unless `SKIP_GITHUB_WRITES=1`.
