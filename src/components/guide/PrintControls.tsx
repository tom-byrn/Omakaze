"use client";

import { RiArrowLeftLine, RiPrinterLine } from "@remixicon/react";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Diagrams render in the browser; give up waiting after this long and print what is there. */
const MAX_WAIT_MS = 15_000;

function pending(doc: Element): boolean {
  const diagrams = [...doc.querySelectorAll(".md-mermaid")].some((f) => !f.querySelector("svg"));
  const images = [...doc.querySelectorAll("img")].some((img) => !img.complete);
  return diagrams || images;
}

/**
 * The bar above the print layout (not printed). It waits for Mermaid diagrams and images, then
 * marks the page ready and, when opened from the Export menu, opens the browser's print dialog.
 */
export function PrintControls({ backHref, label, autoPrint }: { backHref: string; label: string; autoPrint: boolean }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const doc = document.querySelector(".print-doc");
    if (!doc) return;
    // Paper can't open a closed <details>, and lazy images may not load before printing.
    doc.querySelectorAll("details").forEach((d) => (d.open = true));
    doc.querySelectorAll("img").forEach((img) => (img.loading = "eager"));
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const check = async () => {
      await document.fonts?.ready;
      if (cancelled) return;
      if (pending(doc) && Date.now() - started < MAX_WAIT_MS) {
        timer = setTimeout(check, 150);
        return;
      }
      setReady(true);
      if (autoPrint) window.print();
    };
    timer = setTimeout(check, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [autoPrint]);

  return (
    <div
      className="print-controls sticky top-0 z-20 border-b border-dashed border-line bg-[rgba(252,252,252,0.97)] backdrop-blur-md print:hidden"
      data-print-ready={ready ? "true" : "false"}
    >
      <div className="mx-auto flex max-w-[880px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
        <Link href={backHref} className="btn btn-ghost btn-sm -ml-3">
          <RiArrowLeftLine size={14} /> Back to the guide
        </Link>
        <span className="order-last basis-full font-mono text-[10px] tracking-[0.08em] text-black/50 uppercase sm:order-none sm:basis-auto sm:flex-1">
          Print layout · {label}
          <span className="ml-3 tracking-normal normal-case" role="status">
            {ready ? "Ready to print" : "Rendering diagrams…"}
          </span>
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()} disabled={!ready}>
          <RiPrinterLine size={14} /> Print or save as PDF
        </button>
      </div>
    </div>
  );
}
