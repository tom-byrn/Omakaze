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
  return (
    <button type="button" onClick={copy} className={className} data-copied={copied || undefined}>
      {icon ? copied ? <RiCheckLine size={14} /> : <RiFileCopyLine size={14} /> : null}
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}
