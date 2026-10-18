"use client";

import { RiArrowRightUpLine, RiCheckLine, RiPlayFill } from "@remixicon/react";
import Image from "next/image";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

const K = "#D73A49"; // keyword
const F = "#6F42C1"; // function
const N = "#005CC5"; // number / constant
const S = "#032F62"; // string
const C = "#6A737D"; // comment
const D = "#24292E"; // default

type Seg = [string, string?];
type Line = { n: number | null; o?: number | null; kind: "ctx" | "add" | "del" | "gap"; moved?: boolean; segs: Seg[] };

const MORTGAGE_LINES: Line[] = [
  { n: 12, kind: "add", segs: [["export ", K], ["function ", K], ["monthlyPayment", F], ["(principal, rate, years) {"]] },
  { n: 13, kind: "add", segs: [["  const ", K], ["r = rate / "], ["12", N], [";"]] },
  { n: 14, kind: "add", segs: [["  const ", K], ["n = years * "], ["12", N], [";"]] },
  { n: 15, kind: "add", segs: [["  if ", K], ["(r === "], ["0", N], [") "], ["return ", K], ["principal / n;"]] },
  { n: 16, kind: "add", segs: [["  return ", K], ["(principal * r) / ("], ["1", N], [" - Math."], ["pow", F], ["("], ["1", N], [" + r, -n));"]] },
  { n: 17, kind: "add", segs: [["}"]] },
  { n: null, kind: "gap", segs: [["Show 9 unchanged lines"]] },
  { n: 27, kind: "ctx", segs: [["// PMI applies above 80% loan-to-value", C]] },
  { n: 28, kind: "add", segs: [["export ", K], ["function ", K], ["pmi", F], ["(loan, value) {"]] },
  { n: 29, kind: "add", segs: [["  const ", K], ["ltv = loan / value;"]] },
  { n: 30, kind: "del", o: 30, segs: [["  return ", K], ["ltv > "], ["0.8", N], [" ? loan * "], ["0.005", N], [" : "], ["0", N], [";"]] },
  { n: 30, kind: "add", segs: [["  if ", K], ["(ltv <= "], ["0.78", N], [") "], ["return ", K], ["0", N], [";"]] },
  { n: 31, kind: "add", segs: [["  return ", K], ["(loan * "], ["0.0058", N], [") / "], ["12", N], [";"]] },
  { n: 32, kind: "ctx", segs: [["}"]] },
];

const SCHEMA_LINES: Line[] = [
  { n: 8, kind: "ctx", segs: [["export ", K], ["const ", K], ["listings = "], ["pgTable", F], ["("], ['"listings"', S], [", {"]] },
  { n: 9, kind: "ctx", segs: [["  id: "], ["uuid", F], ["()."], ["primaryKey", F], ["(),"]] },
  { n: 10, kind: "del", o: 10, segs: [["  price: "], ["integer", F], ["(),"]] },
  { n: 10, kind: "add", segs: [["  priceCents: "], ["bigint", F], ["({ mode: "], ['"number"', S], [" })."], ["notNull", F], ["(),"]] },
  { n: 11, kind: "add", segs: [["  status: "], ["listingStatus", F], ["()."], ["default", F], ["("], ['"draft"', S], ["),"]] },
  { n: 12, kind: "ctx", segs: [["});"]] },
  { n: null, kind: "gap", segs: [["Show 14 unchanged lines"]] },
  { n: 27, kind: "add", segs: [["export ", K], ["const ", K], ["offers = "], ["pgTable", F], ["("], ['"offers"', S], [", {"]] },
  { n: 28, kind: "add", segs: [["  id: "], ["uuid", F], ["()."], ["primaryKey", F], ["(),"]] },
  { n: 29, kind: "add", segs: [["  listingId: "], ["uuid", F], ["()."], ["references", F], ["(() => listings.id),"]] },
  { n: 30, kind: "add", segs: [["  buyerId: "], ["uuid", F], ["()."], ["references", F], ["(() => users.id),"]] },
  { n: 31, kind: "add", segs: [["  amountCents: "], ["bigint", F], ["({ mode: "], ['"number"', S], [" })."], ["notNull", F], ["(),"]] },
  { n: 32, kind: "add", segs: [["});"]] },
];

