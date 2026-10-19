/**
 * Eight weeks of history for the insights page (/w/demo/insights): three more members and 32
 * merged or closed pull requests of acme/storefront, each with a guide (eight with a second
 * version), review marks, comments and reviews posted through Omakaze, resolved conversations and
 * the activity they leave. The workspace's start moves back to 12 weeks ago to make room.
 *
 * None of these pull requests is open, so "Needs my review", the open counts and the demo pull
 * requests of index.ts stay as they were. Their diffs are generated here (the mock GitHub API does
 * not know them), so their guides show the stored patches without expandable context.
 *
 * Runs after the seed's transaction. Random choices come from a fixed seed and times are relative
 * to DEMO_NOW, so every run produces the same data.
 */
import type { DiffFile } from "../../src/lib/diff/types";
import type { RefInput } from "../../src/lib/guides/refs";
import { DEMO_PASSWORD, DEMO_REPO, DEMO_SHAS, DEMO_USERS, demoAvatar, demoSha, githubAvatar, type DemoUserKey } from "./index";

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

type HistoryUserKey = "devon" | "priya" | "lena";
type PersonKey = DemoUserKey | HistoryUserKey;

/** Members added for the history. They have no linked GitHub account. */
export const HISTORY_USERS: Record<HistoryUserKey, { name: string; email: string; login: string; color: string; joinedDaysAgo: number }> = {
  devon: { name: "Devon Ko", email: "devon@omakaze.dev", login: "devon-ko", color: "#7c3aed", joinedDaysAgo: 70 },
  priya: { name: "Priya Shah", email: "priya@omakaze.dev", login: "priya-s", color: "#be185d", joinedDaysAgo: 66 },
  lena: { name: "Lena Fischer", email: "lena@omakaze.dev", login: "lena-f", color: "#0f766e", joinedDaysAgo: 52 },
};

const LOGINS: Record<PersonKey, string> = {
  owner: DEMO_USERS.owner.github.login,
  admin: DEMO_USERS.admin.github.login,
  member: DEMO_USERS.member.github.login,
  devon: HISTORY_USERS.devon.login,
  priya: HISTORY_USERS.priya.login,
  lena: HISTORY_USERS.lena.login,
};

function nameOf(key: PersonKey): string {
  return key in HISTORY_USERS ? HISTORY_USERS[key as HistoryUserKey].name : DEMO_USERS[key as DemoUserKey].name;
}

/** When the demo workspace and its first members start, in days ago (the main seed uses 30). */
const WORKSPACE_DAYS_AGO = 84;
const JOINED_DAYS_AGO: Record<DemoUserKey, number> = { owner: 84, admin: 83, member: 77 };

/* ------------------------------------------------------------------ */
/* Pull requests                                                       */
/* ------------------------------------------------------------------ */

type Origin = "mcp" | "api" | "ai" | "chatgpt" | "manual";
type Kind = "feature" | "fix" | "migration" | "chore";

/** Words the generated code and texts are made of. `id` is camelCase, `Type` PascalCase, `table` snake_case. */
type Vocab = { id: string; Type: string; table: string; noun: string };

type HistoryPull = {
  title: string;
  kind: Kind;
  author: PersonKey;
  origin: Origin;
  v: Vocab;
  /** Files besides the ones the kind brings: shared files make the "most discussed files" panel. */
  touches?: string[];
  /** A second guide version after new commits. */
  v2?: boolean;
  /** More review comments than usual. */
  hot?: boolean;
  closed?: boolean;
};

