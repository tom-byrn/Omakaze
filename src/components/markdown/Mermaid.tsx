"use client";

import { useEffect, useId, useState } from "react";

let initialized: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  initialized ??= import("mermaid").then((m) => {
    m.default.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
      themeVariables: {
        fontSize: "13px",
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
      },
      flowchart: { curve: "basis", htmlLabels: true, useMaxWidth: false },
      sequence: { useMaxWidth: false },
      er: { useMaxWidth: false },
      state: { useMaxWidth: false },
      class: { useMaxWidth: false },
      gantt: { useMaxWidth: false },
    });
    return m.default;
  });
  return initialized;
}

export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then((mermaid) => mermaid.render(`mmd-${id}`, chart))
      .then((res) => !cancelled && setSvg(res.svg))
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
      {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="h-24 animate-pulse bg-black/[0.03]" />}
    </figure>
  );
}
