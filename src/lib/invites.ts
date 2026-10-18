import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invites, memberships, users, workspaces, type Role } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { decrypt, encrypt, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";

export type Invite = typeof invites.$inferSelect;

const INVITE_DAYS = 14;

export function inviteUrl(token: string): string {
  return `${env().APP_URL}/invite/${token}`;
}

export async function createInvite(input: {
  workspaceId: string;
  role: Role;
  email?: string | null;
  invitedByUserId: string;
}): Promise<{ invite: Invite; url: string; emailed: boolean }> {
  const token = randomBytes(24).toString("base64url");
  const [invite] = await db
    .insert(invites)
    .values({
      workspaceId: input.workspaceId,
      role: input.role === "owner" ? "admin" : input.role,
      email: input.email?.trim().toLowerCase() || null,
      tokenHash: sha256(token),
      tokenEnc: encrypt(token),
      invitedByUserId: input.invitedByUserId,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    })
    .returning();
  const url = inviteUrl(token);
  let emailed = false;
  if (invite.email) {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1);
    const [inviter] = await db.select().from(users).where(eq(users.id, input.invitedByUserId)).limit(1);
    emailed = await sendMail({
      to: invite.email,
      subject: `${inviter?.name ?? "Someone"} invited you to ${ws?.name ?? "a workspace"} on Guided PRs`,
      text: `${inviter?.name ?? "Someone"} invited you to join the ${ws?.name} workspace on Guided PRs.\n\nAccept the invite: ${url}\n\nThe link expires in ${INVITE_DAYS} days.`,
    });
  }
  await logActivity({
    workspaceId: input.workspaceId,
    type: "invite.created",
    actorUserId: input.invitedByUserId,
    data: { email: invite.email, role: invite.role },
  });
  return { invite, url, emailed };
}

export async function listPendingInvites(workspaceId: string) {
  const rows = await db
    .select({ invite: invites, inviter: { name: users.name } })
    .from(invites)
    .leftJoin(users, eq(users.id, invites.invitedByUserId))
    .where(
      and(
        eq(invites.workspaceId, workspaceId),
        isNull(invites.acceptedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(invites.createdAt));
  return rows.map((r) => ({ ...r.invite, inviterName: r.inviter?.name ?? null, url: inviteUrl(decrypt(r.invite.tokenEnc)) }));
}

export async function getInviteByToken(token: string) {
  const [row] = await db
    .select({ invite: invites, workspace: workspaces, inviter: { name: users.name, avatarUrl: users.avatarUrl } })
    .from(invites)
    .innerJoin(workspaces, eq(workspaces.id, invites.workspaceId))
    .leftJoin(users, eq(users.id, invites.invitedByUserId))
    .where(eq(invites.tokenHash, sha256(token)))
    .limit(1);
  if (!row) return null;
  const { invite } = row;
  const usable = !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > new Date();
  return { ...row, usable };
}

export class InviteError extends Error {}

export async function acceptInvite(token: string, user: { id: string; email: string | null }): Promise<{ slug: string }> {
  const found = await getInviteByToken(token);
  if (!found) throw new InviteError("This invite link is not valid.");
  if (!found.usable) throw new InviteError("This invite has expired or was already used.");
  const { invite, workspace } = found;
  if (invite.email && invite.email !== (user.email ?? "").toLowerCase()) {
    throw new InviteError(`This invite is for ${invite.email}. Sign in with that email address to accept it.`);
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(memberships)
      .values({ workspaceId: workspace.id, userId: user.id, role: invite.role })
      .onConflictDoNothing();
    await tx
      .update(invites)
      .set({ acceptedAt: new Date(), acceptedByUserId: user.id })
      .where(eq(invites.id, invite.id));
    await tx.update(users).set({ lastWorkspaceId: workspace.id }).where(eq(users.id, user.id));
  });
  await logActivity({ workspaceId: workspace.id, type: "member.joined", actorUserId: user.id, data: { role: invite.role } });
  return { slug: workspace.slug };
}

export async function revokeInvite(workspaceId: string, inviteId: string): Promise<void> {
  await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.id, inviteId), eq(invites.workspaceId, workspaceId)));
}