/** Oldest first; numbers are assigned in this order from FIRST_NUMBER. */
const PULLS: HistoryPull[] = [
  { title: "Add product search", kind: "feature", author: "admin", origin: "manual", v: { id: "search", Type: "SearchResult", table: "search_documents", noun: "search result" } },
  { title: "Fix cart total when a variant is removed", kind: "fix", author: "member", origin: "api", v: { id: "cartLine", Type: "CartLine", table: "cart_lines", noun: "cart line" }, touches: ["src/lib/cart.ts"], hot: true },
  { title: "Store product images in object storage", kind: "feature", author: "devon", origin: "mcp", v: { id: "productImage", Type: "ProductImage", table: "product_images", noun: "product image" }, v2: true },
  { title: "Migrate prices to integer cents", kind: "migration", author: "owner", origin: "manual", v: { id: "priceCents", Type: "Price", table: "prices", noun: "price" }, touches: ["src/lib/money.ts", "src/lib/cart.ts"], hot: true },
  { title: "Add the wishlist API", kind: "feature", author: "priya", origin: "ai", v: { id: "wishlist", Type: "Wishlist", table: "wishlists", noun: "wishlist" } },
  { title: "Fix double charge when checkout is retried", kind: "fix", author: "admin", origin: "mcp", v: { id: "paymentAttempt", Type: "PaymentAttempt", table: "payment_attempts", noun: "payment attempt" }, touches: ["src/app/api/checkout/route.ts"], hot: true, v2: true },
  { title: "Paginate the order history page", kind: "feature", author: "member", origin: "manual", v: { id: "orderPage", Type: "OrderPage", table: "orders", noun: "order" } },
  { title: "Rate limit the promo preview endpoint", kind: "chore", author: "devon", origin: "api", v: { id: "rateLimit", Type: "RateLimit", table: "rate_limits", noun: "rate limit" }, touches: ["src/app/api/promo/preview/route.ts"] },
  { title: "Fix time zones in order confirmation emails", kind: "fix", author: "lena", origin: "mcp", v: { id: "orderDate", Type: "OrderDate", table: "orders", noun: "order date" }, touches: ["src/lib/email/order-confirmation.ts"] },
  { title: "Reserve stock at checkout", kind: "feature", author: "admin", origin: "ai", v: { id: "reservation", Type: "StockReservation", table: "stock_reservations", noun: "reservation" }, touches: ["src/app/api/checkout/route.ts", "src/lib/cart.ts"], hot: true, v2: true },
  { title: "Move shipping rates to a table", kind: "migration", author: "devon", origin: "mcp", v: { id: "shippingRate", Type: "ShippingRate", table: "shipping_rates", noun: "shipping rate" }, touches: ["src/lib/cart.ts"] },
  { title: "Add address autocomplete to checkout", kind: "feature", author: "priya", origin: "manual", v: { id: "addressLookup", Type: "AddressSuggestion", table: "address_lookups", noun: "address suggestion" } },
  { title: "Fix stale stock counts on product pages", kind: "fix", author: "member", origin: "mcp", v: { id: "stockCount", Type: "StockCount", table: "stock_levels", noun: "stock count" }, v2: true },
  { title: "Add gift cards", kind: "feature", author: "admin", origin: "mcp", v: { id: "giftCard", Type: "GiftCard", table: "gift_cards", noun: "gift card" }, touches: ["src/app/api/checkout/route.ts", "src/lib/money.ts"], hot: true },
  { title: "Split the cart reducer into hooks", kind: "chore", author: "lena", origin: "chatgpt", v: { id: "cartState", Type: "CartState", table: "carts", noun: "cart" }, touches: ["src/lib/cart.ts"] },
  { title: "Fix discount rounding on bundles", kind: "fix", author: "owner", origin: "ai", v: { id: "bundleDiscount", Type: "BundleDiscount", table: "bundles", noun: "bundle discount" }, touches: ["src/lib/promo.ts", "src/lib/money.ts"] },
  { title: "Accept VAT numbers for business customers", kind: "feature", author: "priya", origin: "mcp", v: { id: "vatNumber", Type: "VatNumber", table: "tax_ids", noun: "VAT number" }, v2: true },
  { title: "Index orders by customer and date", kind: "migration", author: "devon", origin: "chatgpt", v: { id: "orderIndex", Type: "OrderLookup", table: "orders", noun: "order" } },
  { title: "Keep a guest's cart after sign-in", kind: "fix", author: "member", origin: "mcp", v: { id: "guestCart", Type: "GuestCart", table: "carts", noun: "guest cart" }, touches: ["src/lib/cart.ts"], hot: true },
  { title: "Add returns and refunds", kind: "feature", author: "admin", origin: "api", v: { id: "refund", Type: "Refund", table: "refunds", noun: "refund" }, touches: ["src/app/api/checkout/route.ts"], hot: true, v2: true },
  { title: "Upgrade the payment SDK to v5", kind: "chore", author: "owner", origin: "mcp", v: { id: "paymentClient", Type: "PaymentClient", table: "payments", noun: "payment" }, touches: ["src/app/api/checkout/route.ts"] },
  { title: "Fix the flaky checkout end-to-end test", kind: "fix", author: "lena", origin: "chatgpt", v: { id: "checkoutFixture", Type: "CheckoutFixture", table: "orders", noun: "checkout fixture" } },
  { title: "Email admins when stock runs low", kind: "feature", author: "devon", origin: "mcp", v: { id: "lowStock", Type: "LowStockAlert", table: "low_stock_alerts", noun: "low-stock alert" } },
  { title: "Experiment: recommendations on the cart page", kind: "feature", author: "priya", origin: "ai", v: { id: "recommendation", Type: "Recommendation", table: "recommendations", noun: "recommendation" }, closed: true },
  { title: "Cache category pages at the edge", kind: "feature", author: "member", origin: "mcp", v: { id: "categoryCache", Type: "CategoryCache", table: "categories", noun: "category page" }, v2: true },
  { title: "Fix the currency of refunds in the admin", kind: "fix", author: "admin", origin: "manual", v: { id: "refundCurrency", Type: "RefundAmount", table: "refunds", noun: "refund amount" }, touches: ["src/lib/money.ts"] },
  { title: "Add saved payment methods", kind: "feature", author: "lena", origin: "chatgpt", v: { id: "savedCard", Type: "SavedCard", table: "saved_cards", noun: "saved card" }, touches: ["src/app/api/checkout/route.ts"], hot: true },
  { title: "Backfill order totals for old orders", kind: "migration", author: "owner", origin: "mcp", v: { id: "orderTotal", Type: "OrderTotal", table: "orders", noun: "order total" }, touches: ["src/lib/cart.ts"] },
  { title: "Fix the promo field losing focus on mobile", kind: "fix", author: "priya", origin: "mcp", v: { id: "promoInput", Type: "PromoInput", table: "promo_codes", noun: "promo input" }, touches: ["src/components/checkout/PromoCodeField.tsx"], v2: true },
  { title: "Add store pickup as a shipping option", kind: "feature", author: "devon", origin: "ai", v: { id: "pickup", Type: "PickupSlot", table: "pickup_slots", noun: "pickup slot" }, touches: ["src/lib/cart.ts"] },
  { title: "Show delivery estimates in the cart", kind: "feature", author: "admin", origin: "mcp", v: { id: "deliveryEstimate", Type: "DeliveryEstimate", table: "delivery_estimates", noun: "delivery estimate" } },
  { title: "Log slow checkout queries", kind: "chore", author: "member", origin: "api", v: { id: "queryLog", Type: "SlowQuery", table: "query_logs", noun: "slow query" }, touches: ["src/app/api/checkout/route.ts"] },
];

const FIRST_NUMBER = 92;
/** Days ago the oldest and the newest history guide were published. */
const OLDEST_DAYS = 57;
const NEWEST_DAYS = 2;
/** Guides published after this many days ago were started with the workspace's template, which the team used for a few weeks. */
const TEMPLATE_FROM_DAYS = 30;

const AGENTS = ["Claude Code", "Codex", "Cursor", "Claude Code", "Claude Code"];
const BRANCH_PREFIX: Record<PersonKey, string> = { owner: "alex", admin: "maya", member: "sam", devon: "devon", priya: "priya", lena: "lena" };
const WORKSPACE_MODEL = "claude-opus-5-5";
const PLAN_MODEL = "gpt-5.5";

/* ------------------------------------------------------------------ */
/* Randomness                                                          */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = ReturnType<typeof mulberry32>;
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
const between = (rng: Rng, min: number, max: number) => min + rng() * (max - min);
/** A positive factor around 1 with a long right tail, for waiting times. */
const spread = (rng: Rng) => Math.exp((rng() + rng() + rng() - 1.5) * 0.9);

/* ------------------------------------------------------------------ */
/* Generated diffs                                                     */
/* ------------------------------------------------------------------ */

type FileSpec = { path: string; status: "added" | "modified"; hunks: number };

