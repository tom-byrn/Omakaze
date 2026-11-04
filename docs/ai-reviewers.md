# AI code reviewers

Many teams run AI code reviewers on their pull requests: **Claude Code Review** (the [Claude Code GitHub Action](https://github.com/anthropics/claude-code-action) in a review workflow), **Greptile**, **CodeRabbit**, **GitHub Copilot** code review, or another bot. Omakaze works with them:

- **Automatic guides wait for them.** When automation creates a guide (see [ai.md](ai.md#automation)), the guide starts right away but is only written once the AI reviewers are done, or when the wait runs out.
- **Their findings go into the guide.** The built-in AI gets the reviewers' inline comments and summaries next to the diff, and adds a one-line verdict on each finding (does it hold, in a few words) to the section that covers its line. It doesn't reword the finding: the comment itself is shown next to the code.
- **The viewer shows them.** The guide overview lists every finding with the section it is in, each section lists the findings on its lines, and the reviewers' comments in the diff carry an **AI** label with the reviewer's name.
- **Agents see them too.** `list_review_comments` over MCP marks comments by AI reviewers with the reviewer's name.

The code is in `src/lib/ai-reviewers`: `config.ts` (presets and matching), `signals.ts` (states, the wait decision and the findings, unit tested in `tests/ai-reviewers.test.ts`) and `service.ts` (reading GitHub and the wait in the job queue).

## Settings

**Settings → Automation → AI code reviewers** (owners and admins):

| Setting | Default | Meaning |
| --- | --- | --- |
| **Wait for AI code reviewers before writing automatic guides** | on | Automatic guides wait as described below. Off: they are written right away, still with the findings that are already in. |
| **Wait at most** | 15 minutes | The longest wait (1 to 120 minutes). |
| **Reviewers** | all on | The built-in reviewers. Turn off the ones a workspace doesn't use, so a guide doesn't watch for them. |
| **Your own reviewers** | none | Up to 10 more: a name, the GitHub logins the bot posts as, and the names of its check runs or commit statuses. |

The built-in reviewers:

| Reviewer | Posts as | Progress on the head commit |
| --- | --- | --- |
| Claude Code Review | `claude[bot]` | Check run `claude-review` (the job name of the example review workflow) or `Claude Code Review` |
| Greptile | `greptile-apps[bot]` | Commit status or check `Greptile Review` |
| CodeRabbit | `coderabbitai[bot]` | Commit status `CodeRabbit` |
| GitHub Copilot | `copilot-pull-request-reviewer[bot]` | A review request for `Copilot` |

Logins match with or without the `[bot]` suffix and in any case. Check names match exactly or followed by a space, so a matrix job such as `claude-review (ubuntu-latest)` matches `claude-review`. A Claude Code workflow that runs under a different job name, or posts with the workflow's `GITHUB_TOKEN` (as `github-actions[bot]`), can be added under **Your own reviewers** with its job name and login.

Manually started guides (**Generate with AI**, the REST API) never wait; they are written with the findings that are in at that moment.

## How the wait works

The `generate_guide` job of an automatic guide creates the guide version (status `generating`) and then, before any AI request, reads from GitHub for the pull request's head commit:

- check runs (`GET /repos/{owner}/{repo}/commits/{sha}/check-runs`) and commit statuses (`…/commits/{sha}/statuses`, the newest per context);
- reviews, review comments and comments in the pull request conversation;
- requested reviewers.

Each enabled reviewer gets a state:

| State | When |
| --- | --- |
| reviewing | One of its check runs is queued or in progress, or its commit status is pending |
| done | Its check run completed, its commit status is no longer pending, or it submitted a review of the head commit |
| requested | Its review is requested (GitHub Copilot) and nothing else is known |
| not seen | None of the above |

The job keeps waiting while a reviewer is reviewing or requested, and for at least two minutes after the wait starts, because reviewers announce themselves with a check run, a status or a review request a little after a push. It stops as soon as every enabled reviewer is done, and at the latest after **Wait at most**. While it waits, the job is rescheduled every 20 seconds without using up an attempt; webhooks about reviews (`pull_request_review`), check runs (`check_run`) and commit statuses (`status`) for the pull request wake it right away.

The guide page shows **Waiting for AI code reviewers** with each reviewer's state, a link to its check or review, and a **Skip waiting** button that writes the guide right away with the reviews that are in. The progress log records each change. The outcome (all reviews in, stopped waiting, skipped, or no reviewer reviewed the pull request) is stored on the guide (`guides.ai_reviews`) and shown in the overview.

When new commits are pushed while a guide waits, the waiting version (it has no sections yet) is replaced by one for the new head commit, whether or not **Create a new version when commits are pushed** is on: the reviewers review the new commit, too.

## What the AI is given

The findings are added after the diff (single request) or after the outline (large pull requests), grouped by reviewer:

- review bodies of the head commit and each reviewer's latest comment in the conversation (CodeRabbit and Greptile keep one summary comment up to date), as summaries;
- inline comments on lines of the current diff (not replies, not outdated comments), with the path and the line as the diff numbers it (`o<n>` for removed lines).

HTML comments and markup that bots use for hidden state are removed, each comment is cut at 2,000 characters (summaries at 4,000) and all findings at 24,000. For large pull requests, each section is written with the inline findings on its own lines. The system prompt then asks the model to keep its response to each finding very brief: one short sentence in the section that covers the line, with the reviewer's name, a `diff:` link and its verdict in a few words (in a `[!WARNING]` alert for likely bugs), without restating, paraphrasing or summarizing the finding, since readers see the comment next to the line. The summary gets at most one sentence on the findings that matter.

## Webhooks and permissions

The GitHub App manifest and new repository webhooks subscribe to `check_run` and `status` in addition to the review events. Apps and repository webhooks created earlier don't receive them; `/admin` lists the missing events (see [github-app.md](github-app.md#apps-created-before-an-event-was-added)). Without them the wait still works: it looks at GitHub every 20 seconds and on every review webhook.

Reading check runs needs the Checks permission (read), which the manifest grants. A personal access token without it still works: the reviewers' commit statuses, reviews and review requests are read, and a failed read of check runs is logged and treated as empty.
