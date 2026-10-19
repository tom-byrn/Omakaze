# MCP server

Omakaze includes a Model Context Protocol (MCP) server. A coding agent connected to it can read a pull request, write the guide section by section, upload screenshots and publish the result. It can also take part in the review: read the review conversations, reply in them, comment on lines with suggested changes, resolve conversations and submit reviews, posting to GitHub as the user (see [Reviewing over MCP](#reviewing-over-mcp)). The agent uses its own model; Omakaze stores what the agent sends and validates every diff reference.

The implementation is in `src/lib/mcp/server.ts` (tools, prompt, instructions) and `src/app/api/mcp/route.ts` (transport and authentication).

## Endpoint

| Property | Value |
| --- | --- |
| URL | `<APP_URL>/api/mcp` |
| Transport | Streamable HTTP, stateless: no session ID, a new server instance per request, JSON responses instead of an event stream |
| Methods | `POST`; `GET` and `DELETE` are routed to the same handler |
| Server | name `omakaze`, version `0.1.0`, capabilities `tools` and `prompts` |
| CORS | `Access-Control-Allow-Origin: *` |

During initialization the server sends instructions that contain the workflow, the authoring guidelines from `src/lib/guides/guidelines.ts` and a description of the diff format. Clients that pass server instructions to the model give the agent these rules without extra prompting.

## Authentication

Every request needs `Authorization: Bearer <token>`. A missing, expired or revoked token gets HTTP 401 with a JSON-RPC error (code `-32001`) and this header:

```text
WWW-Authenticate: Bearer realm="omakaze", resource_metadata="<APP_URL>/.well-known/oauth-protected-resource/api/mcp"
```

A token belongs to one user and one workspace. Every tool works in that workspace and acts as that user. Tokens stop working when they are revoked or expire, or when the user is no longer a member of the workspace.

### OAuth

Clients that implement MCP authorization handle these steps themselves:

1. **Discovery.** The client reads the protected resource metadata (RFC 9728) at `/.well-known/oauth-protected-resource/api/mcp` (also served at `/.well-known/oauth-protected-resource`), which names the instance as the authorization server, and then the authorization server metadata (RFC 8414) at `/.well-known/oauth-authorization-server`. The same document is also served at `/.well-known/openid-configuration` for clients that look there.
2. **Registration.** The client registers itself with dynamic client registration (RFC 7591) at `POST /api/oauth/register`.
3. **Consent.** The client opens `/oauth/authorize` in the browser. You sign in if needed, see a page that asks whether to allow the client (by its registered name) to use Omakaze, choose a workspace and select **Allow** or **Deny**.
4. **Token.** The client exchanges the authorization code at `POST /api/oauth/token`.

Authorization server metadata:

| Field | Value |
| --- | --- |
| `issuer` | `<APP_URL>` |
| `authorization_endpoint` | `<APP_URL>/oauth/authorize` |
| `token_endpoint` | `<APP_URL>/api/oauth/token` |
| `registration_endpoint` | `<APP_URL>/api/oauth/register` |
| `revocation_endpoint` | `<APP_URL>/api/oauth/revoke` |
| `response_types_supported` | `code` (response mode `query`) |
| `grant_types_supported` | `authorization_code`, `refresh_token` |
| `code_challenge_methods_supported` | `S256` (PKCE is required) |
| `token_endpoint_auth_methods_supported` | `none`, `client_secret_post`, `client_secret_basic` |
| `scopes_supported` | `mcp` |

Registration:

- `redirect_uris` is required. `http` redirect URIs are accepted only for `localhost`, `127.0.0.1` and `[::1]`. URIs with a fragment and the schemes `javascript:`, `data:`, `file:` and `vbscript:` are rejected.
- `token_endpoint_auth_method` is `none` (the default, a public client), `client_secret_post` or `client_secret_basic`. For the last two the response contains a `client_secret`, shown once.
- `client_name` (up to 100 characters, default `MCP client`) is shown on the consent screen and recorded as the author of the guides the client creates.
- Registration is limited to 30 requests per hour per client address and 500 per hour in total.

Authorization requests need `response_type=code`, `client_id`, a `code_challenge` with `code_challenge_method=S256`, and a `redirect_uri` that exactly matches a registered one (the first registered URI is used when it is omitted). `state`, `scope` and `resource` are optional:

- `scope`: the granted scope is always `mcp`; other requested scopes are dropped.
- `resource` (RFC 8707): if present, it must be `<APP_URL>/api/mcp` or `<APP_URL>` (a trailing slash is ignored); otherwise the request fails with `invalid_target`. The token endpoint checks a `resource` parameter the same way, and for an authorization code it must match the one from the authorization request.

After consent, the browser is redirected to the client with `code`, `state` and `iss`, or with `error=access_denied`.

Token lifetimes (`src/lib/oauth/server.ts`):

| Credential | Lifetime |
| --- | --- |
| Authorization code | 5 minutes, single use |
| Access token | 7 days (`expires_in: 604800`) |
| Refresh token | 90 days, single use |

- The token and revocation endpoints accept form-encoded bodies or a JSON object, and the token endpoint answers with `Cache-Control: no-store`. Errors use the OAuth format: `{"error": "invalid_grant", "error_description": "..."}`.
- Refreshing rotates the tokens: the refresh token that was used and the access token issued with it are revoked, and a new pair is returned.
- `POST /api/oauth/revoke` (RFC 7009) takes `token=<token>` and needs the client's identity: `client_id` in the body or HTTP Basic authentication. Clients registered with a secret must authenticate with it. Without a valid client the response is 401 `invalid_client`; otherwise it is 200, and tokens issued to other clients are left alone. Revoking an access token or a refresh token revokes both tokens of that grant.
- Authorized clients are listed in **Settings → API tokens & MCP** with an `OAuth` tag. **Revoke** there revokes the access token and its refresh token, so the client has to be authorized again. Removing a user from the workspace stops all of their tokens.
- Token formats: access tokens start with `omko_`, refresh tokens with `omkr_`, client IDs with `omkc_`.

### API tokens

For clients without OAuth support, create a token in **Settings → API tokens & MCP**:

- Choose a name and an expiry: 30 days, 90 days (default), 1 year or never. Tokens start with `omk_` and are shown once; only a hash is stored.
- Send it as `Authorization: Bearer <token>`. The same token works for the [REST API](api.md).
- Members see and revoke their own tokens. Admins and owners see and revoke all tokens of the workspace.

### Repositories and permissions

- Tools that take a `pr` work only with repositories the workspace follows. If an admin or owner passes a pull request from a repository that is not followed yet, or one that [has no GitHub connection](github-app.md#repositories-without-a-connection), Omakaze adds or reconnects the repository with the first GitHub connection of the workspace that can access it. For members, a repository that is not followed is an error with a link to the **Repositories** page, and a repository without a connection is an error that says so.
- Every member can create and edit guides. The editing tools work on any guide of the workspace, including published ones.
- The review tools post to GitHub as the token's user, with the same rules as the review tools of the guide viewer. See [Reviewing over MCP](#reviewing-over-mcp).

## Client configuration

Replace `<APP_URL>` with the URL of your instance. **Settings → API tokens & MCP** shows the same snippets with the URL filled in.

Claude Code:

```sh
claude mcp add --transport http omakaze <APP_URL>/api/mcp
```

Codex:

```sh
codex mcp add omakaze --url <APP_URL>/api/mcp
```

Cursor, in `mcp.json`:

```json
{
  "mcpServers": {
    "omakaze": {
      "url": "<APP_URL>/api/mcp"
    }
  }
}
```

VS Code, in `mcp.json`:

```json
{
  "servers": {
    "omakaze": {
      "type": "http",
      "url": "<APP_URL>/api/mcp"
    }
  }
}
```

With an API token instead of OAuth:

```sh
claude mcp add --transport http omakaze <APP_URL>/api/mcp \
  --header "Authorization: Bearer <your token>"
```

Other clients: add a remote MCP server named `omakaze` that uses HTTP (Streamable HTTP) with the URL `<APP_URL>/api/mcp`, and either let the client handle OAuth or configure the `Authorization` header.

## Prompts

**Setup prompt.** Shown on the landing page and in **Settings → API tokens & MCP**. Paste it into an agent to have it add the server:

```text
Set up the Omakaze MCP server so you can create guided pull request walkthroughs.

1. Add the remote MCP server (Streamable HTTP):
   - Claude Code: claude mcp add --transport http omakaze <APP_URL>/api/mcp
   - Codex: codex mcp add omakaze --url <APP_URL>/api/mcp
   - Cursor / VS Code / other clients: add an HTTP MCP server named "omakaze" with the URL <APP_URL>/api/mcp
2. Authenticate when the client asks (it opens <APP_URL> to sign in and pick a workspace). If the client does not support OAuth, create an API token at <APP_URL>/settings/tokens and send it as the header "Authorization: Bearer <token>".
3. Call the whoami tool to confirm the connection, then tell me which workspace you are connected to.

Docs: https://github.com/tom-byrn/omakaze/blob/main/docs/mcp.md
```

**Per pull request.** Every pull request page has **Copy agent prompt**:

```text
Create a guided PR for <PR URL> using the Omakaze MCP.
```

The server also provides this as the MCP prompt [`create_guided_pr`](#prompt-create_guided_pr).

**Review comments.** To have an agent answer the review comments on a pull request:

```text
Address the review comments on <PR URL> using the Omakaze MCP.
```

The MCP prompt [`address_review_comments`](#prompt-address_review_comments) starts with this sentence and adds the steps.

## Tools

The `pr` parameter accepts a pull request URL such as `https://github.com/owner/repo/pull/123` (GitHub Enterprise Server URLs work the same way) or the short form `owner/repo#123`.

| Tool | Purpose | Read-only |
| --- | --- | --- |
| [`whoami`](#whoami) | Show the user, workspace and repositories of this connection | Yes |
| [`list_pull_requests`](#list_pull_requests) | List pull requests with their guide status | Yes |
| [`get_pull_request`](#get_pull_request) | Read a pull request: description, `head_sha`, files and hunk numbers | Yes |
| [`get_diff`](#get_diff) | Read the code changes with line and hunk numbers | Yes |
| [`read_file`](#read_file) | Read a file at the head or the merge base | Yes |
| [`create_guide`](#create_guide) | Create and publish a complete guide in one call | No |
| [`start_guide`](#start_guide) | Start a guide to fill in section by section | No |
| [`add_section`](#add_section) | Add a section | No |
| [`update_section`](#update_section) | Change a section's title, body or refs | No |
| [`delete_section`](#delete_section) | Delete a section | No |
| [`reorder_sections`](#reorder_sections) | Set the order of the sections | No |
| [`update_guide`](#update_guide) | Change a guide's title or summary | No |
| [`get_guide`](#get_guide) | Read a guide with section IDs, bodies and refs | Yes |
| [`check_coverage`](#check_coverage) | List changed lines that no section covers | Yes |
| [`finish_guide`](#finish_guide) | Publish a guide started with `start_guide` | No |
| [`upload_asset`](#upload_asset) | Upload an image, video or PDF for use in section bodies | No |
| [`list_review_comments`](#list_review_comments) | Read the review conversations with thread IDs, resolved state and guide sections | Yes |
| [`reply_to_review_comment`](#reply_to_review_comment) | Reply in a review thread on GitHub | No |
| [`post_review_comment`](#post_review_comment) | Comment on lines of the diff, optionally with a suggested change | No |
| [`resolve_review_thread`](#resolve_review_thread) | Resolve or unresolve a review thread | No |
| [`submit_review`](#submit_review) | Submit a review: comment, request changes or (if allowed) approve | No |
| [`post_pr_comment`](#post_pr_comment) | Comment in the pull request conversation | No |

`get_pull_request` and `get_diff` are read-only for the pull request, but they store a diff snapshot (see [head_sha](#head_sha-and-changing-pull-requests)). Errors are returned as tool results with `isError: true` and a message (see [Errors](#errors)).

### whoami

Shows the signed-in user, the workspace with its URL, the workspace's repositories, the user's linked GitHub account (which the review tools post as), whether agents may approve pull requests in the workspace, and the instance URL. No parameters.

### list_pull_requests

Lists pull requests from the workspace's cached pull request data, newest update first, with the latest guide version and status of each.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `repository` | string | No | `owner/name` of a followed repository |
| `state` | `open`, `closed`, `merged`, `all` | No | Default `open`. `closed` means closed without merging. |
| `filter` | `needs-review`, `mine`, `assigned`, `all` | No | For the token's user, as on the pull request list: `needs-review` (review requested on GitHub, or a published guide has sections the user hasn't reviewed), `mine` (authored), `assigned`. Default `all`. Review requests, authors and assignees are matched through the user's linked GitHub account. |
| `limit` | integer, 1 to 200 | No | Default 50 |

The cache is refreshed by webhooks, by polling and when members open the workspace. If it is empty, the tool says so.

### get_pull_request

Reads a pull request and stores a snapshot of its diff at the current head commit. The result contains the title, state, author, branches, URL, `head_sha`, size, the description (first 6,000 characters), every changed file with its hunks, and the existing guide versions with their `guide_id`s.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `pr` | string | Yes | Pull request URL or `owner/repo#number` |

Each hunk is listed with the reference to use in sections:

```text
Files and hunks:
- src/api/checkout.ts [modified, +45 -3, 2 hunks]
    src/api/checkout.ts#1  @@ -10,6 +10,20 @@ export async function POST(req: Request) {  (+14 -0)
    src/api/checkout.ts#2  @@ -88,7 +102,35 @@ function total(items: Item[]) {  (+31 -3)
```

If the repository or the workspace has a [guide template](#guide-templates), it follows the list of existing guides.

### get_diff

Returns the code changes of the current head in the [diff format](#diff-format) below. Large diffs are paginated by hunk.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `pr` | string | Yes | Pull request URL or `owner/repo#number` |
| `files` | string[] | No | Only these paths |
| `hunks` | string[] | No | Only these hunks, for example `["src/a.ts#2"]` |
| `cursor` | integer, 0 or more | No | Position to continue from; pass the `next_cursor` of the previous call |
| `max_chars` | integer, 5,000 to 200,000 | No | Size of one page. Default 60,000. A page always contains at least one hunk. |

The last line is either `[<n>/<total> hunks shown] next_cursor: <n>` or `[all <total> hunks shown] head_sha: <sha>`. Files without a patch (binary or too large for GitHub to return) are listed as `(binary or too large to show)` when no `hunks` filter is given.

### read_file

Reads a file with line numbers, for context around a change.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `pr` | string | Yes | Pull request URL or `owner/repo#number` |
| `path` | string | Yes | File path |
| `ref` | `head`, `base` | No | `head` (default) reads the pull request head; `base` reads the merge base |
| `start_line` | integer, 1 or more | No | Default 1 |
| `end_line` | integer, 1 or more | No | Default: 800 lines after `start_line`, or the end of the file |

Files that are missing at that commit, binary, or larger than 2 MB return an error.

### create_guide

Creates a complete guide in one call and publishes it. Every ref of every section is validated before anything is written. Changes not covered by any section go to an automatic "Other changes" section unless `auto_cover` is `false`. Returns the guide URL, the [coverage report](#coverage-and-other-changes) of your sections, warnings, and a [template warning](#guide-templates) when required sections are missing.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `pr` | string | Yes | Pull request URL or `owner/repo#number` |
| `head_sha` | string | No | `head_sha` from `get_pull_request`. The call fails if the pull request has moved on since; see [head_sha](#head_sha-and-changing-pull-requests). |
| `title` | string | No | Defaults to the pull request title (up to 300 characters are kept) |
| `summary` | string | Yes | Markdown overview shown before the first section |
| `sections` | array, at least 1 | Yes | Sections in reading order. Each has `title` (string, required, up to 200 characters are kept), `body` (markdown, required) and `refs` ([diff references](#diff-references), required, may be empty) |
| `auto_cover` | boolean | No | Default `true` |

Each call creates a new guide version for the pull request.

### start_guide

Starts a new guide version that you fill with `add_section` and publish with `finish_guide`. The guide is in the `generating` state: people who open the pull request see "Writing…" and the sections appear as you add them.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `pr` | string | Yes | Pull request URL or `owner/repo#number` |
| `head_sha` | string | No | `head_sha` from `get_pull_request`; checked the same way as for `create_guide` |
| `title` | string | No | Defaults to the pull request title |
| `summary` | string | No | Markdown overview; can be set later with `update_guide` |

Returns the `guide_id` and the guide URL. Call `finish_guide` when you are done. While the guide is in the `generating` state, **Generate with AI** and automatic generation skip the pull request. A guide that stays in the `generating` state with no change to its sections, title or summary for 60 minutes is marked as failed by the background worker, with the error "Nothing changed for 60 minutes, so the guide was marked as abandoned. Start a new version."

### add_section

Appends a section, or inserts it at a position. The automatic "Other changes" section, if present, stays last.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `guide_id` | string | Yes | |
| `title` | string | Yes | Short title, for example `Offers API` |
| `body` | string | Yes | Markdown explanation |
| `refs` | array | Yes | [Diff references](#diff-references); may be empty |
| `position` | integer, 1 or more | No | 1-based position; values past the end append |

Returns the `section_id`, the refs as stored, and warnings. Fails for a guide in the `failed` state.

### update_section

Changes a section. Omitted fields stay as they are; `refs` replaces the whole list.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `section_id` | string | Yes | |
| `title` | string | No | |
| `body` | string | No | |
| `refs` | array | No | [Diff references](#diff-references) |

Fails for a guide in the `failed` state.

### delete_section

Deletes a section and closes the gap in the positions. Marked as destructive.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `section_id` | string | Yes | |

### reorder_sections

Sets the order of a guide's sections. Returns the new order.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `guide_id` | string | Yes | |
| `section_ids` | string[] | Yes | Every section ID of the guide exactly once, in the new order (including the automatic section, if present) |

### update_guide

Changes a guide's title or summary. Omitted fields stay as they are.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `guide_id` | string | Yes | |
| `title` | string | No | |
| `summary` | string | No | Markdown |

### get_guide

Reads a guide: version, status, title, URL, `head_sha`, summary, and every section with its `section_id`, refs and body. Refs are printed as JSON values: the [string form](#diff-references) when it describes the ref completely, otherwise the object form with `note` and `expand`. The automatic section is marked `(automatic)`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `guide_id` | string | No | A specific guide version |
| `pr` | string | No | The latest guide version of this pull request, in any state |

Pass one of the two.

### check_coverage

Lists the changed lines that no section covers yet. See [Coverage](#coverage-and-other-changes).

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `guide_id` | string | Yes | |

### finish_guide

Publishes a guide: its state becomes `ready`. Any previous automatic section is removed first; then, unless `auto_cover` is `false`, uncovered changes are put into a new automatic "Other changes" section. Returns the URL, the [coverage report](#coverage-and-other-changes) of your sections and, when required sections are missing, a [template warning](#guide-templates). If the workspace posts summary comments, one is queued for the pull request.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `guide_id` | string | Yes | |
| `auto_cover` | boolean | No | Default `true` |

`finish_guide` can be called again after editing a published guide to recompute the automatic section. It fails for a guide in the `failed` state.

### upload_asset

Uploads a screenshot, image, screen recording or PDF and returns its URL and a markdown snippet for section bodies. See [Screenshots and videos](#screenshots-and-videos).

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `filename` | string | Yes | For example `checkout-flow.mp4`. The extension decides the file type. |
| `content_base64` | string | One of these two | File contents, base64-encoded. A `data:` URL prefix is removed. |
| `url` | string | One of these two | A public `http` or `https` URL to download instead |
| `content_type` | string | No | Used when the file name has no recognized extension |
| `guide_id` | string | No | Associates the upload with a guide |
| `alt` | string | No | Alt text for the markdown snippet |

### list_review_comments

Reads the review conversations (threads of line comments) on the pull request from GitHub, including comments posted from Omakaze. Thread IDs and resolved state come from GitHub's GraphQL API.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `pr` | string | Yes | Pull request URL or `owner/repo#number` |
| `state` | `open`, `resolved`, `all` | No | Which conversations to show. Default `all`. |

Open conversations come first, then by file and line. Each conversation has its location in the [string form of refs](#diff-references), its state, its `thread_id`, the guide section that shows the lines (from the latest published guide, when it was written for the commit the comment refers to) and every comment with its `comment_id`, author and age. Bodies are shown with their line breaks, up to 1,500 characters each. Comments the user posted through Omakaze, or with their linked GitHub account, are marked `(you)`:

```text
acme/storefront#128: 7 conversations, 4 open and 3 resolved. Showing the open ones.
Comments marked (you) are yours: posted through Omakaze, or by your GitHub account mayachen.

## src/lib/promo.ts:37 · open
thread_id: PRRT_kwDOAbc123
Guide section 2 "Validating a code" (section_id E2Ed-5KMa0jfBBcl)
- comment_id 1834001 · samokafor · just now
  Is `ends_at` inclusive? A code that ends on Sunday should still work on Sunday.

## src/lib/cart.ts:48 · open
thread_id: PRRT_kwDOAbc456
Guide section 3 "Discounts in cart totals" (section_id 69r-sW6BhLph8a8X)
- comment_id 1833870 · samokafor · 3 h ago
  Nit: `discountFor` already caps the discount at the subtotal, so this `Math.max` only matters for other callers. Worth a comment?
- comment_id 1833902 · mayachen (you) · 2 h ago
  I'd keep it: `totals` is exported and the guard is cheap.

Answer in a thread with reply_to_review_comment and resolve answered threads with resolve_review_thread.
```

A conversation on lines that changed since is marked `outdated (the code changed since)` and shows its original lines. If the GraphQL API can't be read, the comments are still listed, without thread IDs and with `state unknown`; use `comment_id` with the other tools then.

### reply_to_review_comment

Replies in a review thread on GitHub, as the user. The reply goes to the thread's first comment, as GitHub requires, so any `comment_id` of the thread works.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `pr` | string | Yes | Pull request URL or `owner/repo#number` |
| `thread_id` | string | One of these two | `thread_id` from `list_review_comments` |
| `comment_id` | integer | One of these two | The `comment_id` of any comment in the thread |
| `body` | string | Yes | GitHub markdown, up to 65,000 characters. May contain a ```` ```suggestion ```` block. |

Returns the location, how the reply was posted (`as <login>`, or through the workspace connection), the new `comment_id`, the `thread_id` and the URL. Threads and comments of other pull requests are refused.

### post_review_comment

Comments on a line or a range of lines of the diff, as the user. Lines are numbered as `get_diff` shows them, so nothing needs translating:

- `side: "new"` (the default) uses new-version line numbers: added lines (`+  12 |`) and context lines (`   12 |`).
- `side: "old"` uses the `o` numbers of removed lines (`-  o12 |`).
- `start_line` makes a multi-line comment from `start_line` to `line`. Both must be in the same hunk, and `start_line` must come first. `start_side` can differ from `side`, for a range that starts on a removed line.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `pr` | string | Yes | Pull request URL or `owner/repo#number` |
| `path` | string | Yes | File path as listed by `get_pull_request` |
| `line` | integer | Yes | The last (or only) commented line |
| `side` | `new`, `old` | No | Default `new` |
| `start_line` | integer | No | The first line of a multi-line comment |
| `start_side` | `new`, `old` | No | Defaults to `side` |
| `body` | string | One or both | GitHub markdown |
| `suggestion` | string | One or both | Replacement text for the commented lines. It is added to `body` as a ```` ```suggestion ```` block, which GitHub shows as a suggested change the author can commit. An empty string suggests deleting the lines. |
| `head_sha` | string | No | `head_sha` from `get_pull_request`; the call fails if the pull request has new commits, as for [`create_guide`](#head_sha-and-changing-pull-requests) |

The comment is posted on the pull request's current head commit and mapped to GitHub's `line`, `side` (`RIGHT` for new, `LEFT` for old), `start_line` and `start_side`. Lines outside the diff are refused before anything is sent, with the line ranges of the file's hunks:

```text
Line 99 of src/lib/promo.ts is not in the diff. GitHub accepts comments only on lines of a hunk: #1 new 1-54, old none.
```

Suggested changes replace lines of the new version, so a suggestion on `old` lines is refused. Returns the location in ref form (for example `src/lib/promo.ts:36-37`), how it was posted, the `comment_id`, the new conversation's `thread_id` and the URL. The comment is linked to the section of the latest guide that shows the line.

### resolve_review_thread

Resolves a review thread on GitHub, or unresolves it with `resolved: false`. Marked as idempotent.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `pr` | string | Yes | Pull request URL or `owner/repo#number` |
| `thread_id` | string | One of these two | `thread_id` from `list_review_comments` |
| `comment_id` | integer | One of these two | The `comment_id` of any comment in the thread |
| `resolved` | boolean | No | Default `true` |

This needs the user's own linked GitHub account and is never done through the workspace connection, as in the guide viewer: branch protection can require resolved conversations, so GitHub's rules on who may resolve apply to the user, and GitHub shows them as the one who resolved it.

### submit_review

Submits a review of the pull request on GitHub, as the user, on the current head commit.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `pr` | string | Yes | Pull request URL or `owner/repo#number` |
| `event` | `COMMENT`, `REQUEST_CHANGES`, `APPROVE` | Yes | |
| `body` | string | For `COMMENT` and `REQUEST_CHANGES` | Summary in GitHub markdown |
| `head_sha` | string | No | The commit the agent reviewed; the call fails if the pull request has new commits |

- `COMMENT` posts with the user's linked account, or through the workspace connection with a `Posted by` line.
- `REQUEST_CHANGES` needs the user's linked account.
- `APPROVE` needs the user's linked account, and is refused unless a workspace admin turned on **Allow agents to approve pull requests** (see [Approvals by agents](#approvals-by-agents)).

Line comments are separate: post them with `post_review_comment` first. A review the user submits settles their pending review request, as on GitHub.

### post_pr_comment

Posts a comment in the pull request's conversation on GitHub (not on a line of the diff), as the user.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `pr` | string | Yes | Pull request URL or `owner/repo#number` |
| `body` | string | Yes | GitHub markdown, up to 65,000 characters |

## Prompt: create_guided_pr

| Argument | Required | Description |
| --- | --- | --- |
| `pr_url` | Yes | Pull request URL |

Returns one user message: `Create a guided PR for <pr_url> using the Omakaze MCP.` followed by the workflow below and, when there is one, the [guide template](#guide-templates) of the pull request's repository (the workspace's for a repository that is not followed).

## Prompt: address_review_comments

| Argument | Required | Description |
| --- | --- | --- |
| `pr_url` | Yes | Pull request URL |

Returns one user message: `Address the review comments on <pr_url> using the Omakaze MCP.` followed by these steps:

1. `list_review_comments` with `state: "open"` to read the open conversations, their `thread_id`, the commented lines and the guide section that shows them.
2. Read the code a conversation is about with `get_diff` or `read_file` before answering.
3. Answer questions in their own thread with `reply_to_review_comment`, briefly and from the code, and say so when unsure.
4. Where a question shows that the guide explained something badly or left it out, improve the section with `get_guide` and `update_section`, and mention it in the reply.
5. Resolve a thread with `resolve_review_thread` only when the reply or the guide change fully answers it. Threads that ask for a code change the agent hasn't made, need a decision from a person, or that it couldn't answer stay open.
6. Don't approve or request changes unless asked. Everything is posted to GitHub as the user.
7. Reply with a summary: threads answered and resolved, sections changed, and threads still open with what each needs.

The server instructions also tell agents that the review tools post as the user, so they only post what the user asked for.

## Reviewing over MCP

The review tools (`reply_to_review_comment`, `post_review_comment`, `resolve_review_thread`, `submit_review`, `post_pr_comment`) post to GitHub as the user the token belongs to, the same way the review tools of the guide viewer do (see [github-app.md](github-app.md#posting-comments-and-reviews)):

| Action | Posted with |
| --- | --- |
| Reply, line comment, PR comment, `COMMENT` review | The user's linked GitHub account. Without one, or if GitHub refuses it, the workspace connection, with the footer `Posted by <name> via Omakaze` that links to the guide. |
| Resolve or unresolve a conversation, `REQUEST_CHANGES` | Only the user's linked GitHub account |
| `APPROVE` | Only the user's linked GitHub account, and only when the workspace allows approvals by agents |

- Tool results say how a post went out: `as mayachen`, or `through the workspace connection (storefront-bot)`. `whoami` shows the linked account.
- Everything posted is recorded like posts from the guide viewer (`comments` rows with the user as author), so line comments and replies show as the user's own in the guide and the user can delete them there.
- The activity log names the client: `Maya Chen replied on src/lib/promo.ts in acme/storefront#128 via Claude Code`. The name is the OAuth client's registered name, or the name of the API token.
- Posts go out immediately; there are no pending reviews. Read-only tools are annotated with `readOnlyHint`; the review tools are not.

### Approvals by agents

An approval from an agent counts as the user's own approval on GitHub, including for branch protection rules, so `submit_review` with `APPROVE` is off by default. Admins and owners can allow it in **Settings → API tokens & MCP → Reviews by agents** with **Allow agents to approve pull requests**. The setting applies to every agent in the workspace, over OAuth and API tokens, and changes are recorded in the activity log. Members see whether it is on. Without it, the call fails with a message that tells the agent to ask the user.

## Writing a guide

The server instructions describe this workflow:

1. Call `get_pull_request` with the pull request URL to see the files, hunks and `head_sha`.
2. Read the code with `get_diff` (page through large diffs with the cursor) and use `read_file` for surrounding context.
3. Plan the sections. If `get_pull_request` shows a guide template, follow it.
4. Either call `create_guide` once with all sections, or call `start_guide`, then `add_section` for each section, then `finish_guide`.
5. Check the coverage report returned by `create_guide` or `finish_guide` and fix sections if important changes are uncovered.
6. Reply with the guide URL.

The instructions also ask the agent to pass `head_sha` from `get_pull_request`, and to read the pull request again and retry if it changed in the meantime (see [head_sha](#head_sha-and-changing-pull-requests)).

The authoring guidelines in the instructions, in short:

- Start with a summary of 2 to 5 sentences on what the pull request does and why, then the context a reviewer needs. A Mermaid diagram often helps for large changes.
- Group changes by feature or concern, not by file. Use line ranges when different parts of one file belong to different sections.
- Order sections so each builds on the previous one, for example data model and migrations, core logic, API, UI, tests, configuration and docs. Use 2 to 10 sections; small pull requests can have one or two.
- Every changed line should belong to a section. Incidental edits can go in a final section such as "Supporting changes".
- Explain what changed, why and how it works, and what a reviewer should check. Do not restate the diff line by line. Keep the tone factual and brief.

The full text is in `src/lib/guides/guidelines.ts`.

### Diff format

`get_diff` returns hunks in this format:

```text
### src/api/checkout.ts [modified, +14 -1, 1 hunk]
#1 @@ -10,6 +10,19 @@ export async function POST(req: Request) {
    10 |   const body = await req.json();
-  o11 |   const order = createOrder(body);
+   11 |   const parsed = schema.safeParse(body);
+   12 |   if (!parsed.success) return badRequest(parsed.error);
```

- `#<n>` is the hunk number within the file, used in refs such as `src/api/checkout.ts#1`.
- `+<n> |` is an added line with its line number in the new version.
- `-o<n> |` is a removed line with its line number in the old version (the merge base).
- ` <n> |` is an unchanged context line with its new line number.

### Markdown in bodies and summaries

Bodies and the summary are GitHub-flavored markdown: headings, lists, tables, task lists, fenced code blocks (highlighted on the server), Mermaid diagrams in `mermaid` code blocks, math with `$...$` and `$$...$$` (as in Pandoc, `$` only closes inline math when it follows a non-space character and isn't followed by a digit, so a price such as `$5` in running text stays text), GitHub alert blockquotes (NOTE, TIP, IMPORTANT, WARNING, CAUTION), images, `<video>` and `<details>`. Raw HTML is sanitized.

## Diff references

Each section has a list of refs that select the parts of the diff shown next to its explanation. A ref is a string or an object.

String forms:

| Ref | Selects |
| --- | --- |
| `path/to/file.ts` | Every hunk of the file |
| `path/to/file.ts#2` | Hunk 2 |
| `path/to/file.ts#1,3` or `path/to/file.ts#1-3` | Several hunks |
| `path/to/file.ts:40-88` | Lines 40 to 88 of the new version. `path:40` selects one line; `path:L40-L88` and `path:new:40-88` are also accepted. |
| `path/to/file.ts:old:40-88` | Lines 40 to 88 of the old version, for removed code |
| `path/to/file.ts#2:40-60` | Lines 40 to 60 within hunk 2 (`#2:old:40-60` for old-side lines) |

Object form:

```json
{
  "path": "src/api/checkout.ts",
  "hunks": [2],
  "lines": { "start": 40, "end": 88, "side": "new" },
  "note": "Total calculation",
  "expand": "function"
}
```

| Field | Description |
| --- | --- |
| `path` | Required. File path as listed by `get_pull_request`. |
| `hunks` | Hunk numbers. Combined with `lines`, only lines of those hunks inside the range are selected. |
| `lines` | `start`, `end` and `side` (`new`, the default, or `old`). |
| `note` | Short caption shown above this part of the diff. |
| `expand` | Initial context around the selection: `none` (default), `function` (the enclosing block, found by indentation) or `file` (the whole file). |

Rules:

- A path that exactly matches a changed file is always read as that file, even if it contains `#` or `:`.
- The string form holds the path, hunks and lines. A caption (`note`) or `expand` needs the object form.
- A file without a patch (binary or too large) has no hunks; reference it by path.
- A new-side line range also covers removed lines that sit inside it.
- Line ranges get up to three unchanged lines of context in the viewer. Readers can expand more context in steps of 20 lines, to the enclosing block, or to the whole file.
- Validation: a path that is not part of the pull request is an error (with suggestions for similar paths); a hunk number that does not exist is an error; a line range that touches no changed line is a warning, and it is shown as unchanged context.
- In the guide editor, refs are written one per line in the string form. ` +function` or ` +file` after the ref sets `expand`, and a caption follows after a `|` with a space on each side, for example `src/api/checkout.ts#2 +function | Validation`.

## diff: links

Section bodies and the summary can link to lines of the diff:

| Link | Target |
| --- | --- |
| `[label](diff:src/api/checkout.ts)` | The file |
| `[label](diff:src/api/checkout.ts#L10)` | Line 10 of the new version |
| `[label](diff:src/api/checkout.ts#L10-L24)` | Lines 10 to 24 of the new version |
| `[label](diff:src/api/checkout.ts#old:L5-L9)` | Lines 5 to 9 of the old version |

The `L` is optional and the path may be URL-encoded. Selecting a link highlights the lines in the right pane: in the current section if it shows the file, otherwise in the first section that references the file, otherwise in the **All files** view. In summary comments posted to GitHub, `diff:` links are replaced by their label.

## Coverage and "Other changes"

Coverage counts changed lines (added and removed lines, not context) and checks whether at least one section selects each of them.

`check_coverage` reports the coverage of the guide's current sections, listing up to 40 uncovered ranges as refs:

```text
412/431 changed lines covered (96%).
Not covered by any section:
- package.json#1 (3 changed lines)
- src/lib/format.ts:40-55 (16 changed lines)
```

When a guide is published with `auto_cover` left at `true`, the uncovered changes are put into a final section titled "Other changes" with the body "Changes that are not part of the sections above. Most are small supporting edits; review them before approving." Hunks without any covered line are referenced by hunk number and partly covered hunks by line range. The section is rebuilt each time the guide is finished.

`create_guide` and `finish_guide` report what your own sections cover, before "Other changes" is added. If they cover everything, the report is a single line such as `431/431 changed lines covered (100%).` Otherwise it lists the gaps and says where they went:

```text
Your sections: 412/431 changed lines covered (96%).
Not covered by any section:
- package.json#1 (3 changed lines)
- src/lib/format.ts:40-55 (16 changed lines)
These changes were added to the "Other changes" section. Move important ones into your own sections with update_section.
```

With `auto_cover: false`, the last line reads "These changes are not shown in any section." instead, no automatic section is added, and finishing a guide without sections fails if the pull request has changed files.

## Guide templates

Admins can set a guide template for the workspace and override it per repository: an ordered outline of sections with guidance, some of them required, and writing instructions (see [ai.md](ai.md#guide-templates)). `get_pull_request` and the [`create_guided_pr`](#prompt-create_guided_pr) prompt include it:

```text
Guide template "Bug fix" (set for this repository):
Use these sections in this order where they apply, with exactly these titles. Required sections must be in every guide; leave out optional ones that do not apply. Add other sections where the pull request needs them. The template takes precedence over the general advice on section order.
1. The bug (required): Symptoms, how to reproduce it, and who or what was affected.
2. Root cause (required): Why it happened, with diff: links to the faulty code.
3. Fix (required): What changed and why it fixes the bug without side effects.
4. Regression test (required): The test that fails without the fix.
5. Similar code (optional): Other places that could have the same bug, and whether they were checked.

Writing instructions:
Write in British English.
```

The first line says `(workspace default)` when the repository uses the workspace template. With writing instructions but no outline, only the instructions are shown; with neither, nothing is.

A guide records the template in effect when it was started. A section counts for a template section when its title matches, ignoring case and punctuation (or starts with it, as in "Tests and fixtures" for "Tests"), and it has a body or refs. When required sections are missing, `create_guide` and `finish_guide` still publish the guide and add a warning to their result:

```text
Template warning: the "Bug fix" template requires "Root cause", "Regression test", which are missing.
- Root cause: Why it happened, with diff: links to the faulty code.
- Regression test: The test that fails without the fix.
Add them with add_section, then call finish_guide again.
```

Members also see the missing sections above the guide.

## head_sha and changing pull requests

Hunk numbers and line numbers refer to a **diff snapshot**: a stored copy of the pull request's diff at one head commit. `get_pull_request`, `get_diff` and `read_file` use the snapshot of the current head and create it if needed. `get_pull_request` returns the full `head_sha`.

Pass that `head_sha` to `create_guide` or `start_guide`. It must match the pull request's current head commit: the full SHA, or a prefix of at least 7 characters (case does not matter). If the pull request has received new commits since you read it, the call fails with `The pull request has new commits (head is now abc1234). Re-read it and try again.` The REST API returns this as HTTP 409. Read the pull request again, check your refs against the new diff, and retry.

Without `head_sha`, the guide is created on the current head. If the pull request changed after you read it, your refs are validated against the new diff and can fail or select different code.

A guide keeps the snapshot it was written for. When the pull request receives new commits later, the guide page shows that the guide covers an older commit.

## Screenshots and videos

Use `upload_asset` to add screenshots or screen recordings to a section:

- Send the file as `content_base64`, or pass a public `url` to download (see [Downloads from a URL](#downloads-from-a-url)).
- Allowed types: `png`, `jpg`, `jpeg`, `gif`, `webp`, `avif`, `svg`, `mp4`, `webm`, `mov`, `m4v`, `pdf`. The type comes from the file name's extension, otherwise from `content_type` (or the downloaded file's `Content-Type`) if it is one of these types.
- The maximum size is `MAX_UPLOAD_MB` (default 50 MB). The MCP endpoint accepts request bodies large enough for a base64-encoded file of that size.
- The result contains the URL `<APP_URL>/api/assets/<id>/<filename>` and a snippet: `![alt](url)` for images, `<video src="url" controls></video>` for videos, `[alt](url)` for PDFs. Put the snippet in a section body with `add_section` or `update_section`.
- Files are served only to signed-in members of the workspace and to tokens of that workspace. They do not display outside Omakaze, for example in GitHub.
- Markdown images that point to a video file (`mp4`, `webm`, `mov`, `m4v`, `ogv`) are shown as video players.

### Downloads from a URL

With `url`, the server downloads the file itself (`src/lib/storage/remote.ts`):

- Only `http` and `https` URLs without user name or password are accepted.
- The host must be a public address. IP addresses in the URL and every address the host name resolves to are checked; loopback, private, link-local, shared (carrier-grade NAT), documentation, multicast and other reserved IPv4 and IPv6 ranges are refused, including IPv4 addresses embedded in IPv6 (mapped and NAT64). The connection is made to the address that was checked.
- Up to 3 redirects are followed, and each target is checked the same way.
- The download times out after 30 seconds without data and stops when it exceeds `MAX_UPLOAD_MB`.
- The file name comes from the `filename` parameter, or from the last part of the final URL if `filename` is empty.
- Downloads connect directly and do not use an outbound HTTP proxy (`NODE_USE_ENV_PROXY`). Where outbound traffic must go through a proxy, send files as `content_base64`.

## Example session

An agent asked to "Create a guided PR for https://github.com/acme/web/pull/412 using the Omakaze MCP." might make these calls:

1. `whoami` to confirm the workspace.
2. `get_pull_request`:

   ```json
   { "pr": "https://github.com/acme/web/pull/412" }
   ```

   The result lists 12 files with their hunks and `head_sha: 9f2c1e0b...`.
3. `get_diff` with `{ "pr": "acme/web#412" }`, then again with `{ "pr": "acme/web#412", "cursor": 37 }` until the footer says all hunks are shown.
4. `read_file` for context:

   ```json
   { "pr": "acme/web#412", "path": "src/api/checkout.ts", "ref": "base", "start_line": 1, "end_line": 120 }
   ```

5. `start_guide`:

   ```json
   {
     "pr": "acme/web#412",
     "head_sha": "9f2c1e0b...",
     "summary": "Adds a checkout endpoint that validates the cart, reserves stock and creates an order.\n\n```mermaid\nsequenceDiagram\n  Client->>API: POST /checkout\n  API->>DB: reserve stock\n  API-->>Client: order id\n```"
   }
   ```

   The result contains `guide_id`.
6. `add_section` for each section:

   ```json
   {
     "guide_id": "<guide_id>",
     "title": "Orders table",
     "body": "Adds the `orders` table. The unique index on [`cart_id`](diff:db/migrations/0042_orders.sql#L12) prevents double submission.",
     "refs": ["db/migrations/0042_orders.sql", "src/db/schema.ts#3"]
   }
   ```

   ```json
   {
     "guide_id": "<guide_id>",
     "title": "Checkout endpoint",
     "body": "Validates the request and reserves stock in one transaction. Check the error paths.",
     "refs": [
       { "path": "src/api/checkout.ts", "hunks": [1], "note": "Validation" },
       { "path": "src/api/checkout.ts", "lines": { "start": 102, "end": 136 }, "note": "Totals", "expand": "function" }
     ]
   }
   ```

7. `upload_asset` with a screenshot of the new form, then `update_section` to add the returned markdown to a section body.
8. `check_coverage` with `{ "guide_id": "<guide_id>" }`, and `add_section` or `update_section` for important uncovered changes.
9. `finish_guide` with `{ "guide_id": "<guide_id>" }`. The result contains the guide URL, which the agent returns to the user.

The same guide can be written with one `create_guide` call that contains the summary and all sections.

### Addressing review comments

The author of acme/storefront#128 asks their agent to "Address the review comments on https://github.com/acme/storefront/pull/128 using the Omakaze MCP." The agent might:

1. Call `list_review_comments` with `{ "pr": "acme/storefront#128", "state": "open" }` and find Sam's question on `src/lib/promo.ts:37`, shown in section 2 of the guide.
2. Read the lines with `get_diff` (`{ "pr": "acme/storefront#128", "hunks": ["src/lib/promo.ts#1"] }`).
3. Answer in the thread:

   ```json
   { "pr": "acme/storefront#128", "thread_id": "PRRT_kwDOAbc123", "body": "No, `ends_at` is exclusive: a code is expired once `endsAt <= now`. For a code that should work all of Sunday, set `ends_at` to Monday 00:00." }
   ```

4. Make section 2 clearer: `get_guide` for its `section_id` and body, then `update_section` with the new body.
5. Resolve the thread with `resolve_review_thread` and `{ "pr": "acme/storefront#128", "thread_id": "PRRT_kwDOAbc123" }`.
6. Suggest a code comment on lines 36 and 37:

   ```json
   {
     "pr": "acme/storefront#128",
     "path": "src/lib/promo.ts",
     "start_line": 36,
     "line": 37,
     "body": "Say it in the code too:",
     "suggestion": "  // ends_at is exclusive: a code ending Monday 00:00 works all of Sunday.\n  if (promo.startsAt && promo.startsAt > now) return { ok: false, reason: \"not_started\" };\n  if (promo.endsAt && promo.endsAt <= now) return { ok: false, reason: \"expired\" };"
   }
   ```

7. Reply to the user with what it answered, changed and resolved, and the threads still open.

## Errors

Tool errors are returned as results with `isError: true`. Common messages:

| Situation | Message |
| --- | --- |
| `pr` cannot be parsed | `Could not read "<pr>". Use a URL like https://github.com/owner/repo/pull/123.` |
| Repository not followed (member) | `owner/repo is not connected to the "<workspace>" workspace. Ask an admin to add it at <APP_URL>/w/<slug>/repos.` |
| No connection can access the repository (admin) | `None of the GitHub connections of "<workspace>" can access owner/repo. Connect GitHub at <APP_URL>/w/<slug>/settings/github.` |
| Repository without a connection | `owner/repo has no GitHub connection. Add a connection that can access it, or add the repository again on the Repositories page.` |
| GitHub returns 404 | `Not found on GitHub. Check the pull request URL and that this workspace's GitHub connection can access the repository.` |
| Invalid refs | `Invalid diff references:` followed by one line per problem, for example `- src/a.ts#4: Hunk 4 does not exist. src/a.ts has 3 hunk(s).` `create_guide` prefixes the section: `Section 2 (Checkout endpoint): ...` |
| Pull request moved on | `The pull request has new commits (head is now abc1234). Re-read it and try again.` |
| Guide of another workspace | `Guide <id> not found in this workspace.` |
| Editing or finishing a failed guide | `This guide failed. Start a new one.` |
| Incomplete `section_ids` | `Provide every section id of the guide exactly once.` |
| Finishing without sections and `auto_cover: false` | `Add at least one section before finishing the guide.` |
| Upload problems | `Unsupported file type. Allowed: ...`, `Files are limited to 50 MB.`, `Provide content_base64 or url.` |
| Line not in the diff | `Line 99 of src/lib/promo.ts is not in the diff. GitHub accepts comments only on lines of a hunk: ...` |
| Range across hunks | `start_line 13 is in hunk #1 and line 42 in hunk #2. A comment can only span lines of one hunk.` |
| Suggestion on removed lines | `A suggested change replaces lines of the new version. Comment on side "new" lines to suggest one.` |
| Thread of another pull request | `Thread <id> is not part of owner/repo#123. Use a thread_id from list_review_comments.` |
| No linked GitHub account (resolve, request changes, approve) | `Resolving conversations needs the user's own linked GitHub account; Omakaze never does it through the workspace connection. Link one at <APP_URL>/account, or ask the user to do it on GitHub.` |
| Approvals by agents are off | `Agents can't approve pull requests in the "<workspace>" workspace. Ask the user to approve it themselves; a workspace admin can allow approvals by agents at <APP_URL>/w/<slug>/settings/tokens.` |
| Download problems (`url`) | `Private network addresses are not allowed`, `<host> resolves to a private network address`, `URLs with credentials are not supported`, `Too many redirects`, `Download failed (404)`, `Download timed out` |
