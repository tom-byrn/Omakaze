import { count, desc, ne, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app/AppHeader";
import { Panel } from "@/components/settings/Panel";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { CopyButton } from "@/components/ui/CopyButton";
import { db } from "@/db";
import { guides, jobs, users, webhookDeliveries, workspaces } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { signPayload } from "@/lib/crypto";
import { env } from "@/lib/env";
import { formatInterval, timeAgo } from "@/lib/format";
import { buildAppManifest, getGitHubApp } from "@/lib/github/app";
import { listUserWorkspaces } from "@/lib/workspaces";
import { removeStoredAppAction } from "./actions";
import { OrgSubmit } from "./OrgSubmit";

export const metadata = { title: "Instance settings" };

export default async function AdminPage(props: PageProps<"/admin">) {
  const user = await requireUser("/admin");
  if (!user.isInstanceAdmin) notFound();
  const sp = await props.searchParams;
  const app = await getGitHubApp();
  const list = await listUserWorkspaces(user.id);
  const e = env();
  const [[u], [w], [g], deliveries, failedJobs] = await Promise.all([
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(workspaces),
    db.select({ n: count() }).from(guides),
    db.select().from(webhookDeliveries).orderBy(desc(webhookDeliveries.receivedAt)).limit(15),
    db
      .select()
      .from(jobs)
      .where(or(ne(jobs.type, "poll_repos"), ne(jobs.status, "done")))
      .orderBy(desc(jobs.updatedAt))
      .limit(10),
  ]);
  const state = signPayload({ uid: user.id }, "github-manifest", 3600);
  const manifest = JSON.stringify(buildAppManifest(`Guided PRs (${new URL(e.APP_URL).host})`));
  const current = list.find((x) => x.workspace.id === user.lastWorkspaceId) ?? list[0];
  const created = typeof sp.created === "string" ? sp.created : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <div className="min-h-screen">
      <AppHeader
        user={user}
        current={current ? { slug: current.workspace.slug, name: current.workspace.name } : null}
        workspaces={list.map((x) => ({ slug: x.workspace.slug, name: x.workspace.name }))}
      />
      <main className="mx-auto flex max-w-[960px] flex-col gap-6 px-4 py-10 lg:px-8">
        <div>
          <span className="eyebrow">Instance</span>
          <h1 className="h2 mt-6">Instance settings.</h1>
          <p className="lead mt-3">Visible to instance admins. The first account created on an instance is an admin.</p>
        </div>
        {created ? <p className="border border-dashed border-olive/40 px-3 py-2 text-[13px] text-olive">GitHub App {created} created and saved.</p> : null}
        {error ? <p className="border border-dashed border-danger/40 px-3 py-2 text-[13px] text-danger">{error}</p> : null}

        <Panel
          title="GitHub App"
          description="Used for “Sign in with GitHub”, organization installs and webhooks. Create one here in a single step, or set the GITHUB_APP_* environment variables."
        >
          {app ? (
            <dl className="grid grid-cols-[160px_minmax(0,1fr)] gap-y-2 text-[14px]">
              <dt className="mono-label pt-0.5">App</dt>
              <dd className="font-mono text-[13px] text-ink">{app.slug || "(slug not set)"} · id {app.appId}</dd>
              <dt className="mono-label pt-0.5">Source</dt>
              <dd className="text-body">{app.source === "env" ? "Environment variables" : "Created from this page"}</dd>
              <dt className="mono-label pt-0.5">Sign-in</dt>
              <dd className="text-body">{app.clientId ? "Enabled" : "Missing client id/secret"}</dd>
              <dt className="mono-label pt-0.5">Webhooks</dt>
              <dd className="text-body">{app.webhookSecret ? `${e.APP_URL}/api/github/webhook` : "No webhook secret configured"}</dd>
            </dl>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-[14px] text-body">
                GitHub opens with the app settings filled in. After you confirm, GitHub sends the credentials back to this instance,
                which stores them encrypted. Use an organization to create an app owned by it.
              </p>
              <form action={`${e.GITHUB_URL}/settings/apps/new?state=${encodeURIComponent(state)}`} method="post" className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="manifest" value={manifest} />
                <button type="submit" className="btn btn-primary btn-md">
                  Create GitHub App on my account
                </button>
              </form>
              <form
                action={`${e.GITHUB_URL}/organizations/__ORG__/settings/apps/new?state=${encodeURIComponent(state)}`}
                method="post"
                className="flex flex-wrap items-end gap-3"
                data-org-form
              >
                <input type="hidden" name="manifest" value={manifest} />
                <OrgField />
              </form>
              {!e.APP_URL.startsWith("https://") ? (
                <p className="text-[12px] text-muted">
                  APP_URL is {e.APP_URL}. GitHub can only deliver webhooks to a public URL; polling covers new pull requests until then.
                </p>
              ) : null}
            </div>
          )}
          {app?.source === "manifest" ? (
            <div className="mt-4">
              <ConfirmButton action={removeStoredAppAction} confirm="Forget the stored GitHub App credentials?" className="btn btn-danger btn-sm">
                Remove stored app
              </ConfirmButton>
            </div>
          ) : null}
        </Panel>

        <Panel title="Status">
          <dl className="grid grid-cols-3 gap-4">
            {[
              ["Users", u.n],
              ["Workspaces", w.n],
              ["Guides", g.n],
            ].map(([label, n]) => (
              <div key={String(label)}>
                <dd className="font-serif text-[36px] leading-none tracking-[-0.03em] text-stat">{n}</dd>
                <dt className="mt-1 text-[13px] text-muted">{label}</dt>
              </div>
            ))}
          </dl>
          <div className="mt-6 grid grid-cols-[180px_minmax(0,1fr)] gap-y-2 text-[13px]">
            <span className="mono-label pt-0.5">Sign-in methods</span>
            <span className="text-body">
              {[app?.clientId ? "GitHub" : null, e.AUTH_EMAIL_ENABLED ? "Email" : null, e.AUTH_GITHUB_TOKEN_ENABLED ? "GitHub token" : null]
                .filter(Boolean)
                .join(", ")}
              {e.AUTH_SIGNUP_ENABLED ? " · open sign-up" : " · invite only"}
            </span>
            <span className="mono-label pt-0.5">Storage</span>
            <span className="text-body">{e.STORAGE_DRIVER}</span>
            <span className="mono-label pt-0.5">Background worker</span>
            <span className="text-body">
              {e.WORKER_ENABLED ? "Running in this process" : "Disabled"} · polling {e.POLL_INTERVAL_SECONDS > 0 ? `every ${formatInterval(e.POLL_INTERVAL_SECONDS)}` : "off"}
            </span>
            <span className="mono-label pt-0.5">Webhook URL</span>
            <span className="flex items-center gap-2">
              <code className="font-mono text-[12px] text-ink">{e.APP_URL}/api/github/webhook</code>
              <CopyButton text={`${e.APP_URL}/api/github/webhook`} label="Copy" className="btn btn-ghost btn-xs" />
            </span>
          </div>
        </Panel>

        <Panel title="Recent webhook deliveries">
          {deliveries.length === 0 ? (
            <p className="text-[13px] text-muted">None received.</p>
          ) : (
            <ul className="-my-1 font-mono text-[12px]">
              {deliveries.map((d) => (
                <li key={d.id} className="flex gap-3 border-t border-dashed border-line py-1.5 first:border-t-0">
                  <span className="w-32 shrink-0 text-meta">{timeAgo(d.receivedAt)}</span>
                  <span className="flex-1 text-ink">
                    {d.event}
                    {d.action ? `.${d.action}` : ""} {d.repositoryFullName ? `· ${d.repositoryFullName}` : ""}
                  </span>
                  <span className={d.status === "failed" ? "text-danger" : "text-meta"}>{d.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent jobs">
          {failedJobs.length === 0 ? (
            <p className="text-[13px] text-muted">No jobs yet.</p>
          ) : (
            <ul className="-my-1 font-mono text-[12px]">
              {failedJobs.map((j) => (
                <li key={j.id} className="flex gap-3 border-t border-dashed border-line py-1.5 first:border-t-0">
                  <span className="w-32 shrink-0 text-meta">{timeAgo(j.updatedAt)}</span>
                  <span className="flex-1 text-ink">
                    {j.type} <span className="text-meta">#{j.id}</span>
                    {j.lastError ? <span className="block truncate text-danger">{j.lastError}</span> : null}
                  </span>
                  <span className={j.status === "failed" ? "text-danger" : "text-meta"}>
                    {j.status} · {j.attempts}/{j.maxAttempts}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </main>
    </div>
  );
}

function OrgField() {
  return (
    <>
      <div>
        <label className="field-label" htmlFor="org">
          Or create it for an organization
        </label>
        <input id="org" name="org" placeholder="organization login" className="input w-64" />
      </div>
      <OrgSubmit />
    </>
  );
}

