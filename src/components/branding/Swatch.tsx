"use client";

import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import clsx from "clsx";
import { useState } from "react";

export type Color = { name: string; hex: string; use: string };

/** One brand color. Clicking it copies the hex value. */
export function Swatch({ color, dark = false }: { color: Color; dark?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(color.hex);
    } catch {
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={clsx(
        "press group flex flex-col border text-left",
        dark ? "border-border-dark bg-panel-dark" : "border-black/15 bg-white",
      )}
      aria-label={`Copy ${color.name} ${color.hex}`}
    >
      <span className="relative block h-28 w-full border-b border-black/10" style={{ background: color.hex }}>
        <span
          className={clsx(
            "absolute top-2 right-2 flex h-6 w-6 items-center justify-center border bg-white text-ink transition-opacity duration-150",
            copied ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            "border-black/15",
          )}
          aria-hidden="true"
        >
          {copied ? <RiCheckLine size={13} /> : <RiFileCopyLine size={13} />}
        </span>
      </span>
      <span className="flex flex-col gap-1 px-3 pt-3 pb-3.5">
        <span className={clsx("font-serif text-[18px] leading-[1.1] tracking-[-0.01em]", dark ? "text-white" : "text-black")}>
          {color.name}
        </span>
        <span className={clsx("font-mono text-[11px] tracking-[0.04em] uppercase", dark ? "text-white/60" : "text-black/60")}>
          {copied ? "Copied" : color.hex}
        </span>
        <span className={clsx("mt-1 text-[12px] leading-[17px]", dark ? "text-white/45" : "text-meta")}>{color.use}</span>
      </span>
    </button>
  );
}
