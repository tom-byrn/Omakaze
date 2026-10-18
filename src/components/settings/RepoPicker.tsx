"use client";

import { RiLock2Line, RiSearchLine } from "@remixicon/react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { FormMessage, type FormState } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Conn = { id: string; label: string };
type RepoItem = { fullName: string; private: boolean; description: string | null; added: boolean };

export function RepoPicker({
  slug,
  connections,
  action,
}: {
  slug: string;
  connections: Conn[];
  action: (prev: FormState, form: FormData) => Promise<FormState>;
}) {
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? "");
  const [loaded, setLoaded] = useState<{ key: string; repos: RepoItem[]; error: string | null } | null>(null);
  const [filter, setFilter] = useState("");
  const [state, formAction] = useActionState(action, undefined);
  const [manual, setManual] = useState("");
  const loadKey = `${connectionId}:${state?.ok ? (state.message ?? "") : ""}`;
  const current = loaded?.key === loadKey ? loaded : null;
  const repos = current?.repos ?? null;
  const listError = current?.error ?? null;

  useEffect(() => {
    if (!connectionId) return;
    let cancelled = false;
    fetch(`/api/w/${slug}/connections/${connectionId}/repos`)
      .then((r) => r.json())
      .then((d: { repos?: RepoItem[]; error?: string | null }) => {
        if (!cancelled) setLoaded({ key: loadKey, repos: d.repos ?? [], error: d.error ?? null });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key: loadKey, repos: [], error: "Could not load repositories." });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, connectionId, loadKey]);

  const shown = useMemo(
    () => (repos ?? []).filter((r) => r.fullName.toLowerCase().includes(filter.toLowerCase())).slice(0, 50),
    [repos, filter],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <label className="label" htmlFor="conn">
            Connection
          </label>
          <select id="conn" className="input" value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <form action={formAction} className="flex flex-col">
          <label className="label" htmlFor="manual">
            Repository
          </label>
          <div className="flex gap-2">
            <input type="hidden" name="connectionId" value={connectionId} />
            <input
              id="manual"
              name="fullName"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="owner/name or a GitHub URL"
              className="input font-mono"
            />
            <SubmitButton pendingText="Adding…" disabled={!manual.trim()}>
              Add
            </SubmitButton>
          </div>
        </form>
      </div>
      <FormMessage state={state} />
      <div className="border border-dashed border-line">
        <div className="relative border-b border-dashed border-line">
          <RiSearchLine size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-black/40" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter accessible repositories"
            className="h-10 w-full bg-transparent pl-8 text-[14px] outline-none"
          />
        </div>
        {repos === null && !listError ? <p className="px-3 py-4 text-[13px] text-muted">Loading repositories…</p> : null}
        {listError ? (
          <p className="px-3 py-4 text-[13px] text-body">
            This connection cannot list repositories ({listError}). Enter the repository name above.
          </p>
        ) : null}
        {repos && !listError && shown.length === 0 ? <p className="px-3 py-4 text-[13px] text-muted">No repositories found.</p> : null}
        <ul className="max-h-80 overflow-auto">
          {shown.map((r) => (
            <li key={r.fullName} className="flex items-center gap-3 border-t border-dashed border-line px-3 py-2 first:border-t-0">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-mono text-[12px] text-ink">
                  {r.fullName} {r.private ? <RiLock2Line size={11} className="text-black/40" /> : null}
                </span>
                {r.description ? <span className="block truncate text-[12px] text-muted">{r.description}</span> : null}
              </span>
              {r.added ? (
                <span className="tag">Added</span>
              ) : (
                <form action={formAction}>
                  <input type="hidden" name="connectionId" value={connectionId} />
                  <input type="hidden" name="fullName" value={r.fullName} />
                  <SubmitButton className="btn btn-secondary btn-xs" pendingText="Adding…">
                    Add
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
