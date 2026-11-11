// Unit tests for the app's pure helpers: `pnpm test` (Node's test runner with type stripping).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseDiffLink } from '../src/lib/diff-link.ts';
import { buildRows, layoutItems, selectRows } from '../src/lib/diff-model.ts';
import { isPushData, routeForPush } from '../src/lib/push-data.ts';
import { normalizeServer, onServer } from '../src/lib/server-url.ts';
import { threadOnRow, threadsByPath } from '../src/lib/threads.ts';
import type { FileView, ReviewComment } from '../src/lib/types.ts';

describe('server addresses', () => {
  it('defaults to https, and http for local development addresses', () => {
    assert.equal(normalizeServer('omakaze.example.com'), 'https://omakaze.example.com');
    assert.equal(normalizeServer(' https://omakaze.example.com/w/acme '), 'https://omakaze.example.com');
    assert.equal(normalizeServer('localhost:3000'), 'http://localhost:3000');
    assert.equal(normalizeServer('192.168.1.20:3000'), 'http://192.168.1.20:3000');
    assert.equal(normalizeServer('http://omakaze.internal:8080/'), 'http://omakaze.internal:8080');
    assert.equal(normalizeServer('ftp://x'), null);
    assert.equal(normalizeServer(''), null);
  });

  it('moves advertised endpoints onto the address the app uses', () => {
    assert.equal(onServer('http://localhost:3000/oauth/authorize', 'http://192.168.1.20:3000'), 'http://192.168.1.20:3000/oauth/authorize');
  });
});

describe('diff: links', () => {
  it('parses files, line ranges and old-side lines', () => {
    assert.deepEqual(parseDiffLink('diff:src/a.ts'), { path: 'src/a.ts', start: null, end: null, side: 'new' });
    assert.deepEqual(parseDiffLink('diff:src/a.ts#L10-L24'), { path: 'src/a.ts', start: 10, end: 24, side: 'new' });
    assert.deepEqual(parseDiffLink('diff:src/a.ts#12'), { path: 'src/a.ts', start: 12, end: 12, side: 'new' });
    assert.deepEqual(parseDiffLink('diff:src/a.ts#old:L5-L9'), { path: 'src/a.ts', start: 5, end: 9, side: 'old' });
    assert.deepEqual(parseDiffLink('diff:src%2Fmy%20file.ts#L3'), { path: 'src/my file.ts', start: 3, end: 3, side: 'new' });
    assert.equal(parseDiffLink('https://example.com'), null);
  });
});

describe('push notifications', () => {
  const data = { type: 'reply', workspaceId: 'ws1', repo: 'acme/web', prNumber: 412, url: 'https://o.example.com/w/acme/acme/web/pull/412?v=2&section=3' };
  it('recognizes the server payload', () => {
    assert.equal(isPushData(data), true);
    assert.equal(isPushData({ url: 'x' }), false);
    assert.equal(isPushData(null), false);
  });
  it('opens the section the link names, else the guide', () => {
    assert.equal(routeForPush(data), '/pr/acme/web/412/section?position=3&v=2');
    assert.equal(routeForPush({ ...data, url: 'https://o.example.com/w/acme/acme/web/pull/412?v=2' }), '/pr/acme/web/412?v=2');
    assert.equal(routeForPush({ ...data, url: 'https://github.com/acme/web/pull/412' }), '/pr/acme/web/412');
  });
});

const comment = (c: Partial<ReviewComment> & { id: number }): ReviewComment => ({
  inReplyTo: null,
  path: 'src/a.ts',
  line: 3,
  originalLine: 3,
  startLine: null,
  side: 'RIGHT',
  body: 'x',
  user: { login: 'maya', avatarUrl: null },
  createdAt: `2026-11-0${c.id}T10:00:00Z`,
  htmlUrl: '',
  outdated: false,
  mine: false,
  threadId: null,
  commentedLines: null,
  ...c,
});

describe('conversations', () => {
  it('groups replies under their first comment, per file, with the resolved state', () => {
    const byPath = threadsByPath({
      comments: [comment({ id: 1, threadId: 'T1' }), comment({ id: 2, inReplyTo: 1, threadId: 'T1' }), comment({ id: 3, path: 'src/b.ts', side: 'LEFT', line: 7 })],
      threads: [{ id: 'T1', isResolved: true, resolvedBy: 'sam' }],
    });
    const a = byPath.get('src/a.ts')!;
    assert.equal(a.length, 1);
    assert.equal(a[0].replies.length, 1);
    assert.equal(a[0].isResolved, true);
    const b = byPath.get('src/b.ts')![0];
    assert.equal(threadOnRow(b, { kind: 'del', old: 7, new: null, inHunk: true }), true);
    assert.equal(threadOnRow(b, { kind: 'add', old: null, new: 7, inHunk: true }), false);
    assert.equal(threadOnRow(a[0], { kind: 'context', old: 3, new: 3, inHunk: true }), true);
  });
});

describe('diff model (shared with the web viewer)', () => {
  const view: FileView = {
    path: 'src/a.ts',
    previousPath: null,
    status: 'modified',
    additions: 1,
    deletions: 1,
    language: 'typescript',
    binary: false,
    hunks: [
      {
        index: 1,
        header: '@@ -1,3 +1,3 @@',
        heading: '',
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 3,
        lines: [
          { t: 'c', o: 1, n: 1 },
          { t: 'd', o: 2, n: null },
          { t: 'a', o: null, n: 2 },
          { t: 'c', o: 3, n: 3 },
        ],
      },
    ],
    newFile: [[['a', 0]], [['B', 0]], [['c', 0]], [['d', 0]], [['e', 0]]],
    oldLines: { 2: [['b', 0]] },
    oldLineCount: 5,
    hunkTokens: null,
    palette: ['#24292E'],
  };
  it('shows the hunk of a whole-file ref and hides unchanged lines after it behind a gap', () => {
    const { rows, full } = buildRows(view);
    assert.equal(full, true);
    assert.equal(rows.length, 6);
    const visible = selectRows(rows, [{ path: 'src/a.ts' }]);
    const items = layoutItems(rows, visible, view, full);
    assert.deepEqual(
      items.map((i) => i.type),
      ['row', 'row', 'row', 'row', 'gap'],
    );
  });
});
