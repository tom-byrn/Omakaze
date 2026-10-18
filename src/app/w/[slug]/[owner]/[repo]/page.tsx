import { notFound } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { PageHeader } from "@/components/app/PageHeader";
import { RepoGroup } from "@/components/app/PullList";
import { SyncOnMount } from "@/components/app/SyncOnMount";
import { resolveAiConfigFor } from "@/lib/ai/chatgpt";
import { isStale, loadDashboard, parseStateFilter, type StateFilter } from "@/lib/dashboard";
import { findWorkspaceRepo } from "@/lib/github/connections";
import { requireWorkspace } from "@/lib/workspaces";

const TABS: { key: StateFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "merged", label: "Merged" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

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
  const data = await loadDashboard(workspace.id, { state, repositoryId: repo.id });
  const aiDisabledReason = (await resolveAiConfigFor(workspace, user.id)) ? null : "Add an AI provider in Settings → AI to generate guides here.";
  return (
    <main className="mx-auto max-w-[1240px] px-4 py-10 lg:px-8">
      <PageHeader
        eyebrow={`Repository · ${repo.private ? "private" : "public"}`}
        title={`${repo.fullName}.`}
        description={repo.description ?? undefined}
        actions={<SyncOnMount slug={slug} stale={isStale([repo])} repositoryId={repo.id} />}
      />
      <nav className="mt-8 flex w-fit border border-tab" aria-label="Filter by state">
        {TABS.map((t, i) => (
          <Link
            key={t.key}
            href={`/w/${slug}/${repo.fullName}${t.key === "open" ? "" : `?state=${t.key}`}`}
            className={clsx(
              "flex h-10 items-center gap-2 px-4 font-serif text-[15px]",
              i > 0 && "border-l border-tab",
              state === t.key ? "bg-ink text-[#f2f2f2]" : "bg-paper text-black hover:bg-black/[0.03]",
            )}
          >
            {t.label}
            <span className={clsx("font-mono text-[10px]", state === t.key ? "text-white/60" : "text-black/45")}>{data.counts[t.key]}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-6">
        <RepoGroup
          slug={slug}
          repo={repo}
          pulls={data.pulls}
          guides={data.guides}
          aiDisabledReason={aiDisabledReason}
          emptyLabel={repo.lastSyncedAt ? `No ${state === "all" ? "" : `${state} `}pull requests.` : "Loading pull requests from GitHub…"}
        />
      </div>
    </main>
  );
}
