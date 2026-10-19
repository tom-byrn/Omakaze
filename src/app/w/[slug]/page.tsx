import { RiAddLine, RiSearchLine } from "@remixicon/react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/PageHeader";
import { FilterEmptyState, FilterTabs, StateTabs, UnlinkedGitHubNotice } from "@/components/app/PullFilters";
import { RepoGroup } from "@/components/app/PullList";
import { SyncOnMount } from "@/components/app/SyncOnMount";
import { resolveAiConfigFor } from "@/lib/ai/chatgpt";
import { isStale, loadDashboard, parsePullFilter, parseStateFilter, pullListHref } from "@/lib/dashboard";
import { listConnections } from "@/lib/github/connections";
import { githubLoginOf } from "@/lib/github/people";
import { requireWorkspace } from "@/lib/workspaces";

export const metadata = { title: "Pull requests" };

export default async function DashboardPage(props: PageProps<"/w/[slug]">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const { workspace, user } = await requireWorkspace(slug);
  const state = parseStateFilter(sp.state);
  const filter = parsePullFilter(sp.filter);
  const q = typeof sp.q === "string" ? sp.q : "";
  const login = await githubLoginOf(user.id);
  const data = await loadDashboard(workspace.id, { state, filter, q, viewer: { userId: user.id, login } });
  const connections = await listConnections(workspace.id);
  const aiDisabledReason = (await resolveAiConfigFor(workspace, user.id)) ? null : "Add an AI provider in Settings → AI to generate guides here.";
  const base = `/w/${slug}`;

  const byRepo = new Map(data.repos.map((r) => [r.id, [] as typeof data.pulls]));
  for (const p of data.pulls) byRepo.get(p.repositoryId)?.push(p);
  // Every repository stays visible in the unfiltered list, so empty and still-syncing ones show up.
  const visibleRepos = q || filter !== "all" ? data.repos.filter((r) => (byRepo.get(r.id)?.length ?? 0) > 0) : data.repos;

  return (
    <main className="mx-auto max-w-[1240px] px-4 py-10 lg:px-8">
      <PageHeader
        eyebrow={`Workspace · ${workspace.name}`}
        title="Pull requests."
        description="Pull requests from the repositories connected to this workspace."
        actions={
          data.repos.length > 0 ? (
            <>
              <SyncOnMount slug={slug} stale={isStale(data.repos)} />
              <Link href={`/w/${slug}/repos`} className="btn btn-primary btn-sm">
                <RiAddLine size={14} /> Add repository
              </Link>
            </>
          ) : null
        }
      />

      {data.repos.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title={connections.length === 0 ? "Connect GitHub to get started." : "Add a repository."}
            action={
              connections.length === 0 ? (
                <Link href={`/w/${slug}/settings/github`} className="btn btn-primary btn-md">
                  Connect GitHub
                </Link>
              ) : (
                <Link href={`/w/${slug}/repos`} className="btn btn-primary btn-md">
                  Add repository
                </Link>
              )
            }
          >
            {connections.length === 0
              ? "Install the GitHub App on an account or organization, or connect with a token."
              : "Choose which repositories this workspace follows. Everyone in the workspace sees the same pull requests and guides."}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-8">
            <FilterTabs current={filter} counts={data.filterCounts} href={(f) => pullListHref(base, { state, filter: f, q })} />
          </div>
          {filter === "needs-review" && !login ? (
            <div className="mt-4">
              <UnlinkedGitHubNotice />
            </div>
          ) : null}
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <StateTabs current={state} counts={data.counts} href={(s) => pullListHref(base, { state: s, filter, q })} />
            <form className="relative w-full md:w-[320px]" action={base}>
              {state !== "open" ? <input type="hidden" name="state" value={state} /> : null}
              {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
              <RiSearchLine size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-black/40" />
              <input name="q" defaultValue={q} placeholder="Search title, author, branch or #number" className="input pl-8" />
            </form>
          </div>

          <div className="mt-6 flex flex-col gap-6">
            {visibleRepos.length === 0 ? (
              filter === "all" ? (
                <EmptyState title="No matching pull requests." />
              ) : (
                <FilterEmptyState filter={filter} state={state} login={login} q={q} />
              )
            ) : (
              visibleRepos.map((repo) => (
                <RepoGroup
                  key={repo.id}
                  slug={slug}
                  repo={repo}
                  pulls={byRepo.get(repo.id) ?? []}
                  guides={data.guides}
                  aiDisabledReason={aiDisabledReason}
                  review={{ progress: data.progress, viewerLogin: login }}
                  emptyLabel={
                    repo.lastSyncedAt
                      ? `No ${state === "all" ? "" : `${state} `}pull requests.`
                      : "Loading pull requests from GitHub…"
                  }
                />
              ))
            )}
          </div>
        </>
      )}
    </main>
  );
}