/** The files a pull request of each kind changes. */
function filesFor(p: HistoryPull, n: number): FileSpec[] {
  const id = p.v.id;
  const kebab = id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const own: FileSpec[] = (() => {
    switch (p.kind) {
      case "feature":
        return [
          { path: `db/migrations/00${n - 80}_${p.v.table}.sql`, status: "added", hunks: 1 },
          { path: "src/db/schema.ts", status: "modified", hunks: 2 },
          { path: `src/lib/${kebab}.ts`, status: "added", hunks: 1 },
          { path: `src/app/api/${kebab}/route.ts`, status: "added", hunks: 1 },
          { path: `src/components/${p.v.Type}Panel.tsx`, status: "added", hunks: 1 },
          { path: `tests/${kebab}.test.ts`, status: "added", hunks: 1 },
          { path: "docs/checkout.md", status: "modified", hunks: 1 },
        ];
      case "fix":
        return [
          { path: `src/lib/${kebab}.ts`, status: "modified", hunks: 2 },
          { path: `tests/${kebab}.test.ts`, status: "modified", hunks: 1 },
        ];
      case "migration":
        return [
          { path: `db/migrations/00${n - 80}_${p.v.table}_${kebab}.sql`, status: "added", hunks: 1 },
          { path: "src/db/schema.ts", status: "modified", hunks: 1 },
          { path: `scripts/backfill-${kebab}.ts`, status: "added", hunks: 1 },
          { path: `src/lib/${kebab}.ts`, status: "modified", hunks: 2 },
          { path: `tests/${kebab}.test.ts`, status: "added", hunks: 1 },
        ];
      case "chore":
        return [
          { path: "package.json", status: "modified", hunks: 1 },
          { path: `src/lib/${kebab}.ts`, status: "modified", hunks: 2 },
          { path: `tests/${kebab}.test.ts`, status: "modified", hunks: 1 },
        ];
    }
  })();
  const extra = (p.touches ?? []).filter((t) => !own.some((f) => f.path === t)).map((path) => ({ path, status: "modified" as const, hunks: 1 }));
  // Shared files go before the tests and docs, where a reader expects them.
  const tail = own.filter((f) => f.path.startsWith("tests/") || f.path.startsWith("docs/") || f.path === "package.json");
  return [...own.filter((f) => !tail.includes(f)), ...extra, ...tail];
}

/** Lines of code for one hunk of a file, in the style of the file. `k` varies them. */
function codeLines(path: string, v: Vocab, k: number): { added: string[]; removed: string[]; context: string[] } {
  const T = v.Type;
  const ctx = (lines: string[]) => lines;
  if (path.endsWith(".sql")) {
    return {
      removed: [],
      context: [],
      added: [
        `CREATE TABLE IF NOT EXISTS "${v.table}" (`,
        `  "id" text PRIMARY KEY,`,
        `  "store_id" text NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,`,
        `  "${v.table.replace(/s$/, "")}_key" text NOT NULL,`,
        `  "amount_cents" integer,`,
        `  "created_at" timestamptz NOT NULL DEFAULT now()`,
        `);`,
        ``,
        `CREATE INDEX "${v.table}_store_created_idx" ON "${v.table}" ("store_id", "created_at");`,
      ],
    };
  }
  if (path === "src/db/schema.ts") {
    return k === 0
      ? { context: ctx(["import { index, integer, pgTable, text, timestamp } from \"drizzle-orm/pg-core\";", "", "/* Orders */"]), removed: [], added: [`export const ${v.id}s = pgTable(`, `  "${v.table}",`, `  {`, `    id: text("id").primaryKey(),`, `    storeId: text("store_id").notNull(),`, `    amountCents: integer("amount_cents"),`, `    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),`, `  },`, `  (t) => [index("${v.table}_store_created_idx").on(t.storeId, t.createdAt)],`, `);`, ``] }
      : { context: ctx(["  status: text(\"status\").notNull(),", "  totalCents: integer(\"total_cents\").notNull(),", "  createdAt: timestamp(\"created_at\", { withTimezone: true }).defaultNow().notNull(),"]), removed: [], added: [`  ${v.id}Id: text("${v.table.replace(/s$/, "")}_id"),`] };
  }
  if (path.startsWith("tests/")) {
    return {
      context: ctx(['import { describe, expect, it } from "vitest";', `import { build${T}, check${T} } from "@/lib/${v.id}";`, ""]),
      removed: k === 0 ? [] : [`  it("works", () => {`],
      added: [
        `describe("${v.noun}s", () => {`,
        `  it("rejects a ${v.noun} from another store", () => {`,
        `    expect(check${T}(build${T}({ storeId: "a" }), "b")).toBe("not_found");`,
        `  });`,
        ``,
        `  it("keeps amounts in cents", () => {`,
        `    expect(build${T}({ amountCents: 1999 }).amountCents).toBe(1999);`,
        `  });`,
        `});`,
      ],
    };
  }
  if (path.endsWith(".tsx")) {
    return {
      context: ctx(['"use client";', "", 'import { useState } from "react";']),
      removed: [],
      added: [
        `export function ${T}Panel({ items }: { items: ${T}[] }) {`,
        `  const [open, setOpen] = useState(false);`,
        `  if (items.length === 0) return <p className="text-muted">No ${v.noun}s yet.</p>;`,
        `  return (`,
        `    <section aria-label="${v.noun}s">`,
        `      <button type="button" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "Show"} ${v.noun}s</button>`,
        `      {open ? <ul>{items.map((i) => <li key={i.id}>{formatMoney(i.amountCents ?? 0)}</li>)}</ul> : null}`,
        `    </section>`,
        `  );`,
        `}`,
      ],
    };
  }
  if (path.includes("/api/")) {
    return k === 0 && path.endsWith(`${v.id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}/route.ts`)
      ? {
          context: [],
          removed: [],
          added: [
            'import { z } from "zod";',
            `import { create${T}, list${T}s } from "@/lib/${v.id}";`,
            'import { requireCustomer } from "@/lib/session";',
            "",
            `const body = z.object({ key: z.string().min(1), amountCents: z.number().int().nonnegative().optional() });`,
            "",
            "export async function GET() {",
            "  const customer = await requireCustomer();",
            `  return Response.json({ items: await list${T}s(customer.storeId) });`,
            "}",
            "",
            "export async function POST(req: Request) {",
            "  const customer = await requireCustomer();",
            "  const parsed = body.safeParse(await req.json());",
            '  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });',
            `  return Response.json(await create${T}(customer.storeId, parsed.data), { status: 201 });`,
            "}",
          ],
        }
      : {
          context: ctx(["  const order = await db.transaction(async (tx) => {", "    const cart = await loadCart(tx, customer.id);", "    if (cart.lines.length === 0) return \"empty\" as const;"]),
          removed: ["    const total = totals(cart).totalCents;"],
          added: [`    const ${v.id} = await prepare${T}(tx, cart);`, `    if (!${v.id}) return "${v.id.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}_failed" as const;`, `    const total = totals(cart, { ${v.id} }).totalCents;`],
        };
  }
  if (path.endsWith(".md")) {
    return { context: ["## Checkout", "", "The checkout endpoint validates the cart, then creates the order in one transaction."], removed: [], added: ["", `### ${v.noun[0].toUpperCase()}${v.noun.slice(1)}s`, "", `Each order can carry ${v.noun}s. They are stored in \`${v.table}\` and shown on the order page.`] };
  }
  if (path === "package.json") {
    return { context: ['  "dependencies": {', '    "drizzle-orm": "0.45.4",', '    "next": "16.4.2",'], removed: ['    "@acme/payments": "4.12.0",'], added: ['    "@acme/payments": "5.1.2",'] };
  }
  // src/lib and scripts: a function per hunk.
  const variants = [
    {
      context: ['import { and, desc, eq } from "drizzle-orm";', 'import { db } from "@/db";', ""],
      removed: [],
      added: [
        `export type ${T} = { id: string; storeId: string; amountCents: number | null; createdAt: Date };`,
        "",
        `/** The ${v.noun}s of a store, newest first. */`,
        `export async function list${T}s(storeId: string, limit = 50): Promise<${T}[]> {`,
        `  return db.select().from(${v.id}s).where(eq(${v.id}s.storeId, storeId)).orderBy(desc(${v.id}s.createdAt)).limit(limit);`,
        "}",
      ],
    },
    {
      context: ["  }", "  return result;", "}"],
      removed: [`  const amount = Math.round(input.amount * 100);`],
      added: [
        "",
        `export function check${T}(item: ${T} | null, storeId: string): "ok" | "not_found" | "expired" {`,
        `  if (!item || item.storeId !== storeId) return "not_found";`,
        `  if (Date.now() - item.createdAt.getTime() > 30 * 60_000) return "expired";`,
        `  return "ok";`,
        "}",
        `const amount = toCents(input.amount);`,
      ],
    },
    {
      context: ["export function totals(cart: Cart, opts: TotalsOptions = {}) {", "  const subtotal = cart.lines.reduce((n, l) => n + l.unitCents * l.quantity, 0);", "  const discount = opts.promo ? discountFor(opts.promo, subtotal) : 0;"],
      removed: ["  return { subtotalCents: subtotal, discountCents: discount, totalCents: subtotal - discount };"],
      added: [`  const ${v.id}Cents = opts.${v.id} ? Math.min(opts.${v.id}.amountCents ?? 0, subtotal - discount) : 0;`, `  return { subtotalCents: subtotal, discountCents: discount, ${v.id}Cents, totalCents: subtotal - discount - ${v.id}Cents };`],
    },
  ];
  return variants[k % variants.length];
}

