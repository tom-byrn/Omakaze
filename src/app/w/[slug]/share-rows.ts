import type { Role } from "@/db/schema";
import type { ShareLinkRow } from "@/components/share/ShareLinkList";
import { env } from "@/lib/env";
import { listShareLinks } from "@/lib/share/links";
import { canCreateShareLinks, canRevokeShareLink } from "@/lib/share/policy";
import type { Workspace } from "@/lib/workspaces";
import { revokeShareLinkAction } from "./share-actions";

/** Whether share links work here at all: on the instance and in the workspace. */
export function shareLinksOn(workspace: Workspace): boolean {
  return env().SHARE_LINKS_ENABLED && workspace.shareLinksEnabled;
}

/** Active links as the lists show them, with a revoke action where the viewer may revoke. */
export async function shareLinkRows(
  slug: string,
  workspace: Workspace,
  viewer: { userId: string; role: Role },
  pull?: { repositoryId: string; prNumber: number },
): Promise<ShareLinkRow[]> {
  const links = await listShareLinks(workspace.id, pull);
  return links.map((l) => ({
    id: l.id,
    version: l.guideId === null ? null : l.version,
    includeComments: l.includeComments,
    creatorName: l.creatorName,
    repoFullName: l.repoFullName,
    prNumber: l.prNumber,
    createdAt: l.createdAt,
    expiresAt: l.expiresAt,
    lastUsedAt: l.lastUsedAt,
    revoke: canRevokeShareLink(viewer, l) ? revokeShareLinkAction.bind(null, slug, l.id) : undefined,
  }));
}

/** What the guide page's Share dialog needs, or null when share links are off. */
export async function shareDialogData(slug: string, workspace: Workspace, viewer: { userId: string; role: Role }, pull: { repositoryId: string; prNumber: number }) {
  if (!shareLinksOn(workspace)) return null;
  return {
    cannotCreate: canCreateShareLinks(viewer.role, workspace.shareLinkRole)
      ? null
      : "Only admins and owners can create share links in this workspace. An admin can allow every member in Settings → Share links.",
    links: await shareLinkRows(slug, workspace, viewer, pull),
  };
}
