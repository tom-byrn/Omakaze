import { RiCheckLine, RiTeamLine } from "@remixicon/react";
import clsx from "clsx";
import { Avatar } from "@/components/ui/Avatar";
import type { ReviewProgress } from "@/lib/dashboard";
import { includesLogin, sameLogin, type GhPersonRef } from "@/lib/github/people";

type Pull = {
  authorLogin: string | null;
  requestedReviewers?: GhPersonRef[];
  requestedTeams?: string[];
  assignees?: GhPersonRef[];
};

/** Up to this many sections are drawn as squares; longer guides get a bar. */
const MAX_SQUARES = 12;

function SectionProgress({ sections, reviewed }: { sections: number; reviewed: number }) {
  const done = reviewed >= sections;
  return (
    <span className="inline-flex items-center gap-2">
      {sections <= MAX_SQUARES ? (
        <span className="flex gap-[2px]" aria-hidden="true">
          {Array.from({ length: sections }, (_, i) => (
            <span key={i} className={clsx("h-2 w-2 border", i < reviewed ? "border-ink bg-ink" : "border-black/25 bg-white")} />
          ))}
        </span>
      ) : (
        <span className="relative h-2 w-[72px] border border-black/25 bg-white" aria-hidden="true">
          <span className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${Math.round((reviewed / sections) * 100)}%` }} />
        </span>
      )}
      <span className={clsx("inline-flex items-center gap-1 font-mono text-[11px]", done ? "text-ink" : "text-muted")}>
        {done ? <RiCheckLine size={12} /> : null}
        {reviewed}/{sections} sections reviewed by you
      </span>
    </span>
  );
}

/**
 * The review side of a pull request row: whether the viewer's review is requested or the pull
 * request is assigned to them, the requested reviewers and teams, and the viewer's progress on the
 * latest published guide. Renders nothing when there is nothing to say.
 */
export function ReviewLine({ pull, progress, viewerLogin }: { pull: Pull; progress: ReviewProgress | null; viewerLogin: string | null }) {
  const reviewers = pull.requestedReviewers ?? [];
  const teams = pull.requestedTeams ?? [];
  const requested = includesLogin(reviewers, viewerLogin);
  const assigned = includesLogin(pull.assignees ?? [], viewerLogin);
  // Authors don't review their own guide, so their progress is left out.
  const showProgress = progress !== null && progress.sections > 0 && !sameLogin(pull.authorLogin, viewerLogin);
  if (!requested && !assigned && reviewers.length === 0 && teams.length === 0 && !showProgress) return null;
  const waitingOn = [...reviewers.map((r) => r.login), ...teams.map((t) => `${t} (team)`)].join(", ");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted">
      {requested || assigned ? (
        <span className="inline-flex items-center gap-1.5">
          {requested ? (
            <span className="tag border-ink/40 text-ink">
              <span className="dot bg-blue-bright" /> Review requested
            </span>
          ) : null}
          {assigned ? <span className="tag">Assigned to you</span> : null}
        </span>
      ) : null}
      {reviewers.length + teams.length > 0 ? (
        <span className="inline-flex items-center gap-1.5" title={`Review requested from ${waitingOn}`}>
          <span className="font-mono text-[10px] tracking-[0.08em] text-black/45 uppercase">Reviewers</span>
          {reviewers.map((r) => (
            <span key={r.login} title={r.login} className={clsx("inline-flex", sameLogin(r.login, viewerLogin) && "outline outline-1 outline-offset-1 outline-ink")}>
              <Avatar src={r.avatarUrl} name={r.login} size={16} />
            </span>
          ))}
          {teams.map((t) => (
            <span key={t} className="inline-flex h-4 items-center gap-1 border border-black/15 px-1 font-mono text-[10px] text-black/60">
              <RiTeamLine size={10} /> {t}
            </span>
          ))}
        </span>
      ) : null}
      {showProgress ? <SectionProgress sections={progress.sections} reviewed={progress.reviewed} /> : null}
    </div>
  );
}
