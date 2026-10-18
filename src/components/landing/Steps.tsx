"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";

const STEPS = [
  {
    label: "Connect",
    title: "Connect GitHub",
    body: "Install the GitHub App on an organization or connect with a token, then choose the repositories to follow. Everyone in the workspace sees the same pull requests.",
  },
  {
    label: "Write",
    title: "Write the guide",
    body: "Ask your coding agent to create it through the MCP server, or let the built-in model write one when a pull request opens. The guide fills in while it is written.",
  },
  {
    label: "Review",
    title: "Review in sections",
    body: "Read each explanation next to the code it covers. Expand context, jump to referenced lines and mark sections as reviewed.",
  },
  {
    label: "Comment",
    title: "Comment on GitHub",
    body: "Line comments, replies, approvals and change requests are posted to the pull request on GitHub.",
  },
];

const DURATION = 6500;

function Media({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div className="w-full max-w-[440px] border border-border-dark bg-[#101010] font-mono text-[11px] text-white/70">
        <p className="border-b border-border-dark px-4 py-2 text-[10px] tracking-[0.08em] text-white/40 uppercase">Repositories</p>
        {[
          ["acme/web", true],
          ["acme/api", true],
          ["acme/mobile", false],
          ["acme/infra", true],
        ].map(([name, on]) => (
          <div key={String(name)} className="flex items-center gap-3 border-b border-dashed border-white/10 px-4 py-2.5 last:border-b-0">
            <span className={clsx("flex h-3.5 w-3.5 items-center justify-center border", on ? "border-signal bg-signal" : "border-white/30")}>
              {on ? <span className="h-1.5 w-1.5 bg-black" /> : null}
            </span>
            {name}
            <span className="ml-auto text-[10px] text-white/35">{on ? "following" : ""}</span>
          </div>
        ))}
      </div>
    );
  }
  if (step === 1) {
    return (
      <div className="w-full max-w-[460px] border border-border-dark bg-[#101010] p-4 font-mono text-[11px] leading-[19px] text-white/70">
        <p className="text-white/40">&gt; Create a guided PR for https://github.com/acme/web/pull/412 using the Guided PRs MCP.</p>
        <p className="mt-3 text-white/85">● get_pull_request</p>
        <p className="pl-4 text-white/45">48 files · 131 hunks · head 9f2c1e0</p>
        <p className="mt-1 text-white/85">● get_diff ×3</p>
        <p className="mt-1 text-white/85">● start_guide</p>
        <p className="text-white/85">● add_section · Data model</p>
        <p className="text-white/85">● add_section · Checkout API</p>
        <p className="text-white/85">● add_section · Payment form</p>
        <p className="mt-1 text-white/85">● finish_guide</p>
        <p className="pl-4 text-teal">1,982/1,982 changed lines covered</p>
      </div>
    );
  }
  if (step === 2) {
    return (
      <div className="grid w-full max-w-[480px] grid-cols-[42%_58%] border border-border-dark bg-[#101010]">
        <div className="border-r border-dashed border-white/15 p-4">
          <p className="font-mono text-[9px] tracking-[0.08em] text-white/40 uppercase">Section 03 / 06</p>
          <p className="mt-2 font-serif text-[19px] leading-tight text-white">Checkout API</p>
          <div className="mt-3 space-y-1.5">
            {[90, 100, 70, 95, 60].map((w, i) => (
              <span key={i} className="block h-[5px] bg-white/15" style={{ width: `${w}%` }} />
            ))}
          </div>
          <span className="mt-4 inline-block border border-signal/60 px-2 py-0.5 font-mono text-[9px] text-signal">reviewed</span>
        </div>
        <div className="p-3 font-mono text-[10px] leading-[17px]">
          {["ctx", "add", "add", "del", "add", "ctx", "add", "ctx"].map((k, i) => (
            <div key={i} className={clsx("flex gap-2 px-1", k === "add" && "bg-teal/15", k === "del" && "bg-[#bf000f]/20")}>
              <span className="w-5 text-right text-white/30">{40 + i}</span>
              <span className="h-[5px] self-center bg-white/25" style={{ width: `${30 + ((i * 37) % 60)}%` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="w-full max-w-[440px] border border-border-dark bg-[#101010] p-4 font-sans">
      <div className="flex gap-2 font-mono text-[10px] leading-[17px]">
        <span className="w-6 text-right text-white/30">88</span>
        <span className="text-white/70">if (total &lt;= 0) throw new CheckoutError()</span>
      </div>
      <div className="mt-3 border border-white/15 bg-black/30 p-3">
        <p className="text-[12px] text-white/85">Should a zero total skip payment instead of throwing?</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="bg-white px-2.5 py-1 font-serif text-[11px] text-ink">Comment on GitHub</span>
          <span className="font-mono text-[10px] text-teal">✓ posted to acme/web#412</span>
        </div>
      </div>
    </div>
  );
}

export function Steps() {
  const [active, setActive] = useState(0);
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setActive((a) => (a + 1) % STEPS.length);
      setCycle((c) => c + 1);
    }, DURATION);
    return () => clearTimeout(t);
  }, [active, cycle]);
  return (
    <div className="grid grid-cols-1 border border-border-dark lg:grid-cols-2">
      <div className="p-6 md:p-10">
        <span className="eyebrow eyebrow-dark">How it works</span>
        <h2 className="mt-6 font-serif text-[36px] leading-none tracking-[-1.44px] text-white sm:text-[44px] sm:tracking-[-0.025em]">
          Four steps.
          <br />
          One review.
        </h2>
        <div className="mt-10 flex flex-col">
          {STEPS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                setActive(i);
                setCycle((c) => c + 1);
              }}
              className="group py-5 text-left"
              aria-expanded={active === i}
            >
              <span className="flex items-center gap-2">
                <span className={clsx("dot h-[5px] w-[5px]", active === i ? "bg-signal" : "bg-[rgba(206,206,206,0.5)]")} />
                <span className={clsx("text-[12px] tracking-[0.025em] uppercase", active === i ? "text-white" : "text-[rgba(206,206,206,0.7)]")}>
                  {String(i + 1).padStart(2, "0")} · {s.label}
                </span>
              </span>
              <span className="relative mt-3 block h-px bg-rule-dark">
                {active === i ? (
                  <span
                    key={cycle}
                    className="absolute inset-0 bg-white"
                    style={{ animation: `tab-cycle-progress ${DURATION}ms linear forwards` }}
                  />
                ) : null}
              </span>
              <span className={clsx("mt-4 block font-serif text-[26px] leading-[1.1] tracking-[-0.025em] lg:text-[32px]", active === i ? "text-white" : "text-white/45 group-hover:text-white/70")}>
                {s.title}
              </span>
              <span
                className={clsx(
                  "grid transition-[grid-template-rows,opacity] duration-500 ease-io",
                  active === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
              >
                <span className="overflow-hidden">
                  <span className="mt-3 block max-w-[480px] text-[16px] leading-[26px] tracking-[-0.4px] text-[#a0a0a0]">{s.body}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="relative flex min-h-[420px] items-center justify-center border-t border-border-dark bg-panel-dark p-8 lg:border-t-0 lg:border-l">
        <div className="pointer-events-none absolute inset-6 border border-dashed border-white/10" aria-hidden="true" />
        <div key={active} className="relative flex w-full justify-center animate-reveal">
          <Media step={active} />
        </div>
      </div>
    </div>
  );
}
