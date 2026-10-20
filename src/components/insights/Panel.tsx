import { RiDownload2Line } from "@remixicon/react";
import clsx from "clsx";
import type { ReactNode } from "react";
import type { GuideOrigin } from "@/lib/insights/model";

/**
 * Categorical colors of the guide sources, in this fixed order (validated for color-vision
 * deficiencies as adjacent stacked segments). The same source has the same color in every chart.
 */
export const ORIGIN_COLORS: Record<GuideOrigin, string> = {
  mcp: "#147dba",
  ai: "#eb6834",
  chatgpt: "#1baf7a",
  api: "#eda100",
  manual: "#7c4dd8",
};

/** One card of the insights page, with its CSV download. */
export function Panel({
  id,
  title,
  description,
  csv,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  csv?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={clsx("flex min-w-0 flex-col border border-solid border-black/15 bg-white", className)}>
      <header className="flex items-start justify-between gap-4 border-b border-dashed border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-serif text-[21px] leading-tight tracking-[-0.015em] text-black">
            {title}
          </h2>
          {description ? <p className="mt-1 text-[13px] leading-[19px] text-muted">{description}</p> : null}
        </div>
        {csv ? (
          <a href={csv} download className="btn btn-ghost btn-xs shrink-0" aria-label={`Download ${title} as CSV`}>
            <RiDownload2Line size={13} aria-hidden="true" /> CSV
          </a>
        ) : null}
      </header>
      <div className="flex min-w-0 flex-1 flex-col px-5 py-5">{children}</div>
    </section>
  );
}

/** What a panel shows when the range has nothing to count. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return <p className="flex min-h-[120px] flex-1 items-center justify-center border border-dashed border-line px-6 py-8 text-center text-[13px] text-muted">{children}</p>;
}

/** The table behind a chart, folded away under the chart. */
export function ChartTable({ head, rows, label }: { head: string[]; rows: ReactNode[][]; label: string }) {
  return (
    <details className="mt-4 border-t border-dashed border-line pt-3">
      <summary className="mono-label w-fit cursor-pointer select-none hover:text-ink">Show table</summary>
      <div className="mt-3 overflow-x-auto">
        <DataTable head={head} rows={rows} label={label} />
      </div>
    </details>
  );
}

/**
 * A plain table: the first column is text, the others are numbers. `widths` fixes the widths of the
 * other columns (CSS lengths), so long first cells truncate instead of widening the table.
 */
export function DataTable({
  head,
  rows,
  label,
  className,
  widths,
}: {
  head: ReactNode[];
  rows: ReactNode[][];
  label: string;
  className?: string;
  widths?: string[];
}) {
  return (
    <table className={clsx("w-full border-collapse text-[12.5px]", widths && "table-fixed", className)} aria-label={label}>
      {widths ? (
        <colgroup>
          <col />
          {widths.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
      ) : null}
      <thead>
        <tr className="border-b border-solid border-black/15">
          {head.map((h, i) => (
            <th key={i} scope="col" className={clsx("mono-label py-2 font-normal", i === 0 ? "pr-3 text-left" : "px-2 text-right whitespace-nowrap")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-dashed border-line last:border-b-0">
            {r.map((cell, j) =>
              j === 0 ? (
                <th key={j} scope="row" className="py-2 pr-3 text-left font-normal text-text">
                  {cell}
                </th>
              ) : (
                <td key={j} className="px-2 py-2 text-right font-mono text-[12px] text-ink tabular-nums">
                  {cell}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A headline number. */
export function Stat({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="font-serif text-[30px] leading-none tracking-[-0.03em] text-stat">{value}</p>
      <p className="mt-2 text-[13px] text-muted">{label}</p>
      {note ? <p className="mt-0.5 font-mono text-[10.5px] text-meta">{note}</p> : null}
    </div>
  );
}
