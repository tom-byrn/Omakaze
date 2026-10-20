import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import type { DiffFile } from "@/lib/diff/types";
import type { SectionRef } from "@/lib/guides/refs";
import type { RepoTemplate, ResolvedTemplate, TemplateOutline } from "@/lib/guides/templates";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => newId());
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------ */
/* Users, sessions, GitHub identities                                  */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email"),
    /** Set when the address was confirmed: a verified GitHub email or an emailed link. Cleared when it changes. */
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    avatarUrl: text("avatar_url"),
    passwordHash: text("password_hash"),
    isInstanceAdmin: boolean("is_instance_admin").default(false).notNull(),
    lastWorkspaceId: text("last_workspace_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)],
);

export const githubAccounts = pgTable(
  "github_accounts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    githubId: bigint("github_id", { mode: "number" }).notNull(),
    login: text("login").notNull(),
    avatarUrl: text("avatar_url"),
    /** "oauth" = OAuth / GitHub App user token, "pat" = personal access token */
    tokenType: text("token_type").$type<"oauth" | "pat">().notNull(),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scopes: text("scopes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("github_accounts_user_unique").on(t.userId),
    uniqueIndex("github_accounts_github_id_unique").on(t.githubId),
  ],
);

/**
 * A user's ChatGPT account, connected with Sign in with ChatGPT so guides they generate can use their
 * ChatGPT plan. Signing out clears the tokens but keeps the registration, which later sign-ins reuse.
 */
