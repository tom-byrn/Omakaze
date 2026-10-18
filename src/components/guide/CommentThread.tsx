"use client";

import { RiExternalLinkLine } from "@remixicon/react";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { timeAgo } from "@/lib/format";
import { ClientMarkdown } from "./ClientMarkdown";
import type { ReviewComment, Thread } from "./types";

function CommentBody({ c }: { c: ReviewComment }) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <Avatar src={c.user?.avatarUrl} name={c.user?.login} size={22} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-medium text-ink">{c.user?.login ?? "unknown"}</span>
          <span className="text-muted">{timeAgo(c.createdAt)}</span>
          <a href={c.htmlUrl} target="_blank" rel="noreferrer" className="ml-auto text-black/35 hover:text-ink" aria-label="Open on GitHub">
            <RiExternalLinkLine size={13} />
          </a>
        </div>
        <div className="mt-1">
          <ClientMarkdown source={c.body} />
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
}: {
  onSubmit: (body: string) => Promise<string | null>;
  onCancel?: () => void;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        className="input min-h-[84px] text-[13px]"
        placeholder={placeholder}
        value={body}
        autoFocus={autoFocus}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") (e.currentTarget.form as HTMLFormElement).requestSubmit();
          if (e.key === "Escape") onCancel?.();
        }}
      />
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending || !body.trim()}>
          {pending ? "Posting…" : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.08em] text-black/40">Markdown · ⌘↵ to post</span>
      </div>
    </form>
  );
}

export function CommentThread({ thread, onReply }: { thread: Thread; onReply: (rootId: number, body: string) => Promise<string | null> }) {
  const [replying, setReplying] = useState(false);
  return (
    <div className="my-2 mr-3 ml-[96px] border border-black/15 bg-white font-sans">
      <CommentBody c={thread.root} />
      {thread.replies.map((r) => (
        <div key={r.id} className="border-t border-dashed border-line">
          <CommentBody c={r} />
        </div>
      ))}
      <div className="border-t border-dashed border-line">
        {replying ? (
          <Composer
            placeholder="Reply"
            submitLabel="Reply on GitHub"
            onCancel={() => setReplying(false)}
            onSubmit={async (body) => {
              const err = await onReply(thread.root.id, body);
              if (!err) setReplying(false);
              return err;
            }}
          />
        ) : (
          <button type="button" className="w-full px-4 py-2 text-left text-[12px] text-muted hover:text-ink" onClick={() => setReplying(true)}>
            Reply…
          </button>
        )}
      </div>
    </div>
  );
}
