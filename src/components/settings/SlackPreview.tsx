"use client";

import clsx from "clsx";
import { useId, useState } from "react";
import { LogoMark } from "@/components/ui/Logo";
import { parseMrkdwn, type MrkdwnNode, type SlackBlock } from "@/lib/notifications/slack";

export type PreviewMessage = { label: string; blocks: SlackBlock[] };

function Inline({ nodes }: { nodes: MrkdwnNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case "text":
            return <span key={i}>{n.text}</span>;
          case "code":
            return (
              <code key={i} className="border border-black/10 bg-wash px-1 font-mono text-[12px] text-danger">
                {n.text}
              </code>
            );
          case "bold":
            return (
              <strong key={i} className="font-semibold">
                <Inline nodes={n.children} />
              </strong>
            );
          case "italic":
            return (
              <em key={i}>
                <Inline nodes={n.children} />
              </em>
            );
          case "link":
            return (
              <a key={i} href={n.url} target="_blank" rel="noreferrer" className="text-blue-bright hover:underline">
                <Inline nodes={n.children} />
              </a>
            );
        }
      })}
    </>
  );
}

function Mrkdwn({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {parseMrkdwn(text).map((line, i) =>
        line.quote ? (
          <div key={i} className="border-l-4 border-black/15 pl-3 text-ui">
            <Inline nodes={line.nodes} />
          </div>
        ) : (
          <div key={i} className="min-h-[1lh]">
            <Inline nodes={line.nodes} />
          </div>
        ),
      )}
    </div>
  );
}

function Block({ block }: { block: SlackBlock }) {
  switch (block.type) {
    case "section":
      return <Mrkdwn text={block.text.text} className="text-[14px] leading-[22px] text-fg" />;
    case "context":
      return (
        <div className="flex flex-wrap gap-2 text-[12px] leading-[18px] text-meta">
          {block.elements.map((e, i) => (
            <Mrkdwn key={i} text={e.text} />
          ))}
        </div>
      );
    case "actions":
      return (
        <div className="flex flex-wrap gap-2">
          {block.elements.map((b, i) => (
            <a
              key={i}
              href={b.url}
              target="_blank"
              rel="noreferrer"
              className={clsx(
                "inline-flex h-7 items-center border px-3 text-[13px] font-medium",
                b.style === "primary" ? "border-[#007a5a] bg-[#007a5a] text-white" : "border-black/25 bg-white text-fg hover:bg-wash",
              )}
            >
              {b.text.text}
            </a>
          ))}
        </div>
      );
    case "divider":
      return <hr className="border-dashed border-line" />;
  }
}

/** How the messages look in Slack, rendered from their Block Kit blocks. One tab per event. */
export function SlackPreview({ messages, time }: { messages: PreviewMessage[]; time: string }) {
  const [active, setActive] = useState(0);
  const id = useId();
  const message = messages[active];
  return (
    <figure className="flex flex-col border border-black/15 bg-white" aria-label="Slack message preview">
      <div role="tablist" aria-label="Event" className="flex overflow-x-auto border-b border-dashed border-line">
        {messages.map((m, i) => (
          <button
            key={m.label}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel`}
            onClick={() => setActive(i)}
            className={clsx(
              "-mb-px shrink-0 border-b px-4 py-2.5 text-[13px] transition-colors",
              i === active ? "border-ink text-ink" : "border-transparent text-nav hover:text-ink",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${active}`} className="flex gap-3 px-4 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-black/10 bg-paper">
          <LogoMark size={24} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="flex items-baseline gap-2 text-[14px]">
            <span className="font-semibold text-fg">Omakaze</span>
            <span className="border border-black/15 px-1 font-mono text-[9px] uppercase tracking-[0.06em] text-meta">App</span>
            <span className="text-[12px] text-meta">{time}</span>
          </p>
          {message.blocks.map((b, i) => (
            <Block key={i} block={b} />
          ))}
        </div>
      </div>
      <details className="border-t border-dashed border-line px-4 py-2.5">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.08em] text-black/60">Block Kit JSON</summary>
        <pre className="mt-2 max-h-[320px] overflow-auto bg-wash p-3 font-mono text-[11px] leading-[16px] text-alt-ink">
          {JSON.stringify({ blocks: message.blocks }, null, 2)}
        </pre>
      </details>
    </figure>
  );
}
