import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { guideSections, repositories, workspaces } from "@/db/schema";
import { getGitHubAccount } from "@/lib/auth/users";
import { loadDashboard, parseStateFilter } from "@/lib/dashboard";
import { parseFiles } from "@/lib/diff/parse";
import { DIFF_FORMAT_NOTE, fileHeaderText, renderHunkText } from "@/lib/diff/render-text";
import { env } from "@/lib/env";
import { ghFileContent, GitHubError, type GhReviewComment } from "@/lib/github/client";
import {
  addRepository,
  findWorkspaceRepo,
  getRepoContext,
  listConnections,
  lookupRepo,
  type RepoContext,
} from "@/lib/github/connections";
import { clearReviewRequest, githubLoginOf } from "@/lib/github/people";
import { getOrCreateSnapshot, parsePullUrl, StaleHeadError } from "@/lib/github/pulls";
import {
  createReviewComment,
  listReviewComments,
  ownCommentIds,
  postIssueComment,
  replyToReviewComment,
  submitReview,
} from "@/lib/github/review";
import { hasSuggestion, suggestionBlock } from "@/lib/github/suggestions";
import { findReviewThread, listReviewThreads, setReviewThreadResolved, threadIndex, ThreadNotFoundError } from "@/lib/github/threads";
import { AGENT_WORKFLOW, GUIDE_GUIDELINES } from "@/lib/guides/guidelines";
import { templateFor, templateWarning } from "@/lib/guides/template-store";
import { templatePrompt } from "@/lib/guides/templates";
import { formatRef, serializeRef, type RefInput } from "@/lib/guides/refs";
import {
  addSection,
  createCompleteGuide,
  deleteSection,
  describeCoverage,
  describeFinishedCoverage,
  finishGuide,
  getCoverage,
  getGuide,
  getLatestGuide,
  getSections,
  guideUrl,
  GuideError,
  listGuideVersions,
  loadParsedFiles,
  reorderSections,
  startGuide,
  updateGuideMeta,
  updateSection,
  type Guide,
  type Section,
} from "@/lib/guides/service";
import {
  commentPosition,
  formatPosition,
  formatReviewThreads,
  groupReviewThreads,
  REVIEW_TOOLS_NOTE,
  REVIEW_WORKFLOW,
  sectionForLine,
  threadPosition,
  toDiffSide,
  type DiffSide,
} from "@/lib/mcp/review";
import { agentPrompt, reviewCommentsPrompt } from "@/lib/prompts";
import { AssetError, fetchRemoteAsset, markdownFor, assetUrl, storeAsset } from "@/lib/storage/assets";
import { getMembership, roleAtLeast } from "@/lib/workspaces";
import type { ApiPrincipal } from "@/lib/guides/access";

export const MCP_INSTRUCTIONS = `Omakaze turns pull requests into guided walkthroughs: ordered sections, each with a markdown explanation and the parts of the diff it covers.

${AGENT_WORKFLOW}

${GUIDE_GUIDELINES}

${DIFF_FORMAT_NOTE}

${REVIEW_TOOLS_NOTE}`;

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function text(t: string): ToolResult {
  return { content: [{ type: "text", text: t }] };
}

function fail(t: string): ToolResult {
  return { content: [{ type: "text", text: t }], isError: true };
}

class ToolError extends Error {}

const refSchema = z.union([
  z.string().describe('e.g. "src/a.ts", "src/a.ts#2", "src/a.ts:10-40" or "src/a.ts:old:5-9"'),
  z.object({
    path: z.string(),
    hunks: z.array(z.number().int()).optional(),
    lines: z.object({ start: z.number().int(), end: z.number().int(), side: z.enum(["new", "old"]).optional() }).optional(),
    note: z.string().optional().describe("Short caption shown above this part of the diff"),
    expand: z.enum(["none", "function", "file"]).optional(),
  }),
]);

const sectionSchema = z.object({
  title: z.string().min(1).describe("Short title, e.g. 'Offers API'"),
  body: z.string().describe("GitHub-flavored markdown explanation"),
  refs: z.array(refSchema).describe("Parts of the diff this section covers"),
});

const prArg = z.string().describe('Pull request URL (https://github.com/owner/repo/pull/123) or "owner/repo#123"');

const threadArgs = {
  thread_id: z.string().optional().describe("thread_id from list_review_comments (PRRT_…)"),
  comment_id: z.number().int().positive().optional().describe("Or the comment_id of any comment in the thread"),
};

const sideArg = z.enum(["new", "old"]);

