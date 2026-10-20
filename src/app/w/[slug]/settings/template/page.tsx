import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { Panel } from "@/components/settings/Panel";
import { TemplateEditor } from "@/components/settings/TemplateEditor";
import { TemplatePreview, TemplateReadOnly } from "@/components/settings/TemplatePanels";
import { db } from "@/db";
import { repositories } from "@/db/schema";
import {
  describeOutline,
  MAX_TEMPLATE_SECTIONS,
  parseOutline,
  parseRepoTemplate,
  resolveTemplate,
  STARTER_TEMPLATES,
} from "@/lib/guides/templates";
import { requireWorkspace, roleAtLeast } from "@/lib/workspaces";
import { saveWorkspaceTemplateAction } from "./actions";

export const metadata = { title: "Guide template" };

export default async function TemplateSettingsPage(props: PageProps<"/w/[slug]/settings/template">) {
  const { slug } = await props.params;
  const { workspace, role } = await requireWorkspace(slug);
  const admin = roleAtLeast(role, "admin");
  const outline = parseOutline(workspace.guideTemplate);
  const repos = await db
    .select({ id: repositories.id, fullName: repositories.fullName, guideTemplate: repositories.guideTemplate })
    .from(repositories)
    .where(eq(repositories.workspaceId, workspace.id))
    .orderBy(asc(repositories.fullName));

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="Guide template"
        description="The outline guides in this workspace follow, however they are written: built-in generation, agents over MCP, the REST API and the editor. Writers get the sections in order with their guidance and are told which are required. A guide without a required section is still published; members see what is missing."
      >
        {admin ? (
          <TemplateEditor
            action={saveWorkspaceTemplateAction.bind(null, slug)}
            starters={STARTER_TEMPLATES}
            initial={outline}
            maxSections={MAX_TEMPLATE_SECTIONS}
            instructions={{
              label: "Writing instructions",
              description: "Free text for whoever writes a guide here: the built-in AI and agents over MCP. Repositories can add their own.",
              value: workspace.aiInstructions ?? "",
              placeholder: "e.g. Write in British English. Link the issue in the summary. Always explain database migrations.",
            }}
          />
        ) : (
          <TemplateReadOnly outline={outline} instructions={workspace.aiInstructions} note="Only admins can change the guide template." />
        )}
      </Panel>

      <TemplatePreview template={resolveTemplate(workspace, null)} />

      <Panel title={`Repositories (${repos.length})`} description="A repository can use its own outline and add instructions in its settings.">
        {repos.length === 0 ? (
          <p className="text-[13px] text-muted">No repositories yet.</p>
        ) : (
          <ul className="-my-2">
            {repos.map((r) => {
              const own = parseRepoTemplate(r.guideTemplate);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 border-t border-dashed border-line py-3 first:border-t-0">
                  <span className="min-w-0 flex-1 font-mono text-[13px] text-ink">{r.fullName}</span>
                  <span className="font-mono text-[11px] text-meta">
                    {own?.outline ? `Own outline: ${describeOutline(own.outline)}` : `Workspace template: ${describeOutline(outline)}`}
                    {own?.instructions ? " · extra instructions" : ""}
                  </span>
                  <Link href={`/w/${slug}/${r.fullName}/settings`} className="btn btn-ghost btn-xs">
                    Repository settings
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
