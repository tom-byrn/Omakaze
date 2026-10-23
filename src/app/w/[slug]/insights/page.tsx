import clsx from "clsx";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/PageHeader";
import { ColumnChart, InlineBar, Legend, LineChart, ShareBar, type ChartSeries } from "@/components/insights/Charts";
import { ChartTable, DataTable, ORIGIN_COLORS, Panel, PanelEmpty, Stat } from "@/components/insights/Panel";
import { RepoFilter } from "@/components/insights/RepoFilter";
import { Avatar } from "@/components/ui/Avatar";
import { plural } from "@/lib/format";
import type { InsightPanel } from "@/lib/insights/export";
import {
  COMPLETION_LABELS,
  COMPLETION_STATES,
  formatDuration,
  GUIDE_ORIGINS,
  INSIGHT_RANGES,
  insightsQuery,
  ORIGIN_LABELS,
  parseRange,
  percent,
  share,
  shortDate,
  type CompletionState,
  type GuideOrigin,
  type InsightRange,
} from "@/lib/insights/model";
import {
  backfillCoverage,
  completion,
  coverage,
  guidesCreated,
  hotFiles,
  hotSections,
  insightRepos,
  insightScope,
  memberStats,
  reviewSpeed,
  templateCompliance,
  unreviewedSections,
} from "@/lib/insights/queries";
import { requireWorkspace } from "@/lib/workspaces";

export const metadata = { title: "Insights" };

const SOURCE_SERIES: ChartSeries[] = GUIDE_ORIGINS.map((o) => ({ key: o, label: ORIGIN_LABELS[o], color: ORIGIN_COLORS[o] }));

const SPEED_SERIES: ChartSeries[] = [
  { key: "first", label: "First section reviewed", color: "var(--color-ink)", marker: "circle" },
  { key: "all", label: "All sections reviewed", color: "var(--color-meta)", marker: "square" },
];

/** One hue light to dark, in the product's neutrals: not reviewed, partly, fully. */
const COMPLETION_COLORS: Record<CompletionState, string> = { full: "var(--color-ink)", partial: "var(--color-ui)", none: "var(--color-solid)" };

const hoursTick = (h: number) => `${h} h`;

