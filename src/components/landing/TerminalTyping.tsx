"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

export type TerminalLine = { text: string; command: boolean };

const LINE_PAUSE = 450;
const OUTPUT_DELAY = 350;

/** Types out shell commands one character at a time once the block scrolls into view. */
export function TerminalTyping({ lines, className }: { lines: TerminalLine[]; className?: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const [started, setStarted] = useState(false);
  const [pos, setPos] = useState({ line: 0, char: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          const last = lines.length - 1;
          setPos({ line: last, char: lines[last]?.text.length ?? 0 });
        }
        setStarted(true);
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [lines]);

  useEffect(() => {
    const current = lines[pos.line];
    if (!started || !current) return;
    const lineDone = pos.char >= current.text.length;
    if (lineDone && pos.line === lines.length - 1) return;
    const timer = window.setTimeout(
      () => {
        if (lineDone) setPos({ line: pos.line + 1, char: 0 });
        else if (current.command) setPos({ line: pos.line, char: pos.char + 1 });
        else setPos({ line: pos.line, char: current.text.length });
      },
      lineDone ? LINE_PAUSE : current.command ? 25 + Math.random() * 45 : OUTPUT_DELAY,
    );
    return () => window.clearTimeout(timer);
  }, [started, pos, lines]);

  const typing = started && pos.char < (lines[pos.line]?.text.length ?? 0);

  return (
    <pre ref={ref} className={className}>
      <span className="sr-only select-none">{lines.map((l) => (l.command ? `$ ${l.text}` : l.text)).join("\n")}</span>
      <span aria-hidden="true">
        {lines.map((l, i) => {
          const shown = i < pos.line ? l.text.length : i === pos.line ? pos.char : 0;
          return (
            <span key={i} className={clsx("block", i > pos.line && "invisible")}>
              {l.command ? <span className="text-black/35">$ </span> : null}
              <span className={l.command ? undefined : "text-black/40"}>{l.text.slice(0, shown)}</span>
              {i === pos.line ? (
                <span className="relative inline-block h-[1lh] w-0 align-top">
                  <span className={clsx("absolute top-[3px] left-0 h-[18px] w-[0.6em] bg-ink/70", !typing && "animate-caret")} />
                </span>
              ) : null}
              <span className="invisible">{l.text.slice(shown)}</span>
            </span>
          );
        })}
      </span>
    </pre>
  );
}
