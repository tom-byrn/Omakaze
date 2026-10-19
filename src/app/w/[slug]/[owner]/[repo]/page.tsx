import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/PageHeader";
import { FilterEmptyState, FilterTabs, StateTabs, UnlinkedGitHubNotice } from "@/components/app/PullFilters";
import { RepoGroup } from "@/components/app/PullList";
import { SyncOnMount } from "@/components/app/SyncOnMount";
import { resolveAiConfigFor } from "@/lib/ai/chatgpt";
import { isStale, loadDashboard, parsePullFilter, parseStateFilter, pullListHref } from "@/lib/dashboard";
import { findWorkspaceRepo } from "@/lib/github/connections";
import { githubLoginOf } from "@/lib/github/people";
import { requireWorkspace } from "@/lib/workspaces";

export async function generateMetadata(props: PageProps<"/w/[slug]/[owner]/[repo]">) {
  const { owner, repo } = await props.params;
  return { title: `${owner}/${repo}` };
}

export default async function RepoPage(props: PageProps<"/w/[slug]/[owner]/[repo]">) {
  const { slug, owner, repo: name } = await props.params;
  const sp = await props.searchParams;
  const { workspace, user } = await requireWorkspace(slug);
  const repo = await findWorkspaceRepo(workspace.id, owner, name);
  if (!repo) notFound();
  const state = parseStateFilter(sp.state);
  const filter = parsePullFilter(sp.filter);
  const login = await githubLoginOf(user.id);
  const data = await loadDashboard(workspace.id, { state, filter, repositoryId: repo.id, viewer: { userId: user.id, login } });
  const aiDisabledReason = (await resolveAiConfigFor(workspace, user.id)) ? null : "Add an AI provider in Settings → AI to generate guides here.";
  const base = `/w/${slug}/${repo.fullName}`;
  return (
    <main className="mx-auto max-w-[1240px] px-4 py-10 lg:px-8">
      <PageHeader
        eyebrow={`Repository · ${repo.private ? "private" : "public"}`}
        title={`${repo.fullName}.`}
        description={repo.description ?? undefined}
        actions={
          <>
            <SyncOnMount slug={slug} stale={isStale([repo])} repositoryId={repo.id} />
            <Link href={`/w/${slug}/${repo.fullName}/settings`} className="btn btn-ghost btn-sm">
              Settings
            </Link>
          </>
        }
      />
      <div className="mt-8">
        <FilterTabs current={filter} counts={data.filterCounts} href={(f) => pullListHref(base, { state, filter: f })} />
      </div>
      {filter === "needs-review" && !login ? (
        <div className="mt-4">
          <UnlinkedGitHubNotice />
        </div>
      ) : null}
      <StateTabs className="mt-4" current={state} counts={data.counts} href={(s) => pullListHref(base, { state: s, filter })} />
      <div className="mt-6">
        {filter !== "all" && data.pulls.length === 0 ? (
          <FilterEmptyState filter={filter} state={state} login={login} />
        ) : (
          <RepoGroup
            slug={slug}
            repo={repo}
            pulls={data.pulls}
            guides={data.guides}
            aiDisabledReason={aiDisabledReason}
            review={{ progress: data.progress, viewerLogin: login }}
            emptyLabel={repo.lastSyncedAt ? `No ${state === "all" ? "" : `${state} `}pull requests.` : "Loading pull requests from GitHub…"}
          />
        )}
      </div>
    </main>
  );
}
