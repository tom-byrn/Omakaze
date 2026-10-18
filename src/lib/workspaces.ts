import { and, asc, count, eq, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { memberships, users, workspaces, type Role } from "@/db/schema";
import { requireUser, type SessionUser } from "@/lib/auth/session";

export type Workspace = typeof workspaces.$inferSelect;

const ROLE_RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s.length >= 2 ? s : `workspace-${s}`.replace(/-+$/, "");
}

const RESERVED = new Set(["new", "api", "admin", "settings", "login", "invite", "oauth", "w", "account"]);

export async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    if (RESERVED.has(candidate)) continue;
    const [row] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, candidate)).limit(1);
    if (!row) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export async function createWorkspace(input: { name: string; slug?: string; userId: string }): Promise<Workspace> {
  const slug = await uniqueSlug(input.slug ?? input.name);
  return db.transaction(async (tx) => {
    const [ws] = await tx
      .insert(workspaces)
      .values({ name: input.name.trim().slice(0, 80) || slug, slug, createdByUserId: input.userId })
      .returning();
    await tx.insert(memberships).values({ workspaceId: ws.id, userId: input.userId, role: "owner" });
    await tx.update(users).set({ lastWorkspaceId: ws.id }).where(eq(users.id, input.userId));
    return ws;
  });
}

export async function listUserWorkspaces(userId: string) {
  return db
    .select({ workspace: workspaces, role: memberships.role })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(workspaces.name));
}

export async function getMembership(workspaceId: string, userId: string): Promise<Role | null> {
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export async function getWorkspaceBySlug(slug: string): Promise<Workspace | null> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
  return ws ?? null;
}

export type WorkspaceContext = { user: SessionUser; workspace: Workspace; role: Role };

/** Load a workspace the current user belongs to, or 404. Memoized per request. */
export const requireWorkspace = cache(async (slug: string, minRole: Role = "member"): Promise<WorkspaceContext> => {
  const user = await requireUser(`/w/${slug}`);
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();
  const role = await getMembership(workspace.id, user.id);
  if (!role) notFound();
  if (!roleAtLeast(role, minRole)) redirect(`/w/${slug}`);
  if (user.lastWorkspaceId !== workspace.id) {
    await db.update(users).set({ lastWorkspaceId: workspace.id }).where(eq(users.id, user.id));
  }
  return { user, workspace, role };
});

/** Server-action guard: like requireWorkspace but throws instead of redirecting. */
export async function assertWorkspaceRole(workspaceId: string, userId: string, minRole: Role): Promise<Role> {
  const role = await getMembership(workspaceId, userId);
  if (!role || !roleAtLeast(role, minRole)) throw new Error("You do not have permission to do that.");
  return role;
}

export async function memberCount(workspaceId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(memberships).where(eq(memberships.workspaceId, workspaceId));
  return row?.n ?? 0;
}

export async function ownerCount(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, "owner")));
  return row?.n ?? 0;
}

/** Where to send a signed-in user who has no specific destination. */
export async function homePathFor(user: SessionUser): Promise<string> {
  const list = await listUserWorkspaces(user.id);
  if (list.length === 0) return "/new";
  const preferred = list.find((w) => w.workspace.id === user.lastWorkspaceId) ?? list[0];
  return `/w/${preferred.workspace.slug}`;
}

export const workspaceSlugSql = sql`lower(${workspaces.slug})`;
