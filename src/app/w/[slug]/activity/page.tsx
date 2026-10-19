import { and, desc, eq, lt } from "drizzle-orm";
import { RiExternalLinkLine } from "@remixicon/react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { db } from "@/db";
import { activity, repositories, users } from "@/db/schema";
import { formatDate, timeAgo } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspaces";

export const metadata = { title: "Activity" };

type Row = {
  type: string;
  data: Record<string, unknown>;
  prNumber: number | null;
  repoFullName: string | null;
};

function describe(r: Row): string {
  const d = r.data;
  const pr = r.repoFullName && r.prNumber ? `${r.repoFullName}#${r.prNumber}` : "";
  switch (r.type) {
    case "workspace.created":
      return "created the workspace";
    case "member.joined":
      return `joined as ${String(d.role ?? "member")}`;
    case "member.removed":
      return d.left ? "left the workspace" : "removed a member";
    case "member.role_changed":
      return `changed a member's role to ${String(d.role)}`;
    case "invite.created":
      return `invited ${d.email ? String(d.email) : "someone"} as ${String(d.role ?? "member")}`;
    case "connection.created":
      return `connected GitHub (${String(d.login ?? "")}, ${d.type === "app" ? "GitHub App" : d.type === "token" ? "token" : "account"})`;
    case "connection.removed":
      return `removed the ${String(d.login ?? "")} GitHub connection`;
    case "repo.added":
      return `added ${String(d.fullName ?? r.repoFullName ?? "a repository")}`;
    case "repo.removed":
      return `removed ${String(d.fullName ?? "a repository")}`;
    case "guide.started":
      return `started guide v${String(d.version ?? "")} for ${pr}`;
    case "guide.ready":
      return `published guide v${String(d.version ?? "")} for ${pr} (${String(d.sections ?? 0)} sections)`;
    case "guide.failed":
      return `could not generate a guide for ${pr}: ${String(d.error ?? "")}`;
    case "comment.posted":
      return `${d.reply ? "replied on" : "commented on"} ${String(d.path ?? "")}${d.line ? `:${String(d.line)}` : ""} in ${pr}`;
    case "thread.resolved":
    case "thread.unresolved":
      return `${r.type === "thread.resolved" ? "resolved" : "unresolved"} a conversation${d.path ? ` on ${String(d.path)}${d.line ? `:${String(d.line)}` : ""}` : ""} in ${pr}`;
    case "review.submitted":
      return `${d.event === "APPROVE" ? "approved" : d.event === "REQUEST_CHANGES" ? "requested changes on" : "reviewed"} ${pr}`;
    case "settings.updated":
      return `updated ${String(d.section ?? "")} settings`;
    case "token.created":
      return `created the API token "${String(d.name ?? "")}"`;
    case "share.created":
    case "share.revoked":
      return `${r.type === "share.created" ? "created" : "revoked"} a share link to ${d.version ? `v${String(d.version)} of ` : "the latest version of "}${pr}`;
    default:
      return r.type;
  }
}

export default async function ActivityPage(props: PageProps<"/w/[slug]/activity">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const { workspace } = await requireWorkspace(slug);
  const before = typeof sp.before === "string" ? new Date(sp.before) : null;
  const rows = await db
    .select({
      id: activity.id,
      type: activity.type,
      data: activity.data,
      createdAt: activity.createdAt,
      prNumber: activity.prNumber,
      actorLabel: activity.actorLabel,
      actorName: users.name,
      actorAvatar: users.avatarUrl,
      repoFullName: repositories.fullName,
    })
    .from(activity)
    .leftJoin(users, eq(users.id, activity.actorUserId))
    .leftJoin(repositories, eq(repositories.id, activity.repositoryId))
    .where(and(eq(activity.workspaceId, workspace.id), before && !Number.isNaN(before.getTime()) ? lt(activity.createdAt, before) : undefined))
    .orderBy(desc(activity.createdAt))
    .limit(60);

  const items = rows.map((r, i) => ({
    row: r,
    header: i === 0 || formatDate(rows[i - 1].createdAt) !== formatDate(r.createdAt) ? formatDate(r.createdAt) : null,
  }));
  return (
    <main className="mx-auto max-w-[1000px] px-4 py-10 lg:px-8">
      <PageHeader eyebrow={`Workspace · ${workspace.name}`} title="Activity." description="Guides, comments, reviews and changes in this workspace." />
      {rows.length === 0 ? (
        <div className="mt-10">
          <EmptyState title="Nothing yet." />
        </div>
      ) : (
        <ol className="mt-8">
          {items.map(({ row: r, header }) => {
            const url = typeof r.data.url === "string" ? r.data.url : null;
            const prHref = r.repoFullName && r.prNumber ? `/w/${slug}/${r.repoFullName}/pull/${r.prNumber}` : null;
            return (
              <li key={r.id}>
                {header ? <p className="mono-label mt-8 mb-2 border-b border-dashed border-line pb-2 first:mt-0">{header}</p> : null}
                <div className="flex items-center gap-3 py-2.5">
                  <Avatar src={r.actorAvatar} name={r.actorName ?? r.actorLabel} size={24} />
                  <p className="min-w-0 flex-1 text-[14px] leading-[20px] text-text">
                    <span className="text-ink">{r.actorName ?? r.actorLabel ?? "Omakaze"}</span>{" "}
                    {prHref ? (
                      <Link href={prHref} className="hover:underline">
                        {describe(r as Row)}
                      </Link>
                    ) : (
                      describe(r as Row)
                    )}
                  </p>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="text-black/35 hover:text-ink" aria-label="Open on GitHub">
                      <RiExternalLinkLine size={14} />
                    </a>
                  ) : null}
                  <span className="w-24 text-right font-mono text-[11px] text-meta">{timeAgo(r.createdAt)}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {rows.length === 60 ? (
        <div className="mt-6">
          <Link href={`/w/${slug}/activity?before=${encodeURIComponent(rows[rows.length - 1].createdAt.toISOString())}`} className="btn btn-secondary btn-sm">
            Older activity
          </Link>
        </div>
      ) : null}
    </main>
  );
}