export function createMcpServer(principal: ApiPrincipal, client: { name?: string } = {}) {
  const server = new McpServer(
    { name: "omakaze", title: "Omakaze", version: "0.1.0" },
    { instructions: MCP_INSTRUCTIONS, capabilities: { tools: {}, prompts: {} } },
  );
  const workspaceId = principal.tokenWorkspaceId!;
  const author = client.name ? `${client.name}` : "Agent";

  async function workspace() {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!ws) throw new ToolError("Workspace not found");
    return ws;
  }

  async function resolvePr(pr: string): Promise<{ ctx: RepoContext; number: number; slug: string }> {
    const parsed = parsePullUrl(pr);
    if (!parsed) throw new ToolError(`Could not read "${pr}". Use a URL like https://github.com/owner/repo/pull/123.`);
    const ws = await workspace();
    let repo = await findWorkspaceRepo(ws.id, parsed.owner, parsed.repo);
    // Admins can follow a new repository (or reconnect one that lost its connection) by using it.
    if (!repo || !repo.connectionId) {
      const role = await getMembership(ws.id, principal.user.id);
      const admin = role !== null && roleAtLeast(role, "admin");
      if (!repo && !admin) {
        throw new ToolError(`${parsed.owner}/${parsed.repo} is not connected to the "${ws.name}" workspace. Ask an admin to add it at ${env().APP_URL}/w/${ws.slug}/repos.`);
      }
      if (admin) {
        for (const conn of await listConnections(ws.id)) {
          try {
            const ghRepo = await lookupRepo(conn, `${parsed.owner}/${parsed.repo}`);
            repo = await addRepository(ws.id, conn, ghRepo);
            break;
          } catch {
            // try the next connection
          }
        }
        if (!repo) {
          throw new ToolError(`None of the GitHub connections of "${ws.name}" can access ${parsed.owner}/${parsed.repo}. Connect GitHub at ${env().APP_URL}/w/${ws.slug}/settings/github.`);
        }
      }
    }
    return { ctx: await getRepoContext(repo!.id), number: parsed.number, slug: ws.slug };
  }

  async function guideInWorkspace(guideId: string): Promise<Guide> {
    const g = await getGuide(guideId);
    if (!g || g.workspaceId !== workspaceId) throw new ToolError(`Guide ${guideId} not found in this workspace.`);
    return g;
  }

  async function urlFor(g: Guide): Promise<string> {
    const [row] = await db
      .select({ slug: workspaces.slug, fullName: repositories.fullName })
      .from(repositories)
      .innerJoin(workspaces, eq(workspaces.id, repositories.workspaceId))
      .where(eq(repositories.id, g.repositoryId))
      .limit(1);
    return guideUrl(row.slug, row.fullName, g.prNumber, g.version);
  }

  /* Review tools post to GitHub as the token's user, like the review tools of the guide viewer. */

  const poster = { id: principal.user.id, name: principal.user.name };

  async function reviewTarget(pr: string) {
    const { ctx, number, slug } = await resolvePr(pr);
    const guide = await getLatestGuide(ctx.repo.id, number, { readyOnly: true });
    return {
      ctx,
      number,
      guide,
      label: `${ctx.repo.fullName}#${number}`,
      // `agent` names the client in the activity log; `link` is used in the connection's "Posted by" line.
      meta: { workspaceId, guideId: guide?.id ?? null, link: guideUrl(slug, ctx.repo.fullName, number), agent: author },
    };
  }

  /** How a post appears on GitHub: as the user's linked account, or through the workspace connection. */
  async function attribution(login: string | null | undefined): Promise<string> {
    const account = await getGitHubAccount(principal.user.id);
    if (account && login && account.login.toLowerCase() === login.toLowerCase()) return `as ${login}`;
    return `through the workspace connection${login ? ` (${login})` : ""}, with a "Posted by ${principal.user.name} via Omakaze" line. The user can link a GitHub account at ${env().APP_URL}/account to post as themselves`;
  }

  /** Errors that mean the user has no usable linked GitHub account, as a tool error that says what to do. */
  function accountRequired(err: unknown, action: string): unknown {
    if (err instanceof GitHubError && err.status === 403 && err.message.startsWith("Link your GitHub account")) {
      return new ToolError(
        `${action} needs the user's own linked GitHub account; Omakaze never does it through the workspace connection. Link one at ${env().APP_URL}/account, or ask the user to do it on GitHub.`,
      );
    }
    return err;
  }

  /** The section of a guide that shows a line of the guide's diff (none without a guide). */
  async function sectionLocator(guide: Guide | null): Promise<(at: { path: string; line: number | null; side: DiffSide; commitSha: string }) => Section | null> {
    if (!guide) return () => null;
    const [{ files }, sections] = await Promise.all([loadParsedFiles(guide), getSections(guide.id)]);
    // Line numbers belong to a commit, so they only locate a section of a guide written for it.
    return (at) => (at.line !== null && at.commitSha === guide.headSha ? sectionForLine(sections, files, at.path, at.line, at.side) : null);
  }

  /** A review comment's section: by its current lines, or its original ones when the guide is older. */
  function commentSection(
    locate: Awaited<ReturnType<typeof sectionLocator>>,
    c: Pick<GhReviewComment, "path" | "line" | "side" | "commit_id" | "original_line" | "original_commit_id">,
  ): Section | null {
    const side = toDiffSide(c.side);
    return locate({ path: c.path, line: c.line, side, commitSha: c.commit_id }) ?? locate({ path: c.path, line: c.original_line, side, commitSha: c.original_commit_id });
  }

  /** The root comment of a thread, found by thread_id or by any of its comments, on this pull request only. */
  async function threadRoot(target: { ctx: RepoContext; number: number; label: string }, ref: { thread_id?: string; comment_id?: number }) {
    if (!ref.thread_id && !ref.comment_id) throw new ToolError("Pass thread_id or comment_id from list_review_comments.");
    const list = await listReviewComments(target.ctx, target.number, true);
    let rootId: number | undefined;
    if (ref.thread_id) {
      const thread = await findReviewThread(target.ctx, target.number, { threadId: ref.thread_id }).catch((err) => {
        throw new ToolError(`Thread IDs are unavailable (${err instanceof Error ? err.message : String(err)}). Pass comment_id instead.`);
      });
      rootId = thread?.commentIds[0];
      if (rootId === undefined) throw new ToolError(`Thread ${ref.thread_id} is not part of ${target.label}. Use a thread_id from list_review_comments.`);
    } else {
      const c = list.find((x) => x.id === ref.comment_id);
      if (!c) throw new ToolError(`Comment ${ref.comment_id} is not a review comment on ${target.label}. Use a comment_id from list_review_comments.`);
      rootId = c.in_reply_to_id ?? c.id;
    }
    const root = list.find((x) => x.id === rootId);
    if (!root) throw new ToolError(`The conversation was not found on ${target.label}. It may have been deleted; call list_review_comments again.`);
    return root;
  }

  function wrap<A>(fn: (args: A) => Promise<ToolResult>) {
    return async (args: A): Promise<ToolResult> => {
      try {
        return await fn(args);
      } catch (err) {
        if (err instanceof ToolError || err instanceof GuideError || err instanceof AssetError || err instanceof StaleHeadError) return fail(err.message);
        if (err instanceof GitHubError && err.status === 404) {
          return fail("Not found on GitHub. Check the pull request URL and that this workspace's GitHub connection can access the repository.");
        }
        const message = err instanceof Error ? err.message : String(err);
        console.error("[mcp] tool error", message);
        return fail(message);
      }
    };
  }

  /* -------------------------------------------------------------- */

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description: "Show the signed-in user, the workspace this connection uses and its repositories.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    wrap(async () => {
      const ws = await workspace();
      const [repos, account] = await Promise.all([
        db.select().from(repositories).where(eq(repositories.workspaceId, ws.id)).orderBy(asc(repositories.fullName)),
        getGitHubAccount(principal.user.id),
      ]);
      return text(
        [
          `User: ${principal.user.name}${principal.user.email ? ` <${principal.user.email}>` : ""}`,
          `Workspace: ${ws.name} (${env().APP_URL}/w/${ws.slug})`,
          `Repositories (${repos.length}): ${repos.map((r) => r.fullName).join(", ") || "none"}`,
          account
            ? `GitHub: ${account.login}. Review tools post as this account.`
            : `GitHub: no linked account. Review tools post through the workspace connection with a "Posted by ${principal.user.name} via Omakaze" line; resolving conversations, requesting changes and approving need a linked account (${env().APP_URL}/account).`,
          `Approvals by agents: ${ws.allowAgentApprovals ? "allowed" : "not allowed"} in this workspace.`,
          `Instance: ${env().APP_URL}`,
        ].join("\n"),
      );
    }),
  );

  server.registerTool(
    "list_pull_requests",
    {
      title: "List pull requests",
      description: "List pull requests in the workspace's repositories, with their guide status.",
      inputSchema: {
        repository: z.string().optional().describe("owner/name to filter by"),
        state: z.enum(["open", "closed", "merged", "all"]).optional(),
        filter: z
          .enum(["needs-review", "mine", "assigned", "all"])
          .optional()
          .describe('For the user: "needs-review" (review requested, or guide sections left to review), "mine" (authored), "assigned". Default "all".'),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    wrap(async ({ repository, state, filter, limit }) => {
      const ws = await workspace();
      let repoId: string | undefined;
      if (repository) {
        const [owner, name] = repository.split("/");
        const repo = owner && name ? await findWorkspaceRepo(ws.id, owner, name) : null;
        if (!repo) throw new ToolError(`${repository} is not in this workspace.`);
        repoId = repo.id;
      }
      const viewer = { userId: principal.user.id, login: await githubLoginOf(principal.user.id) };
      const data = await loadDashboard(ws.id, { state: parseStateFilter(state ?? "open"), filter: filter ?? "all", repositoryId: repoId, viewer });
      const repoName = new Map(data.repos.map((r) => [r.id, r.fullName]));
      const lines = data.pulls.slice(0, limit ?? 50).map((p) => {
        const g = data.guides.get(`${p.repositoryId}:${p.number}`);
        const st = p.merged ? "merged" : p.state;
        return `- ${repoName.get(p.repositoryId)}#${p.number} [${st}${p.draft ? ", draft" : ""}] ${p.title} (${p.htmlUrl})${g ? ` — guide v${g.version} ${g.status}` : ""}`;
      });
      if (lines.length === 0 && filter && filter !== "all") return text(`No pull requests match filter "${filter}"${viewer.login ? "" : ". You have no linked GitHub account, so only guides with sections left to review count as needing your review"}.`);
      return text(lines.length ? lines.join("\n") : "No pull requests found. The cache may be empty; open the workspace in the browser to sync.");
    }),
  );

  server.registerTool(
    "get_pull_request",
    {
      title: "Get pull request",
      description:
        "Read a pull request: description, head_sha, changed files and their hunks (with hunk numbers used in refs). Does not include code; use get_diff for that.",
      inputSchema: { pr: prArg },
      annotations: { readOnlyHint: true },
    },
    wrap(async ({ pr }) => {
      const { ctx, number, slug } = await resolvePr(pr);
      const { snapshot, pull } = await getOrCreateSnapshot(ctx, number);
      const files = parseFiles(snapshot.files);
      const versions = await listGuideVersions(ctx.repo.id, number);
      const adds = files.reduce((n, f) => n + f.additions, 0);
      const dels = files.reduce((n, f) => n + f.deletions, 0);
      const lines = [
        `${ctx.repo.fullName}#${number}: ${pull.title}`,
        `State: ${pull.merged ? "merged" : pull.state}${pull.draft ? " (draft)" : ""} · author ${pull.authorLogin ?? "unknown"} · ${pull.headRef} -> ${pull.baseRef}`,
        `URL: ${pull.htmlUrl}`,
        `head_sha: ${snapshot.headSha}`,
        `Size: ${files.length} files, +${adds} -${dels}${snapshot.truncated ? " (GitHub returned a truncated file list)" : ""}`,
        "",
        "Description:",
        pull.body?.trim() ? pull.body.trim().slice(0, 6000) : "(none)",
        "",
        "Files and hunks:",
      ];
      for (const f of files) {
        lines.push(`${fileHeaderText(f).replace(/^### /, "- ")}`);
        for (const h of f.hunks) {
          const a = h.lines.filter((l) => l.type === "add").length;
          const d = h.lines.filter((l) => l.type === "del").length;
          lines.push(`    ${f.path}#${h.index}  ${h.header}  (+${a} -${d})`);
        }
      }
      lines.push("");
      if (versions.length > 0) {
        lines.push("Existing guides:");
        for (const v of versions) lines.push(`- v${v.version} ${v.status} (guide_id ${v.id}) ${guideUrl(slug, ctx.repo.fullName, number, v.version)}`);
      } else lines.push("No guide exists yet.");
      const template = templatePrompt(await templateFor(workspaceId, ctx.repo));
      if (template) lines.push("", template);
      lines.push("", "Next: read the code with get_diff, then create_guide (or start_guide + add_section + finish_guide).");
      return text(lines.join("\n"));
    }),
  );

  server.registerTool(
    "get_diff",
    {
      title: "Get diff",
      description:
        "Read the code changes of a pull request with line numbers and hunk numbers. Large diffs are paginated: pass next_cursor back as cursor. Optionally limit to some files or hunks.",
      inputSchema: {
        pr: prArg,
        files: z.array(z.string()).optional().describe("Only these paths"),
        hunks: z.array(z.string()).optional().describe('Only these hunks, e.g. ["src/a.ts#2"]'),
        cursor: z.number().int().min(0).optional(),
        max_chars: z.number().int().min(5_000).max(200_000).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    wrap(async ({ pr, files: onlyFiles, hunks: onlyHunks, cursor, max_chars }) => {
      const { ctx, number } = await resolvePr(pr);
      const { snapshot } = await getOrCreateSnapshot(ctx, number);
      const files = parseFiles(snapshot.files).filter((f) => !onlyFiles || onlyFiles.includes(f.path));
      const wanted = onlyHunks ? new Set(onlyHunks) : null;
      const blocks: string[] = [];
      for (const f of files) {
        const hs = f.hunks.filter((h) => !wanted || wanted.has(`${f.path}#${h.index}`));
        if (f.patch === null && !wanted) blocks.push(`${fileHeaderText(f)}\n(binary or too large to show)`);
        hs.forEach((h, i) => blocks.push(`${i === 0 ? `${fileHeaderText(f)}\n` : `(${f.path} continued)\n`}${renderHunkText(h)}`));
      }
      const limit = max_chars ?? 60_000;
      let i = cursor ?? 0;
      const out: string[] = [];
      let used = 0;
      while (i < blocks.length && (used === 0 || used + blocks[i].length <= limit)) {
        out.push(blocks[i]);
        used += blocks[i].length;
        i++;
      }
      const footer =
        i < blocks.length
          ? `\n\n[${i}/${blocks.length} hunks shown] next_cursor: ${i}`
          : `\n\n[all ${blocks.length} hunks shown] head_sha: ${snapshot.headSha}`;
      return text(`${DIFF_FORMAT_NOTE}\n\n${out.join("\n\n")}${footer}`);
    }),
  );

  server.registerTool(
    "read_file",
    {
      title: "Read file",
      description: "Read a file at the PR head (or at the merge base with ref: base), with line numbers. Use for context around a change.",
      inputSchema: {
        pr: prArg,
        path: z.string(),
        ref: z.enum(["head", "base"]).optional(),
        start_line: z.number().int().min(1).optional(),
        end_line: z.number().int().min(1).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    wrap(async ({ pr, path, ref, start_line, end_line }) => {
      const { ctx, number } = await resolvePr(pr);
      const { snapshot } = await getOrCreateSnapshot(ctx, number);
      const sha = ref === "base" ? snapshot.mergeBaseSha : snapshot.headSha;
      const content = await ghFileContent(ctx.token, ctx.repo.owner, ctx.repo.name, path, sha);
      if (content === null) throw new ToolError(`${path} is missing, binary or too large at ${sha.slice(0, 7)}.`);
      const lines = content.split("\n");
      const start = Math.max(1, start_line ?? 1);
      const end = Math.min(lines.length, end_line ?? Math.min(lines.length, start + 799));
      const body = lines
        .slice(start - 1, end)
        .map((l, i) => `${String(start + i).padStart(5)} | ${l}`)
        .join("\n");
      return text(`${path} @ ${sha.slice(0, 7)} (lines ${start}-${end} of ${lines.length})\n${body}`);
    }),
  );

  server.registerTool(
    "create_guide",
    {
      title: "Create guide",
      description:
        "Create a complete guided PR in one call. Validates every ref first. Changes not covered by any section go to an automatic 'Other changes' section unless auto_cover is false. Returns the guide URL and a coverage report.",
      inputSchema: {
        pr: prArg,
        head_sha: z.string().optional().describe("head_sha from get_pull_request, so hunk numbers match"),
        title: z.string().optional(),
        summary: z.string().describe("Markdown overview shown before the first section"),
        sections: z.array(sectionSchema).min(1),
        auto_cover: z.boolean().optional(),
      },
    },
    wrap(async ({ pr, head_sha, title, summary, sections, auto_cover }) => {
      const { ctx, number } = await resolvePr(pr);
      const { guide, coverage, sectionCoverage, warnings } = await createCompleteGuide({
        workspaceId,
        ctx,
        prNumber: number,
        title,
        summary,
        source: "agent",
        createdVia: "mcp",
        author,
        userId: principal.user.id,
        expectedHeadSha: head_sha,
        sections: sections.map((s) => ({ ...s, refs: s.refs as RefInput[] })),
        autoCover: auto_cover,
      });
      const url = await urlFor(guide);
      return text(
        [
          `Created guide v${guide.version} (guide_id ${guide.id}).`,
          `URL: ${url}`,
          describeFinishedCoverage(sectionCoverage, coverage),
          warnings.length ? `Warnings:\n${warnings.map((w) => `- ${w.ref}: ${w.message}`).join("\n")}` : "",
          await templateWarning(guide),
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }),
  );

  server.registerTool(
    "start_guide",
    {
      title: "Start guide",
      description:
        "Start a new guide version that you fill in with add_section, then publish with finish_guide. People viewing the PR see sections appear as you add them.",
      inputSchema: {
        pr: prArg,
        head_sha: z.string().optional(),
        title: z.string().optional(),
        summary: z.string().optional(),
      },
    },
    wrap(async ({ pr, head_sha, title, summary }) => {
      const { ctx, number } = await resolvePr(pr);
      const { guide } = await startGuide({
        workspaceId,
        ctx,
        prNumber: number,
        title,
        summary,
        source: "agent",
        createdVia: "mcp",
        author,
        userId: principal.user.id,
        expectedHeadSha: head_sha,
      });
      return text(`Started guide v${guide.version}. guide_id: ${guide.id}\nURL: ${await urlFor(guide)}\nAdd sections with add_section, then call finish_guide.`);
    }),
  );

  server.registerTool(
    "add_section",
    {
      title: "Add section",
      description: "Append a section to a guide (or insert it at a 1-based position).",
      inputSchema: {
        guide_id: z.string(),
        title: z.string().min(1),
        body: z.string(),
        refs: z.array(refSchema),
        position: z.number().int().min(1).optional(),
      },
    },
    wrap(async ({ guide_id, title, body, refs, position }) => {
      await guideInWorkspace(guide_id);
      const { section, warnings } = await addSection(guide_id, { title, body, refs: refs as RefInput[], position });
      return text(
        [
          `Added section ${section.position}: ${section.title} (section_id ${section.id}) covering ${section.refs.map(formatRef).join(", ") || "no code"}.`,
          warnings.length ? `Warnings:\n${warnings.map((w) => `- ${w.ref}: ${w.message}`).join("\n")}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }),
  );

  server.registerTool(
    "update_section",
    {
      title: "Update section",
      description: "Change a section's title, body or refs.",
      inputSchema: {
        section_id: z.string(),
        title: z.string().optional(),
        body: z.string().optional(),
        refs: z.array(refSchema).optional(),
      },
    },
    wrap(async ({ section_id, title, body, refs }) => {
      const [row] = await db
        .select({ guideId: guideSections.guideId })
        .from(guideSections)
        .where(eq(guideSections.id, section_id))
        .limit(1);
      if (!row) throw new ToolError("Section not found");
      await guideInWorkspace(row.guideId);
      const { section, warnings } = await updateSection(section_id, { title, body, refs: refs as RefInput[] | undefined });
      return text(
        `Updated section ${section.position}: ${section.title}.${warnings.length ? `\nWarnings:\n${warnings.map((w) => `- ${w.ref}: ${w.message}`).join("\n")}` : ""}`,
      );
    }),
  );

  server.registerTool(
    "delete_section",
    {
      title: "Delete section",
      description: "Remove a section from a guide.",
      inputSchema: { section_id: z.string() },
      annotations: { destructiveHint: true },
    },
    wrap(async ({ section_id }) => {
      const [row] = await db
        .select({ guideId: guideSections.guideId })
        .from(guideSections)
        .where(eq(guideSections.id, section_id))
        .limit(1);
      if (!row) throw new ToolError("Section not found");
      await guideInWorkspace(row.guideId);
      await deleteSection(section_id);
      return text("Section deleted.");
    }),
  );

  server.registerTool(
    "reorder_sections",
    {
      title: "Reorder sections",
      description: "Set the order of a guide's sections. Pass every section_id once.",
      inputSchema: { guide_id: z.string(), section_ids: z.array(z.string()).min(1) },
    },
    wrap(async ({ guide_id, section_ids }) => {
      await guideInWorkspace(guide_id);
      const sections = await reorderSections(guide_id, section_ids);
      return text(sections.map((s) => `${s.position}. ${s.title}`).join("\n"));
    }),
  );

  server.registerTool(
    "update_guide",
    {
      title: "Update guide",
      description: "Change a guide's title or summary.",
      inputSchema: { guide_id: z.string(), title: z.string().optional(), summary: z.string().optional() },
    },
    wrap(async ({ guide_id, title, summary }) => {
      await guideInWorkspace(guide_id);
      const g = await updateGuideMeta(guide_id, { title, summary });
      return text(`Updated guide v${g.version}: ${g.title}`);
    }),
  );

  server.registerTool(
    "get_guide",
    {
      title: "Get guide",
      description: "Read a guide (by guide_id, or the latest guide of a PR) including section ids, bodies and refs.",
      inputSchema: { guide_id: z.string().optional(), pr: prArg.optional() },
      annotations: { readOnlyHint: true },
    },
    wrap(async ({ guide_id, pr }) => {
      let g: Guide | null = null;
      if (guide_id) g = await guideInWorkspace(guide_id);
      else if (pr) {
        const { ctx, number } = await resolvePr(pr);
        const [latest] = await listGuideVersions(ctx.repo.id, number);
        g = latest ? await getGuide(latest.id) : null;
      }
      if (!g) throw new ToolError("No guide found. Pass guide_id or pr.");
      const sections = await getSections(g.id);
      const parts = [
        `Guide v${g.version} (guide_id ${g.id}) — ${g.status}`,
        `Title: ${g.title}`,
        `URL: ${await urlFor(g)}`,
        `head_sha: ${g.headSha}`,
        "",
        "Summary:",
        g.summary || "(empty)",
        "",
        ...sections.flatMap((s) => [
          `## ${s.position}. ${s.title}${s.generated ? " (automatic)" : ""}`,
          `section_id: ${s.id}`,
          `refs: ${s.refs.map((r) => JSON.stringify(serializeRef(r))).join(", ") || "none"}`,
          s.body,
          "",
        ]),
      ];
      return text(parts.join("\n"));
    }),
  );

  server.registerTool(
    "check_coverage",
    {
      title: "Check coverage",
      description: "List changed lines that no section covers yet.",
      inputSchema: { guide_id: z.string() },
      annotations: { readOnlyHint: true },
    },
    wrap(async ({ guide_id }) => {
      const g = await guideInWorkspace(guide_id);
      return text(describeCoverage(await getCoverage(g)));
    }),
  );

  server.registerTool(
    "finish_guide",
    {
      title: "Finish guide",
      description:
        "Publish a guide started with start_guide. Uncovered changes are added to an automatic 'Other changes' section unless auto_cover is false.",
      inputSchema: { guide_id: z.string(), auto_cover: z.boolean().optional() },
    },
    wrap(async ({ guide_id, auto_cover }) => {
      await guideInWorkspace(guide_id);
      const { guide, coverage, sectionCoverage } = await finishGuide(guide_id, {
        autoCover: auto_cover,
        actorUserId: principal.user.id,
        actorLabel: author,
      });
      const template = await templateWarning(guide);
      return text(
        `Published guide v${guide.version}.\nURL: ${await urlFor(guide)}\n${describeFinishedCoverage(sectionCoverage, coverage)}${template ? `\n${template}` : ""}`,
      );
    }),
  );

  server.registerTool(
    "upload_asset",
    {
      title: "Upload image or video",
      description:
        "Upload a screenshot, image, screen recording or PDF (png, jpg, gif, webp, avif, svg, mp4, webm, mov, m4v, pdf) to use in section bodies. Returns a URL and a markdown snippet.",
      inputSchema: {
        filename: z.string().describe("e.g. checkout-flow.mp4"),
        content_base64: z.string().optional().describe("File contents, base64 encoded"),
        url: z.string().optional().describe("Or a public http(s) URL to download"),
        content_type: z.string().optional(),
        guide_id: z.string().optional(),
        alt: z.string().optional(),
      },
    },
    wrap(async ({ filename, content_base64, url, content_type, guide_id, alt }) => {
      if (guide_id) await guideInWorkspace(guide_id);
      let data: Buffer;
      let type = content_type ?? null;
      let name = filename;
      if (content_base64) {
        data = Buffer.from(content_base64.replace(/^data:[^;]+;base64,/, ""), "base64");
      } else if (url) {
        const remote = await fetchRemoteAsset(url);
        data = remote.data;
        type = type ?? remote.contentType;
        name = filename || remote.filename;
      } else throw new ToolError("Provide content_base64 or url.");
      const asset = await storeAsset({
        workspaceId,
        guideId: guide_id ?? null,
        filename: name,
        contentType: type,
        data,
        userId: principal.user.id,
      });
      return text(`Uploaded ${asset.filename} (${Math.round(asset.size / 1024)} KB).\nURL: ${assetUrl(asset)}\nMarkdown: ${markdownFor(asset, alt)}`);
    }),
  );

  server.registerTool(
    "list_review_comments",
    {
      title: "List review comments",
      description:
        "Read the review conversations on a pull request (including comments posted from Omakaze): each thread's thread_id and resolved state, the commented lines, the guide section that shows them, and every comment with its comment_id and author. Comments marked (you) are the user's own.",
      inputSchema: {
        pr: prArg,
        state: z.enum(["open", "resolved", "all"]).optional().describe('Which conversations to show. Default "all".'),
      },
      annotations: { readOnlyHint: true },
    },
    wrap(async ({ pr, state }) => {
      const { ctx, number, guide, label } = await reviewTarget(pr);
      const [list, mine, account, threads, locate] = await Promise.all([
        listReviewComments(ctx, number, true),
        ownCommentIds(ctx.repo.id, number, principal.user.id),
        getGitHubAccount(principal.user.id),
        // Thread IDs and resolved state come from GraphQL; without it the comments are still listed.
        listReviewThreads(ctx, number, true).then(
          (data) => ({ data, error: null }),
          (err: unknown) => ({ data: null, error: err instanceof Error ? err.message : String(err) }),
        ),
        sectionLocator(guide).catch(() => () => null),
      ]);
      const index = threadIndex(threads.data ?? []);
      const login = account?.login ?? null;
      return text(
        formatReviewThreads(
          groupReviewThreads(list, (id) => index.get(id) ?? null),
          {
            pr: label,
            state: state ?? "all",
            threadsError: threads.error,
            login,
            isMine: (c) => mine.has(c.id) || (login !== null && c.user?.login.toLowerCase() === login.toLowerCase()),
            sectionOf: (root) => commentSection(locate, root),
          },
        ),
      );
    }),
  );

  server.registerTool(
    "reply_to_review_comment",
    {
      title: "Reply to review comment",
      description:
        "Reply in a review thread on GitHub, as the user. Pass the thread_id or a comment_id from list_review_comments. The body is GitHub markdown and may contain a ```suggestion block.",
      inputSchema: { pr: prArg, ...threadArgs, body: z.string().trim().min(1).max(65000).describe("GitHub markdown") },
    },
    wrap(async ({ pr, thread_id, comment_id, body }) => {
      const target = await reviewTarget(pr);
      const root = await threadRoot(target, { thread_id, comment_id });
      const reply = await replyToReviewComment(target.ctx, target.number, poster, root.id, body, target.meta);
      const thread = await findReviewThread(target.ctx, target.number, { commentId: root.id }).catch(() => null);
      return text(
        [
          `Replied on ${threadPosition(root)} ${await attribution(reply.user?.login)}.`,
          `comment_id: ${reply.id}`,
          thread ? `thread_id: ${thread.id}` : "",
          `URL: ${reply.html_url}`,
          thread && !thread.isResolved ? "If this answers the conversation, resolve it with resolve_review_thread." : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }),
  );

  server.registerTool(
    "post_review_comment",
    {
      title: "Post review comment",
      description:
        'Comment on a line or a range of lines of the diff on GitHub, as the user. Use the line numbers get_diff shows: side "new" (the default) for added and context lines, side "old" with the o-number for removed lines. start_line makes a comment on several lines of one hunk. To suggest a change, pass suggestion with the replacement for the commented lines (GitHub shows it as a suggested change the author can commit), or write a ```suggestion block in body.',
      inputSchema: {
        pr: prArg,
        path: z.string().min(1),
        line: z.number().int().min(1).describe("The last (or only) commented line"),
        side: sideArg.optional().describe('"new" (default) or "old" for removed lines'),
        start_line: z.number().int().min(1).optional().describe("The first line, for a comment on several lines"),
        start_side: sideArg.optional().describe("Side of start_line. Defaults to side."),
        body: z.string().max(65000).optional().describe("GitHub markdown"),
        suggestion: z
          .string()
          .max(65000)
          .optional()
          .describe("Replacement text for the commented lines (new side only), added to body as a ```suggestion block. An empty string suggests deleting the lines."),
        head_sha: z.string().optional().describe("head_sha from get_pull_request, so line numbers match the diff you read"),
      },
    },
    wrap(async ({ pr, path, line, side, start_line, start_side, body, suggestion, head_sha }) => {
      const target = await reviewTarget(pr);
      const note = body?.trim() ?? "";
      if (!note && suggestion === undefined) throw new ToolError("Pass body, suggestion or both.");
      const { snapshot } = await getOrCreateSnapshot(target.ctx, target.number, { expectedHeadSha: head_sha });
      const mapped = commentPosition(parseFiles(snapshot.files), { path, line, side, startLine: start_line, startSide: start_side });
      if (!mapped.ok) throw new ToolError(mapped.error);
      const p = mapped.position;
      const replacement = suggestion === undefined ? null : suggestion === "" ? [] : suggestion.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
      const full = [note, replacement ? suggestionBlock(replacement) : ""].filter(Boolean).join("\n\n");
      const suggests = hasSuggestion(full);
      // GitHub applies suggestions to lines of the head commit only.
      if (suggests && (p.side === "LEFT" || p.startSide === "LEFT")) {
        throw new ToolError('A suggested change replaces lines of the new version. Comment on side "new" lines to suggest one.');
      }
      const locate = await sectionLocator(target.guide).catch(() => () => null);
      const section = locate({ path: p.path, line: p.line, side: toDiffSide(p.side), commitSha: snapshot.headSha });
      const created = await createReviewComment(
        target.ctx,
        target.number,
        poster,
        { path: p.path, line: p.line, side: p.side, startLine: p.startLine, startSide: p.startSide, body: full, commitSha: snapshot.headSha },
        { ...target.meta, sectionId: section?.id ?? null },
      );
      const thread = await findReviewThread(target.ctx, target.number, { commentId: created.id }).catch(() => null);
      return text(
        [
          `Commented on ${formatPosition(p)}${suggests ? " with a suggested change" : ""} ${await attribution(created.user?.login)}.`,
          `comment_id: ${created.id}`,
          thread ? `thread_id: ${thread.id}` : "",
          `URL: ${created.html_url}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }),
  );

  server.registerTool(
    "resolve_review_thread",
    {
      title: "Resolve review thread",
      description:
        "Resolve a review thread (conversation) on GitHub, or unresolve it with resolved: false. Resolve only threads that a reply or a change fully answered. Needs the user's linked GitHub account: Omakaze never resolves conversations through the workspace connection.",
      inputSchema: { pr: prArg, ...threadArgs, resolved: z.boolean().optional().describe("Default true; false unresolves the thread") },
      annotations: { idempotentHint: true },
    },
    wrap(async ({ pr, thread_id, comment_id, resolved }) => {
      if (!thread_id && !comment_id) throw new ToolError("Pass thread_id or comment_id from list_review_comments.");
      const target = await reviewTarget(pr);
      const want = resolved ?? true;
      try {
        const { thread } = await setReviewThreadResolved(
          target.ctx,
          target.number,
          { id: principal.user.id },
          { threadId: thread_id ?? null, commentId: comment_id ?? null },
          want,
          target.meta,
        );
        const root = (await listReviewComments(target.ctx, target.number).catch(() => [])).find((c) => c.id === thread.commentIds[0]);
        return text(`${want ? "Resolved" : "Unresolved"} the conversation${root ? ` on ${threadPosition(root)}` : ""} (thread_id ${thread.id}).`);
      } catch (err) {
        if (err instanceof ThreadNotFoundError) {
          throw new ToolError(`${thread_id ? `Thread ${thread_id}` : `Comment ${comment_id}`} is not part of a conversation on ${target.label}. Use a thread_id from list_review_comments.`);
        }
        throw accountRequired(err, want ? "Resolving conversations" : "Unresolving conversations");
      }
    }),
  );

  server.registerTool(
    "submit_review",
    {
      title: "Submit review",
      description:
        "Submit a review of the pull request on GitHub, as the user: COMMENT, or REQUEST_CHANGES with a body that says what has to change. APPROVE works only if a workspace admin allows agents to approve. Post line comments first with post_review_comment; the review adds the verdict and a summary. Submit a review only when the user asked for one.",
      inputSchema: {
        pr: prArg,
        event: z.enum(["COMMENT", "REQUEST_CHANGES", "APPROVE"]),
        body: z.string().max(65000).optional().describe("Summary in GitHub markdown. Required for COMMENT and REQUEST_CHANGES."),
        head_sha: z.string().optional().describe("The head_sha you reviewed; the call fails if the pull request has new commits"),
      },
    },
    wrap(async ({ pr, event, body, head_sha }) => {
      const ws = await workspace();
      if (event === "APPROVE" && !ws.allowAgentApprovals) {
        throw new ToolError(
          `Agents can't approve pull requests in the "${ws.name}" workspace. Ask the user to approve it themselves; a workspace admin can allow approvals by agents at ${env().APP_URL}/w/${ws.slug}/settings/tokens.`,
        );
      }
      const summary = body?.trim() ?? "";
      if (event !== "APPROVE" && !summary) throw new ToolError(`A ${event} review needs a body.`);
      const target = await reviewTarget(pr);
      const { snapshot } = await getOrCreateSnapshot(target.ctx, target.number, { expectedHeadSha: head_sha });
      try {
        const review = await submitReview(target.ctx, target.number, poster, { event, body: summary, commitSha: snapshot.headSha }, target.meta);
        // GitHub drops the reviewer's pending request once they review; mirror that in the cache.
        const login = review.postedAs === "user" ? await githubLoginOf(principal.user.id) : null;
        if (login) await clearReviewRequest(target.ctx.repo.id, target.number, login);
        const how = login ? `as ${login}` : await attribution(null);
        return text(`Submitted a review (${review.state}) on ${target.label} at ${snapshot.headSha.slice(0, 7)} ${how}.\nURL: ${review.html_url}`);
      } catch (err) {
        throw accountRequired(err, event === "APPROVE" ? "Approving" : "Requesting changes");
      }
    }),
  );

  server.registerTool(
    "post_pr_comment",
    {
      title: "Post PR comment",
      description: "Post a comment in the pull request's conversation on GitHub (not on a line of the diff), as the user.",
      inputSchema: { pr: prArg, body: z.string().trim().min(1).max(65000).describe("GitHub markdown") },
    },
    wrap(async ({ pr, body }) => {
      const target = await reviewTarget(pr);
      const comment = await postIssueComment(target.ctx, target.number, poster, body, target.meta);
      return text(`Commented on ${target.label} ${await attribution(comment.user?.login)}.\ncomment_id: ${comment.id}\nURL: ${comment.html_url}`);
    }),
  );

  server.registerPrompt(
    "create_guided_pr",
    {
      title: "Create a guided PR",
      description: "Instructions for writing a guided walkthrough of a pull request.",
      argsSchema: { pr_url: z.string().describe("Pull request URL") },
    },
    async ({ pr_url }) => {
      // The repository's template when it is followed, otherwise the workspace's.
      const parsed = parsePullUrl(pr_url);
      const repo = parsed ? await findWorkspaceRepo(workspaceId, parsed.owner, parsed.repo) : null;
      const template = templatePrompt(await templateFor(workspaceId, repo));
      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text: [agentPrompt(pr_url), AGENT_WORKFLOW, template].filter(Boolean).join("\n\n") },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "address_review_comments",
    {
      title: "Address review comments",
      description: "Instructions for answering the review comments on a pull request, improving its guide and resolving the answered conversations.",
      argsSchema: { pr_url: z.string().describe("Pull request URL") },
    },
    async ({ pr_url }) => ({
      messages: [{ role: "user", content: { type: "text", text: `${reviewCommentsPrompt(pr_url)}\n\n${REVIEW_WORKFLOW}` } }],
    }),
  );

  return server;
}
