/** Prompt users paste into their coding agent to create a guide for one PR. */
export function agentPrompt(prUrl: string): string {
  return `Create a guided PR for ${prUrl} using the Omakaze MCP.`;
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

Docs: https://github.com/tom-byrn/guided-prs/blob/main/docs/mcp.md`;
}
