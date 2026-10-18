"use client";

import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { useState } from "react";

export function CodeCopy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy code"
      className="inline-flex items-center gap-1 text-black/45 hover:text-ink"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? <RiCheckLine size={13} /> : <RiFileCopyLine size={13} />}
    </button>
  );
}
