/**
 * Seeds the demo workspace: users, a followed repository, cached pull requests, diff snapshots,
 * guides with two versions, review marks, comment records and activity.
 *
 *   pnpm db:seed                  # uses DATABASE_URL (and .env if present)
 *   pnpm db:seed --github=mock    # also a token connection and linked GitHub accounts for the mock GitHub API
 *
 * The seed is idempotent: it deletes the demo workspace and the demo users, then creates them again.
 * It applies pending migrations first (skip with --no-migrate). The data itself lives in scripts/demo-data.
 *
 * --github=none (default): the repository has no GitHub connection, so the app never calls GitHub.
 *   Its last sync time is set far in the future so the dashboard does not try to sync it.
 * --github=mock: the repository uses a token connection with a fake token, and every demo user has a
 *   linked GitHub account. Only use this when GITHUB_API_URL points at the mock (e2e/mock-github.ts).
 */
import { inArray, sql } from "drizzle-orm";
import { runMigrations } from "../src/db/migrate";
import {
  buildDemo,
  DEMO_COMMENTS,
  DEMO_CONNECTION,
  DEMO_PASSWORD,
  DEMO_PRS,
  DEMO_REPO,
  DEMO_REVIEW_MARKS,
  DEMO_REVIEWS,
  DEMO_USERS,
  DEMO_WORKSPACE,
  demoAvatar,
  demoPaths,
  githubAvatar,
  type DemoUserKey,
} from "./demo-data";
import { demoPeopleColumns } from "./demo-data/review-requests";
import { seedReviewCarryover } from "./demo-data/review-carryover";
import { seedShareLinks } from "./demo-data/share-links";

type GitHubMode = "none" | "mock";

function parseArgs(argv: string[]): { github: GitHubMode; migrate: boolean } {
  let github = (process.env.DEMO_GITHUB ?? "none") as GitHubMode;
  let migrate = true;
  for (const arg of argv) {
    if (arg.startsWith("--github=")) github = arg.slice("--github=".length) as GitHubMode;
    else if (arg === "--no-migrate") migrate = false;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: pnpm db:seed [--github=none|mock] [--no-migrate]");
      process.exit(0);
    } else if (arg !== "--") throw new Error(`Unknown argument ${arg}`);
  }
  if (github !== "none" && github !== "mock") throw new Error(`--github must be none or mock, not ${github}`);
  return { github, migrate };
}

/** Same text as the automatic section created by finishGuide (src/lib/guides/service.ts). */
const OTHER_CHANGES_BODY =
  "Changes that are not part of the sections above. Most are small supporting edits; review them before approving.";

/** Far enough ahead that the dashboard never considers a repository without a connection stale. */
const NEVER_STALE = new Date("2100-01-01T00:00:00Z");

