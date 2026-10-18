const REPO = "https://github.com/tom-byrn/guided-prs";

const COLUMNS = [
  {
    head: "01 Product",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Features", href: "#features" },
      { label: "Agents and MCP", href: "#agents" },
    ],
  },
  {
    head: "02 Self-host",
    links: [
      { label: "Docker", href: `${REPO}/blob/main/docs/self-hosting.md` },
      { label: "Configuration", href: `${REPO}/blob/main/docs/configuration.md` },
      { label: "GitHub App", href: `${REPO}/blob/main/docs/github-app.md` },
    ],
  },
  {
    head: "03 Docs",
    links: [
      { label: "MCP tools", href: `${REPO}/blob/main/docs/mcp.md` },
      { label: "REST API", href: `${REPO}/blob/main/docs/api.md` },
      { label: "Architecture", href: `${REPO}/blob/main/docs/architecture.md` },
    ],
  },
  {
    head: "04 Project",
    links: [
      { label: "Source", href: REPO },
      { label: "Contributing", href: `${REPO}/blob/main/CONTRIBUTING.md` },
      { label: "License (MIT)", href: `${REPO}/blob/main/LICENSE` },
    ],
  },
];

export function Footer() {
  return (
    <footer className="dark bg-night grain-dark">
      <div className="mx-auto max-w-[1560px] px-6 pt-16 md:px-[72px] md:pt-[54px]">
        <div className="footer-links grid grid-cols-2 gap-x-5 gap-y-10 md:flex md:justify-between">
          {COLUMNS.map((c) => (
            <div key={c.head} className="min-w-[160px]">
              <p className="font-serif text-[18px] leading-[19.8px] tracking-[-0.18px] text-white">{c.head}</p>
              <span className="mt-4 block border-t border-dashed border-white/[0.16]" />
              <ul className="mt-4 flex flex-col gap-3">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="font-mono text-[12px] tracking-[0.72px] text-white/60 uppercase hover:text-white lg:text-[14px] lg:tracking-[0.84px]"
                      {...(l.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-20 select-none overflow-hidden" aria-hidden="true">
          <svg viewBox="0 0 1296 260" className="w-full" preserveAspectRatio="xMidYMid meet">
            <text
              x="0"
              y="210"
              fill="rgba(255,255,255,0.92)"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontSize: 262, letterSpacing: "-0.055em" }}
            >
              Guided PRs
            </text>
          </svg>
        </div>
        <div className="flex flex-col gap-2 border-t border-dashed border-white/[0.16] py-6 font-mono text-[10px] leading-[14px] text-white/60 uppercase md:flex-row md:justify-between">
          <span>Guided PRs · MIT licensed · Self-hosted</span>
          <span>Not affiliated with GitHub</span>
        </div>
      </div>
    </footer>
  );
}
