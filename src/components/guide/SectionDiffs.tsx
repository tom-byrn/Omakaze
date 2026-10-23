"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import type { FileView } from "@/lib/diff/fileview";
import type { SectionChange } from "@/lib/guides/carryover";
import type { SectionRef } from "@/lib/guides/refs";
import { withShareToken } from "@/lib/share/url";
import { DiffFile, type DiffFileProps } from "./DiffFile";
import type { FocusTarget, Thread } from "./types";

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

function useNearViewport<T extends Element>(eager: boolean) {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(eager);
  useEffect(() => {
    if (near || !ref.current) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), {
      rootMargin: "800px 0px",
    });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [near]);
  return { ref, near };
}

function FileLoader(
  props: Omit<DiffFileProps, "view"> & { guideId: string; path: string; eager: boolean; additions: number; deletions: number; shareToken?: string },
) {
  const { ref, near } = useNearViewport<HTMLDivElement>(props.eager || props.focus?.path === props.path);
  const { data, error } = useSWR<FileView>(
    near ? withShareToken(`/api/guides/${props.guideId}/file?path=${encodeURIComponent(props.path)}`, props.shareToken) : null,
    fetcher,
    { revalidateOnFocus: false, revalidateIfStale: false },
  );
  if (data) return <DiffFile {...props} view={data} />;
  return (
    <div ref={ref} className="border border-black/15 bg-white" data-path={props.path}>
      <div className="flex items-center gap-2 border-b border-dashed border-line bg-paper px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{props.path}</span>
        <span className="font-mono text-[11px]">
          <span className="text-added">+{props.additions}</span> <span className="text-danger">−{props.deletions}</span>
        </span>
      </div>
      {error ? (
        <p className="px-4 py-6 text-[13px] text-danger">{error.message}</p>
      ) : (
        <div className="space-y-2 px-4 py-5" aria-label="Loading diff">
          <div className="h-3 w-2/3 animate-pulse bg-black/[0.05]" />
          <div className="h-3 w-1/2 animate-pulse bg-black/[0.05]" />
          <div className="h-3 w-3/5 animate-pulse bg-black/[0.05]" />
        </div>
      )}
    </div>
  );
}

export function SectionDiffs({
  guideId,
  files,
  refs,
  mode,
  threadsByPath,
  focus,
  blobBase,
  wrap,
  onComment,
  onReply,
  onDelete,
  newSince,
  onResolve,
  showResolved,
  shareToken,
}: {
  guideId: string;
  files: { path: string; additions: number; deletions: number }[];
  refs: SectionRef[];
  mode: "section" | "all";
  threadsByPath: Map<string, Map<string, Thread[]>>;
  focus: FocusTarget | null;
  blobBase: string;
  wrap: boolean;
  /** Missing in the read-only view, like onReply. */
  onComment?: DiffFileProps["onComment"];
  onReply?: DiffFileProps["onReply"];
  onDelete?: DiffFileProps["onDelete"];
  /** Lines new since an earlier version are marked (see InterdiffPanel). */
  newSince?: SectionChange | null;
  onResolve?: DiffFileProps["onResolve"];
  showResolved?: boolean;
  /** A share link's token, sent with file requests in the read-only view. */
  shareToken?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {files.map((f, i) => (
        <FileLoader
          key={`${mode}:${f.path}`}
          guideId={guideId}
          path={f.path}
          additions={f.additions}
          deletions={f.deletions}
          eager={mode === "section" || i < 4}
          refs={refs.filter((r) => r.path === f.path)}
          mode={mode}
          threads={threadsByPath.get(f.path)}
          focus={focus}
          blobUrl={`${blobBase}/${f.path.split("/").map(encodeURIComponent).join("/")}`}
          wrap={wrap}
          onComment={onComment}
          onReply={onReply}
          onDelete={onDelete}
          newSince={newSince?.files.find((x) => x.path === f.path)?.marks}
          onResolve={onResolve}
          showResolved={showResolved}
          shareToken={shareToken}
        />
      ))}
    </div>
  );
}
