"use client";

import { RiSparkling2Line } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generateGuideAction } from "@/app/w/[slug]/actions";

export function GenerateButton({
  slug,
  repositoryId,
  prNumber,
  disabledReason,
  label = "Generate",
  className = "btn btn-secondary btn-sm",
}: {
  slug: string;
  repositoryId: string;
  prNumber: number;
  disabledReason?: string | null;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className={className}
        disabled={pending || Boolean(disabledReason)}
        title={disabledReason ?? "Generate a guide with the configured AI provider"}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await generateGuideAction(slug, repositoryId, prNumber);
            if (res.error) setError(res.error);
            else if (res.url) router.push(res.url);
          })
        }
      >
        <RiSparkling2Line size={14} />
        {pending ? "Starting…" : label}
      </button>
      {error ? <span className="max-w-[260px] text-right text-[11px] text-danger">{error}</span> : null}
    </span>
  );
}
