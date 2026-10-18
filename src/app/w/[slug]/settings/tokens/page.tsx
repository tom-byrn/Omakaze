import { and, desc, eq, isNull } from "drizzle-orm";
import { Panel } from "@/components/settings/Panel";
import { CreateTokenForm } from "@/components/settings/CreateTokenForm";
import { McpClientTabs } from "@/components/settings/McpClientTabs";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { CopyButton } from "@/components/ui/CopyButton";
import { db } from "@/db";
import { apiTokens, oauthClients, users } from "@/db/schema";
import { env } from "@/lib/env";
import { formatDate, timeAgo } from "@/lib/format";
import { setupPrompt } from "@/lib/prompts";
import { requireWorkspace, roleAtLeast } from "@/lib/workspaces";
import { createTokenAction, revokeTokenAction } from "../actions";

export const metadata = { title: "API tokens & MCP" };

export default async function TokensPage(props: PageProps<"/w/[slug]/settings/tokens">) {
  const { slug } = await props.params;
  const { workspace, role, user } = await requireWorkspace(slug);
  const admin = roleAtLeast(role, "admin");
  const appUrl = env().APP_URL;
  const mcpUrl = `${appUrl}/api/mcp`;
  const tokens = await db
    .select({ token: apiTokens, owner: users.name, client: oauthClients.name })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .leftJoin(oauthClients, eq(oauthClients.id, apiTokens.oauthClientId))
    .where(
      and(
        eq(apiTokens.workspaceId, workspace.id),
        isNull(apiTokens.revokedAt),
        admin ? undefined : eq(apiTokens.userId, user.id),
      ),
    )
    .orderBy(desc(apiTokens.createdAt));
  const active = tokens.filter((t) => !t.token.expiresAt || t.token.expiresAt > new Date());

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="Connect an agent"
        description="Agents create and edit guides through the MCP server. They authenticate with OAuth (sign in and pick this workspace) or with an API token."
      >
        <div className="flex flex-col gap-5">
          <div>
            <p className="field-label">MCP server URL</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate border border-dashed border-line bg-paper px-3 py-2 font-mono text-[13px] text-ink">
                {mcpUrl}
              </code>
              <CopyButton text={mcpUrl} label="Copy" />
            </div>
          </div>
          <McpClientTabs mcpUrl={mcpUrl} />
          <div>
            <p className="field-label">Setup prompt</p>
            <pre className="max-h-56 overflow-auto border border-dashed border-line bg-paper p-3 font-mono text-[12px] leading-[18px] whitespace-pre-wrap text-ui">
              {setupPrompt(appUrl)}
            </pre>
            <div className="mt-2">
              <CopyButton text={setupPrompt(appUrl)} label="Copy setup prompt" className="btn btn-primary btn-sm" />
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="API tokens"
        description="Tokens act as you within this workspace. Use them for MCP clients without OAuth support and for the REST API."
      >
        <CreateTokenForm action={createTokenAction.bind(null, slug)} />
        <ul className="mt-6">
          {active.length === 0 ? <li className="text-[13px] text-muted">No active tokens.</li> : null}
          {active.map(({ token, owner, client }) => (
            <li key={token.id} className="flex flex-wrap items-center gap-3 border-t border-dashed border-line py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] text-ink">
                  {token.kind === "oauth" ? (client ?? "OAuth client") : token.name}{" "}
                  <span className="tag ml-1">{token.kind === "oauth" ? "OAuth" : "token"}</span>
                </p>
                <p className="font-mono text-[11px] text-meta">
                  {token.tokenPrefix}… · {owner} · created {formatDate(token.createdAt)} ·{" "}
                  {token.lastUsedAt ? `last used ${timeAgo(token.lastUsedAt)}` : "never used"}
                  {token.expiresAt ? ` · expires ${formatDate(token.expiresAt)}` : ""}
                </p>
              </div>
              {token.userId === user.id || admin ? (
                <ConfirmButton action={revokeTokenAction.bind(null, slug, token.id)} confirm="Revoke this token?">
                  Revoke
                </ConfirmButton>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
