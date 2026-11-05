/** Prompt users paste into their coding agent to create a guide for one PR. */
export function agentPrompt(prUrl: string): string {
  return `Create a guided PR for ${prUrl} using the Omakaze MCP.`;
}

/** Prompt that asks an agent to answer the review comments on a PR and improve its guide. */
export function reviewCommentsPrompt(prUrl: string): string {
  return `Address the review comments on ${prUrl} using the Omakaze MCP.`;
}

/** Prompt that connects an agent to this instance's MCP server. */
export function setupPrompt(appUrl: string): string {
  const mcpUrl = `${appUrl}/api/mcp`;
  return `Set up the Omakaze MCP server so you can create guided pull request walkthroughs.

1. Add the remote MCP server (Streamable HTTP):
   - Claude Code: claude mcp add --transport http omakaze ${mcpUrl}
   - Codex: codex mcp add omakaze --url ${mcpUrl}
   - Cursor / VS Code / other clients: add an HTTP MCP server named "omakaze" with the URL ${mcpUrl}
2. Authenticate when the client asks (it opens ${appUrl} to sign in and pick a workspace). If the client does not support OAuth, create an API token at ${appUrl}/settings/tokens and send it as the header "Authorization: Bearer <token>".
3. Call the whoami tool to confirm the connection, then tell me which workspace you are connected to.

Docs: https://github.com/tom-byrn/omakaze/blob/main/docs/mcp.md`;
}

/**
 * MCP tools the Claude Code workflow may call: reading the pull request and writing the guide.
 * The review tools (replies, line comments, resolving, reviews, PR comments) and upload_asset are
 * left out, so text in a pull request cannot make the workflow post to GitHub or fetch URLs.
 */
export const CLAUDE_WORKFLOW_TOOLS = [
  "whoami",
  "get_pull_request",
  "get_diff",
  "read_file",
  "list_review_comments",
  "create_guide",
  "start_guide",
  "add_section",
  "update_section",
  "delete_section",
  "reorder_sections",
  "update_guide",
  "get_guide",
  "check_coverage",
  "finish_guide",
] as const;

/**
 * GitHub Actions workflow in which Claude Code, signed in with a Claude subscription
 * (CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`), writes a guide for every pull request
 * through this instance's MCP server. See docs/claude-github-action.md.
 */
export function claudeWorkflow(appUrl: string): string {
  const allowed = CLAUDE_WORKFLOW_TOOLS.map((t) => `mcp__omakaze__${t}`).join(",");
  return `name: Omakaze guide (Claude)

on:
  pull_request:
    types: [opened, reopened, synchronize, ready_for_review]

concurrency:
  group: omakaze-guide-\${{ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: read

jobs:
  omakaze-guide:
    if: github.event.pull_request.draft == false && github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Configure the Omakaze MCP server
        env:
          OMAKAZE_TOKEN: \${{ secrets.OMAKAZE_TOKEN }}
        run: |
          jq -n --arg url "${appUrl}/api/mcp" --arg auth "Bearer $OMAKAZE_TOKEN" \\
            '{mcpServers: {omakaze: {type: "http", url: $url, headers: {Authorization: $auth}}}}' \\
            > "$RUNNER_TEMP/omakaze-mcp.json"

      - name: Write the guide with Claude Code
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          github_token: \${{ secrets.GITHUB_TOKEN }}
          prompt: |
            Create a guided PR for \${{ github.event.pull_request.html_url }} using the Omakaze MCP.
            Use head_sha \${{ github.event.pull_request.head.sha }}. Only write the guide: do not
            post comments or reviews, and do not change any files in this repository.
          claude_args: |
            --mcp-config \${{ runner.temp }}/omakaze-mcp.json
            --allowedTools ${allowed}
            --disallowedTools Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch
`;
}
