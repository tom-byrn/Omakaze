/** Response shapes of the server's /api/mobile and /api/guides routes. */

export type Role = 'owner' | 'admin' | 'member';
export type GuideStatus = 'draft' | 'generating' | 'ready' | 'failed';
export type PullState = 'open' | 'closed' | 'merged';
export type StateFilter = 'open' | 'merged' | 'closed' | 'all';
export type PullFilter = 'needs-review' | 'mine' | 'assigned' | 'all';
export type Person = { login: string; avatarUrl: string | null };

export type Me = {
  instance: { url: string };
  user: { id: string; name: string; email: string | null; avatarUrl: string | null; githubLogin: string | null };
  workspace: { id: string; slug: string; name: string };
  role: Role;
  repos: { id: string; fullName: string; htmlUrl: string; connected: boolean }[];
  features: {
    ai: { model: string; chatgptPlan: boolean } | null;
    shareLinks: { canCreate: boolean } | null;
    notifications: boolean;
    push: boolean;
  };
};

export type PullListItem = {
  repository: string;
  number: number;
  title: string;
  state: PullState;
  draft: boolean;
  author: string | null;
  authorAvatarUrl: string | null;
  headRef: string;
  baseRef: string;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  url: string;
  updatedAt: string;
  guide: { id: string; version: number; status: GuideStatus; headSha: string; outdated: boolean } | null;
  requestedReviewers: Person[];
  requestedTeams: string[];
  assignees: Person[];
  reviewProgress: { version: number; sections: number; reviewed: number } | null;
};

export type PullList = {
  counts: Record<StateFilter, number>;
  filterCounts: Record<PullFilter, number>;
  viewerLogin: string | null;
  syncErrors: string[];
  pulls: PullListItem[];
};

export type SectionRef = {
  path: string;
  hunks?: number[];
  lines?: { start: number; end: number; side?: 'new' | 'old' };
  note?: string;
  expand?: 'none' | 'function' | 'file';
};

export type SectionChange = { status: 'new' | 'changed'; version: number; files: { path: string }[] };

export type GuideSection = {
  id: string;
  position: number;
  title: string;
  body: string;
  refs: SectionRef[];
  generated: boolean;
  files: { path: string; additions: number; deletions: number }[];
  additions: number;
  deletions: number;
  reviewedBy: string[];
  carriedFrom: Record<string, number>;
  reviewChange: SectionChange | null;
  visitChange: SectionChange | null;
};

export type GuideFile = {
  path: string;
  previousPath: string | null;
  status: string;
  additions: number;
  deletions: number;
  sections: number[];
};

export type GuideCheck = {
  mode: 'off' | 'informational' | 'required' | string;
  check: { conclusion: string | null; title: string | null; method: string | null; headSha: string | null; postedAt: string | null; error: string | null } | null;
};

export type Guide = {
  id: string;
  title: string;
  summary: string;
  version: number;
  status: GuideStatus;
  error: string | null;
  headSha: string;
  author: string | null;
  source: string;
  createdVia: string;
  createdAt: string;
  outdated: boolean;
  template: { name: string; missing: string[] } | null;
  sections: GuideSection[];
  files: GuideFile[];
  coverage: { total: number; covered: number };
  members: Record<string, { name: string; avatarUrl: string | null }>;
  lastVisitAt: string | null;
  sinceVisit: { at: string; baselineVersion: number; versions: number[] } | null;
};

export type PullDetail = {
  repo: { id: string; fullName: string; htmlUrl: string };
  pull: {
    number: number;
    title: string;
    body: string | null;
    state: PullState;
    draft: boolean;
    author: string | null;
    authorAvatarUrl: string | null;
    headRef: string;
    baseRef: string;
    headSha: string;
    additions: number | null;
    deletions: number | null;
    changedFiles: number | null;
    url: string;
    updatedAt: string;
    requestedReviewers: Person[];
    requestedTeams: string[];
    assignees: Person[];
  };
  versions: { id: string; version: number; status: GuideStatus; headSha: string; author: string | null; source: string; createdAt: string }[];
  check: GuideCheck;
  agentPrompt: string;
  me: { id: string; name: string; hasGitHub: boolean };
  canGenerate: boolean;
  guide: Guide | null;
};

