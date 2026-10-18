import { asc, eq } from "drizzle-orm";
import { Panel } from "@/components/settings/Panel";
import { InviteForm } from "@/components/settings/InviteForm";
import { RoleSelect } from "@/components/settings/RoleSelect";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { CopyButton } from "@/components/ui/CopyButton";
import { db } from "@/db";
import { githubAccounts, memberships, users } from "@/db/schema";
import { formatDate, timeAgo } from "@/lib/format";
import { listPendingInvites } from "@/lib/invites";
import { mailEnabled } from "@/lib/mail";
import { requireWorkspace, roleAtLeast } from "@/lib/workspaces";
import { changeRoleAction, inviteAction, removeMemberAction, revokeInviteAction } from "../actions";

export const metadata = { title: "Members" };

export default async function MembersPage(props: PageProps<"/w/[slug]/settings/members">) {
  const { slug } = await props.params;
  const { workspace, role, user } = await requireWorkspace(slug);
  const admin = roleAtLeast(role, "admin");
  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: memberships.role,
      joinedAt: memberships.createdAt,
      githubLogin: githubAccounts.login,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(githubAccounts, eq(githubAccounts.userId, users.id))
    .where(eq(memberships.workspaceId, workspace.id))
    .orderBy(asc(memberships.createdAt));
  const invites = admin ? await listPendingInvites(workspace.id) : [];

  return (
    <div className="flex flex-col gap-6">
      {admin ? (
        <Panel
          title="Invite people"
          description="Members see every repository, pull request and guide in this workspace, and can comment and review."
        >
          <InviteForm action={inviteAction.bind(null, slug)} canEmail={mailEnabled()} />
        </Panel>
      ) : null}

      <Panel title={`Members (${members.length})`}>
        <ul className="-my-2">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 border-t border-dashed border-line py-3 first:border-t-0">
              <Avatar src={m.avatarUrl} name={m.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] text-ink">
                  {m.name} {m.id === user.id ? <span className="text-muted">(you)</span> : null}
                </p>
                <p className="truncate font-mono text-[11px] text-meta">
                  {[m.email, m.githubLogin ? `@${m.githubLogin}` : null].filter(Boolean).join(" · ")} · joined {formatDate(m.joinedAt)}
                </p>
              </div>
              {admin && m.id !== user.id ? (
                <>
                  <RoleSelect value={m.role} action={changeRoleAction.bind(null, slug, m.id)} canGrantOwner={role === "owner"} />
                  <ConfirmButton action={removeMemberAction.bind(null, slug, m.id)} confirm={`Remove ${m.name} from the workspace?`}>
                    Remove
                  </ConfirmButton>
                </>
              ) : (
                <span className="tag">{m.role}</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      {admin ? (
        <Panel title={`Pending invites (${invites.length})`} description="Invite links expire after 14 days.">
          {invites.length === 0 ? (
            <p className="text-[13px] text-muted">No pending invites.</p>
          ) : (
            <ul className="-my-2">
              {invites.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 border-t border-dashed border-line py-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-ink">{inv.email ?? "Anyone with the link"}</p>
                    <p className="font-mono text-[11px] text-meta">
                      {inv.role} · created {timeAgo(inv.createdAt)}
                      {inv.inviterName ? ` by ${inv.inviterName}` : ""} · expires {formatDate(inv.expiresAt)}
                    </p>
                  </div>
                  <CopyButton text={inv.url} label="Copy link" className="btn btn-secondary btn-xs" />
                  <ConfirmButton action={revokeInviteAction.bind(null, slug, inv.id)} confirm="Revoke this invite?">
                    Revoke
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