/**
 * A file of the snapshot: hunks with three context lines before the change. `seed` shifts line
 * numbers and code; `revised` adds a change, for a second version.
 */
function buildFile(spec: FileSpec, v: Vocab, seed: number, revised = false): DiffFile {
  if (spec.status === "added") {
    const added = [...codeLines(spec.path, v, 0).added, ...(revised ? ["", `// Kept in sync with the ${v.noun} limits in the admin.`] : [])];
    return { path: spec.path, status: "added", additions: added.length, deletions: 0, patch: `@@ -0,0 +1,${added.length} @@\n${added.map((l) => `+${l}`).join("\n")}`, sha: demoSha(`${spec.path}:${seed}`) };
  }
  const hunks: string[] = [];
  let additions = 0;
  let deletions = 0;
  let offset = 0;
  for (let k = 0; k < spec.hunks; k++) {
    const lines = codeLines(spec.path, v, k + (seed % 2));
    const { context, removed } = lines;
    const added = revised && k === 0 ? [...lines.added, `  // Kept in sync with the ${v.noun} limits in the admin.`] : lines.added;
    // Imports sit at the top of the file.
    const oldStart = /^(import |"use client")/.test(context[0] ?? "") ? 1 : 12 + k * 60 + (seed % 7) * 3;
    const oldLines = context.length + removed.length;
    const newLines = context.length + added.length;
    hunks.push(
      [`@@ -${oldStart},${oldLines} +${oldStart + offset},${newLines} @@`, ...context.map((l) => ` ${l}`), ...removed.map((l) => `-${l}`), ...added.map((l) => `+${l}`)].join("\n"),
    );
    offset += added.length - removed.length;
    additions += added.length;
    deletions += removed.length;
  }
  return { path: spec.path, status: "modified", additions, deletions, patch: hunks.join("\n"), sha: demoSha(`${spec.path}:${seed}`) };
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

type SectionPlan = { title: string; body: string; files: number[]; /** Only hunk 1 of the files. */ firstHunk?: boolean };

const TEMPLATE_FOR: Record<Kind, "feature" | "bugfix" | "migration"> = { feature: "feature", fix: "bugfix", migration: "migration", chore: "feature" };

/** Section outline of a guide: template titles once the team used one, free titles before. */
function planSections(p: HistoryPull, files: FileSpec[], templated: boolean, rng: Rng): SectionPlan[] {
  const idx = (pred: (f: FileSpec) => boolean) => files.map((f, i) => (pred(f) ? i : -1)).filter((i) => i >= 0);
  const tests = idx((f) => f.path.startsWith("tests/"));
  const schema = idx((f) => f.path.endsWith(".sql") || f.path === "src/db/schema.ts");
  const ui = idx((f) => f.path.endsWith(".tsx") || f.path.includes("/api/"));
  const own = idx((f) => (f.path.startsWith("src/lib/") || f.path.startsWith("scripts/")) && !f.path.endsWith(".tsx"));
  const n = p.v.noun;
  const T = p.v.Type;
  switch (p.kind) {
    case "feature":
      return templated
        ? [
            { title: "Data model", body: `A \`${p.v.table}\` table with an index on store and creation time, and a reference from orders.`, files: schema },
            { title: "Core logic", body: `\`list${T}s\` and \`check${T}\` in one module. A ${n} from another store is treated as missing, not as forbidden, so nothing leaks between stores.`, files: own },
            { title: "API and UI", body: `\`GET\` and \`POST\` handlers for ${n}s, and a panel that lists them on the order page.`, files: ui },
            { title: "Tests", body: `Unit tests for \`check${T}\`: other stores, amounts in cents.`, files: tests },
            ...(rng() < 0.5 ? [{ title: "Rollout", body: `Behind the \`${p.v.id}\` flag until support has seen it. Turning the flag off hides the panel; stored ${n}s stay.`, files: [] }] : []),
          ]
        : [
            { title: "Schema", body: `New table \`${p.v.table}\`.`, files: schema },
            { title: `${n[0].toUpperCase()}${n.slice(1)}s on the server`, body: `Reading and checking ${n}s, and the endpoint the page calls.`, files: [...own, ...idx((f) => f.path.includes("/api/"))] },
            { title: "Interface", body: `The ${n} panel.`, files: idx((f) => f.path.endsWith(".tsx")) },
            { title: "Tests", body: "Unit tests.", files: tests },
          ];
    case "fix":
      return templated
        ? [
            { title: "The bug", body: `Customers saw a wrong ${n} after changing their cart. Support had four reports last week.`, files: [] },
            { title: "Root cause", body: `The ${n} was computed from the amount in euros and rounded twice.`, files: own, firstHunk: true },
            { title: "Fix", body: `\`check${T}\` now works in cents end to end, and the checkout uses it.`, files: [...own, ...idx((f) => f.path.includes("/api/") || f.path.endsWith(".tsx"))] },
            { title: "Regression test", body: "Fails on main, passes here.", files: tests },
          ]
        : [
            { title: "What was broken", body: `A wrong ${n} after changing the cart.`, files: own, firstHunk: true },
            { title: "The fix", body: "Amounts stay in cents until they are displayed.", files: [...own, ...idx((f) => f.path.includes("/api/") || f.path.endsWith(".tsx"))] },
            { title: "Test", body: "A test that fails without the fix.", files: tests },
          ];
    case "migration":
      return templated
        ? [
            { title: "Schema changes", body: `Adds \`${p.v.table}\` columns and an index. Both are created without locking writes.`, files: schema },
            { title: "Data backfill", body: "Runs in batches of 5,000 rows; about four minutes on a copy of production.", files: idx((f) => f.path.startsWith("scripts/")) },
            { title: "Code changes", body: "Reads use the new column when it is set and fall back to the old one.", files: idx((f) => f.path.startsWith("src/lib/")) },
            { title: "Deploy and rollback", body: "Deploy the migration, run the backfill, then deploy the code. Rolling back the code is safe; the column stays.", files: [] },
            { title: "Tests", body: "The backfill is tested against fixtures with old rows.", files: tests },
          ]
        : [
            { title: "Migration", body: `The new \`${p.v.table}\` columns.`, files: schema },
            { title: "Backfill", body: "A script that fills the column for existing rows.", files: idx((f) => f.path.startsWith("scripts/")) },
            { title: "Code using the new column", body: "Reads prefer the new column.", files: idx((f) => f.path.startsWith("src/lib/")) },
          ];
    case "chore":
      return templated
        ? [
            { title: "Core logic", body: `What changes for ${n}s, and why the behaviour stays the same.`, files: [...own, ...idx((f) => f.path === "package.json")] },
            { title: "API and UI", body: "The callers.", files: ui },
            { title: "Tests", body: "Existing tests, adjusted.", files: tests },
          ]
        : [
            { title: "The change", body: `What changes for ${n}s.`, files: [...own, ...idx((f) => f.path === "package.json")] },
            { title: "Callers", body: "Code that uses it.", files: ui },
            { title: "Tests", body: "Adjusted tests.", files: tests },
          ];
  }
}

/** How likely a writer leaves a file out of every section (it then lands in "Other changes"). */
const LEAVE_OUT: Record<Origin, number> = { mcp: 0.06, api: 0.3, ai: 0.3, chatgpt: 0.2, manual: 0.45 };
/** How likely a templated guide skips a required section. */
const SKIP_REQUIRED: Record<Origin, number> = { mcp: 0.2, api: 0.45, ai: 0.4, chatgpt: 0.35, manual: 0.6 };
const SKIPPABLE = new Set(["Tests", "Regression test", "Root cause", "Deploy and rollback"]);

/** How often nobody reviews a section with this title (others: 2%). */
const OFTEN_SKIPPED: Record<string, number> = {
  "Other changes": 0.25,
  Tests: 0.15,
  Test: 0.15,
  "Regression test": 0.12,
  Rollout: 0.25,
  "Deploy and rollback": 0.12,
  "Data backfill": 0.12,
  Interface: 0.06,
};

const COMMENTS = [
  "Could this run inside the same transaction as the insert?",
  "What happens when the list is empty? An early return would make that clearer.",
  "Should this be behind the feature flag until the rollout?",
  "Is the index on (store_id, created_at) enough for this query?",
  "This swallows the error. Can we at least log it?",
  "I think this needs a test for the boundary case.",
  "Can a guest reach this endpoint?",
  "Could we reuse `formatMoney` here instead of formatting again?",
  "Why not a unique index instead of checking first?",
  "Let's keep the old column until the backfill has finished.",
  "The error message shows up in the UI, so it should say what to do next.",
  "Should this respect the store's currency?",
  "Missing `await`?",
  "This locks the table while it runs; is that fine at this size?",
  "Can you add a comment on why the order matters here?",
  "Does this change the response for the mobile app?",
  "What about orders created before this change?",
  "Edge case: two tabs doing this at the same time.",
  "Nit: the name says list but it returns one page.",
  "This reads much better than before.",
  "Is 30 minutes the expiry we agreed on with support?",
  "Rounding here and again in `totals` gives us the off-by-one-cent again.",
];

const REPLIES = ["Good catch, fixed.", "Done.", "Added a test for it.", "Kept it on purpose: the page can be opened directly.", "Moved it into the transaction.", "Yes, it's behind the flag.", "Changed it to cents."];

/* ------------------------------------------------------------------ */
/* Seeding                                                             */
/* ------------------------------------------------------------------ */

export async function seedInsightsHistory(workspaceSlug: string): Promise<void> {
  const { and, eq, inArray, sql } = await import("drizzle-orm");
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const { hashPassword } = await import("@/lib/crypto");
  const { parseFiles } = await import("@/lib/diff/parse");
  const { computeCoverage, normalizeRef, refsForUncovered, validateRefs } = await import("@/lib/guides/refs");
  const { OTHER_CHANGES_TITLE } = await import("@/lib/guides/service");
  const { carryReviewMarks } = await import("@/lib/guides/progress");
  const { newId } = await import("@/lib/ids");
  const { STARTER_TEMPLATES } = await import("@/lib/guides/templates");

  const now = new Date(Number(process.env.DEMO_NOW) || Date.now());
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const rng = mulberry32(20261019);

  const [ws] = await db.select().from(s.workspaces).where(eq(s.workspaces.slug, workspaceSlug)).limit(1);
  if (!ws) throw new Error(`No workspace ${workspaceSlug}`);
  const [repo] = await db
    .select()
    .from(s.repositories)
    .where(and(eq(s.repositories.workspaceId, ws.id), eq(s.repositories.fullName, DEMO_REPO.fullName)))
    .limit(1);
  if (!repo) throw new Error(`No repository ${DEMO_REPO.fullName}`);

  /* Members ------------------------------------------------------------ */
  const userIds = {} as Record<PersonKey, string>;
  for (const key of Object.keys(DEMO_USERS) as DemoUserKey[]) {
    const [u] = await db.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.email}) = ${DEMO_USERS[key].email}`).limit(1);
    userIds[key] = u.id;
  }
  const historyKeys = Object.keys(HISTORY_USERS) as HistoryUserKey[];
  await db.delete(s.users).where(inArray(s.users.email, historyKeys.map((k) => HISTORY_USERS[k].email)));
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const activity: (typeof s.activity.$inferInsert)[] = [];
  for (const key of historyKeys) {
    const h = HISTORY_USERS[key];
    const joined = ago(h.joinedDaysAgo);
    const [u] = await db
      .insert(s.users)
      .values({ name: h.name, email: h.email, emailVerifiedAt: joined, avatarUrl: demoAvatar(h.name, h.color), passwordHash, lastWorkspaceId: ws.id, createdAt: joined })
      .returning({ id: s.users.id });
    userIds[key] = u.id;
    await db.insert(s.memberships).values({ workspaceId: ws.id, userId: u.id, role: "member", createdAt: joined });
    activity.push({ workspaceId: ws.id, actorUserId: u.id, type: "member.joined", data: { role: "member" }, createdAt: joined });
  }

  // The workspace now starts 12 weeks ago, before the history.
  await db.update(s.workspaces).set({ createdAt: ago(WORKSPACE_DAYS_AGO) }).where(eq(s.workspaces.id, ws.id));
  await db.update(s.repositories).set({ createdAt: ago(JOINED_DAYS_AGO.admin) }).where(eq(s.repositories.id, repo.id));
  for (const key of Object.keys(JOINED_DAYS_AGO) as DemoUserKey[]) {
    const joined = ago(JOINED_DAYS_AGO[key]);
    await db.update(s.memberships).set({ createdAt: joined }).where(and(eq(s.memberships.workspaceId, ws.id), eq(s.memberships.userId, userIds[key])));
    await db.update(s.users).set({ createdAt: joined, emailVerifiedAt: joined }).where(eq(s.users.id, userIds[key]));
    await db
      .update(s.activity)
      .set({ createdAt: joined })
      .where(and(eq(s.activity.workspaceId, ws.id), eq(s.activity.actorUserId, userIds[key]), inArray(s.activity.type, ["workspace.created", "member.joined"])));
  }
  await db.update(s.activity).set({ createdAt: ago(JOINED_DAYS_AGO.admin) }).where(and(eq(s.activity.workspaceId, ws.id), eq(s.activity.type, "repo.added")));

  /* Pull requests, guides, marks and comments ---------------------------- */
  const members = Object.keys(userIds) as PersonKey[];
  const pullRows: (typeof s.pullRequests.$inferInsert)[] = [];
  const marks: (typeof s.sectionReviews.$inferInsert)[] = [];
  const commentRows: (typeof s.comments.$inferInsert)[] = [];
  // Below the IDs the mock GitHub API gives new comments (5000001 and up), which specs delete after themselves.
  let githubId = 4_100_000;
  const counts = { guides: 0, marks: 0, comments: 0 };

  for (const [i, p] of PULLS.entries()) {
    const number = FIRST_NUMBER + i;
    const htmlUrl = `${DEMO_REPO.htmlUrl}/pull/${number}`;
    const age = OLDEST_DAYS - ((OLDEST_DAYS - NEWEST_DAYS) * i) / (PULLS.length - 1) + between(rng, -0.6, 0.6);
    const publishedV1 = ago(Math.max(NEWEST_DAYS, age));
    const templated = age < TEMPLATE_FROM_DAYS;
    const specs = filesFor(p, number);
    const writer = p.author;
    const versions = p.v2 ? 2 : 1;
    let lastActivity = publishedV1;
    let headSha = "";
    let changedFiles = 0;
    let additions = 0;
    let deletions = 0;
    // Which files the writer referenced, kept for the second version.
    const leftOut = new Set(specs.map((_, k) => k).filter((k) => k > 0 && rng() < LEAVE_OUT[p.origin]));
    let plan = planSections(p, specs, templated, rng);
    if (templated && rng() < SKIP_REQUIRED[p.origin]) {
      const skip = plan.find((x) => SKIPPABLE.has(x.title));
      if (skip) plan = plan.filter((x) => x !== skip);
    }
    const template = templated ? STARTER_TEMPLATES.find((t) => t.id === TEMPLATE_FOR[p.kind])! : null;

    for (let version = 1; version <= versions; version++) {
      const published = version === 1 ? publishedV1 : new Date(lastActivity.getTime() + between(rng, 3, 20) * 3_600_000);
      if (published > ago(NEWEST_DAYS - 1)) break;
      const createdAt = new Date(published.getTime() - between(rng, 2, 25) * 60_000);
      const label = `hist-pr${number}-v${version}`;
      headSha = demoSha(label);
      // New commits change one file of the main section; the code of the other sections stays the same.
      const main = plan.find((x) => x.files.length > 0 && !SKIPPABLE.has(x.title))?.files ?? [0];
      const changed = version === 2 ? (main.find((k) => specs[k].status === "modified") ?? main[0]) : -1;
      const files = specs.map((spec, k) => buildFile(spec, p.v, number, k === changed));
      changedFiles = files.length;
      additions = files.reduce((n, f) => n + f.additions, 0);
      deletions = files.reduce((n, f) => n + f.deletions, 0);
      const parsed = parseFiles(files);
      const known = new Set(files.map((f) => f.path));
      const sections = plan.map((x) => {
        const refs = x.files
          .filter((k) => !leftOut.has(k))
          .map((k) => normalizeRef((x.firstHunk && specs[k].hunks > 1 ? { path: specs[k].path, hunks: [1] } : specs[k].path) as RefInput, known));
        const errors = validateRefs(refs, parsed).filter((e) => e.level === "error");
        if (errors.length) throw new Error(`insights history #${number}: ${errors.map((e) => `${e.ref}: ${e.message}`).join("; ")}`);
        return { title: x.title, body: x.body, refs, generated: false };
      });
      const own = computeCoverage(parsed, sections);
      if (own.uncovered.length > 0) {
        sections.push({
          title: OTHER_CHANGES_TITLE,
          body: "Changes that are not part of the sections above. Most are small supporting edits; review them before approving.",
          refs: refsForUncovered(own.uncovered),
          generated: true,
        });
      }

      const [snapshot] = await db
        .insert(s.diffSnapshots)
        .values({ repositoryId: repo.id, prNumber: number, headSha, baseSha: DEMO_SHAS.base, mergeBaseSha: DEMO_SHAS.base, files, createdAt })
        .returning({ id: s.diffSnapshots.id });
      const who = {
        mcp: { source: "agent" as const, createdVia: "mcp", author: pick(rng, AGENTS), aiSource: null },
        api: { source: "agent" as const, createdVia: "api", author: "API", aiSource: null },
        ai: { source: "ai" as const, createdVia: rng() < 0.5 ? "webhook" : "ui", author: WORKSPACE_MODEL, aiSource: "workspace" as const },
        chatgpt: { source: "ai" as const, createdVia: "ui", author: PLAN_MODEL, aiSource: "chatgpt" as const },
        manual: { source: "manual" as const, createdVia: "ui", author: nameOf(writer), aiSource: null },
      }[p.origin];
      // Automation starts guides without a user.
      const createdBy = who.createdVia === "webhook" ? null : userIds[writer];
      const author = who.author;
      const guideId = newId();
      await db.insert(s.guides).values({
        id: guideId,
        workspaceId: ws.id,
        repositoryId: repo.id,
        prNumber: number,
        version,
        snapshotId: snapshot.id,
        status: "ready",
        source: who.source,
        title: p.title,
        summary: `${p.title}. ${p.kind === "fix" ? "A fix with a regression test." : `Adds ${p.v.noun}s end to end.`}`,
        headSha,
        createdByUserId: createdBy,
        createdVia: who.createdVia,
        author,
        aiSource: who.aiSource,
        template: template ? { name: template.name, source: "workspace", sections: template.sections, instructions: "" } : null,
        changedLines: own.totalChanged,
        coveredLines: own.coveredChanged,
        events: [
          { at: createdAt.toISOString(), message: "Guide started", level: "info" },
          { at: published.toISOString(), message: "Guide published", level: "info" },
        ],
        publishedAt: published,
        createdAt,
        updatedAt: published,
      });
      counts.guides++;
      const actor = { workspaceId: ws.id, actorUserId: createdBy, actorLabel: author, repositoryId: repo.id, prNumber: number, guideId };
      activity.push(
        { ...actor, type: "guide.started", data: { version, via: who.createdVia }, createdAt },
        { ...actor, type: "guide.ready", data: { version, sections: sections.length }, createdAt: published },
      );
      const sectionIds = sections.map(() => newId());
      await db.insert(s.guideSections).values(
        sections.map((x, k) => ({ id: sectionIds[k], guideId, position: k + 1, title: x.title, body: x.body, refs: x.refs, generated: x.generated, createdAt })),
      );

      if (version === 2) {
        // Marks on sections whose code did not change carry over, as publishing a version does in the app.
        const [g] = await db.select().from(s.guides).where(eq(s.guides.id, guideId));
        const pending = marks.splice(0);
        if (pending.length) await db.insert(s.sectionReviews).values(pending).onConflictDoNothing();
        await carryReviewMarks(g);
      }

      /* Review marks: faster as the team got used to guides. */
      const weeksAgo = (now.getTime() - published.getTime()) / (7 * 86_400_000);
      const firstDelayHours = (2 + weeksAgo * 2.4) * spread(rng);
      const reviewers = members.filter((m) => m !== writer).sort(() => rng() - 0.5).slice(0, rng() < 0.2 ? 1 : 2 + Math.floor(rng() * 2));
      if (p.closed) reviewers.splice(1);
      const carried = version === 2 ? new Set((await db.select({ sectionId: s.sectionReviews.sectionId, userId: s.sectionReviews.userId }).from(s.sectionReviews).where(eq(s.sectionReviews.guideId, guideId))).map((r) => `${r.sectionId}:${r.userId}`)) : new Set<string>();
      // Some sections nobody gets to; otherwise each reviewer now and then skips one.
      const ignored = new Set(sections.map((x, k) => (rng() < (OFTEN_SKIPPED[x.title] ?? 0.02) + (p.closed ? 0.4 : 0) ? k : -1)));
      reviewers.forEach((reviewer, r) => {
        let t = published.getTime() + (firstDelayHours + (r === 0 ? 0 : between(rng, 1, 18) * spread(rng))) * 3_600_000;
        sections.forEach((x, k) => {
          if (ignored.has(k) || rng() < 0.1) return;
          t += between(rng, 3, 14) * 60_000;
          if (t > now.getTime() - 15 * 60_000) return;
          if (carried.has(`${sectionIds[k]}:${userIds[reviewer]}`)) return;
          marks.push({ sectionId: sectionIds[k], guideId, userId: userIds[reviewer], reviewedAt: new Date(t) });
          counts.marks++;
          if (t > lastActivity.getTime()) lastActivity = new Date(t);
        });
      });

      /* Comments and replies on the code of the sections, and reviews. */
      // Discussion gathers in the main sections and in the files many pull requests touch.
      const shared = new Set(p.touches ?? []);
      const commentable = sections
        .map((x, k) => ({ x, k, weight: x.generated ? 0.25 : x.refs.some((r) => shared.has(r.path)) ? 3 : k < 3 ? 1.5 : 1 }))
        .filter(({ x }) => x.refs.length > 0);
      const totalWeight = commentable.reduce((n, c) => n + c.weight, 0);
      const nComments = commentable.length === 0 ? 0 : Math.round((p.hot ? between(rng, 6, 11) : between(rng, 0, 4)) * (version === 2 ? 0.5 : 1));
      for (let c = 0; c < nComments; c++) {
        let roll = rng() * totalWeight;
        const { x, k } = commentable.find((t) => (roll -= t.weight) <= 0) ?? commentable[commentable.length - 1];
        const sharedRefs = x.refs.filter((r) => shared.has(r.path));
        const ref = sharedRefs.length && rng() < 0.7 ? pick(rng, sharedRefs) : x.refs[Math.floor(rng() * x.refs.length)];
        const file = parsed.find((f) => f.path === ref.path)!;
        const lines = file.hunks.flatMap((h) => h.lines).filter((l) => l.type === "add");
        const line = lines[Math.floor(rng() * lines.length)]?.newNumber ?? 1;
        const by = reviewers.length ? pick(rng, reviewers) : pick(rng, members.filter((m) => m !== writer));
        const at = new Date(published.getTime() + (firstDelayHours + between(rng, 0, 20)) * 3_600_000);
        if (at > ago(0.05)) continue;
        const id = githubId++;
        const base = { workspaceId: ws.id, repositoryId: repo.id, prNumber: number, guideId, sectionId: sectionIds[k], path: ref.path, line, side: "RIGHT" as const, commitSha: headSha, postedAs: "user" as const };
        commentRows.push({ ...base, authorUserId: userIds[by], kind: "review", body: pick(rng, COMMENTS), githubId: id, githubUrl: `${htmlUrl}#discussion_r${id}`, createdAt: at });
        counts.comments++;
        if (rng() < 0.45) {
          const replyId = githubId++;
          const replyAt = new Date(at.getTime() + between(rng, 0.3, 6) * 3_600_000);
          if (replyAt < ago(0.05)) {
            commentRows.push({ ...base, authorUserId: userIds[writer], kind: "reply", body: pick(rng, REPLIES), inReplyToGithubId: id, githubId: replyId, githubUrl: `${htmlUrl}#discussion_r${replyId}`, createdAt: replyAt });
            counts.comments++;
            if (rng() < 0.6) activity.push({ workspaceId: ws.id, actorUserId: userIds[by], type: "thread.resolved", repositoryId: repo.id, prNumber: number, guideId, data: { path: ref.path, line }, createdAt: new Date(replyAt.getTime() + 20 * 60_000) });
          }
        }
        if (at > lastActivity) lastActivity = at;
      }
      if (version === versions) {
        for (const reviewer of reviewers.slice(0, p.closed ? 0 : 2)) {
          const id = githubId++;
          const at = new Date(lastActivity.getTime() + between(rng, 0.2, 3) * 3_600_000);
          if (at > ago(0.05)) continue;
          const event = rng() < 0.15 ? "REQUEST_CHANGES" : "APPROVE";
          const url = `${htmlUrl}#pullrequestreview-${id}`;
          commentRows.push({ workspaceId: ws.id, repositoryId: repo.id, prNumber: number, guideId, authorUserId: userIds[reviewer], kind: "review_submit", body: `${event}: ${event === "APPROVE" ? "Looks good." : "A few things to fix first."}`, githubId: id, githubUrl: url, postedAs: "user", createdAt: at });
          activity.push({ workspaceId: ws.id, actorUserId: userIds[reviewer], type: "review.submitted", repositoryId: repo.id, prNumber: number, guideId, data: { event, url }, createdAt: at });
          if (at > lastActivity) lastActivity = at;
        }
      }
    }

    const created = new Date(publishedV1.getTime() - between(rng, 2, 30) * 3_600_000);
    const closedAt = new Date(Math.min(lastActivity.getTime() + between(rng, 1, 20) * 3_600_000, now.getTime() - 3_600_000));
    pullRows.push({
      repositoryId: repo.id,
      number,
      githubId: 92_000_000 + number,
      title: p.title,
      body: p.closed ? "Trying this out; closing until we have data on the cart page." : null,
      state: "closed",
      merged: !p.closed,
      draft: false,
      authorLogin: LOGINS[p.author],
      authorAvatarUrl: p.author in HISTORY_USERS ? demoAvatar(HISTORY_USERS[p.author as HistoryUserKey].name, HISTORY_USERS[p.author as HistoryUserKey].color) : githubAvatar(LOGINS[p.author]),
      headRef: `${BRANCH_PREFIX[p.author]}/${p.v.id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
      headSha,
      baseRef: DEMO_REPO.defaultBranch,
      baseSha: DEMO_SHAS.base,
      additions,
      deletions,
      changedFiles,
      commits: versions + Math.floor(rng() * 4),
      htmlUrl,
      githubCreatedAt: created,
      githubUpdatedAt: closedAt,
      mergedAt: p.closed ? null : closedAt,
      closedAt,
      detailsSha: headSha,
      syncedAt: now,
    });
  }
  if (marks.length) await db.insert(s.sectionReviews).values(marks).onConflictDoNothing();
  if (commentRows.length) await db.insert(s.comments).values(commentRows);
  await db.insert(s.pullRequests).values(pullRows);
  await db.insert(s.activity).values(activity);
  console.log(`  insights history: ${PULLS.length} pull requests, ${counts.guides} guide versions, ${counts.marks} review marks, ${counts.comments} comments, 3 more members`);
}
