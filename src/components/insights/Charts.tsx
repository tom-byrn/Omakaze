/**
 * Small server-rendered SVG charts for the insights page. Each chart is drawn at two widths (phones
 * and everything else) so text stays at its real size, has a legend for two or more series, a
 * tooltip per column (a native <title>, and a box shown on hover), and a table next to it.
 */
import clsx from "clsx";
import type { ReactNode } from "react";
import { compactNumber, labelEvery, niceTicks, textWidth } from "@/lib/insights/chart";

export type ChartSeries = { key: string; label: string; color: string; marker?: "circle" | "square" };

export type ChartColumn = {
  /** Tooltip heading, e.g. "Week of Oct 13". */
  label: string;
  /** Under the axis, e.g. "Oct 13". Thinned out when columns are narrow. */
  axis: string;
  values: Record<string, number | null>;
};

type ChartProps = {
  /** Accessible name of the chart. */
  label: string;
  series: ChartSeries[];
  columns: ChartColumn[];
  /** Values in tooltips. */
  format?: (n: number) => string;
  /** Y axis ticks. */
  tick?: (n: number) => string;
  /** Counts: no fractional ticks. */
  integer?: boolean;
  /** Tooltip line under the series, e.g. the column total. */
  footer?: (c: ChartColumn) => string | null;
  height?: number;
};

const WIDE = 560;
const NARROW = 340;
const M = { left: 40, right: 8, top: 10, bottom: 24 };

/** Both variants; CSS shows the one that fits. */
function Responsive({ render, name }: { render: (width: number) => ReactNode; name: string }) {
  return (
    <div data-chart={name}>
      <div className="hidden sm:block" data-chart-variant="wide">
        {render(WIDE)}
      </div>
      <div className="sm:hidden" data-chart-variant="narrow">
        {render(NARROW)}
      </div>
    </div>
  );
}

type Frame = {
  width: number;
  height: number;
  plotW: number;
  plotH: number;
  band: number;
  ticks: number[];
  x: (i: number) => number;
  center: (i: number) => number;
  y: (v: number) => number;
};

function frame(width: number, height: number, n: number, max: number, integer?: boolean): Frame {
  const plotW = width - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const band = plotW / Math.max(1, n);
  const ticks = niceTicks(max, height < 160 ? 3 : 4, { integer });
  const top = ticks[ticks.length - 1];
  return {
    width,
    height,
    plotW,
    plotH,
    band,
    ticks,
    x: (i) => M.left + band * i,
    center: (i) => M.left + band * (i + 0.5),
    y: (v) => M.top + plotH - (Math.max(0, v) / top) * plotH,
  };
}

function Axes({ f, columns, tick }: { f: Frame; columns: ChartColumn[]; tick: (n: number) => string }) {
  const labelled = labelEvery(columns.length, 46 / f.band);
  return (
    <g aria-hidden="true">
      {f.ticks.map((t, i) => (
        <g key={t}>
          <line
            x1={M.left}
            x2={f.width - M.right}
            y1={f.y(t)}
            y2={f.y(t)}
            className={i === 0 ? "stroke-black/30" : "stroke-black/[0.07]"}
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
          <text x={M.left - 6} y={f.y(t) + 3.5} textAnchor="end" fontSize={10} className="fill-meta font-mono">
            {tick(t)}
          </text>
        </g>
      ))}
      {columns.map((c, i) =>
        labelled.has(i) ? (
          <text key={i} x={f.center(i)} y={f.height - 7} textAnchor="middle" fontSize={10} className="fill-meta font-mono">
            {c.axis}
          </text>
        ) : null,
      )}
    </g>
  );
}

type TipLine = { key?: ChartSeries; value: string; label: string };

