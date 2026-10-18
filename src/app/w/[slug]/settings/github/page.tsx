import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { Panel } from "@/components/settings/Panel";
import { ActionForm } from "@/components/ui/ActionForm";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { db } from "@/db";
import { githubConnections, repositories, users } from "@/db/schema";
import { getGitHubAccount } from "@/lib/auth/users";
import { timeAgo } from "@/lib/format";
import { getGitHubApp } from "@/lib/github/app";
import { requireWorkspace, roleAtLeast } from "@/lib/workspaces";
import { connectWithAccountAction, connectWithTokenAction, removeConnectionAction } from "../actions";

export const metadata = { title: "GitHub" };

const TYPE_LABEL = { app: "GitHub App installation", token: "Personal access token", user: "Linked GitHub account" };

export default async function GitHubSettingsPage(props: PageProps<"/w/[slug]/settings/github">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const { workspace, role, user } = await requireWorkspace(slug);
  const admin = roleAtLeast(role, "admin");
  const app = await getGitHubApp();
  const account = await getGitHubAccount(user.id);
  const connections = await db
    .select({
      conn: githubConnections,
      creator: users.name,
      repoCount: sql<number>`(select count(*) from ${repositories} where ${repositories.connectionId} = ${githubConnections.id})`.mapWith(Number),
    })
    .from(githubConnections)
    .leftJoin(users, eq(users.id, githubConnections.createdByUserId))
    .where(eq(githubConnections.workspaceId, workspace.id))
    .orderBy(desc(githubConnections.createdAt));
  const notice = typeof sp.error === "string" ? sp.error : typeof sp.connected === "string" ? "GitHub App installed." : null;

  return (
    <div className="flex flex-col gap-6">
      {notice ? (
        <p className={`border border-dashed px-3 py-2 text-[13px] ${sp.error ? "border-danger/40 text-danger" : "border-olive/40 text-olive"}`}>
          {notice}
        </p>
      ) : null}
      <Panel
        title="Connections"
        description="Connections give this workspace access to repositories. Everyone in the workspace uses them to read pull requests."
      >
        {connections.length === 0 ? (
          <p className="text-[13px] text-muted">No connections yet.</p>
        ) : (
          <ul className="-my-2">
            {connections.map(({ conn, creator, repoCount }) => (
              <li key={conn.id} className="flex flex-wrap items-center gap-3 border-t border-dashed border-line py-3 first:border-t-0">
                <Avatar src={conn.accountAvatarUrl} name={conn.accountLogin} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] text-ink">
                    {conn.accountLogin}{" "}
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-black/45">{conn.accountType}</span>
                  </p>
                  <p className="font-mono text-[11px] text-meta">
                    {TYPE_LABEL[conn.type]} · {repoCount} repositor{repoCount === 1 ? "y" : "ies"} · added {timeAgo(conn.createdAt)}
                    {creator ? ` by ${creator}` : ""}
                    {conn.suspendedAt ? " · suspended" : ""}
                  </p>
                </div>
                {admin ? (
                  <ConfirmButton
                    action={removeConnectionAction.bind(null, slug, conn.id)}
                    confirm={`Remove the ${conn.accountLogin} connection? Its repositories and guides are removed from this workspace.`}
                  >
                    Remove
                  </ConfirmButton>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {admin ? (
        <>
          <Panel
            title="Install the GitHub App"
            description="Recommended for organizations. Pick the repositories to share, receive pull request webhooks, and post comments as the app."
          >
            {app ? (
              <a href={`/api/github/install?workspace=${encodeURIComponent(slug)}`} className="btn btn-primary btn-md">
                Install on GitHub
              </a>
            ) : (
              <p className="text-[13px] text-body">
                The GitHub App is not configured on this instance.{" "}
                {user.isInstanceAdmin ? (
                  <Link href="/admin" className="link">
                    Set it up in instance settings
                  </Link>
                ) : (
                  "Ask an instance admin to set it up."
                )}
              </p>
            )}
          </Panel>

          <Panel
            title="Use your GitHub account"
            description="Reads repositories with the GitHub credential you signed in with. Good for personal workspaces."
          >
            {account ? (
              <ConfirmButton action={connectWithAccountAction.bind(null, slug)} className="btn btn-secondary btn-md">
                Connect @{account.login}
              </ConfirmButton>
            ) : (
              <p className="text-[13px] text-body">
                No GitHub account is linked to your user.{" "}
                <Link href="/account" className="link">
                  Link one in account settings
                </Link>
                .
              </p>
            )}
          </Panel>

          <Panel
            title="Connect with a token"
            description="A personal access token for a user or a bot account. Fine-grained tokens need Contents (read), Metadata (read) and Pull requests (read and write)."
          >
            <ActionForm action={connectWithTokenAction.bind(null, slug)} resetOnSuccess className="flex max-w-[560px] flex-col gap-3">
              <div>
                <label className="label" htmlFor="gh-token">
                  Token
                </label>
                <input id="gh-token" name="token" type="password" autoComplete="off" placeholder="github_pat_…" className="input font-mono" />
              </div>
              <div>
                <SubmitButton pendingText="Verifying…">Add connection</SubmitButton>
              </div>
            </ActionForm>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
