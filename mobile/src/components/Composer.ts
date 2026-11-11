import { router } from 'expo-router';

import type { ComposeTarget } from './DiffFile';

/** Open the comment sheet for a new line comment. */
export function composeComment(base: string, guideId: string, t: ComposeTarget, sectionId?: string) {
  const q = new URLSearchParams({ guide: guideId, path: t.path, line: String(t.line), side: t.side, text: t.text.slice(0, 4000) });
  if (t.startLine) q.set('startLine', String(t.startLine));
  if (sectionId) q.set('section', sectionId);
  router.push(`${base}/comment?${q.toString()}` as never);
}

/** Open the comment sheet to reply in a conversation. */
export function composeReply(base: string, guideId: string, rootId: number) {
  router.push(`${base}/comment?guide=${guideId}&inReplyTo=${rootId}` as never);
}
