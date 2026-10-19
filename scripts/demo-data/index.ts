/**
 * Demo data shared by the seed (`pnpm db:seed`), the mock GitHub API and the end-to-end tests.
 *
 * The constants at the top (users, workspace, repository, pull request numbers, paths) are cheap to
 * import. `buildDemo()` reads the fictional repository in `repo/` and the guide texts in `guides/`,
 * and computes diffs with `git diff --no-index`; call it only where the diffs are needed.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePatch } from "../../src/lib/diff/parse";
import type { DiffFile } from "../../src/lib/diff/types";
import type { RefInput } from "../../src/lib/guides/refs";
import { unifiedPatch } from "./patch";
import { REVIEW_DEMO_PULLS } from "./review-requests";
import { THREAD_DEMO_COMMENTS } from "./review-threads";

export { DEMO_RESOLVED_THREADS } from "./review-threads";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.join(HERE, "repo");
const GUIDES_DIR = path.join(HERE, "guides");

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Password of every demo user. */
export const DEMO_PASSWORD = "omakaze-demo";

export type DemoUserKey = "owner" | "admin" | "member";

export type DemoUser = {
  key: DemoUserKey;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  /** GitHub identity used by the mock GitHub API (linked account in `--github=mock` seeds). */
  github: { id: number; login: string; token: string };
  avatarColor: string;
};

export const DEMO_USERS: Record<DemoUserKey, DemoUser> = {
  owner: {
    key: "owner",
    name: "Alex Morgan",
    email: "demo@omakaze.dev",
    role: "owner",
    github: { id: 91_000_001, login: "alexmorgan", token: "ghp_demoAlexMorgan000000000000000000000001" },
    avatarColor: "#1f8a85",
  },
  admin: {
    key: "admin",
    name: "Maya Chen",
    email: "maya@omakaze.dev",
    role: "admin",
    github: { id: 91_000_002, login: "mayachen", token: "ghp_demoMayaChen00000000000000000000000002" },
    avatarColor: "#3b5bdb",
  },
  member: {
    key: "member",
    name: "Sam Okafor",
    email: "sam@omakaze.dev",
    role: "member",
    github: { id: 91_000_003, login: "samokafor", token: "ghp_demoSamOkafor0000000000000000000000003" },
    avatarColor: "#c2410c",
  },
};

export const DEMO_WORKSPACE = { name: "Acme", slug: "demo" } as const;

export const DEMO_REPO = {
  owner: "acme",
  name: "storefront",
  fullName: "acme/storefront",
  githubId: 91_100_001,
  private: true,
  defaultBranch: "main",
  description: "Acme's online store: catalog, cart and checkout.",
  htmlUrl: "https://github.com/acme/storefront",
} as const;

/** The token-type connection created by `--github=mock` seeds. The mock GitHub API accepts it. */
export const DEMO_CONNECTION = {
  token: "ghp_demoStorefrontBot00000000000000000000",
  login: "storefront-bot",
  id: 91_000_100,
  accountLogin: "acme",
  accountType: "Organization" as const,
};

/** GitHub users that are not workspace members (pull request authors). */
export const DEMO_GITHUB_PEOPLE: Record<string, { id: number; name: string; color: string }> = {
  alexmorgan: { id: 91_000_001, name: "Alex Morgan", color: DEMO_USERS.owner.avatarColor },
  mayachen: { id: 91_000_002, name: "Maya Chen", color: DEMO_USERS.admin.avatarColor },
  samokafor: { id: 91_000_003, name: "Sam Okafor", color: DEMO_USERS.member.avatarColor },
  "devon-ko": { id: 91_000_004, name: "Devon Ko", color: "#7c3aed" },
  "priya-s": { id: 91_000_005, name: "Priya Shah", color: "#be185d" },
  "storefront-bot": { id: 91_000_100, name: "Storefront Bot", color: "#52525b" },
};

/** Pull request numbers, by role in the demo. */
export const DEMO_PRS = {
  /** Open, two guide versions (v1 outdated, v2 on the current head), comments and review marks. */
  main: 128,
  /** Open, one guide written for an older head commit (shows "outdated"). */
  outdated: 129,
  /** Merged, one guide. */
  merged: 127,
  /** Open draft, no guide. */
  draft: 130,
  /** Open, no guide. */
  noGuide: 131,
  /** Closed without merging, no guide. */
  closed: 124,
} as const;

const PR_BASE = `/w/${DEMO_WORKSPACE.slug}/${DEMO_REPO.fullName}/pull`;

