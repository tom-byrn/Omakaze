import clsx from "clsx";
import { notFound } from "next/navigation";
import { PrintControls } from "@/components/guide/PrintControls";
import { PrintDiff } from "@/components/guide/PrintDiff";
import { Markdown } from "@/components/markdown/Markdown";
import { LogoMark } from "@/components/ui/Logo";
import { formatDate, plural, shortSha } from "@/lib/format";
import { findWorkspaceRepo } from "@/lib/github/connections";
import { coveragePercent, coverageSentences, coverageSummary, describeRange, sectionFiles, VIA_LABEL } from "@/lib/guides/export";
import { loadFileViews, loadGuideExport } from "@/lib/guides/export-data";
import { getGuide, guidePath, listGuideVersions } from "@/lib/guides/service";
import { missingRequired } from "@/lib/guides/templates";
import { sectionStats } from "@/lib/guides/view";
import { requireWorkspace } from "@/lib/workspaces";
import "./print.css";

export async function generateMetadata(props: PageProps<"/w/[slug]/[owner]/[repo]/pull/[number]/print">) {
  const { owner, repo, number } = await props.params;
  return { title: `Print ${owner}/${repo}#${number}` };
}

/** A CSS string literal for user text (the running footer of printed pages). */
function cssString(text: string): string {
  return `"${text.replace(/[\\"<>\n\r]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`;
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-4 border-t border-dashed border-line py-2 sm:grid-cols-[150px_minmax(0,1fr)] print:py-1.5">
      <dt className="mono-label pt-0.5">{label}</dt>
      <dd className="min-w-0 text-[13px] break-words text-ink">{children}</dd>
    </div>
  );
}

function Delta({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <>
      <span className="text-[#1f8a85]">+{additions.toLocaleString("en")}</span> <span className="text-danger">−{deletions.toLocaleString("en")}</span>
    </>
  );
}

/**
 * The whole guide laid out for paper: a cover with the metadata, the summary, then every section
 * with its explanation and its diff. The browser's print dialog saves it as a PDF.
 */
