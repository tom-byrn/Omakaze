"use client";

import { useEffect, useId, useState } from "react";

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

export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<{ light: string; dark: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    <figure className="md-mermaid" aria-label="Diagram">
      {svg ? (
        <>
          <div className="mermaid-light" dangerouslySetInnerHTML={{ __html: svg.light }} />
          <div className="mermaid-dark" dangerouslySetInnerHTML={{ __html: svg.dark }} />
        </>
      ) : (
        <div className="h-24 animate-pulse bg-black/[0.03]" />
      )}
    </figure>
  );
}
