import { RiArrowRightUpLine, RiCheckboxBlankCircleLine, RiCheckboxCircleFill, RiErrorWarningFill, RiErrorWarningLine, RiFileEditLine, RiLock2Line } from "@remixicon/react";
import clsx from "clsx";
import type { ReactNode } from "react";
import { DiffStat, GuideChip, PrStateTag } from "@/components/app/Badges";

const K = "#D73A49"; // keyword
const F = "#6F42C1"; // function
const N = "#005CC5"; // number / constant
const S = "#032F62"; // string
const D = "#24292E"; // default
const ADD = "#1f8a85";
const AMBER = "#8a6d00";

type Seg = [string, string?];

function Code({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map(([t, c], i) => (
        <span key={i} style={{ color: c ?? D }}>
          {t}
        </span>
      ))}
    </>
  );
}

function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("border border-black/15 bg-white", className)}>{children}</div>;
}

function PanelHeader({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-line bg-paper px-3 py-2 font-mono text-[9px] tracking-[0.08em] whitespace-nowrap text-black/55 uppercase">
      <span className="truncate">{left}</span>
      {right ? <span className="shrink-0">{right}</span> : null}
    </div>
  );
}

function Initial({ name, tone }: { name: string; tone: string }) {
  return (
    <span className={`flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[8px] text-white uppercase ${tone}`}>{name[0]}</span>
  );
}

function Squares({ total, done }: { total: number; done: number }) {
  return (
    <span className="flex gap-[2px]">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={clsx("h-2 w-2 border", i < done ? "border-ink bg-ink" : "border-black/25 bg-white")} />
      ))}
    </span>
  );
}

/* Re-review --------------------------------------------------------- */

const REREVIEW_SECTIONS = [
  { title: "Data model", state: "carried" },
  { title: "Mortgage math", state: "carried" },
  { title: "Offers API", state: "rereview" },
  { title: "Sale listing page", state: "open" },
] as const;

type InterdiffRow = { op: "same" | "added" | "removed"; line: number; segs: Seg[] };

const INTERDIFF: InterdiffRow[] = [
  { op: "same", line: 15, segs: [["const ", K], ["offer = "], ["validateOffer", F], ["("], ["await ", K], ["req."], ["json", F], ["());"]] },
  { op: "removed", line: 16, segs: [["if (!offer.ok) return Response.json(offer, { status: 422 });"]] },
  { op: "added", line: 16, segs: [["if ", K], ["(!offer.ok) "], ["return ", K], ["Response."], ["json", F], ["(offer.error, { status: "], ["422", N], [" });"]] },
  { op: "added", line: 17, segs: [["if ", K], ["("], ["await ", K], ["isSold", F], ["(params.id)) "], ["return ", K], ["Response."], ["json", F], ["(null, { status: "], ["409", N], [" });"]] },
  { op: "same", line: 18, segs: [["return ", K], ["Response."], ["json", F], ["("], ["await ", K], ["createOffer", F], ["(params.id, offer));"]] },
];

