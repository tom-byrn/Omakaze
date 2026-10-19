"use client";

import useSWR from "swr";
import { GuideCheckBadge } from "@/components/app/GuideCheckBadge";
import { timeAgo } from "@/lib/format";
import type { GuideCheckView } from "@/lib/github/guide-check";

/**
 * The guide check as last posted to GitHub, in the pull request header. Polls, since updates are
 * sent by the worker a few seconds after review marks change.
 */
export function GuideCheckStatus({
  slug,
  repositoryId,
  prNumber,
  headSha,
  pullUrl,
  initial,
}: {
  slug: string;
  repositoryId: string;
  prNumber: number;
  headSha: string;
  pullUrl: string;
  initial: GuideCheckView;
}) {
  const { data } = useSWR<GuideCheckView>(
    `/api/w/${slug}/guide-check?repositoryId=${repositoryId}&number=${prNumber}`,
    (url: string) => fetch(url).then((r) => r.json()),
    { fallbackData: initial, refreshInterval: 5000 },
  );
  if (!data || data.mode === "off") return null;
  const check = data.check;
  // Not yet sent for the current head commit: the worker is on it.
  const current = check && check.headSha === headSha ? check : null;
  const where = current?.method === "check_run" ? "check run “Omakaze guide”" : "commit status omakaze/guide";
  const hint = current?.error
    ? current.error
    : current?.postedAt
      ? `Posted to GitHub ${timeAgo(current.postedAt)} as the ${where}. Updated when review progress changes.`
      : "Waiting for the first update.";
  return (
    <a
      href={current?.method === "check_run" ? `${pullUrl}/checks` : pullUrl}
      target="_blank"
      rel="noreferrer"
      title={hint}
      data-testid="guide-check-status"
      className="inline-flex items-center gap-1.5 hover:text-ink"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-meta">Check</span>
      <GuideCheckBadge conclusion={current?.conclusion ?? null} error={Boolean(current?.error)} />
      {current?.title && !current.error ? <span>{current.title}</span> : null}
    </a>
  );
}