/** URLs of the key pages (relative to the app URL). */
export const demoPaths = {
  login: "/login",
  dashboard: `/w/${DEMO_WORKSPACE.slug}`,
  repo: `/w/${DEMO_WORKSPACE.slug}/${DEMO_REPO.fullName}`,
  repos: `/w/${DEMO_WORKSPACE.slug}/repos`,
  activity: `/w/${DEMO_WORKSPACE.slug}/activity`,
  settings: `/w/${DEMO_WORKSPACE.slug}/settings`,
  account: "/account",
  /** A pull request page. `v` pins a guide version; `section` opens a step (1-based, "review" or "files"). */
  pull(number: number = DEMO_PRS.main, opts: { v?: number; section?: number | "review" | "files" } = {}) {
    const q = new URLSearchParams();
    if (opts.v) q.set("v", String(opts.v));
    if (opts.section !== undefined) q.set("section", String(opts.section));
    const qs = q.toString();
    return `${PR_BASE}/${number}${qs ? `?${qs}` : ""}`;
  },
  edit(number: number = DEMO_PRS.main, v?: number) {
    return `${PR_BASE}/${number}/edit${v ? `?v=${v}` : ""}`;
  },
};

/** A stable, fake 40-character commit SHA. */
export function demoSha(label: string): string {
  return createHash("sha1").update(`acme/storefront:${label}`).digest("hex");
}

/** Commit SHAs of the demo pull requests, by snapshot label. */
export const DEMO_SHAS = {
  base: demoSha("main"),
  pr128v1: demoSha("pr128-v1"),
  pr128v2: demoSha("pr128-v2"),
  pr129v1: demoSha("pr129-v1"),
  pr129v2: demoSha("pr129-v2"),
} as const;

