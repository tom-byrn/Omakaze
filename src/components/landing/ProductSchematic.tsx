const K = "#D73A49"; // keyword
const F = "#6F42C1"; // function
const N = "#005CC5"; // number / constant
const C = "#6A737D"; // comment
const D = "#24292E"; // default

type Seg = [string, string?];
type Line = { n: number | null; o?: number | null; kind: "ctx" | "add" | "del" | "gap"; segs: Seg[] };

const LINES: Line[] = [
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

function Callout({
  label,
  sub,
  className,
  lineClass,
}: {
  label: string;
  sub: string;
  className: string;
  lineClass: string;
}) {
  return (
    <div className={`pointer-events-none absolute hidden min-[1400px]:block ${className}`} aria-hidden="true">
      <div className="font-mono text-[10px] leading-[15px] tracking-[0.08em] text-[#898989] uppercase">
        <p className="flex items-center gap-1.5 text-black/70">
          <span className="inline-block h-[7px] w-[7px] bg-ink" />
          {label}
        </p>
        <p className="mt-0.5 pl-[13px] text-[8px] leading-[12px]">{sub}</p>
      </div>
      <span className={`absolute block bg-[#a8a8a8] ${lineClass}`} />
    </div>
  );
}

export function ProductSchematic() {
  return (
    <div className="relative mx-auto w-full max-w-[1040px]">
      <Callout label="Sections" sub="in review order" className="-left-[176px] top-[70px] w-[124px]" lineClass="left-[124px] top-[8px] h-px w-[52px]" />
      <Callout label="Explanation" sub="markdown · mermaid" className="-left-[176px] top-[250px] w-[124px]" lineClass="left-[124px] top-[8px] h-px w-[52px]" />
      <Callout label="Context" sub="expand on demand" className="-right-[176px] top-[262px] w-[124px] text-right" lineClass="right-[124px] top-[8px] h-px w-[52px]" />
      <Callout label="Comments" sub="posted to github" className="-right-[176px] top-[420px] w-[124px] text-right" lineClass="right-[124px] top-[8px] h-px w-[52px]" />

      <div className="relative border border-solid border-[#a8a8a8] bg-white text-left" role="img" aria-label="A guided pull request: sections on top, explanation on the left, code on the right.">
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
        <div className="flex overflow-hidden border-b border-solid border-black/15 bg-paper">
          {[
            ["—", "Overview", false, false],
            ["01", "Data model", false, true],
            ["02", "Mortgage math", true, true],
            ["03", "Offers API", false, false],
            ["04", "Sale listing page", false, false],
            ["05", "Tests", false, false],
          ].map(([n, t, active, done]) => (
            <div
              key={String(t)}
              className={`relative flex h-12 min-w-0 flex-1 flex-col justify-center gap-0.5 border-r border-dashed border-line px-3 ${active ? "bg-ink" : ""}`}
            >
              <span className={`absolute inset-x-0 top-0 h-[2px] ${done ? (active ? "bg-lacquer" : "bg-wood") : ""}`} />
              <span className={`flex items-center gap-1 font-mono text-[9px] tracking-[0.08em] uppercase ${active ? "text-white/60" : "text-black/45"}`}>
                <span className={`dot h-[5px] w-[5px] ${active ? "bg-lacquer" : done ? "bg-wood" : "bg-black/20"}`} />
                {n}
              </span>
              <span className={`truncate font-serif text-[13px] ${active ? "text-white" : "text-black"}`}>{t}</span>
            </div>
          ))}
        </div>
        {/* Panes */}
        <div className="grid grid-cols-1 md:grid-cols-[40%_60%]">
          <div className="border-r border-dashed border-line bg-paper px-6 py-6 grain md:px-8">
            <span className="eyebrow">Section 02 / 05</span>
            <p className="mt-4 font-serif text-[28px] leading-none tracking-[-0.03em] text-black">Mortgage math</p>
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
              Check the cut-off in{" "}
              <span className="border border-dashed border-blue-deep/40 bg-blue-bright/[0.06] px-1 font-mono text-[11px] text-blue-deep">
                pmi()
              </span>
              .
            </p>
            <div className="mt-6 flex gap-2">
              <span className="btn btn-primary btn-sm pointer-events-none">Mark reviewed and continue</span>
            </div>
          </div>
          <div className="bg-wash p-4 md:p-5">
            <div className="border border-black/15 bg-white">
              <div className="flex items-center gap-2 border-b border-dashed border-line bg-paper px-3 py-2">
                <span className="tag">added</span>
                <span className="font-mono text-[11px] text-ink">shared/mortgage.ts</span>
                <span className="ml-auto font-mono text-[10px]">
                  <span className="text-[#1f8a85]">+184</span> <span className="text-danger">−0</span>
                </span>
              </div>
              <div className="font-mono text-[11px] leading-[19px]">
                {LINES.map((l, i) =>
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
                        <span className="truncate pl-3 whitespace-pre">
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
                      {i === LINES.length - 3 ? (
                        <div className="border-y border-dashed border-black/10 bg-wash px-3 py-2">
                          <div className="ml-[34px] border border-black/15 bg-white px-3 py-2 font-sans">
                            <p className="text-[10.5px] text-muted">
                              <span className="text-ink">reviewer</span> · just now
                            </p>
                            <p className="mt-0.5 text-[11.5px] text-text">Should this use the loan&apos;s original value for LTV?</p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="pointer-events-none mt-4 hidden justify-between font-mono text-[8px] leading-[12px] tracking-[0.2px] text-[#898989] uppercase md:flex" aria-hidden="true">
        <span>OMK-0007 // Version 1 // 5 sections // 46 files</span>
        <span>process: diff → sections → review → github</span>
      </div>
    </div>
  );
}
