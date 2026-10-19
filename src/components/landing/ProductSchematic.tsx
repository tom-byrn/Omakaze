"use client";

import { RiArrowRightUpLine, RiCheckboxCircleFill, RiCheckLine, RiHeart3Line, RiLock2Line, RiMapPin2Line, RiPlayFill } from "@remixicon/react";
import Image from "next/image";
import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

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
// Sections marked as reviewed in the tab row, as the guide viewer marks them.
const REVIEWED = new Set([0, 1]);

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

function Callout({ label, sub, side, top, reveal }: CalloutSpec & { reveal: boolean }) {
  const left = side === "left";
  return (
    <div
      className={`pointer-events-none absolute hidden w-[124px] min-[1400px]:block ${left ? "-left-[176px]" : "-right-[176px] text-right"} ${
        reveal ? "motion-safe:animate-reveal" : ""
      }`}
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

// Whether a panel's explanation should play the reveal: it is the open section and was opened by a click.
const RevealContext = createContext(false);

function Explanation({ index, children }: { index: number; children: ReactNode }) {
  const reveal = useContext(RevealContext);
  return (
    <div className="border-r border-dashed border-line bg-paper px-6 py-6 grain md:px-8">
      {/* Same as the guide viewer: the explanation fades in from a blur, the diff swaps in place. */}
      <div className={reveal ? "motion-safe:animate-reveal" : undefined}>
        <span className="eyebrow">
          Section {SECTIONS[index].n} / {String(SECTIONS.length).padStart(2, "0")}
        </span>
        <p className="mt-4 font-serif text-[28px] leading-none tracking-[-0.03em] text-black">{SECTIONS[index].title}</p>
        {children}
      </div>
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

// The recorded browser viewport, in CSS px. The recording draws Hearth at this width and scales it to fit the frame.
const APP_W = 680;
const ACCENT = "#1d4ed8";

/** Scale from APP_W to the frame's current width. */
function useFitScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(350 / APP_W);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / APP_W));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, scale] as const;
}

function HearthLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill={ACCENT} />
      <path d="M7 15.5 16 8l9 7.5V25a1 1 0 0 1-1 1h-5.5v-6h-5v6H8a1 1 0 0 1-1-1z" fill="#fff" />
      <path d="M16 12.6c1.7 1.6 2.5 3 2.5 4.2a2.5 2.5 0 0 1-5 0c0-1.2.8-2.6 2.5-4.2z" fill="#f59e0b" />
    </svg>
  );
}

