import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { guideSections, repositories, workspaces } from "@/db/schema";
import { loadDashboard, parseStateFilter } from "@/lib/dashboard";
import { parseFiles } from "@/lib/diff/parse";
import { DIFF_FORMAT_NOTE, fileHeaderText, renderHunkText } from "@/lib/diff/render-text";
import { env } from "@/lib/env";
import { ghFileContent, GitHubError } from "@/lib/github/client";
import {
  addRepository,
  findWorkspaceRepo,
  getRepoContext,
  listConnections,
  lookupRepo,
  type RepoContext,
} from "@/lib/github/connections";
import { getOrCreateSnapshot, parsePullUrl } from "@/lib/github/pulls";
import { listReviewComments } from "@/lib/github/review";
import { AGENT_WORKFLOW, GUIDE_GUIDELINES } from "@/lib/guides/guidelines";
import { formatRef, type RefInput } from "@/lib/guides/refs";
import {
  addSection,
  createCompleteGuide,
  deleteSection,
  describeCoverage,
  finishGuide,
  getCoverage,
  getGuide,
  getSections,
  guideUrl,
  GuideError,
  listGuideVersions,
  reorderSections,
  startGuide,
  updateGuideMeta,
  updateSection,
  type Guide,
} from "@/lib/guides/service";
import { agentPrompt } from "@/lib/prompts";
import { AssetError, fetchRemoteAsset, markdownFor, assetUrl, storeAsset } from "@/lib/storage/assets";
import { getMembership, roleAtLeast } from "@/lib/workspaces";
import type { ApiPrincipal } from "@/lib/guides/access";

export const MCP_INSTRUCTIONS = `Guided PRs turns pull requests into guided walkthroughs: ordered sections, each with a markdown explanation and the parts of the diff it covers.

${AGENT_WORKFLOW}

${GUIDE_GUIDELINES}

${DIFF_FORMAT_NOTE}`;

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

export function createMcpServer(principal: ApiPrincipal, client: { name?: string } = {}) {
  const server = new McpServer(
    { name: "guided-prs", title: "Guided PRs", version: "0.1.0" },
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
    if (!repo) {
      const role = await getMembership(ws.id, principal.user.id);
      if (!role || !roleAtLeast(role, "admin")) {
        throw new ToolError(`${parsed.owner}/${parsed.repo} is not connected to the "${ws.name}" workspace. Ask an admin to add it at ${env().APP_URL}/w/${ws.slug}/repos.`);
      }
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
    return { ctx: await getRepoContext(repo.id), number: parsed.number, slug: ws.slug };
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

  function wrap<A>(fn: (args: A) => Promise<ToolResult>) {
    return async (args: A): Promise<ToolResult> => {
      try {
        return await fn(args);
      } catch (err) {
        if (err instanceof ToolError || err instanceof GuideError || err instanceof AssetError) return fail(err.message);
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
      const repos = await db.select().from(repositories).where(eq(repositories.workspaceId, ws.id)).orderBy(asc(repositories.fullName));
      return text(
        [
          `User: ${principal.user.name}${principal.user.email ? ` <${principal.user.email}>` : ""}`,
          `Workspace: ${ws.name} (${env().APP_URL}/w/${ws.slug})`,
          `Repositories (${repos.length}): ${repos.map((r) => r.fullName).join(", ") || "none"}`,
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
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    wrap(async ({ repository, state, limit }) => {
      const ws = await workspace();
      let repoId: string | undefined;
      if (repository) {
        const [owner, name] = repository.split("/");
        const repo = owner && name ? await findWorkspaceRepo(ws.id, owner, name) : null;
        if (!repo) throw new ToolError(`${repository} is not in this workspace.`);
        repoId = repo.id;
      }
      const data = await loadDashboard(ws.id, { state: parseStateFilter(state ?? "open"), repositoryId: repoId });
      const repoName = new Map(data.repos.map((r) => [r.id, r.fullName]));
      const lines = data.pulls.slice(0, limit ?? 50).map((p) => {
        const g = data.guides.get(`${p.repositoryId}:${p.number}`);
        const st = p.merged ? "merged" : p.state;
        return `- ${repoName.get(p.repositoryId)}#${p.number} [${st}${p.draft ? ", draft" : ""}] ${p.title} (${p.htmlUrl})${g ? ` — guide v${g.version} ${g.status}` : ""}`;
      });
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
      const { guide, coverage, warnings } = await createCompleteGuide({
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
          describeCoverage(coverage),
          warnings.length ? `Warnings:\n${warnings.map((w) => `- ${w.ref}: ${w.message}`).join("\n")}` : "",
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
          `refs: ${s.refs.map(formatRef).join(", ") || "none"}`,
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
      const { guide, coverage } = await finishGuide(guide_id, {
        autoCover: auto_cover,
        actorUserId: principal.user.id,
        actorLabel: author,
      });
      return text(`Published guide v${guide.version}.\nURL: ${await urlFor(guide)}\n${describeCoverage(coverage)}`);
    }),
  );

  server.registerTool(
    "upload_asset",
    {
      title: "Upload image or video",
      description:
        "Upload a screenshot, image or screen recording (png, jpg, gif, webp, svg, mp4, webm, mov) to use in section bodies. Returns a URL and a markdown snippet.",
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
      description: "Read the line comments on a pull request (including ones posted from Guided PRs).",
      inputSchema: { pr: prArg },
      annotations: { readOnlyHint: true },
    },
    wrap(async ({ pr }) => {
      const { ctx, number } = await resolvePr(pr);
      const list = await listReviewComments(ctx, number, true);
      if (list.length === 0) return text("No review comments.");
      return text(
        list
          .map((c) => `- ${c.user?.login ?? "unknown"} on ${c.path}:${c.line ?? c.original_line}${c.in_reply_to_id ? ` (reply to ${c.in_reply_to_id})` : ""}: ${c.body.replace(/\s+/g, " ").slice(0, 400)}`)
          .join("\n"),
      );
    }),
  );

  server.registerPrompt(
    "create_guided_pr",
    {
      title: "Create a guided PR",
      description: "Instructions for writing a guided walkthrough of a pull request.",
      argsSchema: { pr_url: z.string().describe("Pull request URL") },
    },
    ({ pr_url }) => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: `${agentPrompt(pr_url)}\n\n${AGENT_WORKFLOW}` },
        },
      ],
    }),
  );

  return server;
}
