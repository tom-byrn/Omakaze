"use client";

import { RiExternalLinkLine, RiFileEditLine } from "@remixicon/react";
import clsx from "clsx";
import { isNoopSuggestion, parseSuggestions, suggestionRows } from "@/lib/github/suggestions";
import { ClientMarkdown } from "./ClientMarkdown";

function Line({ text, change }: { text: string; change: [number, number] | null }) {
  // A space keeps the height of an empty line.
  if (!change) return <>{text || " "}</>;
  return (
    <>
      {text.slice(0, change[0])}
      <span className="suggestion-change">{text.slice(change[0], change[1])}</span>
      {text.slice(change[1])}
    </>
  );
}

/** A suggested change as a small diff: the replaced lines, then the suggested ones. */
export function SuggestionDiff({
  original,
  suggested,
  startLine,
  href,
  label = "Suggested change",
}: {
  /** The lines the suggestion replaces; null when they aren't known. */
  original: string[] | null;
  suggested: string[];
  startLine: number | null;
  /** The comment on GitHub, where the suggestion can be committed. */
  href?: string;
  label?: string;
}) {
  const rows = suggestionRows(original, suggested, startLine);
  return (
    <figure className="suggestion my-2 border border-black/15 bg-white" data-suggestion>
      <figcaption className="flex items-center gap-2 border-b border-dashed border-line bg-paper px-3 py-1.5">
        <RiFileEditLine size={13} className="text-black/45" />
        <span className="mono-label whitespace-nowrap">{label}</span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-[11.5px] whitespace-nowrap text-muted hover:text-ink"
            title="Commit the suggestion on GitHub"
          >
            <span className="hidden sm:inline">Commit on GitHub</span>
            <span className="sm:hidden">Commit</span> <RiExternalLinkLine size={12} />
          </a>
        ) : null}
      </figcaption>
      <div className="diff-wrap">
        <table className="diff-table">
          <colgroup>
            <col className="w-[44px]" />
            <col />
          </colgroup>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={clsx(r.kind === "add" ? "row-add" : "row-del")}>
                <td className="diff-num">{r.number ?? ""}</td>
                <td className="diff-code" data-marker={r.kind === "add" ? "+" : "−"}>
                  <Line text={r.text} change={r.change} />
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-2 font-sans text-[12px] text-muted">
                  Removes the line.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** A comment body with suggestion blocks shown as diffs against the commented lines. */
export function CommentMarkdown({ body, base, startLine, href }: { body: string; base: string[] | null; startLine: number | null; href?: string }) {
  const segments = parseSuggestions(body);
  if (!segments.some((s) => s.type === "suggestion")) return <ClientMarkdown source={body} />;
  return (
    <>
      {segments.map((s, i) =>
        s.type === "markdown" ? (
          <ClientMarkdown key={i} source={s.text} />
        ) : (
          <SuggestionDiff key={i} original={base} suggested={s.lines} startLine={startLine} href={href} />
        ),
      )}
    </>
  );
}

/** What the suggestions in a draft would change, shown under the composer. */
export function SuggestionPreview({ body, base, startLine }: { body: string; base: string[]; startLine: number }) {
  const blocks = parseSuggestions(body).filter((s) => s.type === "suggestion");
  if (blocks.length === 0) return null;
  return (
    <div aria-label="Suggestion preview">
      {blocks.map((b, i) =>
        isNoopSuggestion(base, b.lines) ? (
          <p key={i} className="border border-dashed border-line px-3 py-2 text-[12px] text-muted">
            Edit the lines inside the suggestion block to suggest a change.
          </p>
        ) : (
          <SuggestionDiff key={i} original={base} suggested={b.lines} startLine={startLine} label="Preview" />
        ),
      )}
    </div>
  );
}
