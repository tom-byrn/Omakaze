"use client";

import { useEffect, useState } from "react";

const CURVES = [
  { name: "Snap", token: "--ease-snap", value: "cubic-bezier(0.23, 1, 0.32, 1)", use: "Presses, swaps, reveals" },
  { name: "In-out", token: "--ease-io", value: "cubic-bezier(0.65, 0, 0.35, 1)", use: "Header and layout changes" },
];

/** The two easing curves, each moving a block across its track every 1.6 seconds. */
export function EaseDemo() {
  const [end, setEnd] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setEnd((e) => !e), 1600);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex flex-col gap-3">
      {CURVES.map((c) => (
        <div key={c.token} className="border border-black/15 bg-white">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-dashed border-line px-4 py-3">
            <span className="font-serif text-[20px] tracking-[-0.01em] text-black">{c.name}</span>
            <span className="font-mono text-[11px] text-black/60">{c.token}</span>
            <span className="font-mono text-[11px] text-black/40">{c.value}</span>
            <span className="ml-auto text-[12px] text-meta">{c.use}</span>
          </div>
          <div className="relative h-14 px-4">
            <span className="absolute inset-x-4 top-1/2 border-t border-dashed border-line" aria-hidden="true" />
            <span
              className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 bg-ink"
              style={{
                left: end ? "calc(100% - 36px)" : "16px",
                transition: `left 900ms ${c.value}`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
