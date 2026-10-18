import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/app/PageHeader";
import { AutoGenerateSelect } from "@/components/settings/AutoGenerateSelect";
import { Panel } from "@/components/settings/Panel";
import { RepoPicker } from "@/components/settings/RepoPicker";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { db } from "@/db";
import { githubConnections, repositories } from "@/db/schema";
import { timeAgo } from "@/lib/format";
import { requireWorkspace, roleAtLeast } from "@/lib/workspaces";
import {
  addRepositoryAction,
  createRepoWebhookAction,
  removeRepositoryAction,
  setRepoAutoGenerateAction,
} from "../settings/actions";

export const metadata = { title: "Repositories" };

const CONN_LABEL = { app: "App", token: "Token", user: "Account" };

export default async function ReposPage(props: PageProps<"/w/[slug]/repos">) {
  const { slug } = await props.params;
  const { workspace, role } = await requireWorkspace(slug);
  const admin = roleAtLeast(role, "admin");
  const connections = await db.select().from(githubConnections).where(eq(githubConnections.workspaceId, workspace.id));
  const repos = await db
    .select({ repo: repositories, connection: githubConnections })
    .from(repositories)
    .innerJoin(githubConnections, eq(githubConnections.id, repositories.connectionId))
    .where(eq(repositories.workspaceId, workspace.id))
    .orderBy(asc(repositories.fullName));

  return (
    <main className="mx-auto max-w-[1240px] px-4 py-10 lg:px-8">
      <PageHeader
        eyebrow={`Workspace · ${workspace.name}`}
        title="Repositories."
        description="Repositories followed by this workspace. Members see their pull requests and guides."
      />
      <div className="mt-8 flex flex-col gap-6">
        {admin ? (
          connections.length === 0 ? (
            <EmptyState
              title="No GitHub connection yet."
              action={
                <Link href={`/w/${slug}/settings/github`} className="btn btn-primary btn-md">
                  Connect GitHub
                </Link>
              }
            >
              Add a connection first, then choose repositories.
            </EmptyState>
          ) : (
            <Panel title="Add a repository">
              <RepoPicker
                slug={slug}
                connections={connections.map((c) => ({ id: c.id, label: `${c.accountLogin} (${CONN_LABEL[c.type]})` }))}
                action={addRepositoryAction.bind(null, slug)}
              />
            </Panel>
          )
        ) : null}

        <Panel title={`Followed repositories (${repos.length})`}>
          {repos.length === 0 ? (
            <p className="text-[13px] text-muted">No repositories yet.</p>
          ) : (
            <ul className="-my-2">
              {repos.map(({ repo, connection }) => (
                <li key={repo.id} className="flex flex-wrap items-center gap-3 border-t border-dashed border-line py-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <Link href={`/w/${slug}/${repo.fullName}`} className="font-mono text-[13px] text-ink hover:underline">
                      {repo.fullName}
                    </Link>
                    <p className="mt-0.5 font-mono text-[11px] text-meta">
                      via {connection.accountLogin} ({CONN_LABEL[connection.type]}) ·{" "}
                      {repo.lastSyncedAt ? `synced ${timeAgo(repo.lastSyncedAt)}` : "not synced"}
                      {connection.type !== "app" ? (repo.webhookId ? " · webhook active" : " · no webhook (polling)") : " · app webhooks"}
                    </p>
                    {repo.syncError ? <p className="mt-1 text-[12px] text-danger">{repo.syncError}</p> : null}
                  </div>
                  <AutoGenerateSelect
                    value={repo.autoGenerate}
                    inherited={workspace.autoGenerate}
                    action={setRepoAutoGenerateAction.bind(null, slug, repo.id)}
                    disabled={!admin}
                  />
                  {admin && connection.type !== "app" && !repo.webhookId ? (
                    <ConfirmButton action={createRepoWebhookAction.bind(null, slug, repo.id)} className="btn btn-secondary btn-xs">
                      Create webhook
                    </ConfirmButton>
                  ) : null}
                  {admin ? (
                    <ConfirmButton
                      action={removeRepositoryAction.bind(null, slug, repo.id)}
                      confirm={`Stop following ${repo.fullName}? Its guides are deleted from this workspace.`}
                    >
                      Remove
                    </ConfirmButton>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </main>
  );
}
