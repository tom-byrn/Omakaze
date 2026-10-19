import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkdownField } from "@/components/guide/editor/MarkdownField";
import { SectionEditor } from "@/components/guide/editor/SectionEditor";
import { TemplateChecklist } from "@/components/guide/TemplateChecklist";
import { Panel } from "@/components/settings/Panel";
import { ActionForm } from "@/components/ui/ActionForm";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { findWorkspaceRepo } from "@/lib/github/connections";
import { getSnapshot } from "@/lib/github/pulls";
import { formatRefLines } from "@/lib/guides/ref-lines";
import { describeCoverage, getCoverage, getGuide, getSections, guidePath, listGuideVersions } from "@/lib/guides/service";
import { missingSections, placeholderFor, templateSectionFor } from "@/lib/guides/templates";
import { requireWorkspace } from "@/lib/workspaces";
import {
  addSectionAction,
  deleteSectionAction,
  moveSectionAction,
  publishGuideAction,
  saveGuideMetaAction,
  saveSectionAction,
} from "./actions";

export const metadata = { title: "Edit guide" };

export default async function EditGuidePage(props: PageProps<"/w/[slug]/[owner]/[repo]/pull/[number]/edit">) {
  const { slug, owner, repo: repoName, number } = await props.params;
  const sp = await props.searchParams;
  const { workspace } = await requireWorkspace(slug);
  const repo = await findWorkspaceRepo(workspace.id, owner, repoName);
  const prNumber = Number(number);
  if (!repo || !Number.isInteger(prNumber)) notFound();
  const versions = await listGuideVersions(repo.id, prNumber);
  const meta = versions.find((v) => v.version === Number(sp.v)) ?? versions[0];
  if (!meta) notFound();
  const guide = (await getGuide(meta.id))!;
  const [sections, snapshot, coverage] = await Promise.all([getSections(guide.id), getSnapshot(guide.snapshotId), getCoverage(guide)]);
  const files = (snapshot?.files ?? []).map((f) => f.path);
  const viewPath = guidePath(slug, repo.fullName, prNumber, guide.version);
  const template = guide.template?.sections.length ? guide.template : null;
  const unwritten = missingSections(template, sections);

  return (
    <main className="mx-auto flex max-w-[980px] flex-col gap-6 px-4 py-10 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-dashed border-line pb-8">
        <div>
          <span className="eyebrow">
            Edit guide · v{guide.version} · {guide.status}
          </span>
          <h1 className="h2 mt-6">
            {repo.fullName}#{prNumber}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href={viewPath} className="btn btn-secondary btn-sm">
            View guide
          </Link>
          {guide.status !== "ready" ? (
            <ConfirmButton action={publishGuideAction.bind(null, slug, guide.id, viewPath)} className="btn btn-primary btn-sm" pendingText="Publishing…">
              Publish
            </ConfirmButton>
          ) : null}
        </div>
      </div>

      <Panel title="Coverage" description={<span className="font-mono text-[12px] whitespace-pre-wrap">{describeCoverage(coverage)}</span>} />

      {template ? (
        <Panel
          title={`Template · ${template.name}`}
          description={`The ${template.source === "repository" ? "repository's" : "workspace's"} template when this guide was started. A section counts once it has an explanation or diff references. Empty template sections are left out when you publish, and members see missing required sections above the guide.`}
        >
          <TemplateChecklist template={template} sections={sections} />
        </Panel>
      ) : null}

      <Panel title="Guide">
        <ActionForm action={saveGuideMetaAction.bind(null, slug, guide.id)} className="flex flex-col gap-3">
          <div>
            <label className="field-label" htmlFor="g-title">
              Title
            </label>
            <input id="g-title" name="title" defaultValue={guide.title} className="input" />
          </div>
          <div>
            <p className="field-label">Summary</p>
            <MarkdownField name="summary" defaultValue={guide.summary} guideId={guide.id} files={files} rows={8} />
          </div>
          <div>
            <SubmitButton className="btn btn-primary btn-sm" pendingText="Saving…">
              Save
            </SubmitButton>
          </div>
        </ActionForm>
      </Panel>

      {sections.map((s, i) => {
        const t = s.generated ? null : templateSectionFor(template, s.title);
        return (
          <SectionEditor
            key={s.id}
            index={i}
            total={sections.length}
            guideId={guide.id}
            files={files}
            section={{ id: s.id, title: s.title, body: s.body, refs: formatRefLines(s.refs), generated: s.generated }}
            saveAction={saveSectionAction.bind(null, slug, guide.id, s.id)}
            deleteAction={deleteSectionAction.bind(null, slug, guide.id, s.id)}
            moveAction={moveSectionAction.bind(null, slug, guide.id, s.id)}
            template={t ? { required: t.required, placeholder: placeholderFor(t) } : null}
          />
        );
      })}

      <Panel title="Add a section">
        <ActionForm action={addSectionAction.bind(null, slug, guide.id)} resetOnSuccess className="flex flex-col gap-3">
          <div>
            <label className="field-label" htmlFor="n-title">
              Title
            </label>
            <input
              id="n-title"
              name="title"
              className="input"
              placeholder={unwritten[0] ? `e.g. ${unwritten[0].title}` : "e.g. Database migration"}
              list={unwritten.length > 0 ? "template-titles" : undefined}
            />
            {unwritten.length > 0 ? (
              <datalist id="template-titles">
                {unwritten.map((t) => (
                  <option key={t.title} value={t.title} />
                ))}
              </datalist>
            ) : null}
          </div>
          <div>
            <p className="field-label">Explanation</p>
            <MarkdownField name="body" defaultValue="" guideId={guide.id} files={files} rows={6} />
          </div>
          <div>
            <label className="field-label" htmlFor="n-refs">
              Diff references
            </label>
            <textarea id="n-refs" name="refs" rows={4} className="input font-mono text-[12px]" placeholder={files.slice(0, 2).join("\n")} spellCheck={false} />
          </div>
          <div>
            <SubmitButton className="btn btn-secondary btn-sm" pendingText="Adding…">
              Add section
            </SubmitButton>
          </div>
        </ActionForm>
      </Panel>
    </main>
  );
}