const ROUTE_LINES: Line[] = [
  { n: 14, kind: "add", segs: [["export ", K], ["async ", K], ["function ", K], ["POST", F], ["(req, { params }) {"]] },
  { n: 15, kind: "add", segs: [["  const ", K], ["offer = "], ["validateOffer", F], ["("], ["await ", K], ["req."], ["json", F], ["());"]] },
  { n: 16, kind: "add", segs: [["  if ", K], ["(!offer.ok) "], ["return ", K], ["Response."], ["json", F], ["(offer, { status: "], ["422", N], [" });"]] },
  { n: 17, kind: "add", segs: [["  return ", K], ["Response."], ["json", F], ["("], ["await ", K], ["createOffer", F], ["(params.id, offer));"]] },
  { n: 18, kind: "add", segs: [["}"]] },
];

const VALIDATE_LINES: Line[] = [
  { n: 3, kind: "add", moved: true, segs: [["export ", K], ["function ", K], ["validateOffer", F], ["(body) {"]] },
  { n: 4, kind: "add", moved: true, segs: [["  if ", K], ["(!"], ["Number", F], ["."], ["isInteger", F], ["(body.amountCents))"]] },
  { n: 5, kind: "add", moved: true, segs: [["    return ", K], ["{ ok: "], ["false", N], [", error: "], ['"amount"', S], [" };"]] },
  { n: 6, kind: "add", moved: true, segs: [["  return ", K], ["{ ok: "], ["true", N], [", ...body };"]] },
];

const PAGE_LINES: Line[] = [
  { n: 21, kind: "add", segs: [["export ", K], ["default ", K], ["async ", K], ["function ", K], ["ListingPage", F], ["({ params }) {"]] },
  { n: 22, kind: "add", segs: [["  const ", K], ["listing = "], ["await ", K], ["getListing", F], ["(params.id);"]] },
  { n: 23, kind: "add", segs: [["  const ", K], ["monthly = "], ["monthlyPayment", F], ["(listing.priceCents);"]] },
  { n: 24, kind: "add", segs: [["  return ", K], ["("]] },
  { n: 25, kind: "add", segs: [["    <"], ["Listing", F], [" listing={listing}>"]] },
  { n: 26, kind: "add", segs: [["      <"], ["Price", F], [" value={listing.priceCents} />"]] },
  { n: 27, kind: "add", segs: [["      <"], ["Estimate", F], [" monthly={monthly} />"]] },
  { n: 28, kind: "add", segs: [["      <"], ["OfferForm", F], [" listingId={listing.id} />"]] },
  { n: 29, kind: "add", segs: [["    </"], ["Listing", F], [">"]] },
  { n: 30, kind: "add", segs: [["  );"]] },
  { n: 31, kind: "add", segs: [["}"]] },
];

const SECTIONS = [
  { n: "01", title: "Data model" },
  { n: "02", title: "Mortgage math" },
  { n: "03", title: "Offers API" },
  { n: "04", title: "Sale listing page" },
];

// The section the schematic opens on.
const INITIAL = 1;

type CalloutSpec = { label: string; sub: string; side: "left" | "right"; top: number };

// Feature labels around the frame, per section. Tops are measured against the frame at its full 1040px width.
const CALLOUTS: CalloutSpec[][] = [
  [
    { label: "Diagrams", sub: "mermaid · math", side: "left", top: 282 },
    { label: "Progress", sub: "who reviewed what", side: "left", top: 396 },
    { label: "Coverage", sub: "every line covered", side: "right", top: 443 },
  ],
  [
    { label: "Sections", sub: "in review order", side: "left", top: 70 },
    { label: "Explanation", sub: "markdown · mermaid", side: "left", top: 250 },
    { label: "Context", sub: "expand on demand", side: "right", top: 262 },
    { label: "Comments", sub: "posted to github", side: "right", top: 420 },
  ],
  [
    { label: "Alerts", sub: "notes · warnings", side: "left", top: 282 },
    { label: "Moved code", sub: "linked to source", side: "right", top: 300 },
    { label: "Reviews", sub: "posted as a review", side: "right", top: 442 },
  ],
  [
    { label: "Recordings", sub: "screenshots · video", side: "left", top: 345 },
    { label: "Versions", sub: "one for every push", side: "right", top: 124 },
  ],
];

