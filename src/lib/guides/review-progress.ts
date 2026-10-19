/** A section as the progress computation needs it, in guide order. */
export type ProgressSection = { id: string; title: string };

/** A review mark: `userId` marked `sectionId` as reviewed. Pass them oldest first. */
export type ProgressMark = { sectionId: string; userId: string };

export type SectionProgress = {
  id: string;
  title: string;
  /** Members who marked the section, oldest mark first. */
  reviewers: string[];
  /** Has at least `required` reviewers. */
  done: boolean;
};

export type ReviewProgress = {
  sections: SectionProgress[];
  /** Sections with at least `required` reviewers. */
  reviewed: number;
  total: number;
  /** Reviewers each section needs. */
  required: number;
  complete: boolean;
};

/**
 * Review progress of one guide version: who marked each section, and how many sections have
 * enough reviewers. This is the only place that decides what "reviewed" means for the guide check,
 * so a change to how marks carry over between versions only has to change the marks passed in.
 *
 * Marks by users outside `memberIds` (people who left the workspace) and marks on sections that
 * aren't in `sections` are ignored. A guide without sections counts as complete.
 */
export function computeReviewProgress(
  sections: ProgressSection[],
  marks: ProgressMark[],
  opts: { required?: number; memberIds?: Iterable<string> } = {},
): ReviewProgress {
  const required = Math.max(1, Math.floor(opts.required ?? 1));
  const members = opts.memberIds ? new Set(opts.memberIds) : null;
  const bySection = new Map<string, string[]>(sections.map((s) => [s.id, []]));
  for (const m of marks) {
    const reviewers = bySection.get(m.sectionId);
    if (!reviewers || reviewers.includes(m.userId)) continue;
    if (members && !members.has(m.userId)) continue;
    reviewers.push(m.userId);
  }
  const out = sections.map((s) => {
    const reviewers = bySection.get(s.id) ?? [];
    return { id: s.id, title: s.title, reviewers, done: reviewers.length >= required };
  });
  const reviewed = out.filter((s) => s.done).length;
  return { sections: out, reviewed, total: out.length, required, complete: reviewed === out.length };
}