/** Syntax tokens: [text, palette index] or [text, palette index, font style bits]. */
export type Tok = [string, number] | [string, number, number];

export type FileView = {
  path: string;
  previousPath: string | null;
  status: string;
  additions: number;
  deletions: number;
  language: string | null;
  binary: boolean;
  hunks: {
    index: number;
    header: string;
    heading: string;
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: { t: 'c' | 'a' | 'd'; o: number | null; n: number | null }[];
  }[];
  newFile: Tok[][] | null;
  oldLines: Record<number, Tok[]>;
  oldLineCount: number | null;
  hunkTokens: Tok[][][] | null;
  palette: string[];
  moves?: { kind?: string; path: string; [k: string]: unknown }[];
};

export type ReviewComment = {
  id: number;
  inReplyTo: number | null;
  path: string;
  line: number | null;
  originalLine: number | null;
  startLine: number | null;
  side: 'LEFT' | 'RIGHT';
  body: string;
  user: Person | null;
  createdAt: string;
  htmlUrl: string;
  outdated: boolean;
  mine: boolean;
  threadId: string | null;
  commentedLines: unknown;
};

export type CommentsResponse = {
  comments: ReviewComment[];
  threads: { id: string; isResolved: boolean; resolvedBy: string | null }[] | null;
  disconnected?: boolean;
};

export type GuideStatusResponse = {
  status: GuideStatus;
  sections: number;
  title: string;
  error: string | null;
  events: { at?: string; level?: string; message: string }[];
  updatedAt: string;
};

export type ShareLink = {
  id: string;
  repoFullName: string;
  prNumber: number;
  version: number | null;
  includeComments: boolean;
  creatorName: string | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  canRevoke: boolean;
};

export type ActivityItem = {
  id: string;
  type: string;
  at: string;
  actor: { name: string; avatarUrl: string | null };
  text: string;
  repo: string | null;
  prNumber: number | null;
  url: string | null;
};

export type NotificationSettings = {
  enabled: boolean;
  emailAvailable: boolean;
  pushAvailable: boolean;
  digestOptions: { value: 'minutes' | 'hourly' | 'daily'; label: string }[];
  preferences: {
    email: boolean;
    push: boolean;
    guideReady: boolean;
    newVersion: boolean;
    replies: boolean;
    pullActivity: boolean;
    digest: 'minutes' | 'hourly' | 'daily';
  };
  workspaceMuted: boolean;
};

export type Member = { id: string; name: string; avatarUrl: string | null; role: Role; joinedAt: string; login: string | null };

type OriginValues = Record<string, number>;
export type MemberStats = {
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  reviewed: number;
  carried: number;
  comments: number;
  reviews: number;
  resolved: number;
  guides: number;
};

export type Insights = {
  days: 7 | 30 | 90;
  repo: string | null;
  repos: string[];
  origins: { key: string; label: string }[];
  created: { unit: 'day' | 'week'; buckets: { start: string; label: string; values: OriginValues; total: number }[]; totals: OriginValues; total: number };
  speed: {
    unit: 'day' | 'week';
    buckets: { start: string; label: string; published: number; reviewed: number; firstMedian: number | null; completed: number; allMedian: number | null }[];
    published: number;
    firstMedian: number | null;
    allMedian: number | null;
    reviewed: number;
    completed: number;
  };
  completion: { guides: number; states: { full: number; partial: number; none: number }; sections: number; reviewedSections: number };
  unreviewed: { title: string; unreviewed: number; appearances: number; share: number | null }[];
  hotSections: { sectionId: string; title: string; position: number; version: number; prNumber: number; prTitle: string | null; repoFullName: string; comments: number; people: number }[];
  hotFiles: { repoFullName: string; path: string; comments: number; pulls: number; link: { prNumber: number; version: number | null; position: number | null } }[];
  coverage: {
    bins: { key: string; label: string; values: OriginValues; total: number }[];
    guides: number;
    median: number | null;
    otherShare: number | null;
    bySource: { origin: string; guides: number; median: number | null }[];
  };
  members: { rows: MemberStats[]; total: MemberStats; everyone: boolean };
  templates: { guides: number; missing: number; sections: { title: string; template: string; missing: number }[] };
};
