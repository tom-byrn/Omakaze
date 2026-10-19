import { RiExternalLinkLine, RiGitBranchLine } from "@remixicon/react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiffStat, PrStateTag, prStateOf } from "@/components/app/Badges";
import { GenerateButton } from "@/components/app/GenerateButton";
import { GuideViewer } from "@/components/guide/GuideViewer";
import { VersionSelect } from "@/components/guide/VersionSelect";
import { WatchLatestGuide } from "@/components/guide/WatchLatestGuide";
import { NoGuide } from "@/components/guide/NoGuide";
import { TemplateGapsNotice } from "@/components/guide/TemplateChecklist";
import { Markdown } from "@/components/markdown/Markdown";
import { ShareDialog } from "@/components/share/ShareDialog";
import { Avatar } from "@/components/ui/Avatar";
import { CopyButton } from "@/components/ui/CopyButton";
import { resolveAiConfigFor } from "@/lib/ai/chatgpt";
import { getGitHubAccount } from "@/lib/auth/users";
import { shortSha, timeAgo } from "@/lib/format";
import { findWorkspaceRepo, getRepoContext } from "@/lib/github/connections";
import { getCachedPull, pullNeedsRefresh, syncPull } from "@/lib/github/pulls";
import { listGuideVersions, getGuide } from "@/lib/guides/service";
import { missingRequiredSections } from "@/lib/guides/template-store";
import { loadGuideData } from "@/lib/guides/view";
import { agentPrompt } from "@/lib/prompts";
import { requireWorkspace } from "@/lib/workspaces";
import { startManualGuideAction } from "./edit/actions";
import { createShareLinkAction } from "@/app/w/[slug]/share-actions";
import { shareDialogData } from "@/app/w/[slug]/share-rows";

export async function generateMetadata(props: PageProps<"/w/[slug]/[owner]/[repo]/pull/[number]">) {
  const { owner, repo, number } = await props.params;
  return { title: `${owner}/${repo}#${number}` };
}

