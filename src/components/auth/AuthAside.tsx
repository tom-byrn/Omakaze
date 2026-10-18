const SECTIONS = [
  { n: "01", title: "Data model", files: 3, add: 142, del: 6 },
  { n: "02", title: "Offers API", files: 5, add: 388, del: 41 },
  { n: "03", title: "Listing page", files: 9, add: 912, del: 120 },
  { n: "04", title: "Tests", files: 4, add: 455, del: 0 },
];

export function AuthAside() {
  return (
    <aside className="dark relative hidden overflow-hidden bg-night-2 grain-dark lg:flex lg:flex-col lg:justify-between" aria-hidden="true">
      <div className="pointer-events-none absolute inset-y-0 left-12 border-l border-dashed border-white/10" />
      <div className="pointer-events-none absolute inset-y-0 right-12 border-r border-dashed border-white/10" />
      <div className="px-24 pt-24">
        <span className="eyebrow">Walkthrough</span>
        <p className="mt-6 max-w-[420px] font-serif text-[40px] leading-none tracking-[-0.03em] text-[#f1f1f1]">
          One pull request.
          <br />
          Read in sections.
        </p>
      </div>
      <div className="px-24 pb-24">
        <div className="border border-border-dark">
          {SECTIONS.map((s, i) => (
            <div key={s.n} className="flex items-center gap-4 border-b border-border-dark px-5 py-4 last:border-b-0">
              <span className={`dot ${i === 1 ? "bg-signal" : "bg-[rgba(206,206,206,0.5)]"}`} />
              <span className="font-mono text-[11px] tracking-[0.08em] text-white/50">{s.n}</span>
              <span className={`font-serif text-[20px] tracking-[-0.01em] ${i === 1 ? "text-white" : "text-white/60"}`}>
                {s.title}
              </span>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.08em] text-white/40">
                {s.files} files · <span className="text-teal">+{s.add}</span> <span className="text-[#ff8a8a]">−{s.del}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.08em] text-white/40">
          GPR-0042 // 4 sections // 21 files
        </p>
      </div>
    </aside>
  );
}
