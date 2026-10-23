import { RiExternalLinkLine, RiGitBranchLine } from "@remixicon/react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { cache } from "react";
import { DiffStat, PrStateTag, prStateOf } from "@/components/app/Badges";
import { GuideViewer } from "@/components/guide/GuideViewer";
import { VersionSelect } from "@/components/guide/VersionSelect";
import { Markdown } from "@/components/markdown/Markdown";
import { Logo } from "@/components/ui/Logo";
import { env } from "@/lib/env";
import { formatDate, shortSha, timeAgo } from "@/lib/format";
import { getCachedPull } from "@/lib/github/pulls";
import { getGuide } from "@/lib/guides/service";
import { loadGuideData } from "@/lib/guides/view";
import { clientIp } from "@/lib/http";
import { openShareLink, sharedVersions, type OpenedShare } from "@/lib/share/links";
import { pickSharedVersion } from "@/lib/share/policy";
import { shareAssetUrl } from "@/lib/share/url";

// One lookup per request, shared by the metadata and the page (each lookup counts toward the rate limit).
const openLink = cache(async (token: string) => openShareLink(token, clientIp(await headers())));

export async function generateMetadata(props: PageProps<"/s/[token]">): Promise<Metadata> {
  const { token } = await props.params;
  const opened = await openLink(token);
  return {
    title: opened.state === "active" ? `${opened.repo.fullName}#${opened.link.prNumber} · Shared guide` : "Shared guide",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

/** A read-only guide for anyone with the link (src/lib/share). No session is read or needed. */
export default async function SharedGuidePage(props: PageProps<"/s/[token]">) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  const opened = await openLink(token);
  if (opened.state !== "active") return <Unavailable opened={opened} />;
  const { link, repo } = opened;

  const versions = await sharedVersions(link);
  const requested = typeof sp.v === "string" && /^\d+$/.test(sp.v) ? Number(sp.v) : null;
  const picked = pickSharedVersion(versions, link.guideId === null ? requested : null);
  const [guide, pull] = await Promise.all([picked ? getGuide(picked.id) : null, getCachedPull(repo.id, link.prNumber)]);
  if (!guide || !pull) {
    return (
      <Notice state="empty" title="Nothing to show yet.">
        The guide for this pull request isn&apos;t published yet. Try again later.
      </Notice>
    );
  }

  const data = await loadGuideData(guide, null);
  const appUrl = env().APP_URL;
  const md = (source: string) => <Markdown source={source} urlTransform={(url) => shareAssetUrl(url, token, appUrl)} />;
  const sectionParam = typeof sp.section === "string" ? sp.section : null;
  const initialStep = sectionParam === "files" ? ("files" as const) : Number(sectionParam) || 0;
  const ref = `${repo.fullName}#${pull.number}`;

  return (
    <div className="flex h-screen flex-col overflow-hidden" data-shared-guide>
      <header className="flex h-16 flex-none items-center gap-4 border-b border-dashed border-line-header bg-paper/97 px-4 lg:px-6">
        <Logo />
        <span className="h-6 border-l border-dashed border-line" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[13px] text-body">
          <span className="hidden sm:inline">Shared, read-only view of </span>
          <span className="sm:hidden">Read-only · </span>
          <span className="font-mono text-[12px] text-ink">{ref}</span>
        </p>
        <span className="hidden font-mono text-[10px] tracking-[0.08em] whitespace-nowrap text-black/45 uppercase md:inline">
          {link.expiresAt ? `Link expires ${formatDate(link.expiresAt)}` : "Shared link"}
        </span>
      </header>
      <div className="flex-none border-b border-solid border-black/15 bg-paper">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 lg:px-6">
          {/* Full width on phones, so the title isn't squeezed next to the version. */}
          <div className="min-w-0 flex-1 basis-full md:basis-0">
            <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.04em] text-meta">
              <span>{repo.fullName}</span>
              <span>/</span>
              <span>#{pull.number}</span>
              <PrStateTag state={prStateOf(pull)} />
              <span className="tag">Read-only</span>
            </div>
            <h1 className="mt-1 truncate font-serif text-[22px] leading-tight tracking-[-0.02em] text-black" title={pull.title}>
              {pull.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                <RiGitBranchLine size={12} /> {pull.headRef} → {pull.baseRef}
              </span>
              <DiffStat additions={pull.additions} deletions={pull.deletions} />
              {pull.changedFiles !== null ? <span>{pull.changedFiles} files</span> : null}
              <span>updated {timeAgo(pull.githubUpdatedAt)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {link.guideId === null && versions.length > 1 ? (
              <VersionSelect versions={versions.map((v) => ({ version: v.version, status: v.status, headSha: shortSha(v.headSha) }))} current={guide.version} />
            ) : (
              <span className="tag font-mono">
                v{guide.version} · {shortSha(guide.headSha)}
                {link.guideId === null ? " · latest" : ""}
              </span>
            )}
            <a href={pull.htmlUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
              GitHub <RiExternalLinkLine size={13} />
            </a>
          </div>
        </div>
        {guide.headSha !== pull.headSha ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-line bg-highlight/15 px-4 py-2 text-[12px] text-ink lg:px-6">
            <span className="dot bg-highlight" />
            This guide covers {shortSha(guide.headSha)}. The pull request now points to {shortSha(pull.headSha)}.
          </div>
        ) : null}
      </div>
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
          error: null,
          summary: md(guide.summary),
          hasSummary: guide.summary.trim().length > 0,
        }}
        sections={data.sections.map((s) => ({
          id: s.id,
          title: s.title,
          refs: s.refs,
          generated: s.generated,
          body: md(s.body),
          files: s.stats.files,
          additions: s.stats.additions,
          deletions: s.stats.deletions,
          reviewedBy: [],
        }))}
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
        members={{}}
        me={{ id: "", name: "", hasGitHub: false }}
        initialStep={initialStep}
        agentPrompt=""
        canGenerate={false}
        readOnly={{ shareToken: token, comments: link.includeComments }}
      />
    </div>
  );
}

function Unavailable({ opened }: { opened: Exclude<OpenedShare, { state: "active" }> }) {
  switch (opened.state) {
    case "revoked":
      return (
        <Notice state="revoked" title="This link was revoked.">
          The person who shared it turned it off. Ask them for a new link.
        </Notice>
      );
    case "expired":
      return (
        <Notice state="expired" title="This link has expired.">
          It stopped working on {formatDate(opened.link.expiresAt)}. Ask the person who shared it for a new link.
        </Notice>
      );
    case "disabled":
      return opened.scope === "instance" ? (
        <Notice state="disabled" title="Share links are turned off.">
          This Omakaze instance doesn&apos;t serve share links.
        </Notice>
      ) : (
        <Notice state="disabled" title="Sharing is turned off.">
          The workspace that shared this guide has turned share links off.
        </Notice>
      );
    case "limited":
      return (
        <Notice state="limited" title="Too many attempts.">
          Try again in a few minutes.
        </Notice>
      );
    default:
      return (
        <Notice state="invalid" title="This link is not valid.">
          Check that you copied the whole link, or ask the person who shared it for a new one.
        </Notice>
      );
  }
}

function Notice({ state, title, children }: { state: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col grain" data-share-state={state}>
      <header className="flex h-16 items-center border-b border-dashed border-line-header px-6 lg:px-12">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-[480px] border border-black/15 bg-white p-8">
          <span className="eyebrow">Shared guide</span>
          <h1 className="h3 mt-6">{title}</h1>
          <p className="body-copy mt-3">{children}</p>
        </div>
      </main>
    </div>
  );
}
