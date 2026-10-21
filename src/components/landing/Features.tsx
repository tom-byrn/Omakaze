import {
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiBracesLine,
  RiCheckboxCircleFill,
  RiCheckLine,
  RiExpandUpDownLine,
  RiLinksLine,
} from "@remixicon/react";
import clsx from "clsx";
import type { ReactNode } from "react";
import { DiffStat } from "@/components/app/Badges";

const K = "#D73A49"; // keyword
const F = "#6F42C1"; // function
const N = "#005CC5"; // number / constant
const C = "#6A737D"; // comment
const D = "#24292E"; // default
const ADD = "#1f8a85";

type Seg = [string, string?];
type Line = { n: number; kind: "ctx" | "add"; segs: Seg[] };

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

function FileHeader({ status, path, add, del, extra }: { status: string; path: string; add: number; del: number; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-dashed border-line bg-paper px-3 py-2">
      <span className="tag">{status}</span>
      <span className="truncate font-mono text-[11px] text-ink">{path}</span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {extra}
        <DiffStat additions={add} deletions={del} />
      </span>
    </div>
  );
}

function Diff({ lines }: { lines: Line[] }) {
  return (
    <div className="font-mono text-[10.5px] leading-[19px]">
      {lines.map((l, i) => (
        <div key={i} className={clsx("grid grid-cols-[34px_minmax(0,1fr)]", l.kind === "add" && "bg-[rgba(78,211,207,0.14)]")}>
          <span className={clsx("pr-2 text-right text-[10px] text-black/35", l.kind === "add" && "bg-[rgba(78,211,207,0.24)]")}>{l.n}</span>
          <span className="truncate pl-2 whitespace-pre">
            <span className={l.kind === "add" ? "text-[#1f8a85]" : "text-black/30"}>{l.kind === "add" ? "+" : " "}</span> <Code segs={l.segs} />
          </span>
        </div>
      ))}
    </div>
  );
}

const PEOPLE = {
  maya: "bg-blue-deep",
  sam: "bg-olive",
  jun: "bg-moved",
  you: "bg-ink",
} as const;

