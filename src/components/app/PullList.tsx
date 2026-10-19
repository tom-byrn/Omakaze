import { RiExternalLinkLine, RiGitBranchLine, RiLock2Line } from "@remixicon/react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { CopyButton } from "@/components/ui/CopyButton";
import type { LatestGuide, ReviewProgress } from "@/lib/dashboard";
import { timeAgo } from "@/lib/format";
import { agentPrompt } from "@/lib/prompts";
import { DiffStat, GuideChip, PrStateTag, prStateOf } from "./Badges";
import { GenerateButton } from "./GenerateButton";
import { ReviewLine } from "./ReviewLine";

type Repo = { id: string; fullName: string; htmlUrl: string; private: boolean; syncError: string | null };
type Pull = {
  id: string;
  repositoryId: string;
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  headRef: string;
  baseRef: string;
  headSha: string;
  additions: number | null;
  deletions: number | null;
  htmlUrl: string;
  githubUpdatedAt: Date;
  requestedReviewers?: { login: string; avatarUrl: string | null }[];
  requestedTeams?: string[];
  assignees?: { login: string; avatarUrl: string | null }[];
};

/** The viewer's guide progress and linked GitHub login. Without it, rows only show the requested reviewers. */
type ReviewContext = { progress: Map<string, ReviewProgress>; viewerLogin: string | null };

export function PullRow({
  slug,
  repo,
  pull,
  guide,
  aiDisabledReason,
  progress,
  viewerLogin,
}: {
  slug: string;
  repo: Repo;
  pull: Pull;
  guide?: LatestGuide;
  aiDisabledReason: string | null;
  progress?: ReviewProgress | null;
  viewerLogin?: string | null;
}) {
  const href = `/w/${slug}/${repo.fullName}/pull/${pull.number}`;
  const outdated = guide?.status === "ready" && guide.headSha !== pull.headSha;
  return (
    <li className="group relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-dashed border-line px-5 py-4 first:border-t-0 hover:bg-black/[0.018] md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
      <div className="pt-0.5">
        <PrStateTag state={prStateOf(pull)} />
      </div>
      <div className="min-w-0">
        <Link href={href} className="flex items-baseline gap-2 text-[15px] leading-[22px] tracking-[-0.01em] text-ink">
          <span className="font-mono text-[12px] text-meta">#{pull.number}</span>
          <span className="truncate group-hover:underline group-hover:underline-offset-4">{pull.title}</span>
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Avatar src={pull.authorAvatarUrl} name={pull.authorLogin} size={16} />
            {pull.authorLogin ?? "unknown"}
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[11px]">
            <RiGitBranchLine size={12} />
            {pull.headRef} → {pull.baseRef}
          </span>
          <span>updated {timeAgo(pull.githubUpdatedAt)}</span>
          <DiffStat additions={pull.additions} deletions={pull.deletions} />
        </div>
        <ReviewLine pull={pull} progress={progress ?? null} viewerLogin={viewerLogin ?? null} />
      </div>
      <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 md:col-span-1">
        {guide ? <GuideChip status={guide.status} version={guide.version} outdated={outdated} /> : null}
        {guide && guide.status !== "failed" ? (
          <Link href={href} className="btn btn-primary btn-sm">
            Open guide
          </Link>
        ) : (
          <>
            <CopyButton text={agentPrompt(pull.htmlUrl)} label="Copy prompt" className="btn btn-ghost btn-sm" />
            <GenerateButton slug={slug} repositoryId={repo.id} prNumber={pull.number} disabledReason={aiDisabledReason} />
          </>
        )}
      </div>
    </li>
  );
}

export function RepoGroup({
  slug,
  repo,
  pulls,
  guides,
  aiDisabledReason,
  emptyLabel,
  review,
}: {
  slug: string;
  repo: Repo;
  pulls: Pull[];
  guides: Map<string, LatestGuide>;
  aiDisabledReason: string | null;
  emptyLabel: string;
  review?: ReviewContext;
}) {
  return (
    <section className="border border-solid border-black/15 bg-white">
      <header className="flex items-center gap-3 border-b border-dashed border-line bg-paper px-5 py-3 grain">
        <Link href={`/w/${slug}/${repo.fullName}`} className="font-mono text-[12px] uppercase tracking-[0.06em] text-ink hover:underline">
          {repo.fullName}
        </Link>
        {repo.private ? (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-black/45">
            <RiLock2Line size={11} /> private
          </span>
        ) : null}
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-black/45">{pulls.length} shown</span>
        <a href={repo.htmlUrl} target="_blank" rel="noreferrer" className="ml-auto text-black/40 hover:text-ink" aria-label="Open on GitHub">
          <RiExternalLinkLine size={14} />
        </a>
      </header>
      {repo.syncError ? (
        <p className="border-b border-dashed border-line bg-danger/[0.03] px-5 py-2 text-[12px] text-danger">{repo.syncError}</p>
      ) : null}
      {pulls.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted">{emptyLabel}</p>
      ) : (
        <ul>
          {pulls.map((p) => (
            <PullRow
              key={p.id}
              slug={slug}
              repo={repo}
              pull={p}
              guide={guides.get(`${repo.id}:${p.number}`)}
              aiDisabledReason={aiDisabledReason}
              progress={review?.progress.get(`${repo.id}:${p.number}`)}
              viewerLogin={review?.viewerLogin}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
