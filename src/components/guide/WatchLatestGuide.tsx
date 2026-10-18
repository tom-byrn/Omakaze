"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import useSWR from "swr";

type Latest = { latest: { version: number; status: string; author: string | null } | null };

/**
 * Polls for guides created elsewhere (an agent, automation or a teammate).
 * Without a guide on screen it refreshes the page as soon as one appears;
 * otherwise it shows a notice when a newer version exists.
 */
export function WatchLatestGuide({
  slug,
  repositoryId,
  prNumber,
  currentVersion,
  pinned,
  basePath,
}: {
  slug: string;
  repositoryId: string;
  prNumber: number;
  currentVersion: number | null;
  pinned: boolean;
  basePath: string;
}) {
  const router = useRouter();
  const { data } = useSWR<Latest>(
    `/api/w/${slug}/latest-guide?repositoryId=${repositoryId}&number=${prNumber}`,
    (url: string) => fetch(url).then((r) => r.json()),
    { refreshInterval: currentVersion === null ? 2500 : 10_000 },
  );
  const refreshed = useRef(false);
  const latest = data?.latest ?? null;
  useEffect(() => {
    if (currentVersion === null && latest && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [currentVersion, latest, router]);
  if (!latest || currentVersion === null || latest.version <= currentVersion) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-line bg-mist px-4 py-2 text-[12px] text-ink lg:px-6">
      <span className="dot animate-pulse-dot bg-blue-bright" />
      Version {latest.version} {latest.status === "generating" ? "is being written" : "is available"}
      {latest.author ? ` by ${latest.author}` : ""}.
      <Link href={pinned ? `${basePath}?v=${latest.version}` : basePath} onClick={() => router.refresh()} className="link">
        View version {latest.version}
      </Link>
    </div>
  );
}
