import clsx from "clsx";

export type PrState = "open" | "closed" | "merged" | "draft";

export function prStateOf(p: { state: string; merged: boolean; draft: boolean }): PrState {
  if (p.merged) return "merged";
  if (p.state === "closed") return "closed";
  if (p.draft) return "draft";
  return "open";
}

const STATE_STYLES: Record<PrState, string> = {
  open: "border-olive/40 text-olive",
  draft: "border-black/20 text-black/50",
  merged: "border-blue-deep/40 text-blue-deep",
  closed: "border-danger/40 text-danger",
};

export function PrStateTag({ state }: { state: PrState }) {
  return <span className={clsx("tag", STATE_STYLES[state])}>{state}</span>;
}

export function GuideChip({
  status,
  version,
  outdated,
}: {
  status: "draft" | "generating" | "ready" | "failed";
  version: number;
  outdated?: boolean;
}) {
  if (status === "generating") {
    return (
      <span className="tag border-ink/30 text-ink">
        <span className="dot animate-pulse-dot bg-blue-bright" /> Generating
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="tag border-danger/40 text-danger">
        <span className="dot bg-danger" /> Failed
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="tag">
        <span className="dot bg-black/30" /> Draft v{version}
      </span>
    );
  }
  return (
    <span className={clsx("tag", outdated ? "text-black/55" : "border-ink/40 text-ink")}>
      <span className={clsx("dot", outdated ? "bg-highlight" : "bg-ink")} /> Guide v{version}
      {outdated ? " · outdated" : ""}
    </span>
  );
}

export function DiffStat({ additions, deletions }: { additions: number | null; deletions: number | null }) {
  if (additions === null && deletions === null) return null;
  return (
    <span className="font-mono text-[11px] tracking-[0.02em] whitespace-nowrap">
      <span className="text-added">+{(additions ?? 0).toLocaleString("en")}</span>{" "}
      <span className="text-danger">−{(deletions ?? 0).toLocaleString("en")}</span>
    </span>
  );
}
