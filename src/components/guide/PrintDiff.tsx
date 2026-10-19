import clsx from "clsx";
import type { FileView } from "@/lib/diff/fileview";
import type { Tok } from "@/lib/diff/highlight";
import { fileStatusLabel } from "@/lib/guides/export";
import type { SectionRef } from "@/lib/guides/refs";
import { buildRows, layoutItems, selectRows } from "./diff-model";

function Code({ tokens, palette }: { tokens: Tok[]; palette: string[] }) {
  return (
    <>
      {tokens.map((t, i) => (
        <span
          key={i}
          style={{
            color: t[1] ? palette[t[1]] : undefined,
            fontStyle: t[2] && t[2] & 1 ? "italic" : undefined,
            fontWeight: t[2] && t[2] & 2 ? 600 : undefined,
          }}
        >
          {t[0]}
        </span>
      ))}
    </>
  );
}

function lines(n: number, what: string) {
  return `${n.toLocaleString("en")} ${what} line${n === 1 ? "" : "s"}`;
}

/**
 * One file of a section on paper: the lines the section's refs select (with their context
 * expansion), line numbers on both sides, and markers where lines are left out. Server component.
 */
export function PrintDiff({ view, refs }: { view: FileView; refs: SectionRef[] }) {
  const { rows, full } = buildRows(view);
  const visible = selectRows(rows, refs);
  const items = layoutItems(rows, visible, view, full);
  const shown = items.some((it) => it.type === "row");
  const notes = refs.filter((r) => r.note).map((r) => r.note!);
  const message = view.binary
    ? "Binary file or diff too large to display."
    : rows.length === 0
      ? view.status === "renamed"
        ? "File renamed without changes."
        : "No changes."
      : !shown
        ? "Lines from this file belong to other sections."
        : null;

  return (
    <div className="print-file border border-black/15 bg-white" data-path={view.path}>
      <table className="diff-table diff-wrap">
        <colgroup>
          <col className="w-[44px]" />
          <col className="w-[44px]" />
          <col />
        </colgroup>
        {/* In a header group, the file name repeats at the top of every page the diff runs over. */}
        <thead>
          <tr>
            <th colSpan={3} className="print-file-head">
              <div className="flex items-center gap-2 border-b border-dashed border-line bg-paper px-3 py-1.5">
                <span className="tag shrink-0">{fileStatusLabel(view.status)}</span>
                <span className="min-w-0 flex-1 font-mono text-[11.5px] font-normal break-all text-ink">
                  {view.previousPath && view.previousPath !== view.path ? <span className="text-meta">{view.previousPath} → </span> : null}
                  {view.path}
                </span>
                <span className="font-mono text-[10.5px] font-normal whitespace-nowrap">
                  <span className="text-[#1f8a85]">+{view.additions}</span> <span className="text-danger">−{view.deletions}</span>
                </span>
              </div>
              {notes.length > 0 ? (
                <div className="border-b border-dashed border-line bg-mist/50 px-3 py-1.5 font-mono text-[10.5px] leading-[15px] font-normal text-ui">
                  {notes.map((n, i) => (
                    <p key={i}>{n}</p>
                  ))}
                </div>
              ) : null}
            </th>
          </tr>
        </thead>
        <tbody>
          {message ? (
            <tr>
              <td colSpan={3} className="px-3 py-3 font-sans text-[12px] text-muted">
                {message}
              </td>
            </tr>
          ) : (
            items.map((it, idx) => {
              if (it.type === "unknown-gap") {
                return (
                  <tr key={`u${idx}`} className="diff-hunk-header">
                    <td colSpan={2} />
                    <td>
                      {it.lines ? `⋯ ${lines(it.lines, "unchanged")}` : "⋯"}
                      {it.header ? <span className="ml-3 text-black/45">{it.header}</span> : null}
                    </td>
                  </tr>
                );
              }
              if (it.type === "gap") {
                return (
                  <tr key={`g${it.from}`} className="diff-hunk-header">
                    <td colSpan={2} />
                    <td>⋯ {rows[it.from].inHunk ? `${lines(it.hidden, "more")} from this change` : lines(it.hidden, "unchanged")}</td>
                  </tr>
                );
              }
              const row = rows[it.index];
              return (
                <tr key={it.index} className={clsx("diff-row", row.kind === "add" && "row-add", row.kind === "del" && "row-del", !row.inHunk && "row-expanded")}>
                  <td className="diff-num">{row.old ?? ""}</td>
                  <td className="diff-num">{row.new ?? ""}</td>
                  <td className="diff-code" data-marker={row.kind === "add" ? "+" : row.kind === "del" ? "−" : " "}>
                    <Code tokens={row.tokens} palette={view.palette} />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
