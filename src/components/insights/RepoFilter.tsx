"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Repository filter: navigates as soon as a repository is picked. */
export function RepoFilter({ repos, current, hrefs }: { repos: string[]; current: string | null; hrefs: Record<string, string> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="insights-repo" className="mono-label">
        Repository
      </label>
      <select
        id="insights-repo"
        className="input h-10 w-auto min-w-[220px] max-w-full font-mono text-[12px]"
        value={current ?? ""}
        aria-busy={pending}
        onChange={(e) => startTransition(() => router.push(hrefs[e.target.value] ?? hrefs[""]))}
      >
        <option value="">All repositories</option>
        {repos.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </div>
  );
}
