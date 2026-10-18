"use client";

import { RiArrowDownLine, RiArrowUpLine, RiDeleteBinLine } from "@remixicon/react";
import { ActionForm, type FormState } from "@/components/ui/ActionForm";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { MarkdownField } from "./MarkdownField";

export function SectionEditor({
  index,
  total,
  guideId,
  section,
  files,
  saveAction,
  deleteAction,
  moveAction,
}: {
  index: number;
  total: number;
  guideId: string;
  section: { id: string; title: string; body: string; refs: string; generated: boolean };
  files: string[];
  saveAction: (prev: FormState, form: FormData) => Promise<FormState>;
  deleteAction: () => Promise<FormState>;
  moveAction: (dir: -1 | 1) => Promise<FormState>;
}) {
  return (
    <section className="border border-black/15 bg-white" id={`section-${section.id}`}>
      <header className="flex items-center gap-2 border-b border-dashed border-line bg-paper px-4 py-2">
        <span className="font-mono text-[11px] text-black/45">{String(index + 1).padStart(2, "0")}</span>
        <span className="flex-1 truncate font-serif text-[17px] text-black">{section.title}</span>
        {section.generated ? <span className="tag">automatic</span> : null}
        <ConfirmButton action={() => moveAction(-1)} className="btn btn-ghost btn-xs" pendingText="…">
          <RiArrowUpLine size={13} />
        </ConfirmButton>
        <ConfirmButton action={() => moveAction(1)} className="btn btn-ghost btn-xs" pendingText="…">
          <RiArrowDownLine size={13} />
        </ConfirmButton>
        <ConfirmButton action={deleteAction} confirm={`Delete section "${section.title}"?`} className="btn btn-ghost btn-xs" pendingText="…">
          <RiDeleteBinLine size={13} />
        </ConfirmButton>
      </header>
      <ActionForm action={saveAction} className="flex flex-col gap-3 p-4">
        <div>
          <label className="field-label" htmlFor={`t-${section.id}`}>
            Title
          </label>
          <input id={`t-${section.id}`} name="title" defaultValue={section.title} className="input" />
        </div>
        <div>
          <p className="field-label">Explanation</p>
          <MarkdownField name="body" defaultValue={section.body} guideId={guideId} files={files} />
        </div>
        <div>
          <label className="field-label" htmlFor={`r-${section.id}`}>
            Diff references · one per line · path, path#2, path:10-40, optional &quot; | caption&quot;
          </label>
          <textarea
            id={`r-${section.id}`}
            name="refs"
            defaultValue={section.refs}
            rows={Math.min(10, Math.max(3, section.refs.split("\n").length + 1))}
            className="input font-mono text-[12px]"
            spellCheck={false}
          />
        </div>
        <div className="flex items-center gap-2">
          <SubmitButton className="btn btn-primary btn-sm" pendingText="Saving…">
            Save section
          </SubmitButton>
          <span className="text-[12px] text-muted">{index + 1} of {total}</span>
        </div>
      </ActionForm>
    </section>
  );
}
