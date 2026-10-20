import clsx from "clsx";
import Link from "next/link";
import { missingSections, type ResolvedTemplate, type SectionLike, type TemplateSection } from "@/lib/guides/templates";

/**
 * The sections of a template. With `sections` (a guide's), each row also says whether the guide
 * has it; without, it is a read-only view of the outline.
 */
export function TemplateChecklist({ template, sections }: { template: { sections: TemplateSection[] }; sections?: SectionLike[] }) {
  const missing = new Set(sections ? missingSections(template, sections) : []);
  return (
    <ol className="-my-2" aria-label="Template sections">
      {template.sections.map((s, i) => {
        const written = !missing.has(s);
        const status = !sections ? null : written ? "Written" : s.required ? "Missing" : "Not written";
        return (
          <li key={s.title} className="flex items-baseline gap-3 border-t border-dashed border-line py-2.5 first:border-t-0">
            <span className="font-mono text-[11px] text-black/45">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] text-ink">{s.title}</p>
              {s.guidance ? <p className="mt-0.5 text-[12px] leading-[18px] text-muted">{s.guidance}</p> : null}
            </div>
            <span className="tag">{s.required ? "required" : "optional"}</span>
            {status ? (
              <span
                className={clsx(
                  "w-[92px] text-right font-mono text-[10px] tracking-[0.08em] uppercase",
                  written ? "text-olive" : s.required ? "text-danger" : "text-black/40",
                )}
              >
                {status}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Strip above a guide listing required template sections it lacks. Only render it for workspace members. */
export function TemplateGapsNotice({ template, missing, editHref }: { template: ResolvedTemplate; missing: TemplateSection[]; editHref: string }) {
  if (missing.length === 0) return null;
  return (
    <div
      role="note"
      aria-label="Missing template sections"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-line bg-danger/[0.04] px-4 py-2 text-[12px] text-ink lg:px-6"
    >
      <span className="dot bg-danger" />
      <span>
        Missing from the {template.name} template: {missing.map((s) => s.title).join(", ")}.
      </span>
      <span className="text-body">Required sections reviewers expect in every guide.</span>
      <Link href={editHref} className="link">
        Add {missing.length === 1 ? "it" : "them"} in the editor
      </Link>
    </div>
  );
}
