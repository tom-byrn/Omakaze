"use client";

import { useState, useTransition } from "react";
import type { FormState } from "@/components/ui/ActionForm";

type Role = "owner" | "admin" | "member";

export function RoleSelect({
  value,
  action,
  canGrantOwner,
}: {
  value: Role;
  action: (role: Role) => Promise<FormState>;
  canGrantOwner: boolean;
}) {
  const [role, setRole] = useState<Role>(value);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <select
        aria-label="Role"
        className="input h-8 w-[120px] text-[13px]"
        value={role}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Role;
          const prev = role;
          setRole(next);
          start(async () => {
            const res = await action(next);
            if (res?.error) {
              setError(res.error);
              setRole(prev);
            } else setError(null);
          });
        }}
      >
        <option value="member">Member</option>
        <option value="admin">Admin</option>
        <option value="owner" disabled={!canGrantOwner}>
          Owner
        </option>
      </select>
      {error ? <span className="mt-1 max-w-[220px] text-right text-[11px] text-danger">{error}</span> : null}
    </span>
  );
}