function Callout({ label, sub, side, top, visible }: CalloutSpec & { visible: boolean }) {
  const left = side === "left";
  return (
    <div
      className={`pointer-events-none absolute hidden w-[124px] transition-[opacity,translate] duration-500 ease-(--ease-snap) motion-reduce:transition-none min-[1400px]:block ${
        left ? "-left-[176px]" : "-right-[176px] text-right"
      } ${visible ? "opacity-100 delay-150" : `opacity-0 ${left ? "-translate-x-2" : "translate-x-2"}`}`}
      style={{ top }}
      aria-hidden="true"
    >
      <div className="font-mono text-[10px] leading-[15px] tracking-[0.08em] text-[#898989] uppercase">
        <p className="flex items-center gap-1.5 text-black/70">
          <span className="inline-block h-[7px] w-[7px] bg-ink" />
          {label}
        </p>
        <p className="mt-0.5 pl-[13px] text-[8px] leading-[12px]">{sub}</p>
      </div>
      <span className={`absolute top-[8px] block h-px w-[52px] bg-[#a8a8a8] ${left ? "left-[124px]" : "right-[124px]"}`} />
    </div>
  );
}

function Diff({ lines, after }: { lines: Line[]; after?: Record<number, ReactNode> }) {
  return (
    <div className="font-mono text-[11px] leading-[19px]">
      {lines.map((l, i) =>
        l.kind === "gap" ? (
          <div key={i} className="border-y border-dashed border-black/10 bg-mist px-3 py-0.5 font-sans text-[10.5px] text-ui">
            ↕ {l.segs[0][0]}
          </div>
        ) : (
          <div key={i}>
            <div
              className={`grid grid-cols-[34px_minmax(0,1fr)] ${l.kind === "add" ? "bg-[rgba(78,211,207,0.14)]" : l.kind === "del" ? "bg-[rgba(191,0,15,0.065)]" : ""}`}
            >
              <span
                className={`pr-2 text-right text-[10px] text-black/35 ${l.kind === "add" ? "bg-[rgba(78,211,207,0.24)]" : l.kind === "del" ? "bg-[rgba(191,0,15,0.12)]" : ""}`}
              >
                {l.kind === "del" ? l.o : l.n}
              </span>
              <span className={`truncate pl-3 whitespace-pre ${l.moved ? "shadow-[inset_2px_0_0_var(--color-moved)]" : ""}`}>
                <span className={l.kind === "add" ? "text-[#1f8a85]" : l.kind === "del" ? "text-danger" : "text-black/30"}>
                  {l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}
                </span>{" "}
                {l.segs.map(([t, c], j) => (
                  <span key={j} style={{ color: c ?? D }}>
                    {t}
                  </span>
                ))}
              </span>
            </div>
            {after?.[i] ?? null}
          </div>
        ),
      )}
    </div>
  );
}

function FileCard({ status, path, add, del, extra, children }: { status: string; path: string; add: number; del: number; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="border border-black/15 bg-white">
      <div className="flex items-center gap-2 border-b border-dashed border-line bg-paper px-3 py-2">
        <span className="tag">{status}</span>
        <span className="truncate font-mono text-[11px] text-ink">{path}</span>
        {extra}
        <span className="ml-auto shrink-0 font-mono text-[10px]">
          <span className="text-[#1f8a85]">+{add}</span> <span className="text-danger">−{del}</span>
        </span>
      </div>
      {children}
    </div>
  );
}

function Explanation({ index, children }: { index: number; children: ReactNode }) {
  return (
    <div className="border-r border-dashed border-line bg-paper px-6 py-6 grain md:px-8">
      <span className="eyebrow">
        Section {SECTIONS[index].n} / {String(SECTIONS.length).padStart(2, "0")}
      </span>
      <p className="mt-4 font-serif text-[28px] leading-none tracking-[-0.03em] text-black">{SECTIONS[index].title}</p>
      {children}
    </div>
  );
}