/** The hover box for one column: values first, then what they are. */
function Tip({ f, i, heading, lines }: { f: Frame; i: number; heading: string; lines: TipLine[] }) {
  const pad = 8;
  const lh = 16;
  const w = Math.max(textWidth(heading), ...lines.map((l) => textWidth(`${l.value} ${l.label}`) + (l.key ? 16 : 0))) + pad * 2;
  const h = (lines.length + 1) * lh + pad;
  const right = f.center(i) + 10;
  const left = right + w > f.width - 2 ? Math.max(2, f.center(i) - 10 - w) : right;
  return (
    <g className="pointer-events-none opacity-0 transition-opacity duration-100 group-hover:opacity-100" aria-hidden="true">
      <rect x={left} y={M.top} width={w} height={h} className="fill-white stroke-black/30" shapeRendering="crispEdges" />
      <text x={left + pad} y={M.top + pad + 9} fontSize={10} className="fill-meta font-mono uppercase" letterSpacing="0.06em">
        {heading}
      </text>
      {lines.map((l, j) => {
        const base = M.top + pad + (j + 1) * lh + 9;
        return (
          <g key={j}>
            {l.key ? <Key series={l.key} x={left + pad} y={base - 4} /> : null}
            <text x={left + pad + (l.key ? 16 : 0)} y={base} fontSize={11}>
              <tspan className="fill-ink" fontWeight={500}>
                {l.value}
              </tspan>
              <tspan className="fill-ui"> {l.label}</tspan>
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Series key in tooltips: a square for bars, a short line for lines. */
function Key({ series, x, y }: { series: ChartSeries; x: number; y: number }) {
  return series.marker ? (
    <line x1={x} x2={x + 10} y1={y} y2={y} style={{ stroke: series.color }} strokeWidth={2} />
  ) : (
    <rect x={x + 1} y={y - 4} width={8} height={8} style={{ fill: series.color }} />
  );
}

function columnTitle(c: ChartColumn, series: ChartSeries[], format: (n: number) => string, footer?: string | null): string {
  const parts = series.map((s) => `${s.label}: ${c.values[s.key] === null ? "–" : format(c.values[s.key] ?? 0)}`);
  return `${c.label}. ${parts.join(", ")}${footer ? `. ${footer}` : ""}`;
}

/** Hover targets: the whole column band, with a wash, a <title> and the tooltip. */
function HitLayer({
  f,
  columns,
  series,
  format,
  footer,
  crosshair,
  onlyNonZero,
}: {
  f: Frame;
  columns: ChartColumn[];
  series: ChartSeries[];
  format: (n: number) => string;
  footer?: (c: ChartColumn) => string | null;
  crosshair?: boolean;
  onlyNonZero?: boolean;
}) {
  return (
    <g>
      {columns.map((c, i) => {
        const foot = footer?.(c) ?? null;
        const lines: TipLine[] = series
          .filter((s) => !onlyNonZero || (c.values[s.key] ?? 0) > 0)
          .map((s) => ({ key: series.length > 1 ? s : undefined, value: c.values[s.key] === null ? "–" : format(c.values[s.key] ?? 0), label: s.label }));
        if (foot) lines.push({ value: foot, label: "" });
        if (lines.length === 0) lines.push({ value: format(0), label: "" });
        return (
          <g key={i} className="group" data-column={i}>
            <title>{columnTitle(c, series, format, foot)}</title>
            <rect x={f.x(i)} y={M.top} width={f.band} height={f.plotH} className="fill-transparent group-hover:fill-black/[0.035]" data-hit="" />
            {crosshair ? (
              <line
                x1={f.center(i)}
                x2={f.center(i)}
                y1={M.top}
                y2={M.top + f.plotH}
                strokeWidth={1}
                className="pointer-events-none stroke-black/25 opacity-0 group-hover:opacity-100"
                shapeRendering="crispEdges"
              />
            ) : null}
            <Tip f={f} i={i} heading={c.label} lines={lines} />
          </g>
        );
      })}
    </g>
  );
}

/** Stacked columns, one stack per time bucket or bin. */
export function ColumnChart({ label, series, columns, format = compactNumber, tick = compactNumber, integer, footer, height = 190 }: ChartProps) {
  const max = Math.max(0, ...columns.map((c) => series.reduce((n, s) => n + (c.values[s.key] ?? 0), 0)));
  const render = (width: number) => {
    const f = frame(width, height, columns.length, max, integer);
    // Bars leave air in their slot, at most 24px wide.
    const barW = Math.max(2, Math.min(24, f.band * 0.7));
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={label} className="block h-auto w-full overflow-visible">
        <Axes f={f} columns={columns} tick={tick} />
        <g>
          {columns.map((c, i) => {
            let base = f.y(0);
            const parts = series.map((s) => ({ s, v: c.values[s.key] ?? 0 })).filter((p) => p.v > 0);
            return parts.map((p, j) => {
              const top = f.y(series.slice(0, series.indexOf(p.s) + 1).reduce((n, s) => n + (c.values[s.key] ?? 0), 0));
              const h = base - top;
              // A 2px gap in the surface color separates stacked segments.
              const gap = j < parts.length - 1 && h > 3 ? 2 : 0;
              const rect = (
                <rect key={p.s.key} x={f.center(i) - barW / 2} y={top + gap} width={barW} height={Math.max(1, h - gap)} style={{ fill: p.s.color }} shapeRendering="crispEdges" />
              );
              base = top;
              return rect;
            });
          })}
        </g>
        <HitLayer f={f} columns={columns} series={series} format={format} footer={footer} onlyNonZero={series.length > 1} />
      </svg>
    );
  };
  return <Responsive render={render} name={label} />;
}

/** Lines over time; null values leave a gap. */
export function LineChart({ label, series, columns, format = compactNumber, tick = compactNumber, integer, footer, height = 190 }: ChartProps) {
  const max = Math.max(0, ...columns.flatMap((c) => series.map((s) => c.values[s.key] ?? 0)));
  const render = (width: number) => {
    const f = frame(width, height, columns.length, max, integer);
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={label} className="block h-auto w-full overflow-visible">
        <Axes f={f} columns={columns} tick={tick} />
        {series.map((s) => {
          const segments: [number, number][][] = [];
          let current: [number, number][] = [];
          columns.forEach((c, i) => {
            const v = c.values[s.key];
            if (v === null || v === undefined) {
              if (current.length) segments.push(current);
              current = [];
            } else current.push([f.center(i), f.y(v)]);
          });
          if (current.length) segments.push(current);
          return (
            <g key={s.key}>
              {segments
                .filter((seg) => seg.length > 1)
                .map((seg, k) => (
                  <polyline key={k} points={seg.map((p) => p.join(",")).join(" ")} fill="none" style={{ stroke: s.color }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                ))}
              {segments.flat().map(([x, y], k) =>
                s.marker === "square" ? (
                  <rect key={k} x={x - 4} y={y - 4} width={8} height={8} style={{ fill: s.color }} className="stroke-white" strokeWidth={2} />
                ) : (
                  <circle key={k} cx={x} cy={y} r={4} style={{ fill: s.color }} className="stroke-white" strokeWidth={2} />
                ),
              )}
            </g>
          );
        })}
        <HitLayer f={f} columns={columns} series={series} format={format} footer={footer} crosshair />
      </svg>
    );
  };
  return <Responsive render={render} name={label} />;
}

/**
 * Legend: the same mark as the chart, then the label in text color. Shown for two or more series,
 * or from `minimum` when one series still needs a name (a source among several possible ones).
 */
export function Legend({ series, className, minimum = 2 }: { series: ChartSeries[]; className?: string; minimum?: number }) {
  if (series.length < minimum) return null;
  return (
    <ul className={clsx("flex flex-wrap gap-x-4 gap-y-1.5", className)} aria-label="Legend">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 text-[12px] text-ui">
          {s.marker ? (
            <svg width="16" height="10" aria-hidden="true">
              <line x1="0" x2="16" y1="5" y2="5" style={{ stroke: s.color }} strokeWidth="2" />
              {s.marker === "square" ? <rect x="4.5" y="1.5" width="7" height="7" style={{ fill: s.color }} /> : <circle cx="8" cy="5" r="3.5" style={{ fill: s.color }} />}
            </svg>
          ) : (
            <span className="inline-block h-2.5 w-2.5" style={{ background: s.color }} aria-hidden="true" />
          )}
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** A horizontal bar for a value in a table row, relative to the largest value. */
export function InlineBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const width = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return (
    <span className={clsx("block h-1.5 w-full bg-black/[0.05]", className)} aria-hidden="true">
      <span className="block h-full bg-ink" style={{ width: `${width}%` }} />
    </span>
  );
}

/** Parts of a whole in one bar, separated by 2px gaps, with a labelled key below. */
export function ShareBar({ parts, label }: { parts: { key: string; label: string; value: number; color: string }[]; label: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div>
      <div className="flex h-6 w-full gap-[2px] bg-white" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.value}`).join(", ")}`}>
        {total === 0 ? (
          <span className="block h-full w-full bg-black/[0.05]" />
        ) : (
          shown.map((p) => (
            <span
              key={p.key}
              className="block h-full"
              style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
              title={`${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`}
            />
          ))
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5 text-[12px] text-ui">
            <span className="inline-block h-2.5 w-2.5" style={{ background: p.color }} aria-hidden="true" />
            <span className="font-medium text-ink">{p.value}</span> {p.label}
            {total > 0 ? <span className="font-mono text-[11px] text-meta">{Math.round((p.value / total) * 100)}%</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
