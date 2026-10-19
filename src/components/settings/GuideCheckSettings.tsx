import { eq } from "drizzle-orm";
import Link from "next/link";
import { GuideCheckBadge } from "@/components/app/GuideCheckBadge";
import { Markdown } from "@/components/markdown/Markdown";
import { Panel } from "@/components/settings/Panel";
import { ActionForm, type FormState } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { db } from "@/db";
import { githubConnections, type GuideCheckMode } from "@/db/schema";
import { shortSha, timeAgo } from "@/lib/format";
import { getAppGrant, getGitHubApp, missingGuideCheckPermissions } from "@/lib/github/app";
import { recentGuideChecks } from "@/lib/github/guide-check";
import { CHECK_RUN_NAME, STATUS_CONTEXT } from "@/lib/guides/check";
import { guidePath } from "@/lib/guides/service";
import type { Workspace } from "@/lib/workspaces";

const MODES: { value: GuideCheckMode; label: string; help: string }[] = [
  { value: "off", label: "Off", help: "Nothing is posted to GitHub." },
  {
    value: "informational",
    label: "Informational",
    help: "Shows progress such as “3 of 6 sections reviewed” and never blocks merging: check runs are neutral, commit statuses succeed.",
  },
  {
    value: "required",
    label: "Require review",
    help: "Passes once every section is reviewed by enough members. Until then a check run asks for action and a commit status stays pending. Make it a required status check in the branch protection rules to block merging until then.",
  },
];

/** Settings → Automation: the guide check setting and the last updates sent to GitHub. */
export async function GuideCheckSettings({
  workspace,
  admin,
  action,
}: {
  workspace: Workspace;
  admin: boolean;
  action: (prev: FormState, form: FormData) => Promise<FormState>;
}) {
  const slug = workspace.slug;
  const [connections, recent] = await Promise.all([
    db.select({ type: githubConnections.type }).from(githubConnections).where(eq(githubConnections.workspaceId, workspace.id)),
    recentGuideChecks(workspace.id),
  ]);
  const app = connections.some((c) => c.type === "app") ? await getGitHubApp() : null;
  const grant = app ? await getAppGrant(app) : null;
  const missing = grant ? missingGuideCheckPermissions(grant.permissions).filter((p) => p === "Checks") : [];

  return (
    <>
      <Panel
        title="Guide check on GitHub"
        description={
          <>
            Reports review progress on the head commit of each open pull request, with a link to the guide. GitHub App
            connections post a check run named “{CHECK_RUN_NAME}”; token and account connections post a commit status named{" "}
            <code className="font-mono text-[12px] text-ink">{STATUS_CONTEXT}</code>. Repositories can override this on the{" "}
            <Link className="link" href={`/w/${slug}/repos`}>
              Repositories
            </Link>{" "}
            page.
          </>
        }
      >
        {missing.length > 0 && grant ? (
          <p className="mb-4 border border-dashed border-highlight bg-highlight/10 px-3 py-2 text-[13px] text-ink">
            The GitHub App can&apos;t post check runs: it was created without the Checks permission.{" "}
            <a className="link" href={grant.settingsUrl} target="_blank" rel="noreferrer">
              Add Checks (read and write)
            </a>{" "}
            under Repository permissions, then accept the new permission for the installation.
          </p>
        ) : null}
        <ActionForm action={action} className="flex flex-col">
          <fieldset className="flex flex-col" disabled={!admin}>
            <legend className="sr-only">Guide check</legend>
            {MODES.map((m) => (
              <label key={m.value} className="flex cursor-pointer items-start gap-3 border-t border-dashed border-line py-4 first-of-type:border-t-0">
                <input
                  type="radio"
                  name="guideCheck"
                  value={m.value}
                  defaultChecked={workspace.guideCheck === m.value}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#141518]"
                />
                <span>
                  <span className="block text-[14px] text-ink">{m.label}</span>
                  <span className="block text-[13px] leading-[20px] text-body">{m.help}</span>
                </span>
              </label>
            ))}
            <div className="flex flex-wrap items-end gap-4 border-t border-dashed border-line py-4">
              <div>
                <label className="field-label" htmlFor="guideCheckReviewers">
                  Reviewers per section
                </label>
                <input
                  id="guideCheckReviewers"
                  name="guideCheckReviewers"
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={workspace.guideCheckReviewers}
                  className="input w-24"
                />
              </div>
              <p className="max-w-[460px] pb-1 text-[13px] leading-[20px] text-body">
                Members who must mark a section as reviewed before it counts. Marks by people who left the workspace don&apos;t count.
              </p>
            </div>
          </fieldset>
          {admin ? (
            <div className="mt-2 mb-3">
              <SubmitButton pendingText="Saving…">Save</SubmitButton>
            </div>
          ) : null}
        </ActionForm>
      </Panel>

      {recent.length > 0 ? (
        <Panel title="Recent guide checks" description="The last updates sent to GitHub, newest first, with the summary that was posted.">
          <ul className="-my-2">
            {recent.map(({ check, fullName, prTitle }, i) => (
              <li key={check.id} className="border-t border-dashed border-line py-3 first:border-t-0" data-testid="recent-guide-check">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <GuideCheckBadge conclusion={check.conclusion} error={Boolean(check.error)} />
                  <Link href={guidePath(slug, fullName, check.prNumber)} className="font-mono text-[12px] text-ink hover:underline">
                    {fullName}#{check.prNumber}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-body" title={prTitle ?? undefined}>
                    {check.title ?? prTitle}
                  </span>
                  <span className="font-mono text-[11px] text-meta">
                    {check.method === "check_run" ? "check run" : "commit status"}
                    {check.headSha ? ` · ${shortSha(check.headSha)}` : ""}
                    {check.postedAt ? ` · ${timeAgo(check.postedAt)}` : ""}
                  </span>
                </div>
                {check.error ? (
                  <p className="mt-1.5 text-[12px] leading-[18px] text-danger">
                    The last update failed{check.postedAt ? "; GitHub still shows the one below" : ""}. {check.error}
                  </p>
                ) : null}
                {check.summary ? (
                  <details className="group mt-2" open={i === 0}>
                    <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.08em] text-meta hover:text-ink">
                      {check.method === "check_run" ? "Summary of the check run" : "Summary (a commit status shows only the title)"}
                    </summary>
                    <div className="mt-2 border border-dashed border-line bg-paper px-4 py-3">
                      <p className="font-serif text-[18px] leading-tight tracking-[-0.01em] text-black">{check.title}</p>
                      <Markdown source={check.summary} className="guide-prose mt-2 text-[13px]" />
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}
