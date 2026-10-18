"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";
import { CopyButton } from "@/components/ui/CopyButton";

type Status = {
  status: "draft" | "generating" | "ready" | "failed";
  sections: number;
  error: string | null;
  events: { at: string; message: string; level?: string }[];
};

export function GenerationStatus({
  guideId,
  status,
  error,
  sectionCount,
  agentPrompt,
  onChange,
}: {
  guideId: string;
  status: "draft" | "generating" | "ready" | "failed";
  error: string | null;
  sectionCount: number;
  agentPrompt: string;
  onChange: () => void;
}) {
  const { data } = useSWR<Status>(
    status === "generating" ? `/api/guides/${guideId}/status` : null,
    (url: string) => fetch(url).then((r) => r.json()),
    { refreshInterval: 2000 },
  );
  const last = useRef({ sections: sectionCount, status });
  useEffect(() => {
    if (!data) return;
    if (data.sections !== last.current.sections || data.status !== last.current.status) {
      last.current = { sections: data.sections, status: data.status };
      onChange();
    }
  }, [data, onChange]);

  if (status === "failed") {
    return (
      <div className="mb-8 border border-danger/40 bg-white p-5">
        <p className="mono-label text-danger">Generation failed</p>
        <p className="mt-2 text-[14px] leading-[22px] text-text">{error ?? "Unknown error"}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <CopyButton text={agentPrompt} label="Copy agent prompt" className="btn btn-secondary btn-sm" />
        </div>
      </div>
    );
  }

  const events = data?.events ?? [];
  return (
    <div className="mb-8 border border-black/15 bg-white">
      <div className="flex items-center gap-2 border-b border-dashed border-line px-4 py-3">
        <span className="dot animate-pulse-dot bg-blue-bright" />
        <p className="mono-label">Writing this guide · {data?.sections ?? sectionCount} sections so far</p>
      </div>
      <ol className="max-h-48 overflow-auto px-4 py-3 font-mono text-[11px] leading-[18px] text-ui">
        {events.length === 0 ? <li>Waiting for the first update…</li> : null}
        {events.map((e, i) => (
          <li key={i} className={e.level === "error" ? "text-danger" : e.level === "warn" ? "text-[#8a6d00]" : undefined}>
            <span className="text-black/35">{new Date(e.at).toLocaleTimeString("en", { hour12: false })}</span> {e.message}
          </li>
        ))}
      </ol>
    </div>
  );
}
