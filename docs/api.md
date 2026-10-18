# REST API

The REST API under `/api/v1` lists pull requests, reads and creates guides, and starts AI generation. It uses the same validation as the [MCP server](mcp.md). The routes are in `src/app/api/v1/`.

## Authentication

Send an API token in the `Authorization` header:

```text
Authorization: Bearer gpr_...
```

- Create tokens in **Settings → API tokens & MCP**. A token acts as the user who created it, in the workspace it was created in. Access tokens issued to MCP clients through OAuth (`gpo_...`) are accepted as well.
- Browser sessions are not accepted. A request without a token, or with a session cookie only, returns 401.
- Pull requests must belong to a repository the workspace follows. If an admin's or owner's token names a repository that is not followed yet, or one that [has no GitHub connection](github-app.md#repositories-without-a-connection), Guided PRs adds or reconnects it with the first GitHub connection that can access it. For members, a repository that is not followed returns 404, and one without a connection returns 409.

## Pull request references

Endpoints that take a `pr` accept a pull request URL (`https://github.com/acme/web/pull/412`) or the short form `acme/web#412`. In a query string, encode `#` as `%23`: `pr=acme/web%23412`.

## Endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/pulls` | List pull requests with the status of their latest guide |
| `GET /api/v1/guides` | Read a guide |
| `POST /api/v1/guides` | Create and publish a complete guide |
| `POST /api/v1/generate` | Start AI generation for a pull request |

### GET /api/v1/pulls

Lists up to 500 pull requests from the workspace's followed repositories, most recently updated first.

| Query parameter | Description |
| --- | --- |
| `state` | `open` (default), `closed` (closed without merging), `merged` or `all` |
| `repo` | Optional. `owner/name` of a followed repository (case does not matter); 404 if the workspace does not follow it. The filter is applied to the 500 most recently updated pull requests of the workspace. |

```sh
curl -sS "$GUIDED_PRS_URL/api/v1/pulls?state=open&repo=acme/web" \
  -H "Authorization: Bearer $GUIDED_PRS_TOKEN"
```

```json
{
  "pulls": [
    {
      "repository": "acme/web",
      "number": 412,
      "title": "Add checkout endpoint",
      "state": "open",
      "draft": false,
      "author": "octocat",
      "url": "https://github.com/acme/web/pull/412",
      "updated_at": "2026-10-17T09:12:44.000Z",
      "guide": { "version": 2, "status": "ready", "head_sha": "9f2c1e0b..." }
    }
  ]
}
```

`guide` is `null` when the pull request has no guide. Guide statuses are `draft`, `generating`, `ready` and `failed`.

The list comes from Guided PRs' cache of GitHub data. The cache is refreshed by webhooks, by polling (for repositories with automatic guides) and when members open the workspace in the browser, so recent pull requests can be missing if none of these has run.

### GET /api/v1/guides

Reads the latest guide of a pull request, or a specific version.

| Query parameter | Description |
| --- | --- |
| `pr` | Required. Pull request URL or `owner/repo%23number` |
| `version` | Optional. A positive integer; without it, the latest version is returned. 400 if it is not a positive integer, 404 if the version does not exist. |

```sh
curl -sS "$GUIDED_PRS_URL/api/v1/guides?pr=https://github.com/acme/web/pull/412" \
  -H "Authorization: Bearer $GUIDED_PRS_TOKEN"
```

```json
{
  "id": "Xq3v9yQm1kPz0aBc",
  "version": 2,
  "status": "ready",
  "title": "Add checkout endpoint",
  "summary": "Adds a checkout endpoint that ...",
  "head_sha": "9f2c1e0b...",
  "url": "https://guided-prs.example.com/w/acme/acme/web/pull/412?v=2",
  "versions": [
    { "version": 2, "status": "ready", "head_sha": "9f2c1e0b..." },
    { "version": 1, "status": "ready", "head_sha": "41d7a2c9..." }
  ],
  "sections": [
    {
      "id": "c8VbN2mQ7rTx4LkE",
      "position": 1,
      "title": "Orders table",
      "body": "Adds the `orders` table ...",
      "refs": ["db/migrations/0042_orders.sql", "src/db/schema.ts#3"],
      "automatic": false
    },
    {
      "id": "P0uW5sJk2nHc8DyR",
      "position": 2,
      "title": "Checkout endpoint",
      "body": "Validates the request, then reserves stock ...",
      "refs": [{ "path": "src/api/checkout.ts", "lines": { "start": 10, "end": 88, "side": "new" }, "note": "Validation" }],
      "automatic": false
    }
  ]
}
```

- Each ref is a string in the form described in [mcp.md](mcp.md#diff-references) when that form describes it completely, and an object when it has a caption (`note`) or an `expand` setting.
- `automatic` is `true` for the automatic "Other changes" section.
- `url` opens the guide in Guided PRs; it requires signing in as a member of the workspace.

Returns 404 when the pull request has no guide or the requested version does not exist.

### POST /api/v1/guides

Creates a complete guide and publishes it, like the MCP `create_guide` tool. The guide is recorded as created through the API, with the author `API`.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `pr` | string | Yes | Pull request URL or `owner/repo#number` |
| `head_sha` | string | No | Head commit the refs were written for: the full SHA or a prefix of at least 7 characters. If the pull request's head is a different commit, the request fails with 409. See [head_sha](mcp.md#head_sha-and-changing-pull-requests). |
| `title` | string | No | Defaults to the pull request title |
| `summary` | string | No | Markdown overview. Default empty. |
| `sections` | array, at least 1 | Yes | Each section has `title` (required), `body` (markdown, default empty) and `refs` ([diff references](mcp.md#diff-references), default empty) |
| `auto_cover` | boolean | No | Default `true`: uncovered changes go to an automatic "Other changes" section |

```sh
curl -sS -X POST "$GUIDED_PRS_URL/api/v1/guides" \
  -H "Authorization: Bearer $GUIDED_PRS_TOKEN" \
  -H "Content-Type: application/json" \
  -d @guide.json
```

`guide.json`:

```json
{
  "pr": "https://github.com/acme/web/pull/412",
  "head_sha": "9f2c1e0b...",
  "summary": "Adds a checkout endpoint that validates the cart, reserves stock and creates an order.",
  "sections": [
    {
      "title": "Orders table",
      "body": "Adds the `orders` table and its unique index on `cart_id`.",
      "refs": ["db/migrations/0042_orders.sql", "src/db/schema.ts#3"]
    },
    {
      "title": "Checkout endpoint",
      "body": "Validates the request, then reserves stock in one transaction.",
      "refs": [{ "path": "src/api/checkout.ts", "lines": { "start": 10, "end": 88 }, "note": "Validation" }]
    }
  ]
}
```

Response, `201 Created`:

```json
{
  "id": "Xq3v9yQm1kPz0aBc",
  "version": 3,
  "url": "https://guided-prs.example.com/w/acme/acme/web/pull/412?v=3",
  "coverage": {
    "changed_lines": 431,
    "covered": 412,
    "uncovered": [
      { "path": "package.json", "hunk": 1, "start": 12, "end": 14, "side": "new", "changedLines": 3, "wholeHunk": true },
      { "path": "src/lib/format.ts", "hunk": 2, "start": 40, "end": 55, "side": "new", "changedLines": 16, "wholeHunk": false }
    ],
    "added_to_other_changes": true
  },
  "warnings": [
    {
      "ref": "src/api/checkout.ts:200-210",
      "level": "warning",
      "message": "Line range does not overlap any changed lines; it will be shown as unchanged context."
    }
  ]
}
```

`coverage` describes the sections you sent, before the automatic section is added. Each entry of `uncovered` has `path`, `hunk`, `start`, `end`, `side` (`new` or `old`), `changedLines` and `wholeHunk`. `added_to_other_changes` is `true` when uncovered changes were put into the automatic "Other changes" section, and `false` when everything was covered or `auto_cover` was `false`.

### POST /api/v1/generate

Starts AI generation with the workspace's AI provider (or the instance default). The guide is created right away in the `generating` state and written by the background worker; see [ai.md](ai.md).

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `pr` | string | Yes | Pull request URL or `owner/repo#number` |

```sh
curl -sS -X POST "$GUIDED_PRS_URL/api/v1/generate" \
  -H "Authorization: Bearer $GUIDED_PRS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pr": "https://github.com/acme/web/pull/412"}'
```

Response, `202 Accepted`:

```json
{
  "id": "Xq3v9yQm1kPz0aBc",
  "version": 4,
  "status": "generating",
  "url": "https://guided-prs.example.com/w/acme/acme/web/pull/412?v=4"
}
```

Poll `GET /api/v1/guides?pr=...&version=4` until `status` is `ready` or `failed`. Every call starts a new version, also when a guide for the same head commit already exists. Generation needs a running worker (`WORKER_ENABLED=true` on at least one instance).

## Errors

Errors are JSON objects with an `error` message:

```json
{ "error": "acme/web is not in this workspace" }
```

| Status | Cause |
| --- | --- |
| 400 | The body is not valid JSON (`The request body must be valid JSON.`), the body or query does not match the expected fields, `version` is not a positive integer, or `pr` is not a pull request reference |
| 401 | Missing, invalid, expired or revoked token, or a browser session instead of a token (`Use an API token: Authorization: Bearer <token>`) |
| 404 | The repository is not followed and the token's user cannot add it, no GitHub connection can access it, the `repo` filter names a repository that is not followed, the pull request has no guide, or the requested version does not exist |
| 409 | `POST /api/v1/guides`: `head_sha` does not match the pull request's current head. `POST /api/v1/generate`: no AI provider is configured for the workspace, or the latest guide of the pull request is still being generated. Any request that reads from GitHub: the repository has no usable GitHub connection, for example because the connection was removed or suspended, or its linked account has to sign in again. |
| 422 | `POST /api/v1/guides`: invalid diff references. The message lists each problem, prefixed with the section number and title. |
| 500 | Other errors, including errors returned by GitHub. The message contains the cause. |

## GitHub Actions example

This workflow asks Guided PRs to generate a guide whenever a pull request is opened, updated or marked ready for review. Create a token in **Settings → API tokens & MCP**, store it as the repository secret `GUIDED_PRS_TOKEN`, and store the instance URL as the repository variable `GUIDED_PRS_URL`. The instance must be reachable from GitHub's runners.

```yaml
name: Guided PR

on:
  pull_request:
    types: [opened, reopened, synchronize, ready_for_review]

jobs:
  guide:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    steps:
      - name: Generate a guided walkthrough
        env:
          GUIDED_PRS_URL: ${{ vars.GUIDED_PRS_URL }}
          GUIDED_PRS_TOKEN: ${{ secrets.GUIDED_PRS_TOKEN }}
          PR_URL: ${{ github.event.pull_request.html_url }}
        run: |
          curl --fail-with-body -sS -X POST "$GUIDED_PRS_URL/api/v1/generate" \
            -H "Authorization: Bearer $GUIDED_PRS_TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"pr\": \"$PR_URL\"}"
```

Notes:

- Each run creates a new guide version. The built-in automation in **Settings → Automation** does the same without a workflow and skips commits that already have a guide; see [ai.md](ai.md#automation).
- Workflows triggered by pull requests from forks do not receive repository secrets, so the request fails for those.
- The workspace needs an AI provider (**Settings → AI provider** or the `AI_*` variables); otherwise the API returns 409.

## Other routes

The web interface uses further routes under `/api` (for example `/api/guides/<id>/comments`, `/api/guides/<id>/file` and `/api/w/<slug>/sync`). They are internal and can change without notice. `/api/health` is described in [self-hosting.md](self-hosting.md#health-check).