export default async function InsightsPage(props: PageProps<"/w/[slug]/insights">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const { workspace, user, role } = await requireWorkspace(slug);
  const days = parseRange(sp.days);
  const repos = await insightRepos(workspace.id);
  const repoParam = typeof sp.repo === "string" ? sp.repo.toLowerCase() : "";
  const repo = repos.find((r) => r.fullName.toLowerCase() === repoParam) ?? null;
  const base = `/w/${slug}/insights`;
  const href = (opts: { days?: InsightRange; repo?: string | null }) => `${base}${insightsQuery({ days: opts.days ?? days, repo: opts.repo === undefined ? repo?.fullName : opts.repo })}`;
  const csv = (panel: InsightPanel) => `/api/w/${slug}/insights/${panel}${insightsQuery({ days, repo: repo?.fullName })}`;

  if (repos.length === 0) {
    return (
      <main className="mx-auto max-w-[1240px] px-4 py-10 lg:px-8">
        <PageHeader eyebrow={`Workspace · ${workspace.name}`} title="Insights." description="How guides are written and reviewed in this workspace." />
        <div className="mt-10">
          <EmptyState title="Nothing to measure yet." action={<Link href={`/w/${slug}/repos`} className="btn btn-primary btn-md">Add repository</Link>}>
            Insights count the guides, review marks and comments of the repositories this workspace follows.
          </EmptyState>
        </div>
      </main>
    );
  }

  const scope = insightScope(workspace.id, days, repo?.id ?? null);
  await backfillCoverage(workspace.id);
  const [created, speed, done, unreviewed, sections, files, cov, members, templates] = await Promise.all([
    guidesCreated(scope),
    reviewSpeed(scope),
    completion(scope),
    unreviewedSections(scope),
    hotSections(scope),
    hotFiles(scope),
    coverage(scope),
    memberStats(scope, { userId: user.id, role }),
    templateCompliance(scope),
  ]);
  const pull = (repoFullName: string, n: number, q?: { v?: number | null; section?: number | string | null }) => {
    const params = new URLSearchParams();
    if (q?.v) params.set("v", String(q.v));
    if (q?.section) params.set("section", String(q.section));
    const qs = params.toString();
    return `/w/${slug}/${repoFullName}/pull/${n}${qs ? `?${qs}` : ""}`;
  };
  const rangeLabel = `the last ${days} days`;
  const maxReviewed = Math.max(1, ...members.rows.map((r) => r.reviewed));
  const fullShare = share(done.states.full, done.guides);

  return (
    <main className="mx-auto max-w-[1240px] px-4 py-10 lg:px-8">
      <PageHeader
        eyebrow={`Workspace · ${workspace.name}`}
        title="Insights."
        description="How guides are written and reviewed: where they come from, how fast members review them, what gets skipped and where the discussion is."
      />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <nav className="flex w-fit border border-tab" aria-label="Time range">
          {INSIGHT_RANGES.map((d, i) => (
            <Link
              key={d}
              href={href({ days: d })}
              className={clsx(
                "flex h-10 items-center px-4 font-serif text-[15px]",
                i > 0 && "border-l border-tab",
                d === days ? "bg-ink text-white" : "bg-paper text-black hover:bg-black/[0.03]",
              )}
              aria-current={d === days ? "page" : undefined}
            >
              {d} days
            </Link>
          ))}
        </nav>
        <RepoFilter
          repos={repos.map((r) => r.fullName)}
          current={repo?.fullName ?? null}
          hrefs={Object.fromEntries([["", href({ repo: null })], ...repos.map((r) => [r.fullName, href({ repo: r.fullName })])])}
        />
        <p className="font-mono text-[11px] text-meta sm:ml-auto">
          {shortDate(scope.since)} – {shortDate(new Date(scope.until.getTime() - 1))} · days in UTC
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 border border-solid border-black/15 bg-white md:grid-cols-5" role="group" aria-label="Summary">
        {[
          { key: "guides", value: created.total.toLocaleString("en"), label: "Guides created", note: `${plural(speed.published, "version")} published` },
          { key: "first-review", value: formatDuration(speed.firstMedian), label: "To first review", note: `median of ${plural(speed.reviewed, "guide")}` },
          { key: "full-review", value: formatDuration(speed.allMedian), label: "To full review", note: `median of ${plural(speed.completed, "guide")}` },
          { key: "fully-reviewed", value: percent(fullShare), label: "Fully reviewed", note: `${done.states.full} of ${plural(done.guides, "pull request")}` },
          { key: "coverage", value: percent(cov.median), label: "Median coverage", note: "by the author's sections" },
        ].map(({ key, ...s }, i) => (
          <div
            key={key}
            data-stat={key}
            className={clsx("border-dashed border-line", i % 2 === 1 && "border-l", i >= 2 && "border-t md:border-t-0", i > 0 && "md:border-l", i === 4 && "col-span-2 md:col-span-1")}
          >
            <Stat {...s} />
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          id="guides"
          title="Guides created"
          description={`Guide versions started per ${created.unit} in ${rangeLabel}, by who wrote them. Failed generations are left out.`}
          csv={csv("guides")}
        >
          {created.total === 0 ? (
            <PanelEmpty>No guides were started in {rangeLabel}.</PanelEmpty>
          ) : (
            <>
              <Legend series={SOURCE_SERIES.filter((x) => created.totals[x.key as GuideOrigin] > 0)} minimum={1} className="mb-3" />
              <ColumnChart
                label="Guides created by source"
                series={SOURCE_SERIES}
                columns={created.buckets.map((b) => ({ label: b.label, axis: shortDate(b.start), values: b.values }))}
                integer
                footer={(c) => plural(GUIDE_ORIGINS.reduce((n, o) => n + (c.values[o] ?? 0), 0), "guide")}
              />
              <ChartTable
                label="Guides created by source"
                head={[created.unit === "day" ? "Day" : "Week", ...GUIDE_ORIGINS.map((o) => ORIGIN_LABELS[o]), "Total"]}
                rows={[
                  ...created.buckets.filter((b) => b.total > 0).map((b) => [b.label, ...GUIDE_ORIGINS.map((o) => b.values[o]), b.total]),
                  ["Total", ...GUIDE_ORIGINS.map((o) => created.totals[o]), created.total],
                ]}
              />
            </>
          )}
        </Panel>

        <Panel
          id="review-speed"
          title="Review speed"
          description={`Median time from publishing a version to its first review mark, and until every section has one, per ${speed.unit}. Each median counts the versions that got that far; marks carried over from an earlier version are left out.`}
          csv={csv("review-speed")}
        >
          {speed.reviewed === 0 ? (
            <PanelEmpty>No guide published in {rangeLabel} has a review mark yet.</PanelEmpty>
          ) : (
            <>
              <Legend series={SPEED_SERIES} className="mb-3" />
              <LineChart
                label="Median hours to review"
                series={SPEED_SERIES}
                columns={speed.buckets.map((b) => ({
                  label: b.label,
                  axis: shortDate(b.start),
                  values: { first: b.firstMedian === null ? null : b.firstMedian / 3600, all: b.allMedian === null ? null : b.allMedian / 3600 },
                }))}
                format={(h) => formatDuration(h * 3600)}
                tick={hoursTick}
                footer={(c) => {
                  const b = speed.buckets.find((x) => x.label === c.label);
                  return b ? `${plural(b.published, "version")} published` : null;
                }}
              />
              <ChartTable
                label="Review speed"
                head={[speed.unit === "day" ? "Day" : "Week", "Published", "Reviewed", "To first review", "Fully reviewed", "To full review"]}
                rows={speed.buckets
                  .filter((b) => b.published > 0)
                  .map((b) => [b.label, b.published, b.reviewed, formatDuration(b.firstMedian), b.completed, formatDuration(b.allMedian)])}
              />
            </>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel
            id="completion"
            title="Completion"
            description="The latest version of each pull request published in the range: did every section get a review mark? Marks carried over from an earlier version count, since the code is the same."
            csv={csv("completion")}
          >
            {done.guides === 0 ? (
              <PanelEmpty>No guides were published in {rangeLabel}.</PanelEmpty>
            ) : (
              <>
                <p className="mb-4 text-[14px] text-text">
                  <span className="font-serif text-[26px] leading-none tracking-[-0.02em] text-stat">{percent(fullShare)}</span>{" "}
                  of {plural(done.guides, "pull request")} fully reviewed, {done.reviewedSections} of {plural(done.sections, "section")} marked.
                </p>
                <ShareBar
                  label="Guides by review state"
                  parts={COMPLETION_STATES.map((s) => ({ key: s, label: COMPLETION_LABELS[s], value: done.states[s], color: COMPLETION_COLORS[s] }))}
                />
              </>
            )}
          </Panel>

          <Panel
            id="unreviewed-sections"
            className="flex-1"
            title="Sections left unreviewed"
            description="Section titles most often without any review mark, in the same pull requests as Completion."
            csv={csv("unreviewed-sections")}
          >
            {unreviewed.length === 0 ? (
              <PanelEmpty>{done.guides === 0 ? `No guides were published in ${rangeLabel}.` : "Every section has a review mark."}</PanelEmpty>
            ) : (
              <DataTable
                label="Sections left unreviewed"
                widths={["32%", "92px"]}
                head={["Section", "", "Unreviewed"]}
                rows={unreviewed.map((s) => [
                  s.title,
                  <InlineBar key="bar" value={s.share ?? 0} max={1} />,
                  <span key="n">
                    {s.unreviewed} <span className="text-meta">of {s.appearances}</span>
                  </span>,
                ])}
              />
            )}
          </Panel>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Panel
            id="coverage"
            title="Coverage"
            description={`How much of each version's changed lines the author's own sections covered; the rest went to "Other changes". Every version published in ${rangeLabel}.`}
            csv={csv("coverage")}
          >
            {cov.guides === 0 ? (
              <PanelEmpty>No guides with changed lines were published in {rangeLabel}.</PanelEmpty>
            ) : (
              <>
                <p className="mb-3 text-[13px] text-text">
                  Median <span className="font-medium text-ink">{percent(cov.median)}</span> · {percent(cov.otherShare)} of all changed lines went to “Other
                  changes”
                </p>
                <Legend series={SOURCE_SERIES.filter((x) => cov.bySource.some((b) => b.origin === x.key))} minimum={1} className="mb-3" />
                <ColumnChart
                  label="Guides by share of changed lines covered"
                  series={SOURCE_SERIES}
                  columns={cov.bins.map((b) => ({ label: `${b.label} covered`, axis: b.label, values: b.values }))}
                  integer
                  height={170}
                  footer={(c) => plural(GUIDE_ORIGINS.reduce((n, o) => n + (c.values[o] ?? 0), 0), "guide")}
                />
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted" aria-label="Median coverage by source">
                  {cov.bySource.map((b) => (
                    <li key={b.origin}>
                      {ORIGIN_LABELS[b.origin]} <span className="font-mono text-ink">{percent(b.median)}</span>
                    </li>
                  ))}
                </ul>
                <ChartTable
                  label="Coverage"
                  head={["Covered", ...GUIDE_ORIGINS.map((o) => ORIGIN_LABELS[o]), "Total"]}
                  rows={[
                    ...cov.bins.map((b) => [b.label, ...GUIDE_ORIGINS.map((o) => b.values[o]), b.total]),
                    ["Median", ...GUIDE_ORIGINS.map((o) => percent(cov.bySource.find((s) => s.origin === o)?.median ?? null)), percent(cov.median)],
                  ]}
                />
              </>
            )}
          </Panel>

          <Panel
            id="templates"
            className="flex-1"
            title="Template compliance"
            description="The same pull requests, where the guide was started with a template: how many lack a required section, and which."
            csv={csv("templates")}
          >
            {templates.guides === 0 ? (
              <PanelEmpty>No guides in {rangeLabel} were started with a template.</PanelEmpty>
            ) : (
              <>
                <p className="mb-4 text-[14px] text-text">
                  <span className="font-serif text-[26px] leading-none tracking-[-0.02em] text-stat">{percent(share(templates.missing, templates.guides))}</span>{" "}
                  of {plural(templates.guides, "guide")} with a template miss a required section.
                </p>
                {templates.sections.length > 0 ? (
                  <DataTable
                    label="Missing required sections"
                    head={["Required section", "Template", "Missing in"]}
                    rows={templates.sections.map((s) => [s.title, <span key="t" className="font-sans text-ui">{s.template}</span>, plural(s.missing, "guide")])}
                  />
                ) : null}
              </>
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          id="hot-sections"
          title="Most discussed sections"
          description="Line comments and replies posted through Omakaze in the range, by the section they were made in."
          csv={csv("hot-sections")}
        >
          {sections.length === 0 ? (
            <PanelEmpty>No comments were posted through Omakaze in {rangeLabel}.</PanelEmpty>
          ) : (
            <DataTable
              label="Most discussed sections"
              widths={["28%", "84px"]}
              head={["Section", "", "Comments"]}
              rows={sections.map((s) => [
                <Link key="l" href={pull(s.repoFullName, s.prNumber, { v: s.version, section: s.position })} className="group/link block min-w-0">
                  <span className="block truncate text-ink group-hover/link:underline">{s.title}</span>
                  <span className="block truncate font-mono text-[11px] text-meta">
                    {repos.length > 1 ? `${s.repoFullName}` : ""}#{s.prNumber} v{s.version} · {s.prTitle ?? ""}
                  </span>
                </Link>,
                <InlineBar key="bar" value={s.comments} max={sections[0].comments} />,
                <span key="n" title={`${plural(s.people, "commenter")}`}>
                  {s.comments}
                </span>,
              ])}
            />
          )}
        </Panel>

        <Panel
          id="hot-files"
          title="Most discussed files"
          description="The same comments by file, across pull requests. Each file links to the section of its latest comment."
          csv={csv("hot-files")}
        >
          {files.length === 0 ? (
            <PanelEmpty>No comments were posted through Omakaze in {rangeLabel}.</PanelEmpty>
          ) : (
            <DataTable
              label="Most discussed files"
              widths={["28%", "84px"]}
              head={["File", "", "Comments"]}
              rows={files.map((f) => [
                <Link
                  key="l"
                  href={pull(f.repoFullName, f.link.prNumber, f.link.version && f.link.position ? { v: f.link.version, section: f.link.position } : { section: "files" })}
                  className="group/link block min-w-0"
                >
                  <span className="block truncate font-mono text-[12px] text-ink group-hover/link:underline" title={f.path}>
                    {f.path}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-meta">
                    {repos.length > 1 ? `${f.repoFullName} · ` : ""}
                    {plural(f.pulls, "pull request")}
                  </span>
                </Link>,
                <InlineBar key="bar" value={f.comments} max={files[0].comments} />,
                f.comments,
              ])}
            />
          )}
        </Panel>
      </div>

      <div className="mt-6">
        <Panel
          id="members"
          title="Members"
          description={
            members.everyone
              ? `Review marks, comments and reviews in ${rangeLabel}. Carried-over marks were made on an earlier version and are not counted as reviews.`
              : `Your review marks, comments and reviews in ${rangeLabel}, and the team's. Owners and admins see every member.`
          }
          csv={csv("members")}
        >
          <div className="overflow-x-auto">
            <DataTable
              label="Members"
              className="min-w-[640px]"
              head={["Member", "Sections reviewed", "Carried over", "Comments", "Reviews", "Resolved", "Guides started"]}
              rows={[...members.rows, members.total].map((m) => {
                const isTotal = m === members.total;
                return [
                  <span key="who" className={clsx("flex items-center gap-2", isTotal && "font-medium text-ink")}>
                    {isTotal ? null : <Avatar src={m.avatarUrl} name={m.name} size={20} />}
                    {m.name}
                    {m.userId === user.id ? <span className="tag h-[18px]">You</span> : null}
                  </span>,
                  <span key="r" className="flex items-center justify-end gap-3">
                    {isTotal || !members.everyone ? null : (
                      <span className="hidden w-[90px] sm:block">
                        <InlineBar value={m.reviewed} max={maxReviewed} />
                      </span>
                    )}
                    {m.reviewed}
                  </span>,
                  m.carried,
                  m.comments,
                  m.reviews,
                  m.resolved,
                  m.guides,
                ];
              })}
            />
          </div>
        </Panel>
      </div>
    </main>
  );
}