async function seed(opts: { github: GitHubMode }) {
  // Imported after migrations so a missing table can't break module initialization.
  const { db, getDb } = await import("@/db");
  const s = await import("@/db/schema");
  const { encrypt, hashPassword } = await import("@/lib/crypto");
  const { parseFiles } = await import("@/lib/diff/parse");
  const { computeCoverage, normalizeRef, refsForUncovered, validateRefs, formatRef } = await import("@/lib/guides/refs");
  const { OTHER_CHANGES_TITLE } = await import("@/lib/guides/service");

  const demo = buildDemo();
  const { ago } = demo;
  const mock = opts.github === "mock";
  const userKeys = Object.keys(DEMO_USERS) as DemoUserKey[];

  await db.transaction(async (tx) => {
    /* Remove the previous demo ------------------------------------- */
    const old = await tx.select({ id: s.workspaces.id }).from(s.workspaces).where(sql`${s.workspaces.slug} = ${DEMO_WORKSPACE.slug}`);
    if (old.length > 0) {
      const ids = old.map((w) => w.id);
      // Guides reference snapshots with ON DELETE RESTRICT, so they go first.
      await tx.delete(s.guides).where(inArray(s.guides.workspaceId, ids));
      await tx.delete(s.workspaces).where(inArray(s.workspaces.id, ids));
    }
    const emails = userKeys.map((k) => DEMO_USERS[k].email);
    await tx.delete(s.users).where(sql`lower(${s.users.email}) in ${emails}`);
    await tx.delete(s.githubAccounts).where(inArray(s.githubAccounts.githubId, userKeys.map((k) => DEMO_USERS[k].github.id)));

    /* Users and workspace ------------------------------------------ */
    const users = {} as Record<DemoUserKey, typeof s.users.$inferSelect>;
    const joined: Record<DemoUserKey, number> = { owner: 720, admin: 700, member: 480 };
    for (const key of userKeys) {
      const u = DEMO_USERS[key];
      const [row] = await tx
        .insert(s.users)
        .values({
          name: u.name,
          email: u.email,
          emailVerifiedAt: ago(joined[key]),
          avatarUrl: demoAvatar(u.name, u.avatarColor),
          passwordHash: await hashPassword(DEMO_PASSWORD),
          isInstanceAdmin: key === "owner",
          createdAt: ago(joined[key]),
        })
        .returning();
      users[key] = row;
    }

    const [ws] = await tx
      .insert(s.workspaces)
      .values({ name: DEMO_WORKSPACE.name, slug: DEMO_WORKSPACE.slug, createdByUserId: users.owner.id, createdAt: ago(720) })
      .returning();
    for (const key of userKeys) {
      await tx.insert(s.memberships).values({ workspaceId: ws.id, userId: users[key].id, role: DEMO_USERS[key].role, createdAt: ago(joined[key]) });
    }
    await tx.update(s.users).set({ lastWorkspaceId: ws.id }).where(inArray(s.users.id, userKeys.map((k) => users[k].id)));

    /* GitHub (mock mode only) -------------------------------------- */
    let connectionId: string | null = null;
    if (mock) {
      const [conn] = await tx
        .insert(s.githubConnections)
        .values({
          workspaceId: ws.id,
          type: "token",
          accountLogin: DEMO_CONNECTION.accountLogin,
          accountType: DEMO_CONNECTION.accountType,
          accountAvatarUrl: demoAvatar("Acme", "#141518"),
          tokenEnc: encrypt(DEMO_CONNECTION.token),
          createdByUserId: users.owner.id,
          createdAt: ago(700),
        })
        .returning();
      connectionId = conn.id;
      for (const key of userKeys) {
        const g = DEMO_USERS[key].github;
        await tx.insert(s.githubAccounts).values({
          userId: users[key].id,
          githubId: g.id,
          login: g.login,
          avatarUrl: githubAvatar(g.login),
          tokenType: "pat",
          accessTokenEnc: encrypt(g.token),
          scopes: "repo, user:email",
        });
      }
    }

    const [repo] = await tx
      .insert(s.repositories)
      .values({
        workspaceId: ws.id,
        connectionId,
        githubId: DEMO_REPO.githubId,
        owner: DEMO_REPO.owner,
        name: DEMO_REPO.name,
        fullName: DEMO_REPO.fullName,
        private: DEMO_REPO.private,
        defaultBranch: DEMO_REPO.defaultBranch,
        description: DEMO_REPO.description,
        htmlUrl: DEMO_REPO.htmlUrl,
        lastSyncedAt: mock ? demo.now : NEVER_STALE,
        createdAt: ago(700),
      })
      .returning();

    /* Pull requests and snapshots ---------------------------------- */
    const snapshotIds = new Map<string, string>();
    for (const p of demo.pulls) {
      await tx.insert(s.pullRequests).values({
        repositoryId: repo.id,
        number: p.number,
        githubId: 92_000_000 + p.number,
        title: p.title,
        body: p.body,
        state: p.state,
        merged: p.merged,
        draft: p.draft,
        authorLogin: p.author,
        authorAvatarUrl: githubAvatar(p.author),
        headRef: p.headRef,
        headSha: p.headSha,
        baseRef: DEMO_REPO.defaultBranch,
        baseSha: p.baseSha,
        additions: p.additions,
        deletions: p.deletions,
        changedFiles: p.changedFiles,
        commits: p.commits,
        htmlUrl: p.htmlUrl,
        githubCreatedAt: p.createdAt,
        githubUpdatedAt: p.updatedAt,
        mergedAt: p.mergedAt,
        closedAt: p.closedAt,
        detailsSha: p.headSha,
        ...demoPeopleColumns(p.number, githubAvatar),
        syncedAt: demo.now,
      });
      for (const snap of p.snapshots) {
        const [row] = await tx
          .insert(s.diffSnapshots)
          .values({
            repositoryId: repo.id,
            prNumber: p.number,
            headSha: snap.headSha,
            baseSha: snap.baseSha,
            mergeBaseSha: snap.mergeBaseSha,
            files: snap.files,
            createdAt: snap.pushedAt,
          })
          .returning({ id: s.diffSnapshots.id });
        snapshotIds.set(snap.headSha, row.id);
      }
    }

    /* Guides -------------------------------------------------------- */
    const guideIds = new Map<string, string>();
    const sectionIds = new Map<string, string>();
    const activity: (typeof s.activity.$inferInsert)[] = [
      { workspaceId: ws.id, actorUserId: users.owner.id, type: "workspace.created", data: { name: ws.name }, createdAt: ago(720) },
      { workspaceId: ws.id, actorUserId: users.admin.id, type: "member.joined", data: { role: "admin" }, createdAt: ago(700) },
      { workspaceId: ws.id, actorUserId: users.owner.id, type: "repo.added", repositoryId: repo.id, data: { fullName: repo.fullName }, createdAt: ago(699) },
      { workspaceId: ws.id, actorUserId: users.member.id, type: "member.joined", data: { role: "member" }, createdAt: ago(480) },
    ];
    for (const g of demo.guides) {
      const snapshot = demo.pulls.flatMap((p) => p.snapshots).find((x) => x.headSha === g.headSha)!;
      const files = parseFiles(snapshot.files);
      const known = new Set(files.map((f) => f.path));
      const sections = g.builtSections.map((sec) => {
        const refs = sec.refs.map((r) => normalizeRef(r, known));
        const errors = validateRefs(refs, files).filter((p) => p.level === "error");
        if (errors.length > 0) {
          throw new Error(`Invalid refs in ${g.markdown} "${sec.title}": ${errors.map((e) => `${e.ref}: ${e.message}`).join("; ")}`);
        }
        return { ...sec, refs, generated: false };
      });
      const coverage = computeCoverage(files, sections);
      if (coverage.uncovered.length > 0) {
        sections.push({ key: "other", title: OTHER_CHANGES_TITLE, body: OTHER_CHANGES_BODY, refs: refsForUncovered(coverage.uncovered), generated: true });
      }
      const createdAt = g.createdAt;
      const at = (minutes: number) => new Date(createdAt.getTime() + minutes * 60_000).toISOString();
      const [guide] = await tx
        .insert(s.guides)
        .values({
          workspaceId: ws.id,
          repositoryId: repo.id,
          prNumber: g.pr,
          version: g.version,
          snapshotId: snapshotIds.get(g.headSha)!,
          status: "ready",
          source: "agent",
          title: g.title,
          summary: g.summary,
          headSha: g.headSha,
          createdByUserId: users[g.createdBy].id,
          createdVia: "mcp",
          author: g.author,
          events: [
            { at: at(0), message: "Guide started", level: "info" },
            ...sections.filter((x) => !x.generated).map((x, i) => ({ at: at(i + 1), message: `Section ${i + 1} added: ${x.title}`, level: "info" as const })),
            { at: at(sections.length + 1), message: "Guide published", level: "info" },
          ],
          publishedAt: new Date(createdAt.getTime() + (sections.length + 1) * 60_000),
          createdAt,
          updatedAt: new Date(createdAt.getTime() + (sections.length + 1) * 60_000),
        })
        .returning();
      guideIds.set(`${g.pr}:${g.version}`, guide.id);
      for (const [i, sec] of sections.entries()) {
        const [row] = await tx
          .insert(s.guideSections)
          .values({ guideId: guide.id, position: i + 1, title: sec.title, body: sec.body, refs: sec.refs, generated: sec.generated, createdAt: new Date(createdAt.getTime() + (i + 1) * 60_000) })
          .returning({ id: s.guideSections.id });
        sectionIds.set(`${g.pr}:${g.version}:${sec.key}`, row.id);
      }
      const actor = { workspaceId: ws.id, actorUserId: users[g.createdBy].id, actorLabel: g.author, repositoryId: repo.id, prNumber: g.pr, guideId: guide.id };
      activity.push(
        { ...actor, type: "guide.started", data: { version: g.version, via: "mcp" }, createdAt },
        { ...actor, type: "guide.ready", data: { version: g.version, sections: sections.length }, createdAt: new Date(createdAt.getTime() + (sections.length + 1) * 60_000) },
      );
      const uncovered = refsForUncovered(coverage.uncovered).map(formatRef);
      console.log(`  ${DEMO_REPO.fullName}#${g.pr} v${g.version}: ${sections.length} sections, ${coverage.coveredChanged}/${coverage.totalChanged} lines in the author's sections${uncovered.length ? ` (other changes: ${uncovered.join(", ")})` : ""}`);
    }

    /* Review marks and views --------------------------------------- */
    for (const [guideKey, byUser] of Object.entries(DEMO_REVIEW_MARKS)) {
      const guideId = guideIds.get(guideKey);
      if (!guideId) throw new Error(`No guide ${guideKey} for review marks`);
      const guide = demo.guides.find((g) => `${g.pr}:${g.version}` === guideKey)!;
      for (const [key, sectionKeys] of Object.entries(byUser) as [DemoUserKey, string[]][]) {
        for (const [i, sectionKey] of sectionKeys.entries()) {
          const sectionId = sectionIds.get(`${guideKey}:${sectionKey}`);
          if (!sectionId) throw new Error(`No section ${sectionKey} in guide ${guideKey}`);
          await tx.insert(s.sectionReviews).values({
            guideId,
            sectionId,
            userId: users[key].id,
            reviewedAt: new Date(guide.createdAt.getTime() + (90 + i * 12) * 60_000),
          });
        }
        await tx.insert(s.guideViews).values({ guideId, userId: users[key].id, lastViewedAt: new Date(guide.createdAt.getTime() + 150 * 60_000) });
      }
    }

    /* Comments posted through Omakaze, and their activity ----------- */
    for (const c of demo.comments.filter((x) => x.viaOmakaze)) {
      const user = users[c.viaOmakaze!];
      const guideVersion = c.head === "pr128-v1" ? 1 : 2;
      const guideId = guideIds.get(`${c.pr}:${guideVersion}`) ?? null;
      await tx.insert(s.comments).values({
        workspaceId: ws.id,
        repositoryId: repo.id,
        prNumber: c.pr,
        guideId,
        authorUserId: user.id,
        kind: c.inReplyTo ? "reply" : "review",
        path: c.path,
        line: c.originalLine,
        startLine: c.originalStartLine,
        side: "RIGHT",
        commitSha: c.commitSha,
        body: c.body,
        inReplyToGithubId: c.inReplyTo ?? null,
        githubId: c.id,
        githubUrl: c.htmlUrl,
        postedAs: "user",
        createdAt: c.createdAt,
      });
      activity.push({
        workspaceId: ws.id,
        actorUserId: user.id,
        type: "comment.posted",
        repositoryId: repo.id,
        prNumber: c.pr,
        guideId,
        data: { path: c.path, line: c.originalLine, url: c.htmlUrl, ...(c.inReplyTo ? { reply: true } : {}) },
        createdAt: c.createdAt,
      });
    }
    for (const r of DEMO_REVIEWS) {
      const user = users[r.viaOmakaze];
      const guideId = guideIds.get(`${r.pr}:1`) ?? null;
      const event = r.state === "CHANGES_REQUESTED" ? "REQUEST_CHANGES" : r.state === "APPROVED" ? "APPROVE" : "COMMENT";
      const url = `${DEMO_REPO.htmlUrl}/pull/${r.pr}#pullrequestreview-${r.id}`;
      await tx.insert(s.comments).values({
        workspaceId: ws.id,
        repositoryId: repo.id,
        prNumber: r.pr,
        guideId,
        authorUserId: user.id,
        kind: "review_submit",
        body: `${event}: ${r.body}`,
        githubId: r.id,
        githubUrl: url,
        postedAs: "user",
        createdAt: ago(r.hoursAgo),
      });
      activity.push({ workspaceId: ws.id, actorUserId: user.id, type: "review.submitted", repositoryId: repo.id, prNumber: r.pr, guideId, data: { event, url }, createdAt: ago(r.hoursAgo) });
    }
    await tx.insert(s.activity).values(activity);
  });
  await seedReviewCarryover(DEMO_WORKSPACE.slug);
  await seedShareLinks(DEMO_WORKSPACE.slug);

  await getDb().$client.end();
}

const { github, migrate } = parseArgs(process.argv.slice(2));
if (migrate) await runMigrations();
console.log(`Seeding the demo workspace (GitHub: ${github})…`);
try {
  await seed({ github });
} catch (err) {
  console.error(err);
  process.exit(1);
}
const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const commentCount = DEMO_COMMENTS.filter((c) => c.viaOmakaze).length;
console.log(`Done. ${commentCount} comment records.

  Sign in:   ${appUrl}${demoPaths.login}
  Owner:     ${DEMO_USERS.owner.email}
  Admin:     ${DEMO_USERS.admin.email}
  Member:    ${DEMO_USERS.member.email}
  Password:  ${DEMO_PASSWORD} (all users)

  Dashboard: ${appUrl}${demoPaths.dashboard}
  Guide:     ${appUrl}${demoPaths.pull(DEMO_PRS.main)}
  Version 1: ${appUrl}${demoPaths.pull(DEMO_PRS.main, { v: 1 })}`);
process.exit(0);
