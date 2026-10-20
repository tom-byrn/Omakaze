import clsx from "clsx";
import type { GuideCheckConclusion } from "@/db/schema";
import { CONCLUSION_LABELS } from "@/lib/guides/check";

const STYLES: Record<GuideCheckConclusion | "error" | "queued", { tag: string; dot: string }> = {
  success: { tag: "border-olive/40 text-olive", dot: "bg-olive" },
  neutral: { tag: "", dot: "bg-black/40" },
  action_required: { tag: "border-highlight text-ink", dot: "bg-highlight" },
  in_progress: { tag: "border-ink/30 text-ink", dot: "animate-pulse-dot bg-blue-bright" },
  off: { tag: "text-black/50", dot: "bg-black/25" },
  error: { tag: "border-danger/40 text-danger", dot: "bg-danger" },
  queued: { tag: "text-black/55", dot: "animate-pulse-dot bg-black/30" },
};

/** The state of a guide check: its last conclusion, "Update failed" after an error, or "Queued". */
export function GuideCheckBadge({ conclusion, error }: { conclusion: GuideCheckConclusion | null; error?: boolean }) {
  const key = error ? "error" : (conclusion ?? "queued");
  const label = error ? "Update failed" : conclusion ? CONCLUSION_LABELS[conclusion] : "Queued";
  return (
    <span className={clsx("tag", STYLES[key].tag)}>
      <span className={clsx("dot", STYLES[key].dot)} /> {label}
    </span>
  );
}