export default async function PrintPage(props: PageProps<"/w/[slug]/[owner]/[repo]/pull/[number]/print">) {
  const { slug, owner, repo: repoName, number } = await props.params;
  const sp = await props.searchParams;
  const { workspace, user } = await requireWorkspace(slug);
  const repo = await findWorkspaceRepo(workspace.id, owner, repoName);
  const prNumber = Number(number);
  if (!repo || !Number.isInteger(prNumber) || prNumber < 1) notFound();
  const versions = await listGuideVersions(repo.id, prNumber);
  const meta = versions.find((v) => v.version === Number(sp.v)) ?? versions[0];
  if (!meta) notFound();
  const guide = (await getGuide(meta.id))!;

  const { data, snapshot } = await loadGuideExport(guide, repo, workspace.slug);
  const { pull, files } = data;
  const sections = data.sections.map((s) => ({ ...s, files: sectionFiles(s.refs, files), stats: sectionStats(s.refs, files) }));
  const views = await loadFileViews(guide, snapshot, [...new Set(sections.flatMap((s) => s.files.map((f) => f.path)))]);
  const coverage = coverageSummary(files, data.sections, data.snapshot.truncated);
  const missing = guide.template?.sections.length ? missingRequired(guide.template, data.sections) : [];
  const additions = files.reduce((n, f) => n + f.additions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);
  const outdated = pull.headSha !== null && pull.headSha !== guide.headSha;
  const prRef = `${repo.fullName}#${prNumber}`;
  const commitUrl = `${repo.htmlUrl}/commit/${guide.headSha}`;
  const now = new Date();

  return (
    <div className="print-guide min-h-[calc(100vh)] bg-wash">
      <style>{`@page { @bottom-left { content: ${cssString(`${prRef} · v${guide.version} · ${guide.title}`)}; } } @page :first { @bottom-left { content: none; } }`}</style>
      <PrintControls backHref={guidePath(slug, repo.fullName, prNumber, guide.version)} label={`${prRef} · v${guide.version}`} autoPrint={sp.autoprint === "1"} />
      <main className="print-doc mx-auto max-w-[880px] px-4 py-6 sm:py-10">
        <article className="print-sheet border border-black/15 bg-white px-5 py-8 sm:px-12 sm:py-12">
          <section className="print-cover">
            <div className="flex items-center justify-between gap-4 border-b border-dashed border-line pb-4">
              <span className="flex items-center gap-2">
                <LogoMark size={22} />
                <span className="font-serif text-[17px] tracking-[-0.02em] text-black">Omakaze</span>
              </span>
              <span className="mono-label">Guided pull request</span>
            </div>

            <div className="mt-12 sm:mt-16 print:mt-10">
              <span className="eyebrow">Guided PR · v{guide.version}</span>
              <h1 className="mt-6 font-serif text-[34px] leading-[1.03] tracking-[-0.035em] text-black sm:text-[46px]">{guide.title}</h1>
              <p className="mt-4 font-mono text-[11px] tracking-[0.04em] text-meta">
                {repo.fullName} / #{prNumber}
                {pull.headRef && pull.baseRef ? ` · ${pull.headRef} → ${pull.baseRef}` : ""}
              </p>
              {pull.title !== guide.title ? <p className="mt-2 text-[14px] text-body">{pull.title}</p> : null}
            </div>

            <div className="mt-10 grid grid-cols-3 border border-black/15 bg-white print:mt-7">
              {[
                { label: "Files changed", value: files.length.toLocaleString("en") },
                { label: "Lines", value: <Delta additions={additions} deletions={deletions} /> },
                { label: "Covered by sections", value: `${coveragePercent(coverage)}%` },
              ].map((s, i) => (
                <div key={s.label} className={clsx("px-3 py-3 sm:px-5 sm:py-4", i > 0 && "border-l border-dashed border-line")}>
                  <p className="font-serif text-[20px] leading-none tracking-[-0.03em] text-stat sm:text-[28px]">{s.value}</p>
                  <p className="mt-2 text-[12px] text-muted">{s.label}</p>
                </div>
              ))}
            </div>

            <dl className="mt-8 border-b border-dashed border-line print:mt-6">
              <Meta label="Pull request">
                <a href={pull.htmlUrl} className="underline decoration-black/25 underline-offset-[3px]">
                  {pull.htmlUrl.replace(/^https?:\/\//, "")}
                </a>
              </Meta>
              {pull.authorLogin ? <Meta label="Author">{pull.authorLogin}</Meta> : null}
              <Meta label="Head commit">
                <a href={commitUrl} className="font-mono text-[12px] underline decoration-black/25 underline-offset-[3px]">
                  {shortSha(guide.headSha)}
                </a>
                {outdated ? <span className="ml-2 text-[12px] text-body">The pull request now points to {shortSha(pull.headSha)}.</span> : null}
              </Meta>
              <Meta label="Guide">
                Version {guide.version} of {versions.length} · {guide.status}
              </Meta>
              <Meta label="Written">
                {guide.author ? `${guide.author} ` : ""}via {VIA_LABEL[guide.createdVia] ?? guide.createdVia} · {formatDate(guide.createdAt)}
              </Meta>
              {guide.template?.sections.length ? (
                <Meta label="Template">
                  {guide.template.name ?? "Outline"} ({guide.template.source})
                  {missing.length ? <span className="text-danger"> · missing required: {missing.map((s) => s.title).join(", ")}</span> : null}
                </Meta>
              ) : null}
              <Meta label="Printed">
                {formatDate(now)} by {user.name}
              </Meta>
              <Meta label="In Omakaze">
                <span className="font-mono text-[11.5px]">{data.guideUrl}</span>
              </Meta>
            </dl>

            <div className="mt-10 print:mt-7">
              <p className="mono-label">Contents</p>
              <ol className="mt-3">
                {data.guide.summary.trim() ? (
                  <li className="flex items-baseline gap-3 border-t border-dashed border-line py-2.5 first:border-t-0 print:py-1.5">
                    <span className="font-mono text-[11px] text-black/45">00</span>
                    <span className="flex-1 font-serif text-[18px] leading-[1.15] tracking-[-0.015em] text-black">Overview</span>
                  </li>
                ) : null}
                {sections.map((s, i) => (
                  <li key={i} className="flex items-baseline gap-3 border-t border-dashed border-line py-2.5 first:border-t-0 print:py-1.5">
                    <span className="font-mono text-[11px] text-black/45">{String(i + 1).padStart(2, "0")}</span>
                    <span className={clsx("flex-1 font-serif text-[18px] leading-[1.15] tracking-[-0.015em]", s.generated ? "text-black/55" : "text-black")}>{s.title}</span>
                    <span className="font-mono text-[10px] whitespace-nowrap text-black/45 uppercase">{plural(s.files.length, "file")}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {data.guide.summary.trim() ? (
            <section className="print-page">
              <span className="eyebrow">Overview</span>
              <h2 className="mt-5 font-serif text-[30px] leading-[1.05] tracking-[-0.03em] text-black">Summary</h2>
              <div className="mt-6">
                <Markdown source={data.guide.summary} />
              </div>
            </section>
          ) : null}

          {sections.map((s, i) => (
            <section key={i} className="print-page" aria-label={`Section ${i + 1}: ${s.title}`}>
              <span className="eyebrow">
                Section {String(i + 1).padStart(2, "0")} / {String(sections.length).padStart(2, "0")}
              </span>
              <h2 className="mt-5 font-serif text-[28px] leading-[1.05] tracking-[-0.03em] text-black sm:text-[32px]">{s.title}</h2>
              <p className="mt-3 font-mono text-[10px] tracking-[0.08em] text-black/50 uppercase">
                {plural(s.files.length, "file")} · <Delta additions={s.stats.additions} deletions={s.stats.deletions} />
                {s.generated ? " · added automatically for changes no other section covers" : ""}
              </p>
              {s.body.trim() ? (
                <div className="mt-6">
                  <Markdown source={s.body} />
                </div>
              ) : null}
              {s.files.length > 0 ? (
                <div className="mt-8 flex flex-col gap-4">
                  {s.files.map((f) => {
                    const view = views.get(f.path);
                    return view ? <PrintDiff key={f.path} view={view} refs={s.refs.filter((r) => r.path === f.path)} /> : null;
                  })}
                </div>
              ) : null}
            </section>
          ))}

          <section className="print-coverage mt-14 border-t border-dashed border-line pt-8">
            <p className="mono-label">Coverage</p>
            <p className="mt-3 text-[14px] leading-[1.6] text-text">{coverageSentences(coverage).join(" ")}</p>
            {coverage.uncovered.length > 0 ? (
              <ul className="mt-3 font-mono text-[11.5px] text-ui">
                {coverage.uncovered.map((u, i) => (
                  <li key={i}>
                    {u.path} {describeRange(u)} ({plural(u.changedLines, "line")})
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-6 font-mono text-[10px] tracking-[0.04em] text-meta">
              Printed from Omakaze on {formatDate(now)}. Diffs are from the guide&apos;s snapshot at {shortSha(guide.headSha)}.
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
