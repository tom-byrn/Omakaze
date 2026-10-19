"use client";

import { RiArrowGoBackLine, RiCheckDoubleLine, RiCheckLine, RiExternalLinkLine, RiFileEditLine } from "@remixicon/react";
import { useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { timeAgo } from "@/lib/format";
import { bodyWithoutSuggestions, hasSuggestion, insertSuggestion } from "@/lib/github/suggestions";
import { CommentMarkdown, SuggestionPreview } from "./Suggestion";
import type { ReviewComment, Thread } from "./types";

/** Lines a new suggestion would replace: their head-side text and the first line number. */
export type SuggestionBase = { lines: string[]; startLine: number };

function CommentBody({ c, onDelete }: { c: ReviewComment; onDelete?: (id: number) => Promise<string | null> }) {
  const [deleting, setDeleting] = useState(false);
  // commentedLines end at the comment's line in the commit it was written on.
  const startLine = c.commentedLines ? (c.originalLine ?? c.line ?? c.commentedLines.length) - c.commentedLines.length + 1 : (c.startLine ?? c.line);
  return (
    <div className="flex gap-3 px-4 py-3">
      <Avatar src={c.user?.avatarUrl} name={c.user?.login} size={22} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-medium text-ink">{c.user?.login ?? "unknown"}</span>
          <span className="text-muted">{timeAgo(c.createdAt)}</span>
          {c.isNew ? <span className="tag border-blue-bright/40 text-blue-bright">New</span> : null}
          {c.mine && onDelete ? (
            <button
              type="button"
              className="text-muted hover:text-danger"
              disabled={deleting}
              onClick={async () => {
                if (!window.confirm("Delete this comment on GitHub?")) return;
                setDeleting(true);
                const err = await onDelete(c.id);
                setDeleting(false);
                if (err) window.alert(err);
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          ) : null}
          <a href={c.htmlUrl} target="_blank" rel="noreferrer" className="ml-auto text-black/35 hover:text-ink" aria-label="Open on GitHub">
            <RiExternalLinkLine size={13} />
          </a>
        </div>
        <div className="mt-1">
          <CommentMarkdown body={c.body} base={c.commentedLines ?? null} startLine={startLine} href={c.htmlUrl} />
        </div>
      </div>
    </div>
  );
}

export function Composer({
  onSubmit,
  onCancel,
  placeholder = "Leave a comment",
  submitLabel = "Comment on GitHub",
  autoFocus = true,
  suggestion,
}: {
  onSubmit: (body: string) => Promise<string | null>;
  onCancel?: () => void;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  /** The commented lines on the head side; offers "Insert suggestion" when set. */
  suggestion?: SuggestionBase | null;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);

  // Put the caret inside an inserted suggestion once the new text is rendered.
  useLayoutEffect(() => {
    if (caret.current === null || !textarea.current) return;
    textarea.current.focus();
    textarea.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [body]);

  function insert() {
    if (!suggestion) return;
    const el = textarea.current;
    const at = { start: el?.selectionStart ?? body.length, end: el?.selectionEnd ?? body.length };
    const next = insertSuggestion(body, at, suggestion.lines);
    caret.current = next.caret;
    setBody(next.text);
  }

  return (
    <form
      className="flex flex-col gap-2 p-3 font-sans"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setPending(true);
        const err = await onSubmit(body);
        setPending(false);
        if (err) setError(err);
        else {
          setBody("");
          setError(null);
        }
      }}
    >
      <textarea
        ref={textarea}
        className="input min-h-[84px] text-[13px]"
        placeholder={placeholder}
        value={body}
        autoFocus={autoFocus}
        rows={Math.min(16, Math.max(3, body.split("\n").length + 1))}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") (e.currentTarget.form as HTMLFormElement).requestSubmit();
          if (e.key === "Escape") onCancel?.();
        }}
      />
      {suggestion && hasSuggestion(body) ? <SuggestionPreview body={body} base={suggestion.lines} startLine={suggestion.startLine} /> : null}
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending || !body.trim()}>
          {pending ? "Posting…" : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        {suggestion ? (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={insert}
            title={`Suggest new text for line${suggestion.lines.length === 1 ? "" : "s"} ${suggestion.startLine}${suggestion.lines.length > 1 ? `–${suggestion.startLine + suggestion.lines.length - 1}` : ""}`}
          >
            <RiFileEditLine size={13} /> Insert suggestion
          </button>
        ) : null}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.08em] text-black/40">Markdown · ⌘↵ to post</span>
      </div>
    </form>
  );
}

