"use client";

import { useState, useTransition } from "react";
import type { FormState } from "@/components/ui/ActionForm";
import type { GuideCheckMode } from "@/db/schema";

const LABELS: Record<GuideCheckMode, string> = { off: "off", informational: "informational", required: "require review" };

/** Per-repository override of the workspace's guide check setting. */
export function GuideCheckSelect({
  value,
  inherited,
  action,
  disabled,
}: {
  value: GuideCheckMode | null;
  inherited: GuideCheckMode;
  action: (v: "inherit" | GuideCheckMode) => Promise<FormState>;
  disabled?: boolean;
}) {
  const [v, setV] = useState<"inherit" | GuideCheckMode>(value ?? "inherit");
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Guide check"
      className="input h-8 w-[220px] text-[13px]"
      value={v}
      disabled={pending || disabled}
      onChange={(e) => {
        const next = e.target.value as "inherit" | GuideCheckMode;
        setV(next);
        start(async () => {
          await action(next);
        });
      }}
    >
      <option value="inherit">Check: workspace default ({LABELS[inherited]})</option>
      <option value="off">Check: off</option>
      <option value="informational">Check: informational</option>
      <option value="required">Check: require review</option>
    </select>
  );
}
