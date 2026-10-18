"use client";

import clsx from "clsx";
import { useState } from "react";
import { CopyButton } from "@/components/ui/CopyButton";

export function McpClientTabs({ mcpUrl }: { mcpUrl: string }) {
  const clients = [
    { id: "claude", label: "Claude Code", snippet: `claude mcp add --transport http omakaze ${mcpUrl}` },
    { id: "codex", label: "Codex", snippet: `codex mcp add omakaze --url ${mcpUrl}` },
    {
      id: "cursor",
      label: "Cursor",
      snippet: JSON.stringify({ mcpServers: { omakaze: { url: mcpUrl } } }, null, 2),
    },
    {
      id: "vscode",
      label: "VS Code",
      snippet: JSON.stringify({ servers: { omakaze: { type: "http", url: mcpUrl } } }, null, 2),
    },
    {
      id: "token",
      label: "With a token",
      snippet: `claude mcp add --transport http omakaze ${mcpUrl} \\\n  --header "Authorization: Bearer <your token>"`,
    },
  ];
  const [active, setActive] = useState(clients[0].id);
  const current = clients.find((c) => c.id === active) ?? clients[0];
  return (
    <div>
      <p className="field-label">Add to your client</p>
      <div className="flex flex-wrap border border-tab">
        {clients.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActive(c.id)}
            className={clsx(
              "h-9 px-3 font-serif text-[14px]",
              i > 0 && "border-l border-tab",
              active === c.id ? "bg-ink text-[#f2f2f2]" : "bg-paper text-black hover:bg-black/[0.03]",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="relative border border-t-0 border-tab bg-white">
        <pre className="overflow-auto p-3 pr-28 font-mono text-[12px] leading-[18px] text-ink">{current.snippet}</pre>
        <div className="absolute top-2 right-2">
          <CopyButton text={current.snippet} label="Copy" className="btn btn-secondary btn-xs" />
        </div>
      </div>
    </div>
  );
}