function ReReviewMockup() {
  return (
    <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Panel className="self-start">
        <PanelHeader left="acme/web #412 · version 3" right="2 new commits" />
        <ul>
          {REREVIEW_SECTIONS.map((s, i) => (
            <li key={s.title} className="flex items-center gap-2.5 border-t border-dashed border-line px-3 py-2 first:border-t-0">
              {s.state === "carried" ? (
                <RiCheckboxCircleFill size={15} className="shrink-0 text-black/35" />
              ) : s.state === "rereview" ? (
                <RiErrorWarningLine size={15} className="shrink-0 text-[#b08d00]" />
              ) : (
                <RiCheckboxBlankCircleLine size={15} className="shrink-0 text-black/30" />
              )}
              <span className="font-mono text-[10px] text-black/45">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{s.title}</span>
              {s.state === "carried" ? (
                <span className="font-mono text-[9px] tracking-[0.08em] whitespace-nowrap text-black/45 uppercase">Reviewed in v2, unchanged</span>
              ) : s.state === "rereview" ? (
                <span className="font-mono text-[9px] tracking-[0.08em] whitespace-nowrap uppercase" style={{ color: AMBER }}>
                  Changed since v2
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="border-t border-dashed border-line px-3 py-2.5 text-[11.5px] leading-[17px] text-body">
          2 sections carried over from version 2. 1 changed since you reviewed it.
        </p>
      </Panel>
      <div className="hidden self-start border border-[#b08d00]/40 bg-white @2xl:block">
        <div className="flex items-center gap-2 border-b border-dashed border-[#b08d00]/30 bg-highlight/15 px-3 py-2 font-mono text-[9px] tracking-[0.08em] uppercase">
          <span className="text-[#6b5a00]">Changed since you reviewed v2</span>
          <span className="ml-auto whitespace-nowrap text-black/55">1 file · 2 new · 1 removed</span>
        </div>
        <div className="flex items-center gap-2 border-b border-dashed border-line bg-paper px-3 py-1.5">
          <span className="tag">changed</span>
          <span className="truncate font-mono text-[11px] text-ink">api/offers.ts</span>
        </div>
        <div className="font-mono text-[10.5px] leading-[19px]">
          {INTERDIFF.map((r, i) => (
            <div
              key={i}
              className={clsx(
                "grid grid-cols-[30px_28px_minmax(0,1fr)]",
                r.op === "added" && "bg-highlight/[0.22]",
                r.op === "removed" && "bg-black/[0.03]",
              )}
            >
              <span className={clsx("pl-2 text-[9px] tracking-[0.06em]", r.op === "added" ? "bg-highlight/45 text-[#6b5a00]" : "text-black/40")}>
                {r.op === "added" ? "v3" : r.op === "removed" ? "v2" : ""}
              </span>
              <span className={clsx("pr-2 text-right text-[10px] text-black/35", r.op === "added" && "bg-highlight/45")}>{r.line}</span>
              <span className={clsx("truncate pl-2 whitespace-pre", r.op === "removed" && "text-black/45 line-through decoration-black/30", r.op === "same" && "opacity-60")}>
                <span style={{ color: ADD }}>+</span> {r.op === "removed" ? r.segs[0][0] : <Code segs={r.segs} />}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Coverage ---------------------------------------------------------- */

const COVERAGE = [
  { title: "Data model", lines: 412, tone: "bg-ink" },
  { title: "Checkout API", lines: 688, tone: "bg-signal" },
  { title: "Payment form", lines: 531, tone: "bg-blue-bright" },
  { title: "Tests", lines: 314, tone: "bg-black/25" },
];
const OTHER_LINES = 37;
const TOTAL_LINES = COVERAGE.reduce((n, s) => n + s.lines, OTHER_LINES);
const HATCH = "bg-[repeating-linear-gradient(135deg,rgba(0,0,0,0.4)_0_1.5px,transparent_1.5px_4px)]";

function CoverageMockup() {
  const total = TOTAL_LINES.toLocaleString("en");
  return (
    <Panel>
      <PanelHeader left="Coverage" right={<span className="text-ink">{`${total} / ${total} lines`}</span>} />
      <div className="px-3 pt-3 pb-2">
        <div className="flex h-[8px] gap-px">
          {COVERAGE.map((s) => (
            <span key={s.title} className={s.tone} style={{ width: `${(s.lines / TOTAL_LINES) * 100}%` }} />
          ))}
          <span className={HATCH} style={{ width: `${Math.max(3, (OTHER_LINES / TOTAL_LINES) * 100)}%` }} />
        </div>
      </div>
      <ul className="text-[12px]">
        {COVERAGE.map((s, i) => (
          <li key={s.title} className="flex items-center gap-2.5 border-t border-dashed border-line px-3 py-[5px]">
            <span className={clsx("h-2 w-2 shrink-0", s.tone)} />
            <span className="font-mono text-[10px] text-black/45">{String(i + 1).padStart(2, "0")}</span>
            <span className="flex-1 truncate text-ink">{s.title}</span>
            <span className="font-mono text-[10.5px] text-black/55">{s.lines}</span>
          </li>
        ))}
        <li className="flex items-center gap-2.5 border-t border-dashed border-line px-3 py-[5px]">
          <span className={clsx("h-2 w-2 shrink-0 border border-black/30", HATCH)} />
          <span className="font-mono text-[10px] text-black/45">05</span>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-ink">Other changes</span>
            <span className="shrink-0 border border-dashed border-black/25 px-1 font-mono text-[8.5px] tracking-[0.06em] text-black/50 uppercase">Auto</span>
          </span>
          <span className="font-mono text-[10.5px] text-black/55">{OTHER_LINES}</span>
        </li>
      </ul>
      <p className="border-t border-dashed border-line px-3 py-2 font-mono text-[10px] text-black/45">pnpm-lock.yaml · 2 snapshots</p>
    </Panel>
  );
}

/* Guide check ------------------------------------------------------- */

function CheckMockup() {
  return (
    <Panel>
      <PanelHeader left="Checks" right="acme/web #412" />
      {[
        ["ci / test", "Successful in 4m 12s"],
        ["ci / lint", "Successful in 48s"],
      ].map(([name, note]) => (
        <div key={name} className="flex items-center gap-2.5 border-b border-dashed border-line px-3 py-2 text-[12px]">
          <RiCheckboxCircleFill size={15} className="shrink-0" style={{ color: ADD }} />
          <span className="font-medium text-ink">{name}</span>
          <span className="truncate text-muted">{note}</span>
        </div>
      ))}
      <div className="flex gap-2.5 border-b border-dashed border-line bg-highlight/[0.12] px-3 py-2.5 text-[12px]">
        <RiErrorWarningFill size={15} className="mt-px shrink-0 text-[#b08d00]" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="font-medium text-ink">Omakaze guide</span>
            <span className="tag h-[17px] px-1 text-[8.5px]">Required</span>
          </p>
          <p className="mt-1 truncate text-text">4 of 6 sections reviewed by 2 members</p>
          <div className="mt-2">
            <Squares total={6} done={4} />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <RiLock2Line size={14} className="shrink-0 text-black/45" />
        <span className="flex-1 truncate text-[12px] text-text">Merging is blocked</span>
        <span className="btn btn-primary btn-xs pointer-events-none opacity-35">Merge</span>
      </div>
    </Panel>
  );
}

/* Needs my review --------------------------------------------------- */

const QUEUE = [
  {
    n: 412,
    title: "Add offers to sale listings",
    author: "maya",
    tone: "bg-blue-deep",
    add: 1184,
    del: 212,
    requested: true,
    sections: 6,
    reviewed: 3,
    version: 3,
  },
  {
    n: 208,
    title: "Retry webhook deliveries with backoff",
    author: "sam",
    tone: "bg-olive",
    add: 326,
    del: 41,
    requested: true,
    sections: 4,
    reviewed: 0,
    version: 1,
  },
  {
    n: 405,
    title: "Store prices in cents",
    author: "jun",
    tone: "bg-moved",
    add: 540,
    del: 498,
    requested: false,
    sections: 7,
    reviewed: 5,
    version: 2,
  },
];

function QueueMockup() {
  const tabs: [string, number][] = [
    ["Needs my review", 3],
    ["Mine", 2],
    ["Assigned", 1],
    ["All", 14],
  ];
  return (
    <div>
      <div className="flex overflow-hidden">
        {tabs.map(([label, n], i) => (
          <span
            key={label}
            className={clsx(
              "flex h-8 shrink-0 items-center gap-1.5 border-b px-3 text-[12px] tracking-[-0.02em] whitespace-nowrap first:pl-0",
              i === 0 ? "border-solid border-ink text-ink" : "border-dashed border-line text-nav",
            )}
          >
            {label}
            {i === 0 ? (
              <span className="inline-flex h-[15px] min-w-[15px] items-center justify-center bg-ink px-1 font-mono text-[9px] text-white">{n}</span>
            ) : (
              <span className="font-mono text-[9px] text-black/45">{n}</span>
            )}
          </span>
        ))}
        <span className="min-w-4 flex-1 border-b border-dashed border-line" />
      </div>
      <Panel className="mt-3">
        <ul>
          {QUEUE.map((p) => (
            <li key={p.n} className="flex items-center gap-3 border-t border-dashed border-line px-3 py-2.5 first:border-t-0">
              <PrStateTag state="open" />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2 text-[13px] leading-[18px] tracking-[-0.01em] text-ink">
                  <span className="font-mono text-[11px] text-meta">#{p.n}</span>
                  <span className="truncate">{p.title}</span>
                </p>
                <div className="mt-1 flex items-center gap-x-3 overflow-hidden text-[11px] whitespace-nowrap text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Initial name={p.author} tone={p.tone} />
                    {p.author}
                  </span>
                  {p.requested ? (
                    <span className="tag hidden h-[17px] border-ink/40 px-1 text-[8.5px] text-ink @sm:inline-flex">
                      <span className="dot h-[5px] w-[5px] bg-blue-bright" /> Review requested
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5">
                    <Squares total={p.sections} done={p.reviewed} />
                    <span className="font-mono text-[10px]">
                      {p.reviewed}/{p.sections}
                      <span className="hidden @xl:inline"> sections reviewed by you</span>
                    </span>
                  </span>
                  <span className="hidden @3xl:inline">
                    <DiffStat additions={p.add} deletions={p.del} />
                  </span>
                </div>
              </div>
              <div className="hidden shrink-0 items-center gap-2 @lg:flex">
                <GuideChip status="ready" version={p.version} />
                <span className="btn btn-primary btn-xs pointer-events-none">Open guide</span>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* Moved code and suggestions ---------------------------------------- */

const MOVED_LINES: Seg[][] = [
  [["export ", K], ["function ", K], ["validateOffer", F], ["(body) {"]],
  [["  if ", K], ["(!"], ["Number", F], ["."], ["isInteger", F], ["(body.amountCents))"]],
  [["    return ", K], ["{ ok: "], ["false", N], [", error: "], ['"amount"', S], [" };"]],
  [["  return ", K], ["{ ok: "], ["true", N], [", ...body };"]],
  [["}"]],
];

function SuggestionRow({ kind, line, before, change, after }: { kind: "add" | "del"; line: number; before: string; change: string; after: string }) {
  return (
    <div className={clsx("grid grid-cols-[30px_minmax(0,1fr)]", kind === "add" ? "bg-[rgba(78,211,207,0.14)]" : "bg-[rgba(191,0,15,0.065)]")}>
      <span className={clsx("pr-2 text-right text-[10px] text-black/35", kind === "add" ? "bg-[rgba(78,211,207,0.24)]" : "bg-[rgba(191,0,15,0.12)]")}>{line}</span>
      <span className="truncate pl-2 whitespace-pre text-[#24292E]">
        <span className={kind === "add" ? "text-[#1f8a85]" : "text-danger"}>{kind === "add" ? "+" : "−"}</span> {before}
        <span className={kind === "add" ? "bg-[rgba(78,211,207,0.42)]" : "bg-[rgba(191,0,15,0.16)]"}>{change}</span>
        {after}
      </span>
    </div>
  );
}

function SuggestionFigure() {
  return (
    <div className="border border-black/15 bg-white">
      <div className="flex items-center gap-1.5 border-b border-dashed border-line bg-paper px-2.5 py-1">
        <RiFileEditLine size={12} className="text-black/45" />
        <span className="font-mono text-[9px] tracking-[0.08em] text-black/55 uppercase">Suggested change</span>
      </div>
      <div className="font-mono text-[10.5px] leading-[19px]">
        <SuggestionRow kind="del" line={5} before="    return { ok: false, " change={'error: "amount"'} after=" };" />
        <SuggestionRow kind="add" line={5} before="    return { ok: false, " change={'field: "amountCents"'} after=" };" />
      </div>
    </div>
  );
}

function MovedMockup() {
  return (
    <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
      <Panel>
        <div className="flex items-center gap-2 border-b border-dashed border-line bg-paper px-3 py-2">
          <span className="tag">added</span>
          <span className="truncate font-mono text-[11px] text-ink">api/validate.ts</span>
          <span className="ml-auto shrink-0">
            <DiffStat additions={24} deletions={0} />
          </span>
        </div>
        <div className="flex items-center gap-1.5 border-b border-dashed border-moved/30 bg-moved/[0.06] px-3 py-[3px] text-[11px] text-moved">
          <RiArrowRightUpLine size={12} />
          Moved from <span className="font-mono text-[10.5px]">api/listings.ts:88</span>
        </div>
        <div className="font-mono text-[10.5px] leading-[19px]">
          {MOVED_LINES.map((segs, i) => (
            <div key={i} className="grid grid-cols-[30px_minmax(0,1fr)] bg-[rgba(78,211,207,0.14)]">
              <span className="bg-[rgba(78,211,207,0.24)] pr-2 text-right text-[10px] text-black/35">{i + 3}</span>
              <span className="truncate pl-2 whitespace-pre shadow-[inset_2px_0_0_var(--color-moved)]">
                <span style={{ color: ADD }}>+</span> <Code segs={segs} />
              </span>
            </div>
          ))}
        </div>
      </Panel>
      <div className="@2xl:hidden">
        <SuggestionFigure />
      </div>
      <Panel className="hidden @2xl:block">
        <div className="flex items-center border-b border-dashed border-line bg-paper text-[11px]">
          <span className="px-3 py-1.5 text-nav">Write</span>
          <span className="border-x border-dashed border-line bg-white px-3 py-1.5 text-ink">Preview</span>
          <span className="ml-auto pr-3 font-mono text-[9px] tracking-[0.08em] text-black/45 uppercase">Line 5</span>
        </div>
        <div className="px-3 pt-2.5 pb-3">
          <p className="text-[12px] leading-[18px] text-text">Return the field so the form can point at it.</p>
          <div className="mt-2">
            <SuggestionFigure />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="btn btn-primary btn-xs pointer-events-none">Comment on GitHub</span>
            <span className="text-[11px] text-muted">Cancel</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* Share links and export -------------------------------------------- */

function ShareMockup() {
  return (
    <Panel>
      <PanelHeader left="Share #412" right="read-only" />
      <div className="flex flex-col gap-2.5 p-3">
        <div className="grid grid-cols-2 gap-2 text-[11.5px]">
          {[
            ["This version (v3)", true],
            ["Latest version", false],
          ].map(([label, on]) => (
            <span key={String(label)} className={clsx("flex items-center gap-2 border px-2.5 py-2", on ? "border-ink bg-paper text-ink" : "border-black/15 text-text")}>
              <span className={clsx("flex h-3 w-3 shrink-0 items-center justify-center border", on ? "border-ink" : "border-black/30")}>
                {on ? <span className="h-1.5 w-1.5 bg-ink" /> : null}
              </span>
              <span className="truncate">{label}</span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] tracking-[0.08em] text-black/55 uppercase">Expires</span>
          <span className="flex flex-1 border border-tab text-[11px]">
            {["1 day", "7 days", "30 days", "Never"].map((d, i) => (
              <span key={d} className={clsx("flex-1 py-1 text-center whitespace-nowrap", i > 0 && "border-l border-tab", d === "7 days" ? "bg-ink text-white" : "text-text")}>
                {d}
              </span>
            ))}
          </span>
        </div>
        <div className="flex items-center gap-2 border border-dashed border-ink/40 bg-paper p-2">
          <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink">omakaze.acme.dev/s/9QxK2vTm</code>
          <span className="btn btn-primary btn-xs pointer-events-none">Copy link</span>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-dashed border-line px-3 py-2">
        <span className="font-mono text-[9px] tracking-[0.08em] text-black/55 uppercase">Export</span>
        <span className="tag ml-auto h-[18px]">Markdown</span>
        <span className="tag h-[18px]">Print · PDF</span>
      </div>
    </Panel>
  );
}

/* Cards ------------------------------------------------------------- */

const FEATURES: { title: string; body: string; wide?: boolean; mockup: ReactNode }[] = [
  {
    title: "Re-review only what changed.",
    body: "After a push, your marks stay on sections whose code didn't change. Sections that did are flagged, with an interdiff of what is new since you reviewed them.",
    wide: true,
    mockup: <ReReviewMockup />,
  },
  {
    title: "Every changed line has a section.",
    body: "Coverage counts the changed lines each section covers. Anything left over goes into an Other changes section when the guide is published.",
    mockup: <CoverageMockup />,
  },
  {
    title: "A check that means it was read.",
    body: "The guide check shows review progress on the pull request. Make it required and it passes only when every section has enough reviewers.",
    mockup: <CheckMockup />,
  },
  {
    title: "A queue that knows what you've read.",
    body: "Needs my review lists the pull requests that wait on your review or have sections you haven't reviewed, with your progress on each.",
    wide: true,
    mockup: <QueueMockup />,
  },
  {
    title: "Refactors that read like refactors.",
    body: "Moved and copied code links to where it came from, so a moved function doesn't read as new code. Suggested changes show the result before you post them.",
    wide: true,
    mockup: <MovedMockup />,
  },
  {
    title: "Share it outside the workspace.",
    body: "Read-only links for people without an account, expiring after 1, 7 or 30 days. Or export the guide as Markdown or a PDF.",
    mockup: <ShareMockup />,
  },
];

/** The features grid on the landing page: a small mockup of the product above each feature. */
export function Features() {
  return (
    <div className="mt-12 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-5 xl:grid-cols-3">
      {FEATURES.map((f) => (
        <div key={f.title} className={clsx("@container flex flex-col border border-black/15 bg-white", f.wide && "xl:col-span-2")}>
          <div className="flex h-[280px] flex-col justify-center-safe overflow-hidden border-b border-dashed border-line bg-wash p-4 sm:p-5" aria-hidden="true">
            {f.mockup}
          </div>
          <div className="flex flex-1 flex-col gap-4 px-8 pt-6 pb-7 grain">
            <p className="font-serif text-[26px] leading-[1.1] tracking-[-0.01em] text-black lg:text-[28px]">{f.title}</p>
            <p className="body-copy max-w-[600px]">{f.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
