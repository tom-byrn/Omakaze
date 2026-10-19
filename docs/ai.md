# AI generation

Built-in generation is optional. Agents connected over [MCP](mcp.md) write guides with their own model, and a workspace without a provider works normally: **Generate with AI** and automation are simply unavailable. To have Omakaze write guides itself, configure a model.

The code is in `src/lib/ai/`: `config.ts` (providers and defaults), `providers.ts` (model calls through the [Vercel AI SDK](https://ai-sdk.dev)), `models.ts` (model lists) and `generate.ts` (the pipeline).

## Providers

| Provider | Value | AI SDK package | Default model | Default base URL | API key |
| --- | --- | --- | --- | --- | --- |
| Anthropic | `anthropic` | `@ai-sdk/anthropic` | `claude-opus-5-5` | `https://api.anthropic.com` | Required |
| OpenAI | `openai` | `@ai-sdk/openai` (Responses API) | none, set a model | `https://api.openai.com/v1` | Required |
| Google | `google` | `@ai-sdk/google` | none, set a model | `https://generativelanguage.googleapis.com/v1beta` | Required |
| OpenRouter | `openrouter` | `@ai-sdk/openai-compatible` | `anthropic/claude-opus-5.5` | `https://openrouter.ai/api/v1` | Required |
| Ollama | `ollama` | `@ai-sdk/openai-compatible` | none, set a model | `http://localhost:11434/v1` | Optional |
| LM Studio | `lmstudio` | `@ai-sdk/openai-compatible` | none, set a model | `http://localhost:1234/v1` | Optional |
| OpenAI-compatible (vLLM, LiteLLM, gateways and others) | `openai-compatible` | `@ai-sdk/openai-compatible` | none, set a model | `http://localhost:11434/v1` | Optional |

For Anthropic, a base URL without `/v1` gets it appended, so `https://proxy.example.com` and `https://proxy.example.com/v1` both work.

### Local models

The base URL is the address as seen from the Omakaze server. When Omakaze runs in Docker, `localhost` is the container itself: use `http://host.docker.internal:11434/v1` for Ollama on the host, or the Compose service name, for example `http://ollama:11434/v1`.

Guides need a long context. Ollama runs models with a small context window by default and drops the start of longer prompts without an error, so raise it (for example `OLLAMA_CONTEXT_LENGTH=65536`) or expect weaker guides for large pull requests. The diff budget for models other than Claude and Gemini is 240,000 characters per request, roughly 60,000 tokens.

## Configuration

A workspace uses its own provider if one is set, and the instance default otherwise:

1. **Workspace.** Admins pick a provider in **Settings → AI provider** (nothing is selected until they do), then set the API key, base URL and model. The key is encrypted at rest and never shown again. **Load models** (also triggered by focusing the model field) asks the provider for its model list with the entered key, or the saved key for the same provider, and offers the models as suggestions; any model name can still be typed. It uses `GET <base URL>/models` (`/v1/models` for Anthropic); OpenAI's embedding, audio and image models and Gemini models without text generation are left out. OpenRouter, Ollama, LM Studio and OpenAI-compatible lists load without a key. **Test connection** sends a small request with the entered values. **Remove provider** clears the provider, model, base URL and key, but not the [guide template](#guide-templates) and its writing instructions.
2. **Instance.** `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY` and `AI_BASE_URL` set a default for every workspace without its own provider. See [configuration.md](configuration.md#ai-defaults).

Members can also use [their own ChatGPT plan](#chatgpt-plans) for guides they start, if the workspace allows it.

A configuration is usable when it has a model (given or the provider's default) and, for providers that require one, an API key. If a workspace selects a provider, the instance default is not used for that workspace. **Settings → AI provider** shows which configuration is in effect.

## ChatGPT plans

Members with a ChatGPT Plus or Pro plan can generate guides on that plan instead of the workspace provider. It uses [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source), OpenAI's supported way for open-source apps to send requests on a user's ChatGPT plan. It does not use the Codex CLI's login, and it never calls ChatGPT's own backend.

- **Off by default per workspace.** An admin turns on **Allow members to use their own ChatGPT plan** in **Settings → AI provider**. Guides on a ChatGPT plan go to OpenAI under the member's account, even when the workspace provider is a local model.
- **Per user.** Each member connects their own account in **Account → ChatGPT plan** and picks a model from the models their plan includes. **Use my ChatGPT plan for guides I generate** switches it off without signing out.
- **Only for guides the member starts.** **Generate with AI**, **Regenerate** and `POST /api/v1/generate` with the member's token use their plan. [Automation](#automation) has no user and always uses the workspace provider, so a member's plan never pays for other people's guides.
- **Usage.** Requests count toward the plan's usage limits, which ChatGPT shares across the apps where the member uses it. Each member can see and cap Omakaze's usage at [chatgpt.com/settings/usage](https://chatgpt.com/settings/usage). When the limit is reached, the guide fails with a link there; it is not retried and does not fall back to the workspace provider.

### Signing in

Sign in with ChatGPT only redirects to a loopback address, and the Omakaze server is usually on another machine. **Continue with ChatGPT** opens OpenAI's sign-in in a new tab. After the member allows Omakaze to use their plan, the browser goes to `http://127.0.0.1:1456/auth/callback?...`, which does not load. The member pastes that address into Omakaze, which checks the `state`, exchanges the code with PKCE, and verifies the ID token against OpenAI's keys. The pending sign-in is kept in an encrypted cookie for 15 minutes.

The first sign-in registers Omakaze for that ChatGPT account (`dynamic_agent_client`), and later sign-ins reuse the issued client ID. The instance has one host ID (`ext_agent_host_id`, a random `urn:uuid:` kept in `instance_settings`). Access, refresh and ID tokens are encrypted at rest like other secrets. Access tokens are refreshed shortly before they expire, one refresh at a time per connection. **Sign out** revokes the refresh token and clears the tokens but keeps the registration. Deleting the Omakaze account revokes it too.

### Requests

Requests go to `POST https://api.openai.com/v1/responses` with the member's access token. They set `store: false` and `stream: true`, send no output limit, and pass instructions as developer messages. Fields that plan requests reject are removed. Errors such as `subscription_sharing_usage_limit_exceeded` are shown with what to do next. Temporary unavailability is retried like other server errors.

Set `CHATGPT_PLAN_ENABLED=false` to hide the feature on an instance. OpenAI allows plan usage for open-source and self-hosted apps without an application. If you offer Omakaze as a paid or hosted service to other people, [request access](https://openai.com/form/sign-in-with-chatgpt-interest/) from OpenAI first, or turn the feature off.

## Starting generation

- **Generate with AI** on a pull request without a guide, or **Regenerate** on a pull request with one. Any member can use them. If the latest guide is still being generated, the button opens it instead of starting another, unless that guide is [abandoned](#abandoned-guides).
- [Automation](#automation): a guide for new pull requests and a new version on push.
- `POST /api/v1/generate` (see [api.md](api.md#post-apiv1generate)).

Generation runs in the background worker. Each run creates a new guide version in the `generating` state: right away for the button and the API, and when the job starts for automation. People who open the pull request see the progress messages and the sections as they are added. When the run ends, the guide is `ready`, or `failed` with the error message.

## How a guide is generated

The generator works from the stored diff snapshot, the pull request title, branch names and description (first 8,000 characters). It does not read other files of the repository.

1. **Budget.** The diff is rendered as text with line and hunk numbers (the same format as the MCP [`get_diff`](mcp.md#diff-format) tool). The budget is 600,000 characters for the Anthropic and Google providers and for model names that contain `claude` or `gemini`, and 240,000 characters for other models.
2. **Small and medium pull requests.** If the rendered diff fits the budget, one request returns the title, summary and all sections with their refs.
3. **Large pull requests.** Otherwise:
   1. Files are grouped into batches of up to a third of the budget. For each batch, the model writes a one-sentence summary of every hunk; up to three batches run at the same time.
   2. A planning request receives the list of files and hunks with these summaries and returns the title, summary and an ordered list of sections, each with an intent and refs.
   3. For each planned section, one request receives only the code its refs select (up to half the budget) and writes the section body. Sections are added as they are written.
4. **Reference cleanup.** Refs to files that are not in the pull request and hunk numbers that do not exist are dropped and noted in the guide's progress log. If a section's refs are still invalid, the section is added without refs.
5. **Template check.** If the [guide template](#guide-templates) has required sections and the answer (step 2) or the plan (step 3.2) lacks one, the request is sent once more with the missing titles and their guidance appended. The second answer is used either way, or the first if the second is not valid. Required sections that are still missing are noted in the progress log; the guide is not failed for it.
6. **Publishing.** The guide is finished like any other: uncovered changes go to the automatic "Other changes" section (see [mcp.md](mcp.md#coverage-and-other-changes)), and a summary comment is queued if the workspace posts them.

A pull request without file changes gets a guide with the summary "This pull request has no file changes."

The system prompt contains the same authoring guidelines that MCP agents receive (`src/lib/guides/guidelines.ts`), the diff format, and the guide template with its writing instructions.

## Structured output and fallbacks

Every request is streamed with the AI SDK's `streamText` and asks for JSON that matches a schema, passed as the provider's structured output format. The JSON is taken from the response text (a code fence or text around the object is tolerated) and validated; if it is not valid JSON or does not match, the request is repeated once with the validation error appended.

If the provider rejects the structured output format with a 400, 404 or 422 error that mentions the response format or schema, the request is sent again without it and the JSON is taken from the text.

| Provider | Details |
| --- | --- |
| Anthropic | Messages API. Models with native structured outputs get the schema as `output_config.format`; others use the AI SDK's JSON tool. Effort is set to `high` for models that accept it. For `claude-opus-5-5`, `claude-opus-5`, `claude-sonnet-5-5` and `claude-fable-5-1` on `https://api.anthropic.com`, the request sets `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`), which retries a declined request on Anthropic's recommended fallback model. |
| OpenAI | Responses API with a strict JSON schema. |
| ChatGPT plan | Responses API at `https://api.openai.com/v1` with the member's OAuth token and a strict JSON schema; see [ChatGPT plans](#requests). |
| Google | Gemini API with a response schema. |
| OpenRouter, Ollama, LM Studio, OpenAI-compatible | `POST <base URL>/chat/completions` with `response_format` set to a strict JSON schema. OpenRouter requests also send `HTTP-Referer: <APP_URL>` and `X-Title: Omakaze`. |

Output limits per request: 64,000 tokens for the single-request path with Anthropic, none for ChatGPT plans, and 32,000 tokens otherwise. Requests time out after 20 minutes.

## Errors and retries

| Error | Result |
| --- | --- |
| API key rejected | The guide fails with the error message. |
| The model declines, or the response is cut off at the token limit | The guide fails. Try a model with a larger output limit for cut-off responses. |
| Rate limit (429) or provider error (5xx), server not reachable, empty or malformed responses | The job is retried once after a delay. The AI SDK also retries failed requests twice on its own. |
| Other request errors | The guide fails with the provider's message. |

A retry continues the same guide version. Sections written by the failed attempt are removed first, and the progress log notes "Starting over". If the last attempt fails, the guide is marked as failed. A job that is picked up again after the worker process stopped starts over the same way.

The progress log of a failed guide shows the error, and **Copy agent prompt** on the page offers the MCP route instead.

### Abandoned guides

A guide that stays in the `generating` state with no change (no new section, progress message, title or summary) for 60 minutes is marked as failed with the message "Nothing changed for 60 minutes, so the guide was marked as abandoned. Start a new version." The worker checks every 30 seconds. This covers guides from agents that never call `finish_guide` as well as generation that stopped. Guides with a built-in generation job that is still queued or running are left alone, since one model call can take a long time. Abandoned guides are not treated as being generated: **Generate with AI** and **Regenerate** start a new version, and automation applies its usual rules.

## Guide templates

A guide template is an ordered outline of sections, each with a title, short guidance on what belongs there and whether it is required, plus free-text writing instructions. It applies wherever a guide is written: built-in generation, agents over [MCP](mcp.md#guide-templates), the [REST API](api.md#post-apiv1guides) and the editor. The code is in `src/lib/guides/templates.ts`.

- **Workspace.** Admins set it in **Settings → Guide template**. **Start from** loads a built-in starter into the editor, which can then be changed: **Feature** (Data model, Core logic, API and UI, Tests, Rollout), **Bug fix** (The bug, Root cause, Fix, Regression test, Similar code), **Migration** (Schema changes, Data backfill, Code changes, Deploy and rollback, Tests) or **None**. A template has up to 15 sections with different titles.
- **Writing instructions** (up to 4,000 characters), for example "Write in British English." This is the setting earlier versions showed as **Extra instructions** under **Settings → AI provider**, so saved instructions keep applying; they now also go to MCP agents.
- **Repository.** **Repository settings** (`/w/<slug>/<owner>/<repo>/settings`, linked from the repository page and the **Repositories** page) can keep the workspace outline or use an **Own outline**, including none. **Additional instructions for this repository** come after the workspace's writing instructions in either case.
- **Per guide.** When a guide version is started, the template in effect for its repository is stored with it (`guides.template`). Checks and the editor use that copy, so changing the template later does not change what older guides are measured against.

The prompt gives the sections in order with exactly these titles, says which are required, and asks for optional ones only where they apply; other sections can be added. **Settings → Guide template** and **Repository settings** show the text under **What writers receive**.

A guide section counts for a template section when its title is the same, ignoring case and punctuation, or starts with it as whole words ("Tests and fixtures" counts for "Tests"). It must also have an explanation or diff references, and the automatic "Other changes" section never counts. A guide without a required section is still published:

- the built-in AI asks once more (see [How a guide is generated](#how-a-guide-is-generated));
- `create_guide`, `finish_guide` and `POST /api/v1/guides` report the missing sections;
- members see "Missing from the … template" above the guide, with a link to the editor. It is not shown while a guide is being generated.

In the editor, **Start a draft** creates the template's sections with empty explanations and shows each section's guidance as placeholder text. **Publish** leaves out template sections that are still empty (no explanation and no refs); required ones are then reported as missing. A checklist above the sections shows which template sections are written.

## Automation

**Settings → Automation** has four switches (defaults in brackets):

- **Create a guide for every new pull request** (off)
- **Create a new version when commits are pushed** (off)
- **Skip draft pull requests** (on)
- **Post a summary comment on GitHub** (off)

Repositories can override the first switch on the **Repositories** page: **Workspace default**, **On** or **Off**.

### When a guide is generated automatically

Omakaze checks a pull request when:

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

It is posted with the workspace's GitHub connection. The links open Omakaze, which requires signing in as a member of the workspace.

## Cost and privacy

- The diff, the pull request title, description and branch names, and file paths are sent to the configured provider. Do not configure a third-party provider for code that must not leave your network.
- A local model through Ollama, LM Studio or another OpenAI-compatible server on your network (for example Ollama at `http://ollama:11434/v1`) keeps the data there.
- In workspaces that allow [ChatGPT plans](#chatgpt-plans), guides that members start on their plan are sent to OpenAI under their own account, whatever the workspace provider is. Leave the setting off for code that must stay on your network.
- Large pull requests use several requests: one per batch of hunk summaries, one for the plan and one per section. Automation can create a new version on every push, and each version is a full generation.
- Workspace API keys are stored encrypted with a key derived from `APP_SECRET`.
- Agents connected over MCP use their own model and their own provider account. Omakaze makes no model requests for guides written through MCP, `POST /api/v1/guides` or the editor.
