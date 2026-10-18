"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/** Refresh cached GitHub data in the background, then re-render the page. */
export function SyncOnMount({ slug, stale, repositoryId }: { slug: string; stale: boolean; repositoryId?: string }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const ran = useRef(false);

  async function sync(force = false) {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`/api/w/${slug}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force, repositoryId }),
      });
      const data = (await res.json()) as { errors?: string[] };
      if (data.errors?.length) setError(data.errors[0]);
      startTransition(() => router.refresh());
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (ran.current || !stale) return;
    ran.current = true;
    void sync(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale]);

  return (
    <div className="flex items-center gap-3">
      {error ? <span className="max-w-[320px] truncate text-[12px] text-danger" title={error}>{error}</span> : null}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => sync(true)} disabled={syncing}>
        <RiRefreshLine size={14} className={syncing ? "animate-spin" : undefined} />
        {syncing ? "Syncing…" : "Sync"}
      </button>
    </div>
  );
}