/** One line for a collapsed thread: the start of the first comment, without suggestion blocks. */
function previewText(c: ReviewComment): string {
  const text = bodyWithoutSuggestions(c.body)
    .replace(/`+|\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || (hasSuggestion(c.body) ? "Suggested change" : "");
}

export function CommentThread({
  thread,
  onReply,
  onDelete,
  onResolve,
  showResolved = false,
  suggestion,
}: {
  thread: Thread;
  onReply: (rootId: number, body: string) => Promise<string | null>;
  onDelete?: (id: number) => Promise<string | null>;
  /** Resolve (true) or unresolve (false) the thread on GitHub. */
  onResolve?: (threadId: string, resolved: boolean) => Promise<string | null>;
  /** Show resolved threads expanded instead of as one line. */
  showResolved?: boolean;
  /** The thread's lines on the head side, for suggestions in replies. */
  suggestion?: SuggestionBase | null;
}) {
  const [replying, setReplying] = useState(false);
  const [opened, setOpened] = useState(false);
  const [pending, setPending] = useState(false);
  const state = thread.state;
  const resolved = state?.isResolved ?? false;
  const count = 1 + thread.replies.length;

  async function toggleResolved() {
    if (!state || !onResolve) return;
    setPending(true);
    const err = await onResolve(state.id, !resolved);
    setPending(false);
    if (!err && !resolved) {
      setOpened(false);
      setReplying(false);
    }
  }

  if (resolved && !showResolved && !opened) {
    return (
      <div
        className="my-2 mr-3 ml-3 sm:ml-[96px] flex items-center gap-2 border border-dashed border-black/20 bg-white px-3 py-1.5 font-sans text-[12px]"
        data-thread="resolved"
      >
        <RiCheckDoubleLine size={14} className="shrink-0 text-olive" />
        <span className="mono-label shrink-0 text-olive">Resolved</span>
        <span className="min-w-0 flex-1 truncate text-muted">
          <span className="text-ink">{thread.root.user?.login ?? "unknown"}</span> {previewText(thread.root)}
        </span>
        <span className="hidden shrink-0 font-mono text-[10px] tracking-[0.06em] text-black/45 uppercase sm:inline">
          {count} comment{count === 1 ? "" : "s"}
        </span>
        <button type="button" className="btn btn-ghost btn-xs shrink-0" onClick={() => setOpened(true)}>
          Show
        </button>
      </div>
    );
  }

  return (
    <div className="my-2 mr-3 ml-3 sm:ml-[96px] border border-black/15 bg-white font-sans" data-thread={resolved ? "resolved" : "open"}>
      {resolved ? (
        <div className="flex items-center gap-2 border-b border-dashed border-line bg-paper px-4 py-1.5 text-[12px]">
          <RiCheckDoubleLine size={14} className="text-olive" />
          <span className="text-muted">
            Resolved{state?.resolvedBy ? (
              <>
                {" "}
                by <span className="text-ink">{state.resolvedBy}</span>
              </>
            ) : null}
          </span>
          {opened && !showResolved ? (
            <button type="button" className="btn btn-ghost btn-xs ml-auto" onClick={() => setOpened(false)}>
              Hide
            </button>
          ) : null}
        </div>
      ) : null}
      <CommentBody c={thread.root} onDelete={onDelete} />
      {thread.replies.map((r) => (
        <div key={r.id} className="border-t border-dashed border-line">
          <CommentBody c={r} onDelete={onDelete} />
        </div>
      ))}
      <div className="border-t border-dashed border-line">
        {replying ? (
          <Composer
            placeholder="Reply"
            submitLabel="Reply on GitHub"
            suggestion={suggestion}
            onCancel={() => setReplying(false)}
            onSubmit={async (body) => {
              const err = await onReply(thread.root.id, body);
              if (!err) setReplying(false);
              return err;
            }}
          />
        ) : (
          <div className="flex items-stretch">
            <button type="button" className="min-w-0 flex-1 px-4 py-2 text-left text-[12px] text-muted hover:text-ink" onClick={() => setReplying(true)}>
              Reply…
            </button>
            {state && onResolve ? (
              <button
                type="button"
                className="flex shrink-0 items-center gap-1.5 border-l border-dashed border-line px-4 py-2 text-[12px] text-ui hover:text-ink disabled:opacity-50"
                disabled={pending}
                onClick={toggleResolved}
              >
                {resolved ? <RiArrowGoBackLine size={13} /> : <RiCheckLine size={13} />}
                {pending ? (resolved ? "Unresolving…" : "Resolving…") : resolved ? "Unresolve conversation" : "Resolve conversation"}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
