"use client";

import { RiExpandDiagonalLine } from "@remixicon/react";
import { useEffect, useId, useMemo, useState } from "react";
import { MermaidDialog } from "./MermaidDialog";

type MermaidApi = typeof import("mermaid").default;

const LIGHT_VARIABLES = {
  primaryColor: "#fcfcfc",
  primaryBorderColor: "#141518",
  primaryTextColor: "#141518",
  secondaryColor: "#eaebf1",
  secondaryBorderColor: "#141518",
  tertiaryColor: "#ffffff",
  tertiaryBorderColor: "#a8a8a8",
  lineColor: "#565656",
  textColor: "#141518",
  noteBkgColor: "#eaebf1",
  noteBorderColor: "#a8a8a8",
  actorBkg: "#fcfcfc",
  actorBorder: "#141518",
  signalColor: "#141518",
  labelBoxBkgColor: "#eaebf1",
  edgeLabelBackground: "#fcfcfc",
  clusterBkg: "#f4f4f3",
  clusterBorder: "#d4d4d4",
};

// The dark theme's tokens (globals.css).
const DARK_VARIABLES = {
  darkMode: true,
  primaryColor: "#17181b",
  primaryBorderColor: "#ededee",
  primaryTextColor: "#ededee",
  secondaryColor: "#1a1d24",
  secondaryBorderColor: "#ededee",
  tertiaryColor: "#17181b",
  tertiaryBorderColor: "#4c4c51",
  lineColor: "#a9a9ac",
  textColor: "#ededee",
  noteBkgColor: "#1a1d24",
  noteBorderColor: "#4c4c51",
  noteTextColor: "#ededee",
  actorBkg: "#101113",
  actorBorder: "#ededee",
  actorTextColor: "#ededee",
  signalColor: "#ededee",
  signalTextColor: "#ededee",
  labelBoxBkgColor: "#1a1d24",
  labelTextColor: "#ededee",
  edgeLabelBackground: "#101113",
  clusterBkg: "#1a1b1e",
  clusterBorder: "#2e2f33",
};

let loaded: Promise<MermaidApi> | null = null;
// initialize() is global, so renders run one at a time, each after configuring its theme.
let queue: Promise<unknown> = Promise.resolve();

function configure(mermaid: MermaidApi, themeVariables: Record<string, string | boolean>) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
    themeVariables: { fontSize: "13px", ...themeVariables },
    flowchart: { curve: "basis", htmlLabels: true, useMaxWidth: false },
    sequence: { useMaxWidth: false },
    er: { useMaxWidth: false },
    state: { useMaxWidth: false },
    class: { useMaxWidth: false },
    gantt: { useMaxWidth: false },
  });
}

/** Renders the chart for the light and the dark theme; CSS shows the one that matches. */
function renderBoth(id: string, chart: string): Promise<{ light: string; dark: string }> {
  loaded ??= import("mermaid").then((m) => m.default);
  const job = queue.then(async () => {
    const mermaid = await loaded!;
    configure(mermaid, LIGHT_VARIABLES);
    const light = (await mermaid.render(`mmd-${id}`, chart)).svg;
    configure(mermaid, DARK_VARIABLES);
    const dark = (await mermaid.render(`mmd-${id}-dark`, chart)).svg;
    return { light, dark };
  });
  queue = job.catch(() => {});
  return job;
}

/** Copies of the charts with their ids renamed, so the full view doesn't clash with the inline ones. */
function fullViewCopies(id: string, svg: { light: string; dark: string }) {
  const prefix = `mmd-${id}`;
  return { light: svg.light.replaceAll(prefix, `${prefix}-full`), dark: svg.dark.replaceAll(prefix, `${prefix}-full`) };
}

export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<{ light: string; dark: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const full = useMemo(() => (open && svg ? fullViewCopies(id, svg) : null), [open, svg, id]);
  useEffect(() => {
    let cancelled = false;
    renderBoth(id, chart)
      .then((res) => !cancelled && setSvg(res))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [chart, id]);
  if (error) {
    return (
      <div className="md-mermaid-error">
        <p className="mono-label">Diagram could not be rendered</p>
        <pre>{chart}</pre>
      </div>
    );
  }
  return (
    <figure
      className={svg ? "md-mermaid md-mermaid-ready" : "md-mermaid"}
      aria-label="Diagram"
      // Anywhere on the diagram opens the full view, unless the reader was selecting its text.
      // (Clicks inside the full view bubble here through the portal; they aren't on the figure.)
      onClick={(e) => {
        if (svg && e.currentTarget.contains(e.target as Node) && !window.getSelection()?.toString()) setOpen(true);
      }}
    >
      <div className="md-mermaid-scroll">
        {svg ? (
          <>
            <div className="mermaid-light" dangerouslySetInnerHTML={{ __html: svg.light }} />
            <div className="mermaid-dark" dangerouslySetInnerHTML={{ __html: svg.dark }} />
          </>
        ) : (
          <div className="h-24 animate-pulse bg-black/[0.03]" />
        )}
      </div>
      {svg && (
        <button
          type="button"
          className="md-mermaid-expand"
          aria-label="Open diagram in full view"
          aria-haspopup="dialog"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <RiExpandDiagonalLine size={13} aria-hidden /> Expand
        </button>
      )}
      {full && <MermaidDialog svg={full} onClose={() => setOpen(false)} />}
    </figure>
  );
}