export const chatgptConnections = pgTable(
  "chatgpt_connections",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Issued by OpenAI when the account was first registered (oaiapp_…). */
    clientId: text("client_id").notNull(),
    /** The ID token's `sub`. */
    subject: text("subject").notNull(),
    email: text("email"),
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    idTokenEnc: text("id_token_enc"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    /** Granted scopes, space separated. Plan usage needs `chatgpt.tokens.use.direct`. */
    scopes: text("scopes").notNull(),
    model: text("model"),
    /** Use the plan for guides this user generates. */
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("chatgpt_connections_user_unique").on(t.userId)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the session token */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Workspaces, members, invites                                        */
/* ------------------------------------------------------------------ */

export type AiProvider = "anthropic" | "openai" | "google" | "openrouter" | "ollama" | "lmstudio" | "openai-compatible";

/** off: no check. informational: never blocks merging. required: passes once every section is reviewed. */
export type GuideCheckMode = "off" | "informational" | "required";

export const workspaces = pgTable(
  "workspaces",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Generate a guide automatically when a PR is opened (repos can override). */
    autoGenerate: boolean("auto_generate").default(false).notNull(),
    /** Create a new guide version when new commits are pushed. */
    regenerateOnPush: boolean("regenerate_on_push").default(false).notNull(),
    /** Post a comment on the GitHub PR linking to the guide. */
    postPrComment: boolean("post_pr_comment").default(false).notNull(),
    /** Skip draft PRs for automatic generation. */
    skipDrafts: boolean("skip_drafts").default(true).notNull(),
    aiProvider: text("ai_provider").$type<AiProvider>(),
    aiModel: text("ai_model"),
    aiBaseUrl: text("ai_base_url"),
    aiApiKeyEnc: text("ai_api_key_enc"),
    /** Writing instructions for every guide: the instructions part of the guide template (see guides/templates.ts). */
    aiInstructions: text("ai_instructions"),
    /** Section outline guides follow; null = none. Repositories can override it. */
    guideTemplate: jsonb("guide_template").$type<TemplateOutline>(),
    /** Members may generate guides with their own ChatGPT plan instead of the workspace provider. */
    allowChatgptPlans: boolean("allow_chatgpt_plans").default(false).notNull(),
    /** Report guide review progress on the pull request's head commit (repos can override). */
    guideCheck: text("guide_check").$type<GuideCheckMode>().default("off").notNull(),
    /** Members who must review each section before a required guide check passes. */
    guideCheckReviewers: integer("guide_check_reviewers").default(1).notNull(),
    /** Agents over MCP may approve pull requests as the member whose token they use. */
    allowAgentApprovals: boolean("allow_agent_approvals").default(false).notNull(),
    /** Read-only share links work in this workspace (see src/lib/share). Off pauses existing links too. */
    shareLinksEnabled: boolean("share_links_enabled").default(true).notNull(),
    /** Lowest role that can create share links. */
    shareLinkRole: text("share_link_role").$type<"admin" | "member">().default("admin").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("workspaces_slug_unique").on(t.slug)],
);

export type Role = "owner" | "admin" | "member";

export const memberships = pgTable(
  "memberships",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<Role>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

export const invites = pgTable(
  "invites",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email"),
    role: text("role").$type<Role>().notNull(),
    tokenHash: text("token_hash").notNull(),
    /** Encrypted invite token so admins can copy the link again. */
    tokenEnc: text("token_enc").notNull(),
    invitedByUserId: text("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: text("accepted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("invites_token_hash_unique").on(t.tokenHash), index("invites_workspace_idx").on(t.workspaceId)],
);

/* ------------------------------------------------------------------ */
/* GitHub connections and repositories                                 */
/* ------------------------------------------------------------------ */

export type ConnectionType = "app" | "token" | "user";

export const githubConnections = pgTable(
  "github_connections",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").$type<ConnectionType>().notNull(),
    /** GitHub App installation id (type = app) */
    installationId: bigint("installation_id", { mode: "number" }),
    /** Account (org or user) the connection belongs to */
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type").$type<"Organization" | "User">().notNull(),
    accountAvatarUrl: text("account_avatar_url"),
    /** Personal access token (type = token) */
    tokenEnc: text("token_enc"),
    /** Delegates to this user's linked GitHub credential (type = user) */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("github_connections_workspace_idx").on(t.workspaceId),
    index("github_connections_installation_idx").on(t.installationId),
  ],
);

export const repositories = pgTable(
  "repositories",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** null when the connection was removed; guides stay readable until another connection is chosen. */
    connectionId: text("connection_id").references(() => githubConnections.id, { onDelete: "set null" }),
    githubId: bigint("github_id", { mode: "number" }).notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    private: boolean("private").default(false).notNull(),
    defaultBranch: text("default_branch").notNull(),
    description: text("description"),
    htmlUrl: text("html_url").notNull(),
    /** null = inherit workspace setting */
    autoGenerate: boolean("auto_generate"),
    /** Own outline and/or additional writing instructions; null = the workspace template as it is. */
    guideTemplate: jsonb("guide_template").$type<RepoTemplate>(),
    /** null = inherit workspace setting */
    guideCheck: text("guide_check").$type<GuideCheckMode>(),
    webhookId: bigint("webhook_id", { mode: "number" }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    syncError: text("sync_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("repositories_workspace_github_unique").on(t.workspaceId, t.githubId),
    index("repositories_github_id_idx").on(t.githubId),
    index("repositories_full_name_idx").on(sql`lower(${t.fullName})`),
  ],
);

/** A GitHub user cached on a pull request (requested reviewer or assignee). */
export type GhPersonRef = { login: string; avatarUrl: string | null };

export const pullRequests = pgTable(
  "pull_requests",
  {
    id: id(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    githubId: bigint("github_id", { mode: "number" }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    state: text("state").$type<"open" | "closed">().notNull(),
    merged: boolean("merged").default(false).notNull(),
    draft: boolean("draft").default(false).notNull(),
    authorLogin: text("author_login"),
    authorAvatarUrl: text("author_avatar_url"),
    headRef: text("head_ref").notNull(),
    headSha: text("head_sha").notNull(),
    baseRef: text("base_ref").notNull(),
    baseSha: text("base_sha").notNull(),
    additions: integer("additions"),
    deletions: integer("deletions"),
    changedFiles: integer("changed_files"),
    commits: integer("commits"),
    htmlUrl: text("html_url").notNull(),
    githubCreatedAt: timestamp("github_created_at", { withTimezone: true }).notNull(),
    githubUpdatedAt: timestamp("github_updated_at", { withTimezone: true }).notNull(),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** head sha for which additions/deletions were fetched */
    detailsSha: text("details_sha"),
    /** Pending review requests and assignees as GitHub reports them; see src/lib/github/people.ts. */
    requestedReviewers: jsonb("requested_reviewers").$type<GhPersonRef[]>().default([]).notNull(),
    /** Names of requested teams. Team members are not resolved. */
    requestedTeams: jsonb("requested_teams").$type<string[]>().default([]).notNull(),
    assignees: jsonb("assignees").$type<GhPersonRef[]>().default([]).notNull(),
    summaryCommentId: bigint("summary_comment_id", { mode: "number" }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("pull_requests_repo_number_unique").on(t.repositoryId, t.number),
    index("pull_requests_updated_idx").on(t.githubUpdatedAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Diff snapshots and guides                                           */
/* ------------------------------------------------------------------ */

export const diffSnapshots = pgTable(
  "diff_snapshots",
  {
    id: id(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    headSha: text("head_sha").notNull(),
    baseSha: text("base_sha").notNull(),
    /** merge base of base and head; old line numbers refer to this commit */
    mergeBaseSha: text("merge_base_sha").notNull(),
    files: jsonb("files").$type<DiffFile[]>().notNull(),
    truncated: boolean("truncated").default(false).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("diff_snapshots_repo_pr_head_unique").on(t.repositoryId, t.prNumber, t.headSha)],
);

export type GuideStatus = "draft" | "generating" | "ready" | "failed";
export type GuideSource = "agent" | "ai" | "manual";
export type GuideAiSource = "workspace" | "instance" | "chatgpt";

export type GuideEvent = {
  at: string;
  message: string;
  level?: "info" | "warn" | "error";
};

export const guides = pgTable(
  "guides",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    version: integer("version").notNull(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => diffSnapshots.id, { onDelete: "restrict" }),
    status: text("status").$type<GuideStatus>().notNull(),
    source: text("source").$type<GuideSource>().notNull(),
    title: text("title").notNull(),
    summary: text("summary").default("").notNull(),
    headSha: text("head_sha").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    /** "mcp" | "api" | "ui" | "webhook" | "poll" */
    createdVia: text("created_via").notNull(),
    /** MCP client name or AI model that wrote the guide */
    author: text("author"),
    error: text("error"),
    events: jsonb("events").$type<GuideEvent[]>().default([]).notNull(),
    /** The guide template in effect when the guide was started; null = none. */
    template: jsonb("template").$type<ResolvedTemplate>(),
    /** Which AI configuration wrote a built-in AI guide ("chatgpt" = the creator's ChatGPT plan); null otherwise or unknown. */
    aiSource: text("ai_source").$type<GuideAiSource>(),
    /** Changed lines in the snapshot and how many the author's own sections covered, recorded when the guide is published. */
    changedLines: integer("changed_lines"),
    coveredLines: integer("covered_lines"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("guides_repo_pr_version_unique").on(t.repositoryId, t.prNumber, t.version),
    index("guides_workspace_idx").on(t.workspaceId, t.updatedAt),
    index("guides_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("guides_workspace_published_idx").on(t.workspaceId, t.publishedAt),
  ],
);

export const guideSections = pgTable(
  "guide_sections",
  {
    id: id(),
    guideId: text("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    body: text("body").default("").notNull(),
    refs: jsonb("refs").$type<SectionRef[]>().default([]).notNull(),
    /** true for the automatic "Other changes" section */
    generated: boolean("generated").default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("guide_sections_guide_idx").on(t.guideId, t.position)],
);

export const sectionReviews = pgTable(
  "section_reviews",
  {
    sectionId: text("section_id")
      .notNull()
      .references(() => guideSections.id, { onDelete: "cascade" }),
    guideId: text("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
    /**
     * Set when the mark was carried over from an earlier version that covered the same code: the
     * version the member reviewed. null when the member marked the section in this version.
     */
    carriedFromVersion: integer("carried_from_version"),
  },
  (t) => [primaryKey({ columns: [t.sectionId, t.userId] }), index("section_reviews_guide_idx").on(t.guideId)],
);

export const guideViews = pgTable(
  "guide_views",
  {
    guideId: text("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }).defaultNow().notNull(),
    /**
     * End of the viewer's previous visit to the pull request (any version), which "new since your
     * last visit" compares against. Page views less than 30 minutes apart are one visit and keep it.
     */
    previousVisitAt: timestamp("previous_visit_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.guideId, t.userId] })],
);

/**
 * Read-only links to a guide for people outside the workspace (`/s/<token>`). The token is the
 * link's id followed by a secret; only the secret's SHA-256 hash is stored.
 */
export const shareLinks = pgTable(
  "share_links",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    /** The shared version; null = the latest published version of the pull request, and earlier ones. */
    guideId: text("guide_id").references(() => guides.id, { onDelete: "cascade" }),
    secretHash: text("secret_hash").notNull(),
    /** Show the pull request's review comments from GitHub (read-only). */
    includeComments: boolean("include_comments").default(false).notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    /** null = never expires. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("share_links_workspace_idx").on(t.workspaceId, t.createdAt), index("share_links_pr_idx").on(t.repositoryId, t.prNumber)],
);

/* ------------------------------------------------------------------ */
/* Comments posted through Omakaze                                    */
/* ------------------------------------------------------------------ */

export const comments = pgTable(
  "comments",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    guideId: text("guide_id").references(() => guides.id, { onDelete: "set null" }),
    sectionId: text("section_id").references(() => guideSections.id, { onDelete: "set null" }),
    authorUserId: text("author_user_id").references(() => users.id, { onDelete: "set null" }),
    /** "review" (line comment), "reply", "issue" (PR conversation), "review_submit" */
    kind: text("kind").$type<"review" | "reply" | "issue" | "review_submit">().notNull(),
    path: text("path"),
    line: integer("line"),
    startLine: integer("start_line"),
    side: text("side").$type<"LEFT" | "RIGHT">(),
    commitSha: text("commit_sha"),
    body: text("body").notNull(),
    inReplyToGithubId: bigint("in_reply_to_github_id", { mode: "number" }),
    githubId: bigint("github_id", { mode: "number" }),
    githubUrl: text("github_url"),
    /** "user" = posted with the author's GitHub credential, "connection" = via workspace connection */
    postedAs: text("posted_as").$type<"user" | "connection">(),
    createdAt: createdAt(),
  },
  (t) => [index("comments_pr_idx").on(t.repositoryId, t.prNumber), index("comments_workspace_created_idx").on(t.workspaceId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Guide checks: review progress reported on GitHub                    */
/* ------------------------------------------------------------------ */

/** What was last reported. "off" is the final neutral update sent after the check was turned off. */
export type GuideCheckConclusion = "success" | "neutral" | "action_required" | "in_progress" | "off";

/** The check run or commit status Omakaze keeps on a pull request's head commit (one row per pull request). */
export const guideChecks = pgTable(
  "guide_checks",
  {
    id: id(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    /** Commit the last update went to. Also set when it failed, so a failing commit isn't retried on every sync. */
    headSha: text("head_sha"),
    /** "check_run" for GitHub App connections, "status" (a commit status) for token and account connections */
    method: text("method").$type<"check_run" | "status">(),
    checkRunId: bigint("check_run_id", { mode: "number" }),
    guideId: text("guide_id").references(() => guides.id, { onDelete: "set null" }),
    conclusion: text("conclusion").$type<GuideCheckConclusion>(),
    title: text("title"),
    summary: text("summary"),
    detailsUrl: text("details_url"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    error: text("error"),
    /** Counts requests for an update; a job that sees it change while running queues another. */
    requests: integer("requests").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("guide_checks_repo_pr_unique").on(t.repositoryId, t.prNumber)],
);

/* ------------------------------------------------------------------ */
/* API tokens, OAuth clients (for MCP)                                 */
/* ------------------------------------------------------------------ */

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** "personal" = created in settings, "oauth" = issued to an MCP client */
    kind: text("kind").$type<"personal" | "oauth">().notNull(),
    oauthClientId: text("oauth_client_id"),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("api_tokens_hash_unique").on(t.tokenHash), index("api_tokens_user_idx").on(t.userId)],
);

export const oauthClients = pgTable("oauth_clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  clientSecretHash: text("client_secret_hash"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: createdAt(),
});

export const oauthCodes = pgTable("oauth_codes", {
  codeHash: text("code_hash").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  scope: text("scope"),
  resource: text("resource"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const oauthRefreshTokens = pgTable("oauth_refresh_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  accessTokenId: text("access_token_id"),
  scope: text("scope"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Assets (images and videos used in guides)                           */
/* ------------------------------------------------------------------ */

export const assets = pgTable(
  "assets",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    guideId: text("guide_id").references(() => guides.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    storage: text("storage").$type<"database" | "filesystem">().notNull(),
    storageKey: text("storage_key"),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("assets_workspace_idx").on(t.workspaceId)],
);

export const assetBlobs = pgTable("asset_blobs", {
  assetId: text("asset_id")
    .primaryKey()
    .references(() => assets.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
});

/* ------------------------------------------------------------------ */
/* Jobs, activity, webhooks, instance settings                         */
/* ------------------------------------------------------------------ */

export type JobStatus = "queued" | "running" | "done" | "failed";

export const jobs = pgTable(
  "jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<JobStatus>().default("queued").notNull(),
    dedupeKey: text("dedupe_key"),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("jobs_queue_idx").on(t.status, t.runAt),
    uniqueIndex("jobs_dedupe_active_unique")
      .on(t.dedupeKey)
      .where(sql`${t.status} in ('queued', 'running') and ${t.dedupeKey} is not null`),
  ],
);

export const activity = pgTable(
  "activity",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Display label when the actor is not a user (agent, webhook, worker) */
    actorLabel: text("actor_label"),
    type: text("type").notNull(),
    repositoryId: text("repository_id").references(() => repositories.id, { onDelete: "set null" }),
    prNumber: integer("pr_number"),
    guideId: text("guide_id").references(() => guides.id, { onDelete: "set null" }),
    data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("activity_workspace_idx").on(t.workspaceId, t.createdAt)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    event: text("event").notNull(),
    action: text("action"),
    repositoryFullName: text("repository_full_name"),
    status: text("status").$type<"processed" | "ignored" | "failed">().notNull(),
    error: text("error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("webhook_deliveries_received_idx").on(t.receivedAt)],
);

export const instanceSettings = pgTable("instance_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

/** Email notification kinds; see src/lib/notifications. */
export type NotificationType = "guide_ready" | "new_version" | "reply" | "pull_activity";
/** How long the first email notification waits for others, so they are sent as one email. */
export type EmailDigest = "minutes" | "hourly" | "daily";

/** A user's email notification settings. Without a row the defaults apply: everything on, grouped within minutes. */
export const notificationPreferences = pgTable("notification_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Off: no email notifications at all (also what the unsubscribe link sets). */
  email: boolean("email").default(true).notNull(),
  guideReady: boolean("guide_ready").default(true).notNull(),
  newVersion: boolean("new_version").default(true).notNull(),
  replies: boolean("replies").default(true).notNull(),
  pullActivity: boolean("pull_activity").default(true).notNull(),
  digest: text("digest").$type<EmailDigest>().default("minutes").notNull(),
  updatedAt: updatedAt(),
});

/** Workspaces a user gets no email notifications from. */
export const notificationMutes = pgTable(
  "notification_mutes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.workspaceId] })],
);

/** Email notifications waiting to be sent to one recipient (several become one email), and recently sent ones. */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    guideId: text("guide_id").references(() => guides.id, { onDelete: "set null" }),
    type: text("type").$type<NotificationType>().notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Who caused it as the email names them: a member's name, a GitHub login or the AI model. */
    actorName: text("actor_name"),
    /** What the email shows (NotificationData in src/lib/notifications/types.ts). */
    data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
    /** The event, e.g. `comment:<repository id>:<GitHub id>`; one notification per event and recipient. */
    eventKey: text("event_key").notNull(),
    status: text("status").$type<"pending" | "sent" | "skipped">().default("pending").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notifications_event_user_unique").on(t.eventKey, t.userId),
    index("notifications_user_status_idx").on(t.userId, t.status, t.createdAt),
  ],
);

/** Workspace events a Slack or JSON webhook can receive. */
export type ChannelEvent = "guide_published" | "new_version" | "review_submitted";

/** A workspace's Slack incoming webhook or JSON webhook (at most one of each). */
export const notificationChannels = pgTable(
  "notification_channels",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"slack" | "webhook">().notNull(),
    /** The webhook URL, encrypted: a Slack webhook URL is itself the credential. */
    urlEnc: text("url_enc").notNull(),
    /** JSON webhooks: key of the X-Omakaze-Signature-256 HMAC, encrypted. */
    secretEnc: text("secret_enc"),
    events: jsonb("events").$type<ChannelEvent[]>().default(["guide_published", "new_version", "review_submitted"]).notNull(),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("notification_channels_workspace_kind_unique").on(t.workspaceId, t.kind)],
);
