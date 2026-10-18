# AI generation

Besides agents connected over [MCP](mcp.md), Guided PRs can write guides itself with a model you configure. The code is in `src/lib/ai/`: `config.ts` (providers and defaults), `providers.ts` (API calls) and `generate.ts` (the pipeline).

## Providers

| Provider | Value | Default model | Default base URL | API key |
| --- | --- | --- | --- | --- |
| OpenRouter | `openrouter` | `anthropic/claude-opus-5.5` | `https://openrouter.ai/api/v1` | Required |
| Anthropic | `anthropic` | `claude-opus-5-5` | `https://api.anthropic.com` | Required |
| OpenAI | `openai` | none, set a model | `https://api.openai.com/v1` | Required |
| OpenAI-compatible (Ollama, vLLM, LM Studio and others) | `openai-compatible` | none, set a model | `http://localhost:11434/v1` | Optional |

OpenRouter is the default selection in the settings form.

## Configuration

A workspace uses its own provider if one is set, and the instance default otherwise:

1. **Workspace.** Admins set the provider, model, API key and base URL in **Settings → AI provider**. The key is encrypted at rest and never shown again. **Test connection** sends a small request with the entered values. **Remove provider** clears the provider, model, base URL and key, but not the [extra instructions](#workspace-instructions).
2. **Instance.** `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY` and `AI_BASE_URL` set a default for every workspace without its own provider. See [configuration.md](configuration.md#ai-defaults).

A configuration is usable when it has a model (given or the provider's default) and, for providers that require one, an API key. If a workspace selects a provider, the instance default is not used for that workspace. **Settings → AI provider** shows which configuration is in effect.

## Starting generation

- **Generate with AI** on a pull request without a guide, or **Regenerate** on a pull request with one. Any member can use them. If the latest guide is still being generated, the button opens it instead of starting another, unless that guide is [abandoned](#abandoned-guides).
- [Automation](#automation): a guide for new pull requests and a new version on push.
- `POST /api/v1/generate` (see [api.md](api.md#post-apiv1generate)).

Generation runs in the background worker. Each run creates a new guide version in the `generating` state: right away for the button and the API, and when the job starts for automation. People who open the pull request see the progress messages and the sections as they are added. When the run ends, the guide is `ready`, or `failed` with the error message.

## How a guide is generated

The generator works from the stored diff snapshot, the pull request title, branch names and description (first 8,000 characters). It does not read other files of the repository.

1. **Budget.** The diff is rendered as text with line and hunk numbers (the same format as the MCP [`get_diff`](mcp.md#diff-format) tool). The budget is 600,000 characters for the Anthropic provider and for model names that contain `claude` or `gemini`, and 240,000 characters for other models.
2. **Small and medium pull requests.** If the rendered diff fits the budget, one request returns the title, summary and all sections with their refs.
3. **Large pull requests.** Otherwise:
   1. Files are grouped into batches of up to a third of the budget. For each batch, the model writes a one-sentence summary of every hunk; up to three batches run at the same time.
   2. A planning request receives the list of files and hunks with these summaries and returns the title, summary and an ordered list of sections, each with an intent and refs.
   3. For each planned section, one request receives only the code its refs select (up to half the budget) and writes the section body. Sections are added as they are written.
4. **Reference cleanup.** Refs to files that are not in the pull request and hunk numbers that do not exist are dropped and noted in the guide's progress log. If a section's refs are still invalid, the section is added without refs.
5. **Publishing.** The guide is finished like any other: uncovered changes go to the automatic "Other changes" section (see [mcp.md](mcp.md#coverage-and-other-changes)), and a summary comment is queued if the workspace posts them.

A pull request without file changes gets a guide with the summary "This pull request has no file changes."

The system prompt contains the same authoring guidelines that MCP agents receive (`src/lib/guides/guidelines.ts`), the diff format, and the workspace's extra instructions.

## Structured output and fallbacks

Every request asks for JSON that matches a schema. The response is validated; if it is not valid JSON or does not match, the request is repeated once with the validation error appended.

| Provider | How JSON is requested |
| --- | --- |
| Anthropic | Messages API, streamed. For models that support these options, the JSON schema is passed as structured output and effort is set to `high`; otherwise the JSON is taken from the response text. For `claude-opus-5-5`, `claude-opus-5`, `claude-sonnet-5-5` and `claude-fable-5-1` on `https://api.anthropic.com`, the request opts in to Anthropic's server-side fallback (beta `server-side-fallback-2026-07-01`), which retries a declined request on Anthropic's recommended fallback model. |
| OpenRouter, OpenAI, OpenAI-compatible | `POST <base URL>/chat/completions`. The first attempt uses `response_format` with a strict JSON schema, then `json_object`, then no `response_format`. The next format is tried only when the provider rejects the request with an error that mentions the response format or schema. OpenRouter requests also send `HTTP-Referer: <APP_URL>` and `X-Title: Guided PRs`. |

Output limits per request: 64,000 tokens for the single-request path with Anthropic and 32,000 tokens otherwise (`max_completion_tokens` for OpenAI, `max_tokens` for the others). Requests time out after 20 minutes.

## Errors and retries

| Error | Result |
| --- | --- |
| API key rejected | The guide fails with the error message. |
| The model declines, or the response is cut off at the token limit | The guide fails. Try a model with a larger output limit for cut-off responses. |
| Rate limit (429) or provider error (5xx), empty or malformed responses | The job is retried once after a delay. The Anthropic SDK also retries twice on its own. |
| Other request errors | The guide fails with the provider's message. |

A retry continues the same guide version. Sections written by the failed attempt are removed first, and the progress log notes "Starting over". If the last attempt fails, the guide is marked as failed. A job that is picked up again after the worker process stopped starts over the same way.

The progress log of a failed guide shows the error, and **Copy agent prompt** on the page offers the MCP route instead.

### Abandoned guides

A guide that stays in the `generating` state with no change (no new section, progress message, title or summary) for 60 minutes is marked as failed with the message "Nothing changed for 60 minutes, so the guide was marked as abandoned. Start a new version." The worker checks every 30 seconds. This covers guides from agents that never call `finish_guide` as well as generation that stopped. Abandoned guides are not treated as being generated: **Generate with AI** and **Regenerate** start a new version, and automation applies its usual rules.

## Workspace instructions

**Extra instructions** in **Settings → AI provider** are appended to the system prompt as "Additional instructions from this workspace", for example "Always include a section on database migrations." They apply to every built-in generation in the workspace, with the workspace provider or the instance default. They have their own form (**Save instructions**, up to 4,000 characters) and are not changed by **Remove provider**.

## Automation

**Settings → Automation** has four switches (defaults in brackets):

- **Create a guide for every new pull request** (off)
- **Create a new version when commits are pushed** (off)
- **Skip draft pull requests** (on)
- **Post a summary comment on GitHub** (off)

Repositories can override the first switch on the **Repositories** page: **Workspace default**, **On** or **Off**.

### When a guide is generated automatically

Guided PRs checks a pull request when:

- a `pull_request` webhook arrives with the action `opened`, `reopened`, `synchronize` or `ready_for_review`, or
- the poller finds an open pull request that was updated in the last three days.

A generation job is queued when all of these are true:

1. The pull request is open.
2. Automatic guides are on for the repository: its own setting, or the workspace switch when the repository uses **Workspace default**.
3. The pull request is not a draft, or **Skip draft pull requests** is off.
4. An AI provider is configured.
5. The pull request has no guide yet, or its latest guide was written for a different head commit, is not being generated (an [abandoned](#abandoned-guides) guide does not count), and **Create a new version when commits are pushed** is on.

At most one job per repository, pull request and head commit is queued or running at a time. Review webhooks (`pull_request_review`, `pull_request_review_comment`) do not start generation.

### Polling

When `POLL_INTERVAL_SECONDS` is greater than 0, the worker syncs every repository that has automatic guides turned on once per interval: all open pull requests (up to 300) and the 50 most recently closed ones. It then applies the rules above to open pull requests updated in the last three days. Polling is the fallback when GitHub cannot deliver webhooks; see [self-hosting.md](self-hosting.md#webhooks-and-polling).

### Summary comment

With **Post a summary comment on GitHub** on, a job runs every time a guide of the workspace is published, whether it was written by an agent, the built-in AI, the REST API or the editor. It posts one comment in the pull request conversation and updates the same comment for later versions; if that comment was deleted, a new one is created. The comment contains:

- the heading "Guided walkthrough";
- the first paragraphs of the guide summary (up to about 900 characters), without headings, Mermaid blocks, images and videos (uploads need a sign-in and would not load on GitHub), and with `diff:` links reduced to their label;
- a table of the sections with links to each one and the number of files it references;
- a link to the guide and the version and short head commit.

It is posted with the workspace's GitHub connection. The links open Guided PRs, which requires signing in as a member of the workspace.

## Cost and privacy

- The diff, the pull request title, description and branch names, and file paths are sent to the configured provider. Do not configure a third-party provider for code that must not leave your network.
- A local model through the `openai-compatible` provider (for example Ollama at `http://ollama:11434/v1`) keeps the data on your network.
- Large pull requests use several requests: one per batch of hunk summaries, one for the plan and one per section. Automation can create a new version on every push, and each version is a full generation.
- Workspace API keys are stored encrypted with a key derived from `APP_SECRET`.
- Agents connected over MCP use their own model and their own provider account. Guided PRs makes no model requests for guides written through MCP, `POST /api/v1/guides` or the editor.