/** Square SVG avatar with initials, as a data URI (no network). */
export function demoAvatar(name: string, color: string): string {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="${color}"/><text x="48" y="50" dominant-baseline="middle" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="38" fill="#ffffff">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function githubAvatar(login: string): string {
  const p = DEMO_GITHUB_PEOPLE[login];
  return demoAvatar(p?.name ?? login, p?.color ?? "#52525b");
}

/* ------------------------------------------------------------------ */
/* Pull requests                                                       */
/* ------------------------------------------------------------------ */

type FileChange = { path: string; status: DiffFile["status"]; previousPath?: string };

type HeadDef = {
  /** Snapshot label; also the seed of the head SHA. */
  label: string;
  /** Directories under repo/ that hold the head versions, first match wins; repo/base is the fallback. */
  layers: string[];
  files: FileChange[];
  pushedHoursAgo: number;
};

export type PullDef = {
  number: number;
  title: string;
  body: string;
  author: string;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  headRef: string;
  createdHoursAgo: number;
  updatedHoursAgo: number;
  closedHoursAgo?: number;
  commits: number;
  /** Head commits in order; the last one is the current head. Empty for pull requests without content. */
  heads: HeadDef[];
  /** Line stats for pull requests without file contents. */
  stats?: { additions: number; deletions: number; changedFiles: number };
};

const PR128_FILES: FileChange[] = [
  { path: "db/migrations/0018_promo_codes.sql", status: "added" },
  { path: "src/db/schema.ts", status: "modified" },
  { path: "src/lib/promo.ts", status: "added" },
  { path: "src/lib/money.ts", status: "added" },
  { path: "src/lib/cart.ts", status: "modified" },
  { path: "src/app/api/checkout/route.ts", status: "modified" },
  { path: "src/app/api/promo/preview/route.ts", status: "added" },
  { path: "src/components/checkout/PromoCodeField.tsx", status: "added" },
  { path: "src/components/checkout/OrderSummary.tsx", status: "renamed", previousPath: "src/components/cart/Summary.tsx" },
  { path: "src/components/cart/CheckoutButton.tsx", status: "modified" },
  { path: "src/app/(shop)/cart/page.tsx", status: "modified" },
  { path: "docs/checkout.md", status: "modified" },
  { path: "tests/promo.test.ts", status: "added" },
];

const PR129_FILES: FileChange[] = [
  { path: "src/lib/cart.ts", status: "modified" },
  { path: "tests/cart.test.ts", status: "modified" },
];

export const DEMO_PULLS: PullDef[] = [
  {
    number: 128,
    title: "Apply promo codes at checkout",
    author: "mayachen",
    state: "open",
    merged: false,
    draft: false,
    headRef: "maya/promo-codes",
    createdHoursAgo: 76,
    updatedHoursAgo: 3,
    commits: 7,
    body: [
      "Adds promo codes: a `promo_codes` table, validation, the discount in cart totals, a field on the cart page and redemption counting at checkout.",
      "",
      "Closes #97.",
      "",
      "### Testing",
      "",
      "- `pnpm test`",
      "- Applied `WELCOME10` and `FREESHIP` on a local cart and placed orders with both.",
    ].join("\n"),
    heads: [
      { label: "pr128-v1", layers: ["pr128-v1"], files: PR128_FILES, pushedHoursAgo: 54 },
      { label: "pr128-v2", layers: ["pr128-v2", "pr128-v1"], files: PR128_FILES, pushedHoursAgo: 4 },
    ],
  },
  {
    number: 131,
    title: "Serve product images through the CDN resizer",
    author: "devon-ko",
    state: "open",
    merged: false,
    draft: false,
    headRef: "devon/image-cdn",
    createdHoursAgo: 20,
    updatedHoursAgo: 1.5,
    commits: 2,
    body: "Product images go through `cdn.acme-storefront.com/resize`, which caches each size at the edge. Cuts the largest product page from 2.1 MB to 640 KB.",
    heads: [
      {
        label: "pr131",
        layers: ["pr131"],
        files: [
          { path: "next.config.ts", status: "modified" },
          { path: "src/lib/images.ts", status: "added" },
        ],
        pushedHoursAgo: 1.5,
      },
    ],
  },
  {
    number: 130,
    title: "Share wishlists by link",
    author: "priya-s",
    state: "open",
    merged: false,
    draft: true,
    headRef: "priya/wishlist-share",
    createdHoursAgo: 30,
    updatedHoursAgo: 9,
    commits: 3,
    body: "Work in progress. Adds a share token to wishlists and a read-only page for shared lists. Purchased items are not marked yet.",
    heads: [
      {
        label: "pr130",
        layers: ["pr130"],
        files: [
          { path: "src/db/schema.ts", status: "modified" },
          { path: "src/lib/wishlist-share.ts", status: "added" },
          { path: "src/app/(shop)/wishlist/[token]/page.tsx", status: "added" },
        ],
        pushedHoursAgo: 9,
      },
    ],
  },
  {
    number: 129,
    title: "Round sales tax per line item",
    author: "samokafor",
    state: "open",
    merged: false,
    draft: false,
    headRef: "sam/line-tax",
    createdHoursAgo: 50,
    updatedHoursAgo: 6,
    commits: 2,
    body: "The invoice prints tax per line, but we charged tax rounded once on the subtotal. With several cheap items the two differed by a cent.",
    heads: [
      { label: "pr129-v1", layers: ["pr129-v1"], files: PR129_FILES, pushedHoursAgo: 48 },
      { label: "pr129-v2", layers: ["pr129-v2", "pr129-v1"], files: PR129_FILES, pushedHoursAgo: 6 },
    ],
  },
  {
    number: 127,
    title: "Send order confirmation emails",
    author: "mayachen",
    state: "closed",
    merged: true,
    draft: false,
    headRef: "maya/order-emails",
    createdHoursAgo: 150,
    updatedHoursAgo: 100,
    closedHoursAgo: 100,
    commits: 4,
    body: "Sends a plain-text confirmation after checkout from a background job.",
    heads: [
      {
        label: "pr127",
        layers: ["pr127"],
        files: [
          { path: "src/lib/email/order-confirmation.ts", status: "added" },
          { path: "src/lib/jobs.ts", status: "modified" },
        ],
        pushedHoursAgo: 120,
      },
    ],
  },
  {
    number: 124,
    title: "Experiment: one-page checkout",
    author: "devon-ko",
    state: "closed",
    merged: false,
    draft: false,
    headRef: "devon/one-page-checkout",
    createdHoursAgo: 400,
    updatedHoursAgo: 260,
    closedHoursAgo: 260,
    commits: 5,
    body: "Closing in favor of keeping the cart and checkout separate; see the notes in #119.",
    heads: [],
    stats: { additions: 412, deletions: 167, changedFiles: 9 },
  },
  ...REVIEW_DEMO_PULLS,
];

/* ------------------------------------------------------------------ */
/* Guides                                                              */
/* ------------------------------------------------------------------ */

/** Helpers for computing line ranges in a snapshot's files, so refs and links survive edits to repo/. */
export type HeadFiles = {
  /** 1-based line number of the first line (at or after `after`) that contains `text`, or starts with it when `text` begins with ^. */
  line(path: string, text: string, after?: number, side?: "new" | "old"): number;
  /** Lines from the line matching `from` to the next line matching `to` (or `from` alone). */
  range(path: string, from: string, to?: string, side?: "new" | "old"): { start: number; end: number };
  lineCount(path: string, side?: "new" | "old"): number;
};

type SectionDef = { id: string; title: string; refs: (f: HeadFiles) => RefInput[] };

type Anchors = Record<string, (f: HeadFiles) => string>;

export type GuideDef = {
  pr: number;
  version: number;
  /** Snapshot label the guide was written against. */
  head: string;
  title: string;
  /** Markdown file in guides/ with a summary and one block per section id. */
  markdown: string;
  /** Markdown file to take missing blocks from (for a version that changes only some sections). */
  markdownFallback?: string;
  author: string;
  createdBy: DemoUserKey;
  createdHoursAgo: number;
  sections: SectionDef[];
  /** Targets for {{diff:name}} placeholders in the markdown, computed when a placeholder uses them. */
  anchors: Anchors;
};

function diffLink(path: string, r: { start: number; end: number }, side: "new" | "old" = "new"): string {
  const range = r.start === r.end ? `L${r.start}` : `L${r.start}-L${r.end}`;
  return `diff:${path}#${side === "old" ? "old:" : ""}${range}`;
}

const pr128Sections: SectionDef[] = [
  {
    id: "table",
    title: "Promo codes table",
    refs: () => [
      "db/migrations/0018_promo_codes.sql",
      { path: "src/db/schema.ts", hunks: [2], note: "promo_codes" },
      { path: "src/db/schema.ts", hunks: [1, 3], note: "Imports and the new order columns" },
    ],
  },
  {
    id: "validation",
    title: "Validating a code",
    refs: (f) => [
      // Everything up to discountFor; section 3 covers the rest of the file.
      { path: "src/lib/promo.ts", lines: { start: 1, end: f.line("src/lib/promo.ts", "/** A discount never exceeds") - 1 } },
      "tests/promo.test.ts",
    ],
  },
  {
    id: "totals",
    title: "Discounts in cart totals",
    refs: (f) => [
      "src/lib/cart.ts",
      "src/lib/money.ts",
      {
        path: "src/lib/promo.ts",
        lines: { start: f.line("src/lib/promo.ts", "/** A discount never exceeds"), end: f.lineCount("src/lib/promo.ts") },
        note: "discountFor",
      },
    ],
  },
  {
    id: "checkout",
    title: "Checkout endpoint",
    refs: () => [
      { path: "src/app/api/checkout/route.ts", hunks: [1], note: "Request body" },
      { path: "src/app/api/checkout/route.ts", hunks: [2], note: "Validate, then claim the redemption and insert the order", expand: "function" },
      "src/app/api/promo/preview/route.ts",
    ],
  },
  {
    id: "ui",
    title: "Promo code field",
    refs: () => ["src/components/checkout/PromoCodeField.tsx", "src/components/checkout/OrderSummary.tsx", "src/app/(shop)/cart/page.tsx"],
  },
];

const pr128Anchors: Anchors = {
  migrationTable: (f) => diffLink("db/migrations/0018_promo_codes.sql", f.range("db/migrations/0018_promo_codes.sql", 'CREATE TABLE "promo_codes"', "^);")),
  migrationIndex: (f) => diffLink("db/migrations/0018_promo_codes.sql", f.range("db/migrations/0018_promo_codes.sql", "CREATE UNIQUE INDEX")),
  schemaIndex: (f) => diffLink("src/db/schema.ts", f.range("src/db/schema.ts", "uniqueIndex(\"promo_codes_code_unique\")")),
  orderColumns: (f) => diffLink("src/db/schema.ts", f.range("src/db/schema.ts", "discountCents: integer", "promoCodeId:")),
  promoMessages: (f) => diffLink("src/lib/promo.ts", f.range("src/lib/promo.ts", "export const PROMO_MESSAGES", "^};")),
  findPromo: (f) => diffLink("src/lib/promo.ts", f.range("src/lib/promo.ts", "export async function findPromo", "^}")),
  checkPromo: (f) => diffLink("src/lib/promo.ts", f.range("src/lib/promo.ts", "export function checkPromo", "^}")),
  limitCheck: (f) => diffLink("src/lib/promo.ts", f.range("src/lib/promo.ts", "promo.maxRedemptions !== null")),
  discountFor: (f) => diffLink("src/lib/promo.ts", f.range("src/lib/promo.ts", "export function discountFor", "^}")),
  totals: (f) => diffLink("src/lib/cart.ts", f.range("src/lib/cart.ts", "export function totals", "^}")),
  movedHelpers: (f) => diffLink(
    "src/lib/cart.ts",
    {
      start: f.line("src/lib/cart.ts", "export function formatMoney", 1, "old"),
      end: f.line("src/lib/cart.ts", "^}", f.line("src/lib/cart.ts", "export function roundCents", 1, "old"), "old"),
    },
    "old",
  ),
  percentOf: (f) => diffLink("src/lib/money.ts", f.range("src/lib/money.ts", "export function percentOf", "^}")),
  checkoutBody: (f) => diffLink("src/app/api/checkout/route.ts", f.range("src/app/api/checkout/route.ts", "const body = z.object", "^});")),
  claim: (f) => diffLink("src/app/api/checkout/route.ts", f.range("src/app/api/checkout/route.ts", "const claimed = await tx", ".returning({ id: promoCodes.id })")),
  claimFailed: (f) => diffLink("src/app/api/checkout/route.ts", f.range("src/app/api/checkout/route.ts", "if (claimed.length === 0)")),
  usedUpResponse: (f) => diffLink("src/app/api/checkout/route.ts", f.range("src/app/api/checkout/route.ts", 'if (order === "used_up")', "^  }")),
  promoField: (f) => diffLink("src/components/checkout/PromoCodeField.tsx", f.range("src/components/checkout/PromoCodeField.tsx", "async function apply", "^  }")),
  discountRow: (f) => diffLink("src/components/checkout/OrderSummary.tsx", f.range("src/components/checkout/OrderSummary.tsx", "{totals.discountCents > 0", ") : null}")),
};

export const DEMO_GUIDES: GuideDef[] = [
  {
    pr: 128,
    version: 1,
    head: "pr128-v1",
    title: "Apply promo codes at checkout",
    markdown: "pr128-v1.md",
    author: "Claude Code",
    createdBy: "admin",
    createdHoursAgo: 52,
    sections: pr128Sections,
    anchors: pr128Anchors,
  },
  {
    pr: 128,
    version: 2,
    head: "pr128-v2",
    title: "Apply promo codes at checkout",
    markdown: "pr128-v2.md",
    markdownFallback: "pr128-v1.md",
    author: "Claude Code",
    createdBy: "admin",
    createdHoursAgo: 3.5,
    sections: pr128Sections,
    anchors: pr128Anchors,
  },
  {
    pr: 129,
    version: 1,
    head: "pr129-v1",
    title: "Round sales tax per line item",
    markdown: "pr129-v1.md",
    author: "Codex",
    createdBy: "member",
    createdHoursAgo: 47,
    sections: [
      { id: "rounding", title: "Per-line rounding", refs: () => ["src/lib/cart.ts"] },
      { id: "tests", title: "Tests", refs: () => ["tests/cart.test.ts"] },
    ],
    anchors: {
      lineTax: (f) => diffLink("src/lib/cart.ts", f.range("src/lib/cart.ts", "export function lineTax", "^}")),
      totalsSum: (f) => diffLink("src/lib/cart.ts", f.range("src/lib/cart.ts", "const taxCents = lines.reduce")),
    },
  },
  {
    pr: 127,
    version: 1,
    head: "pr127",
    title: "Send order confirmation emails",
    markdown: "pr127-v1.md",
    author: "Claude Code",
    createdBy: "admin",
    createdHoursAgo: 118,
    sections: [
      { id: "template", title: "Email template", refs: () => ["src/lib/email/order-confirmation.ts"] },
      { id: "job", title: "Background job", refs: () => ["src/lib/jobs.ts"] },
    ],
    anchors: {
      confirmationText: (f) => diffLink("src/lib/email/order-confirmation.ts", f.range("src/lib/email/order-confirmation.ts", "export function confirmationText", "^}")),
      jobCase: (f) => diffLink("src/lib/jobs.ts", f.range("src/lib/jobs.ts", 'case "send_order_confirmation"', "^    }")),
    },
  },
];

/** Sections each member marked as reviewed, by guide (`pr:version`). Only older versions have marks. */
export const DEMO_REVIEW_MARKS: Record<string, Partial<Record<DemoUserKey, string[]>>> = {
  "128:1": { admin: ["table", "validation", "totals"], member: ["table", "checkout"] },
  "129:1": { admin: ["rounding", "tests"] },
};

/* ------------------------------------------------------------------ */
/* Review comments (served by the mock GitHub API)                     */
/* ------------------------------------------------------------------ */

export type CommentDef = {
  id: number;
  pr: number;
  author: string;
  path: string;
  /** Snapshot the comment was written on. */
  head: string;
  /** Text of the commented line (the last line of a multi-line comment) in that snapshot. */
  lineText: string;
  /** Text of the first line of a multi-line comment. */
  startLineText?: string;
  /** The line changed later, so GitHub reports the comment as outdated (line: null). */
  outdated?: boolean;
  inReplyTo?: number;
  body: string;
  hoursAgo: number;
  /** Posted from Omakaze by this member (a `comments` row is seeded). */
  viaOmakaze?: DemoUserKey;
};

export const DEMO_COMMENTS: CommentDef[] = [
  {
    id: 2_001_001,
    pr: 128,
    author: "samokafor",
    path: "src/lib/promo.ts",
    head: "pr128-v1",
    lineText: "promo.redemptions > promo.maxRedemptions",
    outdated: true,
    body: "Off by one: with `max_redemptions = 100` and 100 redemptions this still accepts the code. Should this be `>=`?",
    hoursAgo: 30,
    viaOmakaze: "member",
  },
  {
    id: 2_001_002,
    pr: 128,
    author: "mayachen",
    path: "src/lib/promo.ts",
    head: "pr128-v1",
    lineText: "promo.redemptions > promo.maxRedemptions",
    outdated: true,
    inReplyTo: 2_001_001,
    body: "Yes. Fixed in the latest push, with a test for the limit.",
    hoursAgo: 5,
  },
  {
    id: 2_001_003,
    pr: 128,
    author: "alexmorgan",
    path: "src/app/api/checkout/route.ts",
    head: "pr128-v1",
    lineText: "if (claimed.length === 0) return null;",
    outdated: true,
    body: 'A used-up code ends up as 409 "already checked out" here. Can we return the promo error instead?',
    hoursAgo: 28,
    viaOmakaze: "owner",
  },
  {
    id: 2_001_004,
    pr: 128,
    author: "mayachen",
    path: "src/app/api/checkout/route.ts",
    head: "pr128-v1",
    lineText: "if (claimed.length === 0) return null;",
    outdated: true,
    inReplyTo: 2_001_003,
    body: "Done: the transaction returns `used_up` and the handler answers 422.",
    hoursAgo: 4.5,
  },
  {
    id: 2_001_005,
    pr: 128,
    author: "samokafor",
    path: "src/lib/cart.ts",
    head: "pr128-v2",
    lineText: "const taxable = Math.max(0, subtotalCents - discountCents);",
    body: "Nit: `discountFor` already caps the discount at the subtotal, so this `Math.max` only matters for other callers. Worth a comment?",
    hoursAgo: 2.5,
    viaOmakaze: "member",
  },
  {
    id: 2_001_006,
    pr: 128,
    author: "mayachen",
    path: "src/lib/cart.ts",
    head: "pr128-v2",
    lineText: "const taxable = Math.max(0, subtotalCents - discountCents);",
    inReplyTo: 2_001_005,
    body: "I'd keep it: `totals` is exported and the guard is cheap.",
    hoursAgo: 2,
  },
  {
    id: 2_001_007,
    pr: 128,
    author: "alexmorgan",
    path: "src/components/checkout/PromoCodeField.tsx",
    head: "pr128-v2",
    startLineText: "document.cookie = \"promo=\" + encodeURIComponent",
    lineText: "router.refresh();",
    body: "Could the preview route set this cookie instead? Then it can be `httpOnly` and the client never writes it.",
    hoursAgo: 1.5,
    viaOmakaze: "owner",
  },
  ...THREAD_DEMO_COMMENTS,
];

export type ReviewDef = {
  id: number;
  pr: number;
  author: string;
  head: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED";
  body: string;
  hoursAgo: number;
  viaOmakaze: DemoUserKey;
};

/** Submitted reviews (served by the mock; also seeded as `comments` rows of kind review_submit). */
export const DEMO_REVIEWS: ReviewDef[] = [
  {
    id: 3_001_001,
    pr: 128,
    author: "alexmorgan",
    head: "pr128-v1",
    state: "CHANGES_REQUESTED",
    body: "The redemption claim needs its own error; see the comment on the checkout route.",
    hoursAgo: 28,
    viaOmakaze: "owner",
  },
];

/* ------------------------------------------------------------------ */
/* Building snapshots and guides                                       */
/* ------------------------------------------------------------------ */

export type DemoSnapshot = {
  label: string;
  headSha: string;
  baseSha: string;
  mergeBaseSha: string;
  pushedAt: Date;
  files: DiffFile[];
  layers: string[];
  changes: FileChange[];
};

export type DemoPull = PullDef & {
  headSha: string;
  baseSha: string;
  snapshots: DemoSnapshot[];
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  mergedAt: Date | null;
  htmlUrl: string;
};

export type DemoSection = { key: string; title: string; body: string; refs: RefInput[] };

export type DemoGuide = GuideDef & { headSha: string; summary: string; createdAt: Date; builtSections: DemoSection[] };

export type DemoComment = CommentDef & {
  /** The commit the comment was written on (GitHub's commit_id and original_commit_id). */
  commitSha: string;
  line: number | null;
  originalLine: number;
  startLine: number | null;
  originalStartLine: number | null;
  createdAt: Date;
  htmlUrl: string;
};

export type Demo = {
  now: Date;
  ago: (hours: number) => Date;
  pulls: DemoPull[];
  guides: DemoGuide[];
  comments: DemoComment[];
  /** File contents at a commit (head or base) of a demo pull request, or null. */
  contentAt(sha: string, filePath: string): string | null;
};

function layerFile(layer: string, filePath: string): string | null {
  const p = path.join(REPO_DIR, layer, filePath);
  return existsSync(p) ? p : null;
}

function headFile(layers: string[], filePath: string): string | null {
  for (const l of layers) {
    const p = layerFile(l, filePath);
    if (p) return p;
  }
  return null;
}

function blobSha(content: string): string {
  return createHash("sha1").update(`blob ${Buffer.byteLength(content)}\0${content}`).digest("hex");
}

function buildSnapshot(head: HeadDef, pushedAt: Date): DemoSnapshot {
  const files: DiffFile[] = [];
  for (const change of head.files) {
    const oldPath = change.status === "added" ? null : layerFile("base", change.previousPath ?? change.path);
    const newPath = change.status === "removed" ? null : headFile(head.layers, change.path);
    if (change.status !== "added" && !oldPath) throw new Error(`demo data: base file missing for ${change.path}`);
    if (change.status !== "removed" && !newPath) throw new Error(`demo data: head file missing for ${change.path} in ${head.label}`);
    const patch = unifiedPatch(oldPath, newPath);
    let additions = 0;
    let deletions = 0;
    for (const h of parsePatch(patch)) {
      for (const l of h.lines) {
        if (l.type === "add") additions++;
        else if (l.type === "del") deletions++;
      }
    }
    files.push({
      path: change.path,
      previousPath: change.previousPath ?? null,
      status: change.status,
      additions,
      deletions,
      patch,
      sha: newPath ? blobSha(readFileSync(newPath, "utf8")) : null,
    });
  }
  return {
    label: head.label,
    headSha: demoSha(head.label),
    baseSha: DEMO_SHAS.base,
    mergeBaseSha: DEMO_SHAS.base,
    pushedAt,
    files,
    layers: head.layers,
    changes: head.files,
  };
}

function lines(file: string | null): string[] {
  if (!file) return [];
  const text = readFileSync(file, "utf8");
  const out = text.split("\n");
  if (out[out.length - 1] === "") out.pop();
  return out;
}

function headFilesFor(snapshot: DemoSnapshot): HeadFiles {
  const read = (filePath: string, side: "new" | "old" = "new") => {
    const change = snapshot.changes.find((c) => c.path === filePath);
    const file =
      side === "old"
        ? layerFile("base", change?.previousPath ?? filePath)
        : headFile(snapshot.layers, filePath) ?? layerFile("base", filePath);
    const content = lines(file);
    if (content.length === 0) throw new Error(`demo data: ${filePath} not found in ${snapshot.label} (${side})`);
    return content;
  };
  const matches = (lineText: string, text: string) => (text.startsWith("^") ? lineText.startsWith(text.slice(1)) : lineText.includes(text));
  const api: HeadFiles = {
    line(filePath, text, after = 1, side = "new") {
      const content = read(filePath, side);
      for (let i = after - 1; i < content.length; i++) if (matches(content[i], text)) return i + 1;
      throw new Error(`demo data: "${text}" not found in ${filePath} (${snapshot.label}, ${side})`);
    },
    range(filePath, from, to, side = "new") {
      const start = api.line(filePath, from, 1, side);
      return { start, end: to ? api.line(filePath, to, start, side) : start };
    },
    lineCount(filePath, side = "new") {
      return read(filePath, side).length;
    },
  };
  return api;
}

/** Split a guide markdown file into its summary and section blocks. */
function readGuideMarkdown(file: string): Map<string, string> {
  const text = readFileSync(path.join(GUIDES_DIR, file), "utf8");
  const blocks = new Map<string, string>();
  const re = /^<!-- (summary|section: ([\w-]+)) -->$/gm;
  const marks = [...text.matchAll(re)];
  marks.forEach((m, i) => {
    const key = m[2] ?? "summary";
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    blocks.set(key, text.slice(m.index + m[0].length, end).trim());
  });
  return blocks;
}

function fillAnchors(markdown: string, anchors: Anchors, files: HeadFiles, where: string): string {
  return markdown.replace(/\{\{diff:(\w+)\}\}/g, (_, name: string) => {
    const target = anchors[name];
    if (!target) throw new Error(`demo data: unknown anchor {{diff:${name}}} in ${where}`);
    return target(files);
  });
}

/**
 * Build the demo: snapshots with real patches, guide texts with resolved links, review comments
 * with line numbers. `now` anchors every relative timestamp (default: DEMO_NOW or the current time).
 */
export function buildDemo(opts: { now?: Date | number } = {}): Demo {
  const now = new Date(opts.now ?? (Number(process.env.DEMO_NOW) || Date.now()));
  const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000);

  const pulls: DemoPull[] = DEMO_PULLS.map((def) => {
    const snapshots = def.heads.map((h) => buildSnapshot(h, ago(h.pushedHoursAgo)));
    const current = snapshots.at(-1);
    const additions = current ? current.files.reduce((n, f) => n + f.additions, 0) : (def.stats?.additions ?? 0);
    const deletions = current ? current.files.reduce((n, f) => n + f.deletions, 0) : (def.stats?.deletions ?? 0);
    return {
      ...def,
      headSha: current?.headSha ?? demoSha(`pr${def.number}`),
      baseSha: DEMO_SHAS.base,
      snapshots,
      additions,
      deletions,
      changedFiles: current ? current.files.length : (def.stats?.changedFiles ?? 0),
      createdAt: ago(def.createdHoursAgo),
      updatedAt: ago(def.updatedHoursAgo),
      closedAt: def.closedHoursAgo !== undefined ? ago(def.closedHoursAgo) : null,
      mergedAt: def.merged && def.closedHoursAgo !== undefined ? ago(def.closedHoursAgo) : null,
      htmlUrl: `${DEMO_REPO.htmlUrl}/pull/${def.number}`,
    };
  });
  const snapshotByLabel = new Map(pulls.flatMap((p) => p.snapshots.map((s) => [s.label, s] as const)));

  const guides: DemoGuide[] = DEMO_GUIDES.map((g) => {
    const snapshot = snapshotByLabel.get(g.head);
    if (!snapshot) throw new Error(`demo data: no snapshot ${g.head}`);
    const files = headFilesFor(snapshot);
    const blocks = readGuideMarkdown(g.markdown);
    const fallback = g.markdownFallback ? readGuideMarkdown(g.markdownFallback) : new Map<string, string>();
    const block = (key: string) => {
      const md = blocks.get(key) ?? fallback.get(key);
      if (md === undefined) throw new Error(`demo data: no "${key}" block in ${g.markdown}`);
      return fillAnchors(md, g.anchors, files, `${g.markdown}#${key}`);
    };
    return {
      ...g,
      headSha: snapshot.headSha,
      summary: block("summary"),
      createdAt: ago(g.createdHoursAgo),
      builtSections: g.sections.map((s) => ({ key: s.id, title: s.title, body: block(s.id), refs: s.refs(files) })),
    };
  });

  const comments: DemoComment[] = DEMO_COMMENTS.map((c) => {
    const snapshot = snapshotByLabel.get(c.head);
    if (!snapshot) throw new Error(`demo data: no snapshot ${c.head}`);
    const files = headFilesFor(snapshot);
    const originalLine = files.line(c.path, c.lineText);
    const originalStartLine = c.startLineText ? files.line(c.path, c.startLineText) : null;
    const pull = pulls.find((p) => p.number === c.pr)!;
    return {
      ...c,
      commitSha: snapshot.headSha,
      line: c.outdated ? null : originalLine,
      originalLine,
      startLine: c.outdated ? null : originalStartLine,
      originalStartLine,
      createdAt: ago(c.hoursAgo),
      htmlUrl: `${pull.htmlUrl}#discussion_r${c.id}`,
    };
  });

  const shaLayers = new Map<string, { layers: string[]; changes: FileChange[] }>();
  shaLayers.set(DEMO_SHAS.base, { layers: [], changes: [] });
  for (const p of pulls) for (const s of p.snapshots) shaLayers.set(s.headSha, { layers: s.layers, changes: s.changes });

  return {
    now,
    ago,
    pulls,
    guides,
    comments,
    contentAt(sha, filePath) {
      const entry = shaLayers.get(sha);
      if (!entry) return null;
      const change = entry.changes.find((c) => c.path === filePath);
      if (change?.status === "removed") return null;
      if (entry.changes.some((c) => c.previousPath === filePath)) return null;
      const file = headFile(entry.layers, filePath) ?? layerFile("base", filePath);
      return file ? readFileSync(file, "utf8") : null;
    },
  };
}
