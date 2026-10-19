/**
 * Demo data for suggested changes and resolved conversations on #128: review comments made on
 * GitHub (served by the mock GitHub API, like DEMO_COMMENTS) and which review threads are
 * resolved there.
 */
import type { CommentDef } from "./index";

export const THREAD_DEMO_COMMENTS: CommentDef[] = [
  {
    // A suggestion made on GitHub, in section 2 ("Validating a code").
    id: 2_002_001,
    pr: 128,
    author: "samokafor",
    path: "src/lib/promo.ts",
    head: "pr128-v2",
    lineText: 'min_subtotal: "Your cart is below the minimum for this code.",',
    body: 'Copy nit: say what to do rather than what\'s wrong.\n\n```suggestion\n  min_subtotal: "Add a little more to your cart to use this code.",\n```',
    hoursAgo: 1.2,
  },
  {
    // A conversation that was resolved on GitHub, also in section 2.
    id: 2_002_002,
    pr: 128,
    author: "alexmorgan",
    path: "src/lib/promo.ts",
    head: "pr128-v2",
    lineText: "/** Codes are matched without regard to case",
    body: "Is the unique index on `lower(code)` part of this pull request?",
    hoursAgo: 3,
  },
  {
    id: 2_002_003,
    pr: 128,
    author: "mayachen",
    path: "src/lib/promo.ts",
    head: "pr128-v2",
    lineText: "/** Codes are matched without regard to case",
    inReplyTo: 2_002_002,
    body: "Yes, it's in `0018_promo_codes.sql` (section 1).",
    hoursAgo: 2.8,
  },
];

/** Review threads resolved on GitHub: root comment ID → login of who resolved it. */
export const DEMO_RESOLVED_THREADS: Record<number, string> = {
  // The off-by-one and the used-up code on #128 v1, both fixed in v2.
  2_001_001: "samokafor",
  2_001_003: "alexmorgan",
  2_002_002: "alexmorgan",
};
