import { RiAddLine, RiSearchLine } from "@remixicon/react";
import clsx from "clsx";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/PageHeader";
import { RepoGroup } from "@/components/app/PullList";
import { SyncOnMount } from "@/components/app/SyncOnMount";
import { resolveAiConfig } from "@/lib/ai/config";
import { isStale, loadDashboard, parseStateFilter, type StateFilter } from "@/lib/dashboard";
import { listConnections } from "@/lib/github/connections";
import { requireWorkspace } from "@/lib/workspaces";

export const metadata = { title: "Pull requests" };

const TABS: { key: StateFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "merged", label: "Merged" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

export default async function DashboardPage(props: PageProps<"/w/[slug]">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const { workspace } = await requireWorkspace(slug);
  const state = parseStateFilter(sp.state);
  const q = typeof sp.q === "string" ? sp.q : "";
  const data = await loadDashboard(workspace.id, { state, q });
  const connections = await listConnections(workspace.id);
  const aiDisabledReason = resolveAiConfig(workspace) ? null : "Add an AI provider in Settings → AI to generate guides here.";
  const href = (s: StateFilter) => `/w/${slug}?${new URLSearchParams({ ...(s !== "open" ? { state: s } : {}), ...(q ? { q } : {}) })}`;

  const byRepo = new Map(data.repos.map((r) => [r.id, [] as typeof data.pulls]));
  for (const p of data.pulls) byRepo.get(p.repositoryId)?.push(p);
  const visibleRepos = q ? data.repos.filter((r) => (byRepo.get(r.id)?.length ?? 0) > 0) : data.repos;

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
          <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <nav className="flex border border-tab" aria-label="Filter by state">
              {TABS.map((t, i) => (
                <Link
                  key={t.key}
                  href={href(t.key)}
                  className={clsx(
                    "relative flex h-10 items-center gap-2 px-4 font-serif text-[15px]",
                    i > 0 && "border-l border-tab",
                    state === t.key ? "bg-ink text-[#f2f2f2]" : "bg-paper text-black hover:bg-black/[0.03]",
                  )}
                  aria-current={state === t.key ? "page" : undefined}
                >
                  {t.label}
                  <span className={clsx("font-mono text-[10px]", state === t.key ? "text-white/60" : "text-black/45")}>
                    {data.counts[t.key]}
                  </span>
                </Link>
              ))}
            </nav>
            <form className="relative w-full md:w-[320px]" action={`/w/${slug}`}>
              {state !== "open" ? <input type="hidden" name="state" value={state} /> : null}
              <RiSearchLine size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-black/40" />
              <input name="q" defaultValue={q} placeholder="Search title, author, branch or #number" className="input pl-8" />
            </form>
          </div>

          <div className="mt-6 flex flex-col gap-6">
            {visibleRepos.length === 0 ? (
              <EmptyState title="No matching pull requests." />
            ) : (
              visibleRepos.map((repo) => (
                <RepoGroup
                  key={repo.id}
                  slug={slug}
                  repo={repo}
                  pulls={byRepo.get(repo.id) ?? []}
                  guides={data.guides}
                  aiDisabledReason={aiDisabledReason}
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
