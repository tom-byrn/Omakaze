import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/PageHeader";
import { AutoGenerateSelect } from "@/components/settings/AutoGenerateSelect";
import { Panel } from "@/components/settings/Panel";
import { TemplateEditor } from "@/components/settings/TemplateEditor";
import { TemplatePreview, TemplateReadOnly } from "@/components/settings/TemplatePanels";
import { findWorkspaceRepo } from "@/lib/github/connections";
import {
  describeOutline,
  MAX_TEMPLATE_SECTIONS,
  parseOutline,
  parseRepoTemplate,
  resolveTemplate,
  STARTER_TEMPLATES,
} from "@/lib/guides/templates";
import { requireWorkspace, roleAtLeast } from "@/lib/workspaces";
import { setRepoAutoGenerateAction } from "../../../settings/actions";
import { saveRepoTemplateAction } from "../../../settings/template/actions";

export async function generateMetadata(props: PageProps<"/w/[slug]/[owner]/[repo]/settings">) {
  const { owner, repo } = await props.params;
  return { title: `${owner}/${repo} settings` };
}

export default async function RepoSettingsPage(props: PageProps<"/w/[slug]/[owner]/[repo]/settings">) {
  const { slug, owner, repo: name } = await props.params;
  const { workspace, role } = await requireWorkspace(slug);
  const repo = await findWorkspaceRepo(workspace.id, owner, name);
  if (!repo) notFound();
  const admin = roleAtLeast(role, "admin");
  const own = parseRepoTemplate(repo.guideTemplate);
  const workspaceOutline = parseOutline(workspace.guideTemplate);

  return (
    <main className="mx-auto max-w-[980px] px-4 py-10 lg:px-8">
      <PageHeader
        eyebrow={`Repository · ${repo.fullName}`}
        title="Repository settings."
        description="Settings for this repository only. Everything else follows the workspace settings."
        actions={
          <>
            <Link href={`/w/${slug}/${repo.fullName}`} className="btn btn-secondary btn-sm">
              Pull requests
            </Link>
            <Link href={`/w/${slug}/repos`} className="btn btn-ghost btn-sm">
              All repositories
            </Link>
          </>
        }
      />
      <div className="mt-8 flex flex-col gap-6">
        <Panel
          title="Guide template"
          description={
            <>
              Use the{" "}
              <Link href={`/w/${slug}/settings/template`} className="link">
                workspace template
              </Link>{" "}
              or an outline of its own, for example the Migration starter for a database repository. Instructions you add here
              come after the workspace&apos;s writing instructions.
            </>
          }
        >
          {admin ? (
            <TemplateEditor
              action={saveRepoTemplateAction.bind(null, slug, repo.id)}
              starters={STARTER_TEMPLATES}
              initial={own?.outline ?? null}
              maxSections={MAX_TEMPLATE_SECTIONS}
              inherit={{ own: Boolean(own?.outline), workspaceLabel: describeOutline(workspaceOutline), workspaceOutline }}
              instructions={{
                label: "Additional instructions for this repository",
                description: "Added after the workspace's writing instructions, for the built-in AI and agents over MCP.",
                value: own?.instructions ?? "",
                placeholder: "e.g. Name the Terraform modules a change touches. Mention data that needs a backfill.",
              }}
            />
          ) : (
            <TemplateReadOnly
              outline={own?.outline ?? workspaceOutline}
              instructions={own?.instructions || null}
              note={own?.outline ? "This repository uses its own outline. Only admins can change it." : "This repository uses the workspace template. Only admins can change it."}
            />
          )}
        </Panel>

        <TemplatePreview template={resolveTemplate(workspace, repo)} />

        <Panel title="Automatic guides" description="Whether a guide is generated for every new pull request in this repository. See Settings → Automation for the other switches.">
          <AutoGenerateSelect
            value={repo.autoGenerate}
            inherited={workspace.autoGenerate}
            action={setRepoAutoGenerateAction.bind(null, slug, repo.id)}
            disabled={!admin}
          />
        </Panel>
      </div>
    </main>
  );
}