export default async function PullPage(props: PageProps<"/w/[slug]/[owner]/[repo]/pull/[number]">) {
  const { slug, owner, repo: repoName, number } = await props.params;
  const sp = await props.searchParams;
  const { workspace, user, role } = await requireWorkspace(slug);
  const repo = await findWorkspaceRepo(workspace.id, owner, repoName);
  const prNumber = Number(number);
  if (!repo || !Number.isInteger(prNumber) || prNumber < 1) notFound();

  let pull = await getCachedPull(repo.id, prNumber);
  if (!pull || pullNeedsRefresh(pull)) {
    try {
      pull = await syncPull(await getRepoContext(repo.id), prNumber);
    } catch {
      if (!pull) notFound();
    }
  }
  if (!pull) notFound();

  const versions = await listGuideVersions(repo.id, prNumber);
  const requested = Number(sp.v);
  const selectedMeta = versions.find((v) => v.version === requested) ?? versions[0] ?? null;
  const guide = selectedMeta ? await getGuide(selectedMeta.id) : null;
  const ai = await resolveAiConfigFor(workspace, user.id);
  const prompt = agentPrompt(pull.htmlUrl);
  const outdated = guide && guide.headSha !== pull.headSha;
  const sectionParam = typeof sp.section === "string" ? sp.section : null;
  // Required sections of the guide's template that it lacks. This page is only served to members.
  const template = guide?.template?.sections.length && guide.status !== "generating" ? guide.template : null;
  const templateGaps = template ? await missingRequiredSections(guide!) : [];
  // Read-only share links (src/lib/share), when the instance and the workspace allow them.
  const share = guide ? await shareDialogData(slug, workspace, { userId: user.id, role }, { repositoryId: repo.id, prNumber }) : null;

  const bar = (
    <div className="border-b border-solid border-black/15 bg-paper">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 lg:px-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.04em] text-meta">
            <Link href={`/w/${slug}/${repo.fullName}`} className="hover:text-ink hover:underline">
              {repo.fullName}
            </Link>
            <span>/</span>
            <span>#{pull.number}</span>
            <PrStateTag state={prStateOf(pull)} />
          </div>
          <h1 className="mt-1 truncate font-serif text-[22px] leading-tight tracking-[-0.02em] text-black" title={pull.title}>
            {pull.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Avatar src={pull.authorAvatarUrl} name={pull.authorLogin} size={16} /> {pull.authorLogin}
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px]">
              <RiGitBranchLine size={12} /> {pull.headRef} → {pull.baseRef}
            </span>
            <DiffStat additions={pull.additions} deletions={pull.deletions} />
            {pull.changedFiles !== null ? <span>{pull.changedFiles} files</span> : null}
            <span>updated {timeAgo(pull.githubUpdatedAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {versions.length > 0 ? <VersionSelect versions={versions.map((v) => ({ version: v.version, status: v.status, headSha: shortSha(v.headSha) }))} current={selectedMeta?.version ?? null} /> : null}
          <CopyButton text={prompt} label="Copy agent prompt" className="btn btn-secondary btn-sm" />
          {guide && share ? (
            <ShareDialog
              slug={slug}
              version={guide.version}
              versionReady={guide.status === "ready"}
              prNumber={pull.number}
              createAction={createShareLinkAction.bind(null, slug, guide.id)}
              cannotCreate={share.cannotCreate}
              links={share.links}
            />
          ) : null}
          {guide ? (
            <Link href={`/w/${slug}/${repo.fullName}/pull/${pull.number}/edit?v=${guide.version}`} className="btn btn-ghost btn-sm">
              Edit
            </Link>
          ) : null}
          {guide ? (
            <GenerateButton
              slug={slug}
              repositoryId={repo.id}
              prNumber={pull.number}
              label="Regenerate"
              className="btn btn-ghost btn-sm"
              chatgptPlan={ai?.source === "chatgpt"}
              disabledReason={ai ? null : "Add an AI provider in Settings → AI to regenerate here."}
            />
          ) : null}
          <a href={pull.htmlUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            GitHub <RiExternalLinkLine size={13} />
          </a>
        </div>
      </div>
      {guide?.status === "draft" ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-line bg-mist px-4 py-2 text-[12px] text-ink lg:px-6">
          <span className="dot bg-black/40" />
          Draft. Only people in this workspace can see it.
          <Link href={`/w/${slug}/${repo.fullName}/pull/${pull.number}/edit?v=${guide.version}`} className="link">
            Continue editing
          </Link>
        </div>
      ) : null}
      <WatchLatestGuide
        slug={slug}
        repositoryId={repo.id}
        prNumber={pull.number}
        currentVersion={guide?.version ?? null}
        pinned={Number.isInteger(requested) && requested > 0}
        basePath={`/w/${slug}/${repo.fullName}/pull/${pull.number}`}
      />
      {outdated ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-line bg-highlight/15 px-4 py-2 text-[12px] text-ink lg:px-6">
          <span className="dot bg-highlight" />
          This guide covers {shortSha(guide!.headSha)}. The pull request now points to {shortSha(pull.headSha)}.
          <span className="text-body">Regenerate, or ask your agent to update it.</span>
        </div>
      ) : null}
      {template ? (
        <TemplateGapsNotice template={template} missing={templateGaps} editHref={`/w/${slug}/${repo.fullName}/pull/${pull.number}/edit?v=${guide!.version}`} />
      ) : null}
    </div>
  );

  if (!guide) {
    return (
      <div className="flex min-h-[calc(100vh-64px)] flex-col">
        {bar}
        <NoGuide
          startManual={startManualGuideAction.bind(null, slug, repo.owner, repo.name, pull.number)}
          prompt={prompt}
          canGenerate={Boolean(ai)}
          slug={slug}
          repositoryId={repo.id}
          prNumber={pull.number}
          body={pull.body ? <Markdown source={pull.body} /> : null}
          generateButton={
            <GenerateButton
              slug={slug}
              repositoryId={repo.id}
              prNumber={pull.number}
              label="Generate with AI"
              className="btn btn-primary btn-md"
              chatgptPlan={ai?.source === "chatgpt"}
              disabledReason={ai ? null : "Add an AI provider in Settings → AI first."}
            />
          }
        />
      </div>
    );
  }

  const data = await loadGuideData(guide, user.id);
  const account = await getGitHubAccount(user.id);
  const initialStep =
    sectionParam === "review" ? ("review" as const) : sectionParam === "files" ? ("files" as const) : Number(sectionParam) || 0;

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col overflow-hidden">
      {bar}
      <GuideViewer
        key={guide.id}
        guide={{
          id: guide.id,
          title: guide.title,
          version: guide.version,
          status: guide.status,
          headSha: guide.headSha,
          author: guide.author,
          source: guide.source,
          createdVia: guide.createdVia,
          createdAt: guide.createdAt.toISOString(),
          error: guide.error,
          summary: <Markdown source={guide.summary} />,
          hasSummary: guide.summary.trim().length > 0,
        }}
        sections={data.sections.map((s) => ({
          id: s.id,
          title: s.title,
          refs: s.refs,
          generated: s.generated,
          body: <Markdown source={s.body} />,
          files: s.stats.files,
          additions: s.stats.additions,
          deletions: s.stats.deletions,
          reviewedBy: s.reviewedBy,
          carriedFrom: s.carriedFrom,
          reviewChange: s.reviewChange,
          visitChange: s.visitChange,
        }))}
        lastVisitAt={data.lastVisitAt?.toISOString() ?? null}
        sinceVisit={data.sinceVisit ? { ...data.sinceVisit, at: data.sinceVisit.at.toISOString() } : null}
        files={data.files.map((f) => ({
          path: f.path,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          sections: data.fileSections[f.path] ?? [],
        }))}
        coverage={{ total: data.coverage.totalChanged, covered: data.coverage.coveredChanged }}
        pull={{ number: pull.number, htmlUrl: pull.htmlUrl, headSha: pull.headSha }}
        repo={{ fullName: repo.fullName, htmlUrl: repo.htmlUrl }}
        members={data.members}
        me={{ id: user.id, name: user.name, hasGitHub: Boolean(account) }}
        initialStep={initialStep}
        agentPrompt={prompt}
        canGenerate={Boolean(ai)}
      />
    </div>
  );
}
