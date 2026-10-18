"use client";

import { RiCodeSSlashLine } from "@remixicon/react";

export type CodeTarget = { path: string; start: number | null; end: number | null; side: "new" | "old" };

/** Parse diff:path#L10-L20 (or #old:L5) links. */
export function parseDiffHref(href: string): CodeTarget | null {
  const raw = decodeURIComponent(href.replace(/^diff:/, ""));
  const [path, frag = ""] = raw.split("#");
  if (!path) return null;
  const m = /^(old:)?L?(\d+)(?:-L?(\d+))?$/.exec(frag);
  if (!m) return { path, start: null, end: null, side: "new" };
  const start = Number(m[2]);
  const end = m[3] ? Number(m[3]) : start;
  return { path, start: Math.min(start, end), end: Math.max(start, end), side: m[1] ? "old" : "new" };
}

export function CodeRefLink({ href, children }: { href: string; children: React.ReactNode }) {
  const target = parseDiffHref(href);
  return (
    <a
      href={`#${encodeURIComponent(href)}`}
      className="code-ref"
      title={target ? `${target.path}${target.start ? `:${target.start}${target.end !== target.start ? `-${target.end}` : ""}` : ""}` : href}
      onClick={(e) => {
        e.preventDefault();
        if (target) window.dispatchEvent(new CustomEvent<CodeTarget>("guide:goto", { detail: target }));
      }}
    >
      <RiCodeSSlashLine size={12} className="mr-0.5 inline -translate-y-px" />
      {children}
    </a>
  );
}