/** The Hearth listing page from the pull request, as it renders on the preview deploy. */
function HearthListing() {
  const thumbs = [1, 2, 3, 4];
  return (
    <div className="px-6 pb-6 text-[#151c26]">
      <p className="pt-3 pb-2.5 text-[11px] text-[#556070]">
        Buy <span className="px-1 text-[#8792a2]">/</span> Higashiyama <span className="px-1 text-[#8792a2]">/</span>
        <span className="text-[#151c26]"> 2-14 Kazuemachi</span>
      </p>
      <div className="grid h-[200px] grid-cols-[2fr_1fr_1fr] grid-rows-2 gap-1 overflow-hidden rounded-[10px]">
        <div className="relative row-span-2">
          <Image src="/landing/listing-house.webp" alt="" fill sizes="240px" className="object-cover" />
        </div>
        {thumbs.map((n) => (
          <div key={n} className="relative">
            <Image src={`/landing/listing-house-${n}.webp`} alt="" fill sizes="120px" className="object-cover" />
            {n === 4 ? (
              <span className="absolute right-2 bottom-2 rounded-md bg-white px-2 py-1 text-[9.5px] font-medium shadow-sm">View all 5 photos</span>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-[1fr_210px] gap-5">
        <div>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[26px] leading-none font-bold tracking-[-0.02em]">¥78,000,000</p>
              <p className="mt-2 flex gap-3 text-[11px] text-[#556070]">
                <span>
                  <b className="text-[#151c26]">3</b> bed
                </span>
                <span>
                  <b className="text-[#151c26]">2</b> bath
                </span>
                <span>
                  <b className="text-[#151c26]">112</b> m²
                </span>
              </p>
            </div>
            <span className="flex items-center gap-1 rounded-full border border-[#cfd5dd] px-3 py-1.5 text-[11px] font-medium">
              <RiHeart3Line size={12} /> Save
            </span>
          </div>
          <p className="mt-3 text-[16px] font-semibold">2-14 Kazuemachi</p>
          <p className="mt-0.5 text-[11px] text-[#556070]">Higashiyama, Kanazawa · Machiya townhouse</p>
          <div className="mt-3 grid grid-cols-4 gap-1.5 text-[10px]">
            {["Built 1924", "Restored 2019", "Riverside", "Move in Dec"].map((h) => (
              <span key={h} className="rounded-lg border border-[#e4e7ec] bg-[#f8f9fb] px-2 py-2 font-medium">
                {h}
              </span>
            ))}
          </div>
          <p className="mt-4 border-t border-[#e4e7ec] pt-3 text-[13px] font-semibold">About this home</p>
          <p className="mt-1.5 text-[11px] leading-[17px] text-[#556070]">
            A wooden machiya on the Asano river with lattice windows, a tatami room on every floor and a small garden at
            the back. Ten minutes on foot to Higashi Chaya.
          </p>
          <p className="mt-4 border-t border-[#e4e7ec] pt-3 text-[13px] font-semibold">Facts</p>
          <dl className="mt-2 grid grid-cols-3 overflow-hidden rounded-lg border border-[#e4e7ec] text-[10px]">
            {[
              ["Property type", "Townhouse"],
              ["Floors", "3"],
              ["Land", "86 m²"],
              ["Property tax", "¥210,000/yr"],
              ["Size", "112 m²"],
              ["Listed", "Yesterday"],
            ].map(([k, v], i) => (
              <div key={k} className={`px-2.5 py-2 ${i % 3 ? "border-l" : ""} ${i > 2 ? "border-t" : ""} border-[#e4e7ec]`}>
                <dt className="text-[#556070]">{k}</dt>
                <dd className="mt-0.5 font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 border-t border-[#e4e7ec] pt-3 text-[13px] font-semibold">Location</p>
          <div className="relative mt-2 h-[120px] overflow-hidden rounded-lg border border-[#e4e7ec] bg-[#f3efe6]">
            <span className="absolute inset-y-0 left-[38%] w-[18px] -skew-x-12 bg-[#cfe0ec]" />
            <span className="absolute inset-x-0 top-[42%] h-[6px] bg-white" />
            <span className="absolute inset-y-0 left-[70%] w-[6px] bg-white" />
            <span className="absolute top-[12%] right-[8%] h-[50px] w-[70px] rounded-full bg-[#d7e8cf]" />
            <span className="absolute top-[30%] left-[48%] flex h-[22px] w-[22px] items-center justify-center rounded-full border-[3px] border-white bg-[#1d4ed8] shadow">
              <span className="h-[6px] w-[6px] rounded-full bg-white" />
            </span>
            <span className="absolute top-[64%] left-[52%] text-[9px] font-semibold tracking-[0.14em] text-[#1d4ed8] uppercase">Higashiyama</span>
          </div>
        </div>
        <aside className="self-start rounded-xl border border-[#e4e7ec] p-3.5 shadow-sm">
          <p className="text-[10px] font-medium text-[#556070]">Estimated monthly payment</p>
          <p className="mt-1 text-[20px] leading-none font-bold">
            ¥176,000<span className="text-[11px] font-medium text-[#556070]">/mo</span>
          </p>
          <div className="mt-3 space-y-1.5 border-t border-[#e4e7ec] pt-2.5 text-[10.5px]">
            {[
              ["Down payment", "20%"],
              ["Term", "35 years"],
              ["Rate", "0.9%"],
            ].map(([k, v]) => (
              <p key={k} className="flex justify-between">
                <span className="text-[#556070]">{k}</span>
                <span className="font-semibold">{v}</span>
              </p>
            ))}
          </div>
          <span className="motion-safe:group-data-[playing]/rec:animate-[rec-press_8s_var(--ease-io)_infinite] mt-3 flex h-[30px] items-center justify-center rounded-lg bg-[#1d4ed8] text-[11px] font-semibold text-white">
            Make an offer
          </span>
          <p className="mt-2 text-center text-[9px] leading-[13px] text-[#8792a2]">Offers go to the seller&apos;s agent, Haruto Mori.</p>
        </aside>
      </div>
    </div>
  );
}

/** A looping screen recording of Hearth: the page scrolls to the estimate, the cursor clicks "Make an offer" and the offer is sent. */
function Recording({ playing }: { playing: boolean }) {
  const [ref, scale] = useFitScale();
  // Every part loops on the same 8s clock while the section is open; it rests on its first frame otherwise.
  return (
    <div
      ref={ref}
      data-playing={playing || undefined}
      className="group/rec relative mt-4 aspect-[16/8.4] overflow-hidden border border-black/15 bg-white"
    >
      <div
        className="absolute top-0 left-0 flex origin-top-left flex-col bg-white font-sans"
        style={{ width: APP_W, height: `${100 / scale}%`, transform: `scale(${scale})` }}
      >
        <div className="flex h-[26px] shrink-0 items-center gap-2 border-b border-[#e4e7ec] bg-[#f6f7f9] px-3">
          <span className="flex gap-1">
            <span className="h-[7px] w-[7px] rounded-full bg-[#e0e3e8]" />
            <span className="h-[7px] w-[7px] rounded-full bg-[#e0e3e8]" />
            <span className="h-[7px] w-[7px] rounded-full bg-[#e0e3e8]" />
          </span>
          <span className="mx-auto flex w-[260px] items-center justify-center gap-1 rounded-md bg-white px-2 py-[3px] text-[9.5px] text-[#556070]">
            <RiLock2Line size={9} /> preview-7.hearth.app/homes/214
          </span>
        </div>
        <div className="flex h-[44px] shrink-0 items-center gap-4 border-b border-[#e4e7ec] px-4">
          <span className="flex items-center gap-1.5 text-[15px] font-bold tracking-[-0.01em] text-[#151c26]">
            <HearthLogo /> Hearth
          </span>
          <span className="text-[11px] font-medium text-[#556070]">Rentals</span>
          <span className="rounded-full bg-[#eaf0fe] px-2.5 py-1 text-[11px] font-semibold text-[#1d4ed8]">Buy</span>
          <span className="flex items-center gap-1 text-[11px] font-medium text-[#556070]">
            <RiHeart3Line size={11} /> Saved homes
          </span>
          <span className="ml-auto flex items-center gap-1 rounded-full border border-[#e4e7ec] px-2.5 py-1 text-[10px] text-[#556070]">
            <RiMapPin2Line size={10} /> Kanazawa, Ishikawa
          </span>
        </div>
        <div className="relative flex-1 overflow-hidden">
          <div className="motion-safe:group-data-[playing]/rec:animate-[rec-scroll_8s_var(--ease-io)_infinite]">
            <HearthListing />
          </div>
          <div className="motion-safe:group-data-[playing]/rec:animate-[rec-toast_8s_var(--ease-io)_infinite] absolute top-3 right-4 flex items-center gap-2 rounded-lg border border-[#e4e7ec] bg-white px-3 py-2 text-[11px] opacity-0 shadow-lg">
            <RiCheckboxCircleFill size={15} className="text-[#15803d]" />
            <span>
              <b className="font-semibold text-[#151c26]">Offer sent</b>
              <span className="block text-[10px] text-[#556070]">Haruto will reply within a day.</span>
            </span>
          </div>
        </div>
        <svg
          className="motion-safe:group-data-[playing]/rec:animate-[rec-cursor_8s_var(--ease-io)_infinite] absolute top-[150px] left-[300px] h-[20px] w-[15px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]"
          viewBox="0 0 12 16"
          aria-hidden="true"
        >
          <path d="M1 1v12.5l3.2-3 2.2 4.8 2-.9-2.1-4.7H10.5z" fill="#141518" stroke="#fff" strokeWidth="1" />
        </svg>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex h-[20px] items-center gap-2 bg-gradient-to-t from-ink/80 to-ink/40 px-2.5 font-mono text-[8.5px] text-white/80">
        <RiPlayFill size={11} className="text-white" />
        <span className="relative h-[3px] flex-1 bg-white/25">
          <span className="motion-safe:group-data-[playing]/rec:animate-[rec-progress_8s_linear_infinite] absolute inset-0 origin-left scale-x-[0.4] bg-signal" />
        </span>
        <span>0:08</span>
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
  // No reveal on page load; only when a visitor switches sections.
  const [switched, setSwitched] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (active + step + SECTIONS.length) % SECTIONS.length;
    open(next);
    tabs.current[next]?.focus();
  }

  function open(i: number) {
    if (i === active) return;
    setActive(i);
    setSwitched(true);
  }

  const panels = [<DataModel key={0} />, <MortgageMath key={1} />, <OffersApi key={2} />, <SaleListing key={3} playing={active === 3} />];

  return (
    <div className="relative mx-auto w-full max-w-[1040px]">
      {CALLOUTS[active].map((c) => (
        <Callout key={`${active}-${c.label}`} {...c} reveal={switched} />
      ))}

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
          {SECTIONS.map((s, i) => {
            const on = i === active;
            const done = REVIEWED.has(i);
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
                onClick={() => open(i)}
                className={`group relative flex h-12 min-w-0 flex-1 cursor-pointer flex-col justify-center gap-0.5 border-r border-dashed border-line px-3 text-left transition-colors outline-none last:border-r-0 focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-inset ${
                  on ? "bg-ink" : "hover:bg-black/[0.03]"
                }`}
              >
                <span
                  className={`absolute inset-x-0 top-0 h-[2px] ${done ? "bg-ink" : "bg-transparent"}`}
                />
                <span
                  className={`flex items-center gap-1 font-mono text-[9px] tracking-[0.08em] uppercase ${on ? "text-white/60" : "text-black/45"}`}
                >
                  <span className={`dot h-[5px] w-[5px] ${on ? "bg-signal" : done ? "bg-ink" : "bg-black/20"}`} />
                  {s.n}
                </span>
                <span className={`truncate font-serif text-[13px] ${on ? "text-white" : "text-black"}`}>{s.title}</span>
              </button>
            );
          })}
        </div>
        {/* Panels share one grid cell so the frame keeps the height of the tallest and never jumps; only the open one is visible. */}
        <div className="grid">
          {panels.map((panel, i) => (
            <div
              key={i}
              role="tabpanel"
              id={`schematic-panel-${i}`}
              aria-labelledby={`schematic-tab-${i}`}
              inert={i !== active}
              className={`col-start-1 row-start-1 ${i === active ? "" : "invisible"}`}
            >
              <RevealContext value={switched && i === active}>{panel}</RevealContext>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
