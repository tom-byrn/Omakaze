import { RiGithubFill } from "@remixicon/react";
import { SideNote } from "@/components/landing/SideNote";
import { Logo } from "@/components/ui/Logo";

function columns(repo: string) {
  const docs = `${repo}/blob/main/docs`;
  return [
    {
      head: "Product",
      links: [
        { label: "How it works", href: "#how-it-works" },
        { label: "Features", href: "#features" },
        { label: "Agents and MCP", href: "#agents" },
        { label: "Self-host", href: "#self-host" },
      ],
    },
    {
      head: "Self-host",
      links: [
        { label: "Docker Compose", href: `${docs}/self-hosting.md` },
        { label: "Configuration", href: `${docs}/configuration.md` },
        { label: "GitHub App", href: `${docs}/github-app.md` },
        { label: "AI providers", href: `${docs}/ai.md` },
      ],
    },
    {
      head: "Docs",
      links: [
        { label: "MCP tools", href: `${docs}/mcp.md` },
        { label: "REST API", href: `${docs}/api.md` },
        { label: "Architecture", href: `${docs}/architecture.md` },
        { label: "Development", href: `${docs}/development.md` },
      ],
    },
    {
      head: "Project",
      links: [
        { label: "Source", href: repo },
        { label: "Changelog", href: `${repo}/blob/main/CHANGELOG.md` },
        { label: "Contributing", href: `${repo}/blob/main/CONTRIBUTING.md` },
        { label: "Security", href: `${repo}/blob/main/SECURITY.md` },
        { label: "License (MIT)", href: `${repo}/blob/main/LICENSE` },
      ],
    },
  ];
}

export function Footer({ repoUrl }: { repoUrl: string }) {
  return (
    <footer className="dark bg-night grain-dark">
      <div className="relative mx-auto max-w-[1560px] px-6 md:px-[72px]">
        <div className="grid grid-cols-1 gap-14 py-16 md:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] lg:gap-10">
          <div className="flex flex-col items-start">
            <Logo invert />
            <p className="mt-6 max-w-[320px] text-[15px] leading-[24px] tracking-[-0.3px] text-white/60">
              Guided reviews for GitHub pull requests. Open source and self-hosted.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={repoUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-md">
                <RiGithubFill size={16} aria-hidden="true" />
                View on GitHub
              </a>
              <a href={`${repoUrl}/blob/main/docs/self-hosting.md`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-md">
                Self-hosting guide
              </a>
            </div>
          </div>
          <nav className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-4" aria-label="Footer">
            {columns(repoUrl).map((c, i) => (
              <div key={c.head}>
                <p className="font-mono text-[10px] tracking-[0.08em] text-white/40">{String(i + 1).padStart(2, "0")}</p>
                <p className="mt-2 font-serif text-[18px] leading-[19.8px] tracking-[-0.18px] text-white">{c.head}</p>
                <span className="mt-4 block border-t border-dashed border-white/[0.16]" />
                <ul className="mt-4 flex flex-col gap-3">
                  {c.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        className="font-mono text-[12px] tracking-[0.72px] text-white/60 uppercase transition-colors hover:text-white"
                        {...(l.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="select-none border-t border-dashed border-white/[0.16] pt-10 pb-6" aria-hidden="true">
          <svg viewBox="0 0 1176 238" className="w-full" preserveAspectRatio="xMidYMid meet">
            <text
              x="0"
              y="226"
              fill="rgba(255,255,255,0.92)"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontSize: 300, letterSpacing: "-0.05em" }}
            >
              Omakaze
            </text>
          </svg>
        </div>
        <SideNote note="footer" side="right" className="bottom-24" />

        <div className="flex flex-col gap-3 border-t border-dashed border-white/[0.16] py-6 font-mono text-[10px] leading-[14px] tracking-[0.06em] text-white/50 uppercase md:flex-row md:items-center md:justify-between">
          <span>MIT License · © 2026 Omakaze contributors</span>
          <span>Not affiliated with GitHub</span>
          <a href="#top" className="transition-colors hover:text-white">
            Back to top ↑
          </a>
        </div>
      </div>
    </footer>
  );
}