function Ref({ children }: { children: ReactNode }) {
  return (
    <span className="border border-dashed border-blue-deep/40 bg-blue-bright/[0.06] px-1 font-mono text-[11px] text-blue-deep">{children}</span>
  );
}

function Avatar({ initial, tone }: { initial: string; tone: string }) {
  return (
    <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-paper font-mono text-[9px] text-white uppercase ${tone}`}>
      {initial}
    </span>
  );
}

function DataModel() {
  const entities: [string, string[]][] = [
    ["listing", ["id", "price_cents", "status"]],
    ["offer", ["listing_id", "buyer_id", "amount_cents"]],
    ["buyer", ["id", "email"]],
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-[40%_60%]">
      <Explanation index={0}>
        <p className="mt-4 text-[13px] leading-[21px] text-text">
          Adds offers. An offer belongs to one listing and one buyer, and prices are now stored in cents.
        </p>
        <div className="relative mt-4 border border-black/15 bg-white px-3 pt-6 pb-4">
          <span className="absolute top-1.5 right-2 font-mono text-[8.5px] tracking-[0.08em] text-black/35 uppercase">mermaid</span>
          <div className="relative grid grid-cols-3 gap-6">
            <span className="absolute inset-x-[16%] top-[13px] border-t border-black/40" aria-hidden="true" />
            {entities.map(([name, fields], i) => (
              <div key={name} className="relative border border-black/40 bg-white font-mono text-[9px] leading-[15px]">
                <p className="border-b border-black/40 bg-mist px-1.5 py-[2px] text-center tracking-[0.06em] text-ink uppercase">{name}</p>
                <div className="px-1.5 py-1 text-ui">
                  {fields.map((f) => (
                    <p key={f} className="truncate">
                      {f}
                    </p>
                  ))}
                </div>
                {i < 2 ? (
                  <span className="absolute top-0 left-full w-6 text-center font-mono text-[8px] text-black/55">1:n</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2.5 text-[12px] text-text">
          <span className="flex -space-x-1.5">
            <Avatar initial="m" tone="bg-blue-deep" />
            <Avatar initial="s" tone="bg-olive" />
          </span>
          <span>
            Reviewed by <span className="text-ink">maya</span> and <span className="text-ink">sam</span>
          </span>
        </div>
        <div className="mt-6 flex gap-2">
          <span className="btn btn-secondary btn-sm pointer-events-none gap-1.5">
            <RiCheckLine size={14} /> Reviewed
          </span>
        </div>
      </Explanation>
      <div className="flex flex-col gap-3 bg-wash p-4 md:p-5">
        <FileCard
          status="modified"
          path="db/schema.ts"
          add={42}
          del={3}
          extra={<span className="shrink-0 border border-dashed border-line px-1.5 font-mono text-[9px] tracking-[0.06em] text-black/50 uppercase">also in 03</span>}
        >
          <Diff lines={SCHEMA_LINES} />
        </FileCard>
        <div className="border border-black/15 bg-white px-3 py-2.5">
          <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.08em] text-black/55 uppercase">
            <span>Coverage</span>
            <span className="text-ink">3,693 / 3,693 lines</span>
          </div>
          <div className="mt-2 flex h-[6px] gap-px">
            <span className="w-[18%] bg-ink" />
            <span className="w-[24%] bg-signal" />
            <span className="w-[31%] bg-blue-bright" />
            <span className="w-[27%] bg-black/25" />
          </div>
          <div className="mt-1.5 grid grid-cols-[18%_24%_31%_27%] font-mono text-[8.5px] text-black/45">
            {SECTIONS.map((s) => (
              <span key={s.n}>{s.n}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MortgageMath() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[40%_60%]">
      <Explanation index={1}>
        <p className="mt-4 text-[13px] leading-[21px] text-text">
          Payments use the standard amortization formula. PMI is added above 80% loan-to-value and now stops at 78%, as
          required for conventional loans.
        </p>
        <div className="mt-4 border border-black/15 bg-white text-[11.5px]">
          <div className="grid grid-cols-2 border-b border-dashed border-line bg-paper px-3 py-1.5 font-mono text-[9px] tracking-[0.08em] text-black/55 uppercase">
            <span>Input</span>
            <span>Default</span>
          </div>
          {[
            ["Down payment", "20%"],
            ["Term", "30 years"],
            ["Tax rate", "1.1%"],
          ].map(([a, b]) => (
            <div key={a} className="grid grid-cols-2 border-t border-dashed border-line px-3 py-1.5 text-text first:border-t-0">
              <span>{a}</span>
              <span className="font-mono text-[11px]">{b}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[13px] leading-[21px] text-text">
          Check the cut-off in <Ref>pmi()</Ref>.
        </p>
        <div className="mt-6 flex gap-2">
          <span className="btn btn-primary btn-sm pointer-events-none">Mark reviewed and continue</span>
        </div>
      </Explanation>
      <div className="bg-wash p-4 md:p-5">
        <FileCard status="added" path="shared/mortgage.ts" add={184} del={0}>
          <Diff
            lines={MORTGAGE_LINES}
            after={{
              [MORTGAGE_LINES.length - 3]: (
                <div className="border-y border-dashed border-black/10 bg-wash px-3 py-2">
                  <div className="ml-[34px] border border-black/15 bg-white px-3 py-2 font-sans">
                    <p className="text-[10.5px] text-muted">
                      <span className="text-ink">reviewer</span> · just now
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-text">Should this use the loan&apos;s original value for LTV?</p>
                  </div>
                </div>
              ),
            }}
          />
        </FileCard>
      </div>
    </div>
  );
}

function OffersApi() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[40%_60%]">
      <Explanation index={2}>
        <p className="mt-4 text-[13px] leading-[21px] text-text">
          <span className="font-mono text-[11.5px] text-ink">POST /listings/:id/offers</span> validates the amount and creates
          the offer. Validation moved out of the listings route.
        </p>
        <div className="mt-4 border border-black/15 border-l-[3px] border-l-blue-deep bg-white px-3.5 py-2.5 text-[12.5px] leading-[20px] text-text">
          <p className="mb-1 font-mono text-[10px] tracking-[0.08em] text-blue-deep uppercase">Important</p>
          Offers below the asking price are allowed. Only the seller can see them.
        </div>
        <div className="mt-4 border border-black/15 bg-white px-3 py-2 font-mono text-[11px] leading-[18px]">
          <span className="text-black/45">{"// 422 when the amount is not in cents"}</span>
          <br />
          {"{ "}
          <span style={{ color: S }}>&quot;amountCents&quot;</span>: <span style={{ color: N }}>41200000</span>
          {" }"}
        </div>
        <div className="mt-6 flex gap-2">
          <span className="btn btn-primary btn-sm pointer-events-none">Mark reviewed and continue</span>
        </div>
      </Explanation>
      <div className="flex flex-col gap-3 bg-wash p-4 md:p-5">
        <FileCard status="added" path="api/offers.ts" add={96} del={0}>
          <Diff lines={ROUTE_LINES} />
        </FileCard>
        <FileCard status="added" path="api/validate.ts" add={24} del={0}>
          <div className="flex items-center gap-1.5 border-b border-dashed border-moved/30 bg-moved/[0.06] px-3 py-[3px] font-sans text-[11px] text-moved">
            <RiArrowRightUpLine size={12} />
            Moved from <span className="font-mono text-[10.5px]">api/listings.ts:88</span>
          </div>
          <Diff lines={VALIDATE_LINES} />
        </FileCard>
        <div className="border border-black/15 bg-white px-3 py-2.5">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[9px] tracking-[0.08em] text-black/55 uppercase">Finish your review</p>
            <span className="btn btn-primary btn-xs pointer-events-none">Submit review</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
            {[
              ["Comment", false],
              ["Approve", true],
              ["Request changes", false],
            ].map(([t, on]) => (
              <span
                key={String(t)}
                className={`flex items-center gap-1.5 border px-2 py-1 ${on ? "border-ink bg-ink text-white" : "border-black/15 text-text"}`}
              >
                <span className={`dot h-[6px] w-[6px] ${on ? "bg-signal" : "border border-black/30"}`} />
                <span className="truncate">{t}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A looping screen recording: the cursor finds "Make an offer", clicks it and the offer is sent. */
function Recording({ playing }: { playing: boolean }) {
  // Each part loops on the same 6s clock while the section is open; it rests on its first frame otherwise.
  const anim = (cls: string) => (playing ? cls : "");
  return (
    <div className="relative mt-4 aspect-[16/8.4] overflow-hidden border border-black/15 bg-white">
      <div className="grid h-full grid-cols-[46%_54%] pb-[26px]">
        <div className="relative overflow-hidden bg-mist">
          <Image src="/landing/listing-house.webp" alt="" fill sizes="200px" className="object-cover" />
        </div>
        <div className="relative flex flex-col px-3 pt-3">
          <p className="font-serif text-[15px] leading-none text-black">2-14 Kazuemachi</p>
          <p className="mt-1 font-mono text-[8.5px] tracking-[0.06em] text-black/45">Kanazawa · 3LDK · 112 m²</p>
          <p className="mt-2.5 font-serif text-[18px] leading-none text-black">¥78,000,000</p>
          <p className="mt-1 text-[10px] text-text">
            Est. <span className="bg-signal/40 px-0.5 font-mono">¥176,000</span>/mo
          </p>
          <span
            className={`mt-auto mb-3 flex h-[24px] items-center justify-center bg-ink text-[10px] text-white ${anim("motion-safe:animate-[rec-press_6s_var(--ease-io)_infinite]")}`}
          >
            Make an offer
          </span>
          <span
            className={`absolute inset-x-3 bottom-3 flex h-[24px] items-center justify-center gap-1 border border-olive/50 bg-white text-[10px] text-olive opacity-0 ${anim("motion-safe:animate-[rec-toast_6s_var(--ease-io)_infinite]")}`}
          >
            <RiCheckLine size={11} /> Offer sent
          </span>
        </div>
      </div>
      <svg
        className={`absolute top-[30%] left-[30%] h-[14px] w-[14px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)] ${anim("motion-safe:animate-[rec-cursor_6s_var(--ease-io)_infinite]")}`}
        viewBox="0 0 12 16"
        aria-hidden="true"
      >
        <path d="M1 1v12.5l3.2-3 2.2 4.8 2-.9-2.1-4.7H10.5z" fill="#141518" stroke="#fff" strokeWidth="1" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex h-[26px] items-center gap-2 bg-ink/90 px-2.5 font-mono text-[8.5px] text-white/70">
        <RiPlayFill size={11} className="text-white" />
        <span className="relative h-[3px] flex-1 bg-white/20">
          <span className={`absolute inset-0 origin-left scale-x-[0.4] bg-signal ${playing ? "motion-safe:animate-[rec-progress_6s_linear_infinite]" : ""}`} />
        </span>
        <span>0:06</span>
      </div>
    </div>
  );
}

function SaleListing({ playing }: { playing: boolean }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[40%_60%]">
      <Explanation index={3}>
        <p className="mt-4 text-[13px] leading-[21px] text-text">
          The listing page shows the monthly estimate from section 02 and an offer form. Recorded on the preview deploy.
        </p>
        <Recording playing={playing} />
        <div className="mt-5 flex gap-2">
          <span className="btn btn-primary btn-sm pointer-events-none">Mark reviewed and finish</span>
        </div>
      </Explanation>
      <div className="flex flex-col gap-3 bg-wash p-4 md:p-5">
        <div className="flex items-center gap-2 border border-black/15 bg-white px-3 py-2 text-[11px] text-text">
          <span className="tag border-ink bg-ink text-white">v2</span>
          <span className="truncate">
            Updated for <span className="font-mono text-[10.5px] text-ink">a1f3c9e</span> by Claude Code over MCP
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[9px] tracking-[0.06em] text-black/40 uppercase">
            <span className="line-through">v1</span> outdated
          </span>
        </div>
        <FileCard status="added" path="app/listings/[id]/page.tsx" add={126} del={0}>
          <Diff lines={PAGE_LINES} />
          <div className="border-t border-dashed border-black/10 bg-mist px-3 py-0.5 font-sans text-[10.5px] text-ui">↕ Show 41 unchanged lines</div>
        </FileCard>
      </div>
    </div>
  );
}

export function ProductSchematic() {
  const [active, setActive] = useState(INITIAL);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (active + step + SECTIONS.length) % SECTIONS.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  const panels = [<DataModel key={0} />, <MortgageMath key={1} />, <OffersApi key={2} />, <SaleListing key={3} playing={active === 3} />];

  return (
    <div className="relative mx-auto w-full max-w-[1040px]">
      {CALLOUTS.flatMap((set, i) => set.map((c) => <Callout key={`${i}-${c.label}`} {...c} visible={i === active} />))}

      <div className="relative border border-solid border-[#a8a8a8] bg-white text-left">
        {/* PR bar */}
        <div className="flex items-center gap-3 border-b border-dashed border-line bg-paper px-4 py-2.5 grain">
          <span className="font-mono text-[10px] tracking-[0.06em] text-black/50 uppercase">hearth / #7</span>
          <span className="tag border-olive/40 text-olive">open</span>
          <span className="truncate font-serif text-[15px] tracking-[-0.01em] text-black">Add home buying</span>
          <span className="ml-auto font-mono text-[10px] text-black/50">
            <span className="text-[#1f8a85]">+3,481</span> <span className="text-danger">−212</span> · 46 files
          </span>
        </div>
        {/* Stepper */}
        <div
          className="relative flex overflow-hidden border-b border-solid border-black/15 bg-paper"
          role="tablist"
          aria-label="Sections of an example guided pull request"
          onKeyDown={onKeyDown}
        >
          <span
            className="absolute inset-y-0 left-0 bg-ink transition-transform duration-500 ease-(--ease-snap) motion-reduce:transition-none"
            style={{ width: `${100 / SECTIONS.length}%`, transform: `translateX(${active * 100}%)` }}
            aria-hidden="true"
          />
          {SECTIONS.map((s, i) => {
            const on = i === active;
            const done = i <= active;
            return (
              <button
                key={s.n}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`schematic-tab-${i}`}
                aria-selected={on}
                aria-controls={`schematic-panel-${i}`}
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(i)}
                className={`group relative flex h-12 min-w-0 flex-1 cursor-pointer flex-col justify-center gap-0.5 border-r border-dashed border-line px-3 text-left outline-none last:border-r-0 focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-inset ${
                  on ? "" : "hover:bg-black/[0.035]"
                } transition-colors duration-300`}
              >
                <span
                  className={`absolute inset-x-0 top-0 h-[2px] transition-colors duration-500 ${done ? (on ? "bg-signal" : "bg-ink") : "bg-transparent"}`}
                />
                <span
                  className={`flex items-center gap-1 font-mono text-[9px] tracking-[0.08em] uppercase transition-colors duration-300 ${on ? "text-white/60" : "text-black/45"}`}
                >
                  <span className={`dot h-[5px] w-[5px] transition-colors duration-300 ${on ? "bg-signal" : done ? "bg-ink" : "bg-black/20"}`} />
                  {s.n}
                </span>
                <span className={`truncate font-serif text-[13px] transition-colors duration-300 ${on ? "text-white" : "text-black"}`}>{s.title}</span>
              </button>
            );
          })}
        </div>
        {/* Panels share one grid cell so the frame keeps the height of the tallest and never jumps. */}
        <div className="grid overflow-hidden">
          {panels.map((panel, i) => (
            <div
              key={i}
              role="tabpanel"
              id={`schematic-panel-${i}`}
              aria-labelledby={`schematic-tab-${i}`}
              inert={i !== active}
              className={`col-start-1 row-start-1 transition-[opacity,translate,filter] duration-500 ease-(--ease-snap) motion-reduce:transition-none ${
                i === active ? "opacity-100 blur-0" : `pointer-events-none opacity-0 blur-[2px] ${i < active ? "-translate-x-4" : "translate-x-4"}`
              }`}
            >
              {panel}
            </div>
          ))}
        </div>
      </div>
      <div className="pointer-events-none mt-4 hidden justify-between font-mono text-[8px] leading-[12px] tracking-[0.2px] text-[#898989] uppercase md:flex" aria-hidden="true">
        <span>
          OMK-0007 // Version 2 // {SECTIONS.length} sections // 46 files
        </span>
        <span>process: diff → sections → review → github</span>
      </div>
    </div>
  );
}
