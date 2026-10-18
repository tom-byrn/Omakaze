"use client";

import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { useState } from "react";

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  className = "btn btn-secondary btn-sm",
  icon = true,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  icon?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  const state = copied ? "b" : "a";
  return (
    <button type="button" onClick={copy} className={className} data-copied={copied || undefined}>
      {icon ? (
        <span className="swap swap-icon" data-state={state} aria-hidden="true">
          <RiFileCopyLine size={14} className="swap-a" />
          <RiCheckLine size={14} className="swap-b" />
        </span>
      ) : null}
      {/* Both labels share one grid cell, so the button is always as wide as the longer one. */}
      <span className="swap" data-state={state}>
        <span className="swap-a" aria-hidden={copied || undefined}>
          {label}
        </span>
        <span className="swap-b" aria-hidden={!copied || undefined}>
          {copiedLabel}
        </span>
      </span>
    </button>
  );
}
