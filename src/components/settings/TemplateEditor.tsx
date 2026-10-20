"use client";

import { RiAddLine, RiArrowDownLine, RiArrowUpLine, RiDeleteBinLine } from "@remixicon/react";
import clsx from "clsx";
import { useActionState, useState } from "react";
import { FormMessage, type FormState } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Section = { title: string; guidance: string; required: boolean };
type Outline = { name: string; sections: Section[] };
type Starter = Outline & { id: string; description: string };
type Row = Section & { key: number };

const sameSections = (a: Section[], b: Section[]) =>
  a.length === b.length && a.every((s, i) => s.title === b[i].title && s.guidance === b[i].guidance && s.required === b[i].required);

// Stable keys for rows, so inputs keep focus while rows move.
let rowKeys = 0;
const toRows = (sections: Section[]): Row[] => sections.map((s) => ({ ...s, key: rowKeys++ }));

/**
 * Edits a guide template: a starter to begin from, the ordered sections and the writing
 * instructions. For a repository, `inherit` adds the choice between the workspace outline and its own.
 */
export function TemplateEditor({
  action,
  starters,
  initial,
  instructions,
  inherit,
  maxSections,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  starters: Starter[];
  /** The saved outline, or null for none. */
  initial: Outline | null;
  instructions: { label: string; description: string; value: string; placeholder: string };
  inherit?: { own: boolean; workspaceLabel: string; workspaceOutline: Outline | null };
  maxSections: number;
}) {
  const [state, formAction] = useActionState(action, undefined);
  // A repository without its own outline starts from a copy of the workspace's.
  const start = initial ?? (inherit && !inherit.own ? inherit.workspaceOutline : null);
  const [own, setOwn] = useState(inherit ? inherit.own : true);
  const [name, setName] = useState(start?.name ?? "");
  const [rows, setRows] = useState<Row[]>(() => toRows(start?.sections ?? []));
  const sections: Section[] = rows.map(({ title, guidance, required }) => ({ title, guidance, required }));
  const active = rows.length === 0 ? "none" : (starters.find((s) => s.name === name && sameSections(s.sections, sections))?.id ?? null);

  function pick(starter: Starter | null) {
    const label = starter ? `the ${starter.name} starter` : "no outline";
    if (rows.length > 0 && active === null && !window.confirm(`Replace your outline with ${label}? Your changes to the sections are lost.`)) return;
    setName(starter?.name ?? "");
    setRows(toRows(starter?.sections ?? []));
  }

  function update(i: number, patch: Partial<Section>) {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  function move(i: number, dir: -1 | 1) {
    setRows((r) => {
      const j = i + dir;
      if (j < 0 || j >= r.length) return r;
      const next = [...r];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function add() {
    if (rows.length === 0 && !name) setName("Custom");
    setRows((r) => [...r, ...toRows([{ title: "", guidance: "", required: false }])]);
    // Focus the new title once it is rendered.
    setTimeout(() => document.querySelector<HTMLInputElement>("[data-template-row]:last-of-type input")?.focus(), 0);
  }

  const editing = !inherit || own;
  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="outline" value={JSON.stringify({ name, sections })} />
      {inherit ? (
        <fieldset>
          <legend className="field-label">Outline</legend>
          <input type="hidden" name="outlineMode" value={own ? "own" : "workspace"} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ChoiceCard checked={!own} onSelect={() => setOwn(false)} title="Workspace template" detail={inherit.workspaceLabel} />
            <ChoiceCard checked={own} onSelect={() => setOwn(true)} title="Own outline" detail="A different outline for this repository." />
          </div>
        </fieldset>
      ) : null}

      {editing ? (
        <>
          <fieldset>
            <legend className="field-label">Start from</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {starters.map((s) => (
                <ChoiceCard
                  key={s.id}
                  checked={active === s.id}
                  onSelect={() => pick(s)}
                  title={s.name}
                  detail={s.description}
                  meta={`${s.sections.length} sections · ${s.sections.filter((x) => x.required).length} required`}
                />
              ))}
              <ChoiceCard checked={active === "none"} onSelect={() => pick(null)} title="None" detail="No outline. Guides follow the general guidelines." meta="0 sections" />
            </div>
            {active === null ? <p className="mt-2 font-mono text-[10px] tracking-[0.08em] text-black/50 uppercase">Custom outline</p> : null}
          </fieldset>

          {rows.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="max-w-[360px]">
                <label className="field-label" htmlFor="template-name">
                  Template name
                </label>
                <input id="template-name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <p className="field-label">Sections, in reading order</p>
                <ol className="border border-black/15">
                  {rows.map((row, i) => (
                    <li key={row.key} data-template-row className="border-t border-dashed border-line bg-white px-3 py-3 first:border-t-0 sm:px-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-6 font-mono text-[11px] text-black/45">{String(i + 1).padStart(2, "0")}</span>
                        <input
                          aria-label={`Section ${i + 1} title`}
                          className="input h-9 min-w-[160px] flex-1"
                          value={row.title}
                          maxLength={80}
                          placeholder="Section title"
                          onChange={(e) => update(i, { title: e.target.value })}
                        />
                        <label className="flex h-9 items-center gap-1.5 px-1 text-[13px] text-ink">
                          <input type="checkbox" aria-label={`Section ${i + 1} required`} checked={row.required} onChange={(e) => update(i, { required: e.target.checked })} />
                          Required
                        </label>
                        <span className="flex">
                          <button type="button" className="btn btn-ghost btn-xs" aria-label={`Move section ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                            <RiArrowUpLine size={13} />
                          </button>
                          <button type="button" className="btn btn-ghost btn-xs" aria-label={`Move section ${i + 1} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                            <RiArrowDownLine size={13} />
                          </button>
                          <button type="button" className="btn btn-ghost btn-xs" aria-label={`Remove section ${i + 1}`} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
                            <RiDeleteBinLine size={13} />
                          </button>
                        </span>
                      </div>
                      <textarea
                        aria-label={`Section ${i + 1} guidance`}
                        className="input mt-2 min-h-[56px] field-sizing-content text-[13px] sm:ml-8 sm:w-[calc(100%-2rem)]"
                        rows={2}
                        maxLength={500}
                        value={row.guidance}
                        placeholder="What belongs in this section. Writers see this, and the editor shows it as placeholder text."
                        onChange={(e) => update(i, { guidance: e.target.value })}
                      />
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : null}
          <div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={add} disabled={rows.length >= maxSections}>
              <RiAddLine size={14} /> Add section
            </button>
          </div>
        </>
      ) : null}

      <div className="max-w-[720px]">
        <label className="field-label" htmlFor="template-instructions">
          {instructions.label}
        </label>
        <p className="mb-2 text-[13px] leading-[20px] text-body">{instructions.description}</p>
        <textarea
          id="template-instructions"
          name="instructions"
          className="input"
          rows={4}
          maxLength={4000}
          defaultValue={instructions.value}
          placeholder={instructions.placeholder}
        />
      </div>

      <FormMessage state={state} />
      <div>
        <SubmitButton pendingText="Saving…">Save template</SubmitButton>
      </div>
    </form>
  );
}

function ChoiceCard({ checked, onSelect, title, detail, meta }: { checked: boolean; onSelect: () => void; title: string; detail: string; meta?: string }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onSelect}
      className={clsx(
        "flex flex-col gap-1 border bg-white px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ink",
        checked ? "border-ink bg-paper" : "border-black/15 hover:border-black/40",
      )}
    >
      <span className="flex items-center gap-2 text-[14px] font-medium text-ink">
        <span className={clsx("dot", checked ? "bg-ink" : "bg-black/15")} />
        {title}
      </span>
      <span className="text-[12px] leading-[18px] text-muted">{detail}</span>
      {meta ? <span className="mt-1 font-mono text-[10px] tracking-[0.08em] text-black/45 uppercase">{meta}</span> : null}
    </button>
  );
}
