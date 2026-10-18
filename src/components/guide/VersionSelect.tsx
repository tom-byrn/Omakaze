"use client";

import { usePathname, useRouter } from "next/navigation";

export function VersionSelect({
  versions,
  current,
}: {
  versions: { version: number; status: string; headSha: string }[];
  current: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      aria-label="Guide version"
      className="input h-8 w-auto pr-8 font-mono text-[12px]"
      value={current ?? ""}
      onChange={(e) => router.push(`${pathname}?v=${e.target.value}`)}
    >
      {versions.map((v) => (
        <option key={v.version} value={v.version}>
          v{v.version} · {v.headSha}
          {v.status !== "ready" ? ` · ${v.status}` : ""}
        </option>
      ))}
    </select>
  );
}
