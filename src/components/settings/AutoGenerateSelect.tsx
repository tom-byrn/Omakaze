"use client";

import { useState, useTransition } from "react";
import type { FormState } from "@/components/ui/ActionForm";

export function AutoGenerateSelect({
  value,
  inherited,
  action,
  disabled,
}: {
  value: boolean | null;
  inherited: boolean;
  action: (v: "inherit" | "on" | "off") => Promise<FormState>;
  disabled?: boolean;
}) {
  const [v, setV] = useState(value === null ? "inherit" : value ? "on" : "off");
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Automatic guides"
      className="input h-8 w-[200px] text-[13px]"
      value={v}
      disabled={pending || disabled}
      onChange={(e) => {
        const next = e.target.value as "inherit" | "on" | "off";
        setV(next);
        start(async () => {
          await action(next);
        });
      }}
    >
      <option value="inherit">Workspace default ({inherited ? "on" : "off"})</option>
      <option value="on">On</option>
      <option value="off">Off</option>
    </select>
  );
}
