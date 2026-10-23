import clsx from "clsx";
import Link from "next/link";
import { PULL_FILTERS, STATE_FILTERS, type PullFilter, type StateFilter } from "@/lib/dashboard";
import { EmptyState } from "./PageHeader";

const STATE_LABELS: Record<StateFilter, string> = { open: "Open", merged: "Merged", closed: "Closed", all: "All" };

export const FILTER_LABELS: Record<PullFilter, string> = {
  "needs-review": "Needs my review",
  mine: "Mine",
  assigned: "Assigned",
  all: "All",
};

/** Needs my review · Mine · Assigned · All, as tabs over a dashed rule. */
export function FilterTabs({
  current,
  counts,
  href,
}: {
  current: PullFilter;
  counts: Record<PullFilter, number>;
  href: (filter: PullFilter) => string;
}) {
  return (
    <nav aria-label="Filter by involvement" className="flex overflow-x-auto">
      {PULL_FILTERS.map((f) => {
        const active = f === current;
        const n = counts[f];
        return (
          <Link
            key={f}
            href={href(f)}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex h-10 shrink-0 items-center gap-2 border-b px-3 text-[14px] tracking-[-0.02em] whitespace-nowrap transition-colors first:pl-0 sm:px-4 sm:first:pl-0",
              active ? "border-solid border-ink text-ink" : "border-dashed border-line text-nav hover:text-ink",
            )}
          >
            {FILTER_LABELS[f]}
            {f === "needs-review" && n > 0 ? (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center bg-ink px-1 font-mono text-[10px] text-white">{n}</span>
            ) : (
              <span className={clsx("font-mono text-[10px]", active ? "text-ink/60" : "text-black/45")}>{n}</span>
            )}
          </Link>
        );
      })}
      <span className="min-w-4 flex-1 border-b border-dashed border-line" aria-hidden="true" />
    </nav>
  );
}

/** Open · Merged · Closed · All, as a segmented control. */
export function StateTabs({
  current,
  counts,
  href,
  className,
}: {
  current: StateFilter;
  counts: Record<StateFilter, number>;
  href: (state: StateFilter) => string;
  className?: string;
}) {
  return (
    <nav className={clsx("flex w-fit border border-tab", className)} aria-label="Filter by state">
      {STATE_FILTERS.map((s, i) => (
        <Link
          key={s}
          href={href(s)}
          className={clsx(
            "relative flex h-10 items-center gap-2 px-4 font-serif text-[15px]",
            i > 0 && "border-l border-tab",
            current === s ? "bg-ink text-white" : "bg-paper text-black hover:bg-black/[0.03]",
          )}
          aria-current={current === s ? "page" : undefined}
        >
          {STATE_LABELS[s]}
          <span className={clsx("font-mono text-[10px]", current === s ? "text-white/60" : "text-black/45")}>{counts[s]}</span>
        </Link>
      ))}
    </nav>
  );
}

/** The empty state of a filter other than "all". `login` is the viewer's linked GitHub login. */
export function FilterEmptyState({ filter, state, login, q }: { filter: PullFilter; state: StateFilter; login: string | null; q?: string }) {
  if (filter === "needs-review" && (state === "merged" || state === "closed")) return <EmptyState title="Only open pull requests need review." />;
  if (q) return <EmptyState title="No matching pull requests." />;
  const stateWord = state === "all" ? "" : `${state} `;
  if (filter === "needs-review") {
    return (
      <EmptyState title="Nothing needs your review.">
        Pull requests appear here when your review is requested on GitHub, or when a published guide has sections you haven&apos;t
        marked as reviewed.
      </EmptyState>
    );
  }
  if (!login) {
    return (
      <EmptyState
        title="Link your GitHub account."
        action={
          <Link href="/account" className="btn btn-primary btn-md">
            Link GitHub account
          </Link>
        }
      >
        Omakaze matches pull requests you opened, and ones assigned to you, through your linked GitHub account.
      </EmptyState>
    );
  }
  return filter === "mine" ? (
    <EmptyState title={`No ${stateWord}pull requests opened by you.`}>Pull requests that @{login} opens on GitHub appear here.</EmptyState>
  ) : (
    <EmptyState title={`No ${stateWord}pull requests are assigned to you.`}>Pull requests assigned to @{login} on GitHub appear here.</EmptyState>
  );
}

/** Shown to members without a linked GitHub account, who can't be matched to review requests. */
export function UnlinkedGitHubNotice() {
  return (
    <p className="border border-dashed border-line bg-white/50 px-4 py-3 text-[13px] leading-[20px] text-body">
      Review requests on GitHub can&apos;t be matched to you because your account has no linked GitHub account, so this list only
      shows published guides with sections you haven&apos;t reviewed.{" "}
      <Link href="/account" className="link">
        Link your GitHub account
      </Link>{" "}
      to include pull requests where your review is requested.
    </p>
  );
}