function Person({ name, size = 16 }: { name: keyof typeof PEOPLE; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center border border-white font-mono text-white uppercase ${PEOPLE[name]}`}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {name[0]}
    </span>
  );
}

function Checked() {
  return (
    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center bg-ink text-white">
      <RiCheckLine size={11} />
    </span>
  );
}

/* Changes that are understandable ------------------------------------ */

const SECTIONS = [
  { title: "Data model", files: ["db/schema.ts", "drizzle/0012_offers.sql"], lines: 412, tone: "bg-ink" },
  { title: "Checkout API", files: ["api/checkout.ts", "db/schema.ts"], shared: true, lines: 688, tone: "bg-signal" },
  { title: "Payment form", files: ["components/PaymentForm.tsx"], lines: 531, tone: "bg-blue-bright" },
  { title: "Tests", files: ["tests/checkout.test.ts"], lines: 314, tone: "bg-black/25" },
];
const OTHER_LINES = 37;
const TOTAL_LINES = SECTIONS.reduce((n, s) => n + s.lines, OTHER_LINES);
const HATCH = "bg-[repeating-linear-gradient(135deg,rgba(0,0,0,0.4)_0_1.5px,transparent_1.5px_4px)]";

function SectionsMockup() {
  const total = TOTAL_LINES.toLocaleString("en");
  return (
    <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
      <Panel>
        <PanelHeader left="acme/web #412 · 4 sections" right="in review order" />
        <ul>
          {SECTIONS.map((s, i) => (
            <li key={s.title} className="flex gap-2.5 border-t border-dashed border-line px-3 py-2 first:border-t-0">
              <span className="font-mono text-[10px] leading-[18px] text-black/45">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] leading-[18px] text-ink">{s.title}</p>
                <p className="mt-0.5 flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
                  {s.files.map((f) => (
                    <span key={f} className="border border-dashed border-blue-deep/40 bg-blue-bright/[0.06] px-1 font-mono text-[9.5px] text-blue-deep">
                      {f}
                    </span>
                  ))}
                  {s.shared ? <span className="font-mono text-[8.5px] tracking-[0.06em] text-black/45 uppercase">also in 01</span> : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="hidden self-center @2xl:block">
        <PanelHeader left="Coverage" right={<span className="text-ink">{`${total} / ${total} lines`}</span>} />
        <div className="px-3 pt-3 pb-2">
          <div className="flex h-[8px] gap-px">
            {SECTIONS.map((s) => (
              <span key={s.title} className={s.tone} style={{ width: `${(s.lines / TOTAL_LINES) * 100}%` }} />
            ))}
            <span className={HATCH} style={{ width: `${Math.max(3, (OTHER_LINES / TOTAL_LINES) * 100)}%` }} />
          </div>
        </div>
        <ul className="text-[12px]">
          {SECTIONS.map((s, i) => (
            <li key={s.title} className="flex items-center gap-2.5 border-t border-dashed border-line px-3 py-[5px]">
              <span className={clsx("h-2 w-2 shrink-0", s.tone)} />
              <span className="font-mono text-[10px] text-black/45">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1 truncate text-ink">{s.title}</span>
              <span className="font-mono text-[10.5px] text-black/55">{s.lines}</span>
            </li>
          ))}
          <li className="flex items-center gap-2.5 border-t border-dashed border-line px-3 py-[5px]">
            <span className={clsx("h-2 w-2 shrink-0", HATCH)} />
            <span className="font-mono text-[10px] text-black/45">05</span>
            <span className="flex-1 truncate text-ink">Other changes</span>
            <span className="font-mono text-[10.5px] text-black/55">{OTHER_LINES}</span>
          </li>
        </ul>
      </Panel>
    </div>
  );
}

/* Markdown that does more -------------------------------------------- */

/** One rendered markdown element, labeled with what it is. */
function Tile({ label, bottom, className, children }: { label: string; bottom?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={clsx("relative h-[62px] overflow-hidden border border-black/15 bg-white", className)}>
      {children}
      <span
        className={clsx(
          "absolute right-0 bg-white/85 px-1 font-mono text-[7.5px] leading-[11px] tracking-[0.08em] text-black/40 uppercase",
          bottom ? "bottom-0" : "top-0",
        )}
      >
        {label}
      </span>
    </div>
  );
}

function MarkdownMockup() {
  return (
    <Panel>
      <PanelHeader left="Section 02 / 04" right="markdown" />
      <div className="flex flex-col gap-2 px-3 pt-2.5 pb-3">
        <p className="font-serif text-[17px] leading-none tracking-[-0.02em] text-black">
          <span className="mr-1.5 font-mono text-[10px] tracking-normal text-black/30">##</span>
          Checkout API
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Tile label="mermaid" className="flex items-center px-2 pt-2">
            <div className="flex w-full items-center font-mono text-[8px] text-ink">
              {["Cart", "API", "Stripe"].map((box, i) => (
                <span key={box} className="contents">
                  {i > 0 ? <span className="h-px min-w-2 flex-1 bg-black/40" /> : null}
                  <span className={clsx("border border-black/40 px-1 py-[2px]", i === 1 ? "bg-mist" : "bg-white")}>{box}</span>
                </span>
              ))}
            </div>
          </Tile>
          <Tile label="table" bottom>
            <div className="grid grid-cols-2 text-[8.5px] leading-[12px] text-text">
              <span className="bg-paper px-1.5 py-[2px] font-mono text-[7.5px] tracking-[0.06em] text-black/50 uppercase">Input</span>
              <span className="bg-paper px-1.5 py-[2px] font-mono text-[7.5px] tracking-[0.06em] text-black/50 uppercase">Default</span>
              {["Term", "30 years", "Tax rate", "1.1%"].map((c) => (
                <span key={c} className="border-t border-dashed border-line px-1.5 py-[1px]">
                  {c}
                </span>
              ))}
            </div>
          </Tile>
          <Tile label="ts" className="flex flex-col justify-center px-2 font-mono text-[8.5px] leading-[13px] whitespace-nowrap">
            <span>
              <Code segs={[["const ", K], ["t = "], ["sum", F], ["(cart);"]]} />
            </span>
            <span>
              <Code segs={[["if ", K], ["(t <= "], ["0", N], [") "], ["return", K], [";"]]} />
            </span>
          </Tile>
          <Tile label="math" className="flex items-center justify-center font-serif text-[14px] whitespace-nowrap text-ink italic">
            total = Σ pᵢ · qᵢ
          </Tile>
        </div>
      </div>
    </Panel>
  );
}

/* Context when you need it ------------------------------------------- */

const CONTEXT_ABOVE: Line[] = [
  { n: 41, kind: "ctx", segs: [["export ", K], ["async ", K], ["function ", K], ["checkout", F], ["(cart) {"]] },
  { n: 42, kind: "add", segs: [["  const ", K], ["total = "], ["sumCents", F], ["(cart.items);"]] },
  { n: 43, kind: "add", segs: [["  if ", K], ["(total <= "], ["0", N], [") "], ["return ", K], ["confirm", F], ["(cart);"]] },
];

const CONTEXT_BELOW: Line[] = [
  { n: 90, kind: "ctx", segs: [["  const ", K], ["intent = "], ["await ", K], ["stripe.paymentIntents."], ["create", F], ["({"]] },
  { n: 91, kind: "add", segs: [["    amount: total, "], ["// cents", C]] },
  { n: 92, kind: "ctx", segs: [["  });"]] },
];

function ContextMockup() {
  return (
    <Panel>
      <FileHeader
        status="modified"
        path="api/checkout.ts"
        add={38}
        del={6}
        extra={
          <span className="hidden items-center gap-1 border border-black/15 px-1.5 py-[2px] text-[10.5px] text-ui @xs:inline-flex">
            <RiExpandUpDownLine size={12} /> Whole file
          </span>
        }
      />
      <Diff lines={CONTEXT_ABOVE} />
      <div className="flex flex-wrap items-center gap-1 border-y border-dashed border-black/10 bg-mist px-2 py-1 text-[10.5px] text-ui">
        <span className="inline-flex items-center gap-0.5 px-1.5 py-[2px]">
          <RiArrowDownSLine size={12} /> 20
        </span>
        <span className="inline-flex items-center gap-0.5 px-1.5 py-[2px]">
          <RiArrowUpSLine size={12} /> 20
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-[2px]">
          <RiExpandUpDownLine size={12} /> Show 46 unchanged lines
        </span>
        <span className="inline-flex items-center gap-1 border border-black/20 bg-white/70 px-1.5 py-[2px] text-ink">
          <RiBracesLine size={12} /> Enclosing block
        </span>
      </div>
      <Diff lines={CONTEXT_BELOW} />
    </Panel>
  );
}

/* Comments go to GitHub ---------------------------------------------- */

const COMMENT_LINES: Line[] = [
  { n: 42, kind: "add", segs: [["  const ", K], ["total = "], ["sumCents", F], ["(cart.items);"]] },
  { n: 43, kind: "add", segs: [["  if ", K], ["(total <= "], ["0", N], [") "], ["throw ", K], ["new ", K], ["CheckoutError", F], ["();"]] },
];

function CommentsMockup() {
  return (
    <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <Panel>
        <FileHeader status="modified" path="api/checkout.ts" add={38} del={6} />
        <Diff lines={COMMENT_LINES} />
        <div className="flex flex-col gap-2 border-t border-dashed border-black/10 bg-wash px-3 py-2.5">
          <div className="border border-black/15 bg-white px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-[10.5px] text-muted">
              <Person name="maya" size={14} /> <span className="text-ink">maya</span> · 2h ago
            </p>
            <p className="mt-1 text-[11.5px] leading-[16px] text-text">Should a zero total skip payment instead of throwing?</p>
          </div>
          <div className="border border-ink/50 bg-white px-2.5 py-2">
            <p className="text-[11.5px] leading-[16px] text-text">Yes, a free order should go straight to confirmation.</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="btn btn-primary btn-xs pointer-events-none">Reply on GitHub</span>
              <span className="text-[10.5px] text-muted">Cancel</span>
            </div>
          </div>
        </div>
      </Panel>
      <div className="hidden self-center @2xl:block">
        <Panel>
          <PanelHeader left="Finish your review" right="acme/web #412" />
          <div className="flex flex-col gap-2.5 p-3">
            <div className="flex gap-1.5 text-[11px]">
              {[
                ["Comment", false],
                ["Approve", false],
                ["Request changes", true],
              ].map(([t, on]) => (
                <span
                  key={String(t)}
                  className={clsx("flex items-center gap-1.5 border px-2 py-1 whitespace-nowrap", on ? "border-ink bg-ink text-white" : "border-black/15 text-text")}
                >
                  <span className={clsx("dot h-[6px] w-[6px]", on ? "bg-signal" : "border border-black/30")} />
                  {t}
                </span>
              ))}
            </div>
            <p className="border border-black/15 px-2.5 py-2 text-[11.5px] leading-[16px] text-text">Good once a zero total skips payment.</p>
            <span className="btn btn-primary btn-xs pointer-events-none self-start">Submit review</span>
          </div>
        </Panel>
        <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px]" style={{ color: ADD }}>
          <RiCheckboxCircleFill size={13} /> Changes requested on acme/web#412
        </p>
      </div>
    </div>
  );
}

/* Shared by the team ------------------------------------------------- */

const MEMBERS = [
  { name: "maya", email: "maya@acme.dev", role: "Owner" },
  { name: "sam", email: "sam@acme.dev", role: "Admin" },
  { name: "jun", email: "jun@acme.dev", role: "Member" },
] as const;

const REVIEWED_BY: { title: string; by: (keyof typeof PEOPLE)[] }[] = [
  { title: "Data model", by: ["maya", "sam"] },
  { title: "Checkout API", by: ["maya"] },
  { title: "Payment form", by: ["sam", "jun"] },
  { title: "Tests", by: [] },
];

function TeamMockup() {
  return (
    <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
      <Panel className="self-center">
        <PanelHeader left="Members · acme" right="3 members" />
        <ul>
          {MEMBERS.map((m) => (
            <li key={m.name} className="flex items-center gap-2.5 border-b border-dashed border-line px-3 py-2">
              <Person name={m.name} size={20} />
              <span className="text-[12.5px] text-ink">{m.name}</span>
              <span className="truncate font-mono text-[10px] text-muted">{m.email}</span>
              <span className={clsx("tag ml-auto h-[18px]", m.role === "Owner" && "border-ink/40 text-ink")}>{m.role}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 px-3 py-2">
          <RiLinksLine size={13} className="shrink-0 text-black/45" />
          <span className="truncate text-[11.5px] text-text">Invite link · member</span>
          <span className="btn btn-secondary btn-xs pointer-events-none ml-auto">Copy link</span>
        </div>
      </Panel>
      <Panel className="hidden self-center @2xl:block">
        <PanelHeader left="acme/web #412 · version 3" right="reviewed by" />
        <ul>
          {REVIEWED_BY.map((s, i) => (
            <li key={s.title} className="flex items-center gap-2.5 border-t border-dashed border-line px-3 py-[9px] first:border-t-0">
              <span className="font-mono text-[10px] text-black/45">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1 truncate text-[12.5px] text-ink">{s.title}</span>
              {s.by.length > 0 ? (
                <span className="flex -space-x-1">
                  {s.by.map((p) => (
                    <Person key={p} name={p} size={18} />
                  ))}
                </span>
              ) : (
                <span className="font-mono text-[9px] tracking-[0.08em] text-black/40 uppercase">Not reviewed</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* Automatic when you want it ----------------------------------------- */

function AutomationMockup() {
  return (
    <Panel>
      <PanelHeader left="Pull request automation" right="acme/web" />
      {["Create a guide for every new pull request", "Create a new version when commits are pushed", "Skip draft pull requests"].map((t) => (
        <div key={t} className="flex items-center gap-2.5 border-b border-dashed border-line px-3 py-2 text-[12px] text-ink">
          <Checked />
          <span className="truncate">{t}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 border-b border-dashed border-line px-3 py-2">
        <span className="font-mono text-[9px] tracking-[0.08em] text-black/55 uppercase">Model</span>
        <span className="flex flex-1 border border-tab text-[10.5px]">
          {["Anthropic", "OpenAI", "OpenRouter", "Local"].map((p, i) => (
            <span key={p} className={clsx("flex-1 py-[3px] text-center whitespace-nowrap", i > 0 && "border-l border-tab", i === 0 ? "bg-ink text-white" : "text-text")}>
              {p}
            </span>
          ))}
        </span>
      </div>
      <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-text">
        <span className="dot animate-pulse-dot bg-blue-bright" />
        <span className="font-mono text-[10.5px] text-meta">#412</span>
        <span className="truncate">2 commits pushed · writing version 4</span>
      </div>
    </Panel>
  );
}

/* Cards -------------------------------------------------------------- */

const FEATURES: { title: string; body: string; wide?: boolean; mockup: ReactNode }[] = [
  {
    title: "Changes that are understandable.",
    body: "Changes are grouped by what they do. A file can appear in several sections, and every changed line ends up in one.",
    wide: true,
    mockup: <SectionsMockup />,
  },
  {
    title: "Markdown that does more.",
    body: "Headings, tables, Mermaid diagrams, math, code blocks, screenshots and screen recordings next to the code.",
    mockup: <MarkdownMockup />,
  },
  {
    title: "Context when you need it.",
    body: "Expand unchanged lines in steps of twenty, show the enclosing function, or open the whole file.",
    mockup: <ContextMockup />,
  },
  {
    title: "Comments go to GitHub.",
    body: "Comment on a line, reply to a thread, approve or request changes. Everything is posted to the pull request.",
    wide: true,
    mockup: <CommentsMockup />,
  },
  {
    title: "Shared by the team.",
    body: "Workspaces with invites and roles. Everyone sees the same guides and who reviewed which section.",
    wide: true,
    mockup: <TeamMockup />,
  },
  {
    title: "Automatic when you want it.",
    body: "Generate a guide for every new pull request and a new version on every push, with OpenRouter, Anthropic, OpenAI or a local model.",
    mockup: <AutomationMockup />,
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
