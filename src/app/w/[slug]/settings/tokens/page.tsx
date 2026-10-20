import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { Panel } from "@/components/settings/Panel";
import { CreateTokenForm } from "@/components/settings/CreateTokenForm";
import { McpClientTabs } from "@/components/settings/McpClientTabs";
import { ActionForm } from "@/components/ui/ActionForm";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { CopyButton } from "@/components/ui/CopyButton";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { db } from "@/db";
import { apiTokens, oauthClients, users } from "@/db/schema";
import { getGitHubAccount } from "@/lib/auth/users";
import { env } from "@/lib/env";
import { formatDate, timeAgo } from "@/lib/format";
import { setupPrompt } from "@/lib/prompts";
import { requireWorkspace, roleAtLeast } from "@/lib/workspaces";
import { createTokenAction, revokeTokenAction, saveAgentApprovalsAction } from "../actions";

export const metadata = { title: "API tokens & MCP" };

/** What agents may do with the review tools, and as whom (src/lib/mcp/server.ts). */
const AGENT_REVIEW_RULES: { tools: string[]; rule: string }[] = [
  {
    tools: ["reply_to_review_comment", "post_review_comment", "post_pr_comment", "submit_review COMMENT"],
    rule: "With the member's linked GitHub account, or else through the workspace connection with a “Posted by … via Omakaze” line.",
  },
  {
    tools: ["resolve_review_thread", "submit_review REQUEST_CHANGES"],
    rule: "Only with the member's linked GitHub account, never through the connection.",
  },
  {
    tools: ["submit_review APPROVE"],
    rule: "Only with the member's linked GitHub account, and only when admins allow it below.",
  },
];

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
  const account = await getGitHubAccount(user.id);

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

      <Panel
        title="Reviews by agents"
        description="Agents can also work on review comments: reply in threads, comment on lines with suggested changes, resolve conversations and submit reviews. They post on GitHub as the member whose token they use, like the review tools of a guide."
      >
        <ul>
          {AGENT_REVIEW_RULES.map((r) => (
            <li
              key={r.tools[0]}
              className="grid gap-1.5 border-b border-dashed border-line py-3 first:pt-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] sm:gap-6"
            >
              <p className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[12px] leading-[18px] text-ink">
                {r.tools.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </p>
              <p className="text-[13px] leading-[20px] text-body">{r.rule}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] leading-[20px] text-body">
          {account ? (
            <>
              Your agents post as <span className="font-mono text-ink">{account.login}</span> on GitHub.
            </>
          ) : (
            <>
              You have no linked GitHub account, so your agents post through the workspace connection and can&apos;t
              resolve conversations, request changes or approve.{" "}
              <Link href="/account" className="link">
                Link your GitHub account
              </Link>
              .
            </>
          )}
        </p>
        {admin ? (
          <ActionForm action={saveAgentApprovalsAction.bind(null, slug)} className="mt-5 flex flex-col gap-3">
            <label className="flex items-start gap-2 text-[14px] text-ink">
              <input type="checkbox" name="allowAgentApprovals" defaultChecked={workspace.allowAgentApprovals} className="mt-1" />
              <span>
                Allow agents to approve pull requests
                <span className="mt-0.5 block text-[13px] leading-[20px] text-muted">
                  Off by default. An approval by an agent counts as the member&apos;s own on GitHub, including for branch
                  protection rules.
                </span>
              </span>
            </label>
            <div>
              <SubmitButton pendingText="Saving…">Save</SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <p className="mt-5 text-[14px] text-ink">
            {workspace.allowAgentApprovals
              ? "Agents can approve pull requests in this workspace."
              : "Agents can't approve pull requests in this workspace. Admins can allow it."}
          </p>
        )}
      </Panel>
    </div>
  );
}
