import { TemplateChecklist } from "@/components/guide/TemplateChecklist";
import { Panel } from "@/components/settings/Panel";
import { templatePrompt, type ResolvedTemplate, type TemplateOutline } from "@/lib/guides/templates";

/** A template for people who cannot change it. */
export function TemplateReadOnly({ outline, instructions, note }: { outline: TemplateOutline | null; instructions: string | null; note: string }) {
  return (
    <div className="flex flex-col gap-5">
      {outline && outline.sections.length > 0 ? (
        <div>
          <p className="field-label">{outline.name}</p>
          <TemplateChecklist template={outline} />
        </div>
      ) : (
        <p className="text-[14px] text-body">No outline. Guides follow the general guidelines.</p>
      )}
      {instructions ? (
        <div>
          <p className="field-label">Writing instructions</p>
          <p className="text-[14px] leading-[22px] whitespace-pre-wrap text-ink">{instructions}</p>
        </div>
      ) : null}
      <p className="text-[13px] text-muted">{note}</p>
    </div>
  );
}

/** The saved template exactly as the built-in AI and MCP agents receive it. */
export function TemplatePreview({ template }: { template: ResolvedTemplate | null }) {
  const text = templatePrompt(template);
  return (
    <Panel
      title="What writers receive"
      description="Added to the built-in AI's instructions, and shown to agents in get_pull_request and the create_guided_pr prompt. Saved settings only."
    >
      {text ? (
        <pre className="max-h-[420px] overflow-auto border border-dashed border-line bg-paper p-4 font-mono text-[12px] leading-[19px] whitespace-pre-wrap text-ink">
          {text}
        </pre>
      ) : (
        <p className="text-[14px] text-body">Nothing yet: no outline and no writing instructions.</p>
      )}
    </Panel>
  );
}
