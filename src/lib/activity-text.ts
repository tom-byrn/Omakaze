/** How the activity log describes an entry, after the actor's name (the Activity page and the mobile app). */
export type ActivityRow = {
  type: string;
  data: Record<string, unknown>;
  prNumber: number | null;
  repoFullName: string | null;
};

export function describe(r: ActivityRow): string {
  // Posted by an agent over MCP as this member: name the agent.
  return `${describeType(r)}${typeof r.data.agent === "string" ? ` via ${r.data.agent}` : ""}`;
}

function describeType(r: ActivityRow): string {
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
      if (d.conversation) return `commented on ${pr}`;
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
