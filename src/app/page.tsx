import Link from "next/link";
import { CopyButton } from "@/components/ui/CopyButton";
import { Footer } from "@/components/landing/Footer";
import { ProductSchematic } from "@/components/landing/ProductSchematic";
import { SideNote } from "@/components/landing/SideNote";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { Steps } from "@/components/landing/Steps";
import { TerminalTyping, type TerminalLine } from "@/components/landing/TerminalTyping";
import { shipporiMincho } from "@/app/landing-font";
import { getAuthMethods } from "@/lib/auth/methods";
import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { agentPrompt, setupPrompt } from "@/lib/prompts";

const REPO = "https://github.com/tom-byrn/guided-prs";

const TERMINAL_LINES: TerminalLine[] = [
  { text: `git clone ${REPO}.git`, command: true },
  { text: "cd guided-prs", command: true },
  { text: "cp .env.example .env", command: true },
  { text: "docker compose up -d", command: true },
  { text: "# open http://localhost:3000", command: false },
];

const FEATURES = [
  {
    title: "Changes that are understandable.",
    body: "Changes are grouped by what they do. A file can appear in several sections, and every changed line ends up in one.",
  },
  {
    title: "Markdown that does more.",
    body: "Headings, tables, Mermaid diagrams, math, code blocks, screenshots and screen recordings next to the code.",
  },
  {
    title: "Context when you need it.",
    body: "Expand unchanged lines in steps of twenty, show the enclosing function, or open the whole file.",
  },
  {
    title: "Comments go to GitHub.",
    body: "Comment on a line, reply to a thread, approve or request changes. Everything is posted to the pull request.",
  },
  {
    title: "Shared by the team.",
    body: "Workspaces with invites and roles. Everyone sees the same guides and who reviewed which section.",
  },
  {
    title: "Automatic when you want it.",
    body: "Generate a guide for every new pull request and a new version on every push, with OpenRouter, Anthropic, OpenAI or a local model.",
  },
];

export default async function LandingPage() {
  const user = await getCurrentUser();
  const methods = await getAuthMethods();
  const appUrl = env().APP_URL;
  const prompt = setupPrompt(appUrl);
  return (
    <div id="top" className={`${shipporiMincho.variable} bg-paper`}>
      <SiteHeader signedIn={Boolean(user)} repoUrl={REPO} />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-dashed border-black/[0.08] grain">
        <div className="pointer-events-none absolute inset-y-0 left-[72px] hidden border-l border-dashed border-black/[0.08] md:block" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-y-0 right-[72px] hidden border-r border-dashed border-black/[0.08] md:block" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-y-0 left-[271px] hidden border-l border-dashed border-black/[0.06] xl:block" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-y-0 right-[271px] hidden border-r border-dashed border-black/[0.06] xl:block" aria-hidden="true" />
        <div className="relative mx-auto max-w-[1560px] px-4 pt-36 pb-24 md:px-[72px] md:pt-44">
          <SideNote note="hero" side="left" className="top-44" />
          <SideNote note="heroAside" side="right" className="top-44" />
          <div className="mx-auto flex max-w-[840px] flex-col items-center text-center">
            <span className="eyebrow animate-reveal">Open source · Self-hosted · MCP</span>
            <h1 className="h1 mt-6 animate-reveal">
              Review your pull requests <br className="hidden sm:block" />
              one section at a time.
            </h1>
            <p className="lead mt-6 max-w-[560px] animate-reveal">
              Omakaze splits a pull request into sections. Each section explains one part of the change next to the code it
              covers.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
              <Link href="/login" className="btn btn-primary btn-lg w-[260px]">
                {user ? "Open the app" : methods.github ? "Sign In with GitHub" : "Sign In"}
              </Link>
              <CopyButton text={prompt} label="Copy Setup Prompt" copiedLabel="Setup Prompt Copied" className="btn btn-secondary btn-lg w-[260px]" />
            </div>
          </div>
          <div className="mt-20">
            <ProductSchematic />
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className="border-b border-dashed border-line grain">
        <div className="mx-auto grid max-w-[1560px] grid-cols-1 md:grid-cols-3 md:px-[72px]">
          {[
            ["MIT", "Licensed. Run it anywhere."],
            ["17", "MCP tools for coding agents."],
            ["4", "AI providers, including local models."],
          ].map(([n, c], i) => (
            <div key={c} className={`flex flex-col gap-2.5 px-6 py-8 ${i > 0 ? "border-t border-dashed border-line md:border-t-0 md:border-l" : ""}`}>
              <span className="font-serif text-[52px] leading-[1.1] tracking-[-0.04em] text-stat lg:text-[64px]">{n}</span>
              <span className="text-[16px] leading-[22.4px] tracking-[-0.48px] text-muted">{c}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Intro split */}
      <section className="border-b border-dashed border-line">
        <div className="relative mx-auto grid max-w-[1560px] grid-cols-1 gap-10 px-6 py-16 md:px-[72px] md:py-24 lg:grid-cols-2 lg:gap-0">
          <SideNote note="why" side="right" />
          <div className="lg:pr-16">
            <span className="eyebrow">Why</span>
            <h2 className="h2 mt-6">
              A walkthrough instead
              <br />
              of a wall of diff.
            </h2>
          </div>
          <div className="flex max-w-[560px] flex-col gap-5 lg:border-l lg:border-dashed lg:border-line lg:pl-16">
            <p className="body-copy">
              Large pull requests are reviewed file by file, in alphabetical order. Reviewers have to rebuild the author&apos;s
              intent before they can judge the code.
            </p>
            <p className="body-copy">
              A guided PR puts the change in reading order: data model, logic, API, interface, tests. Each section says what
              changed and what to check, and shows only the lines it is about.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="dark scroll-mt-16 bg-night-2 grain-dark">
        <div className="relative mx-auto max-w-[1560px] px-4 py-16 md:px-[72px] md:py-24">
          <SideNote note="steps" side="left" />
          <Steps />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-16 border-b border-dashed border-line">
        <div className="relative mx-auto max-w-[1560px] px-6 py-16 md:px-[72px] md:py-24">
          <SideNote note="features" side="right" />
          <span className="eyebrow">Features</span>
          <h2 className="h2 mt-6 max-w-[620px]">What reviewers get.</h2>
          <div className="mt-12 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-5 xl:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="relative flex min-h-[230px] flex-col justify-between gap-8 border border-black/15 bg-white px-8 pt-8 pb-6 grain">
                <p className="font-serif text-[26px] leading-[1.1] tracking-[-0.01em] text-black lg:text-[28px]">{f.title}</p>
                <div>
                  <p className="body-copy">{f.body}</p>
                  <p className="mt-5 font-mono text-[10px] tracking-[0.08em] text-black/40 uppercase">F-{String(i + 1).padStart(2, "0")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agents */}
      <section id="agents" className="blue scroll-mt-16 bg-brand-gradient">
        <div className="relative mx-auto grid max-w-[1560px] grid-cols-1 gap-12 px-6 py-16 md:px-[72px] md:py-[110px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <SideNote note="agents" side="left" className="top-[110px]" />
          <div>
            <span className="eyebrow">Agents</span>
            <h2 className="mt-6 font-serif text-[36px] leading-none tracking-[-1.44px] text-white sm:text-[44px] sm:tracking-[-0.025em]">
              Your agent writes
              <br />
              the guide.
            </h2>
            <p className="mt-6 max-w-[480px] text-[16px] leading-[26px] tracking-[-0.4px] text-white/75">
              Omakaze runs an MCP server. Claude Code, Codex, Cursor and other MCP clients connect with OAuth and can read
              the diff, write sections, upload screenshots and publish the guide.
            </p>
            <div className="mt-10 grid grid-cols-2 gap-px border border-white/15 bg-white/15 font-mono text-[10px] tracking-[0.09em] text-[#dddddd] uppercase">
              {["Claude Code", "Codex", "Cursor", "VS Code", "Windsurf", "Any MCP client"].map((c) => (
                <span key={c} className="bg-[#163a6f]/60 px-4 py-3">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-5">
            <div className="border border-white/20 bg-[#0d2347]/70">
              <div className="flex items-center justify-between border-b border-white/15 px-4 py-2.5">
                <span className="font-mono text-[10px] tracking-[0.09em] text-[#a9b8c8] uppercase">1 · Setup prompt</span>
                <CopyButton text={prompt} label="Copy" className="btn btn-invert btn-xs" />
              </div>
              <pre className="max-h-[260px] overflow-auto p-4 font-mono text-[12px] leading-[19px] whitespace-pre-wrap text-white/80">{prompt}</pre>
            </div>
            <div className="border border-white/20 bg-[#0d2347]/70">
              <div className="flex items-center justify-between border-b border-white/15 px-4 py-2.5">
                <span className="font-mono text-[10px] tracking-[0.09em] text-[#a9b8c8] uppercase">2 · For each pull request</span>
                <CopyButton text={agentPrompt("https://github.com/owner/repo/pull/123")} label="Copy" className="btn btn-invert btn-xs" />
              </div>
              <p className="p-4 font-mono text-[12px] leading-[19px] text-white/80">{agentPrompt("https://github.com/owner/repo/pull/123")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Self-host */}
      <section id="self-host" className="scroll-mt-16 border-b border-dashed border-line bg-mist">
        <div className="relative mx-auto grid max-w-[1560px] grid-cols-1 gap-10 px-6 py-16 md:px-[72px] md:py-24 lg:grid-cols-2">
          <SideNote note="selfHost" side="right" />
          <div>
            <span className="eyebrow">Self-host</span>
            <h2 className="h2 mt-6">
              Your code stays
              <br />
              on your servers.
            </h2>
            <p className="body-copy mt-6 max-w-[520px]">
              One container and Postgres. Bring your own GitHub App and model API key, or run a local model. The setup page
              creates the GitHub App for you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={`${REPO}/blob/main/docs/self-hosting.md`} target="_blank" rel="noreferrer" className="btn btn-primary btn-md">
                Self-hosting guide
              </a>
              <a href={REPO} target="_blank" rel="noreferrer" className="btn btn-secondary btn-md">
                Source on GitHub
              </a>
            </div>
          </div>
          <div className="relative border border-black/15 bg-white">
            <div className="flex items-center justify-between border-b border-dashed border-line px-4 py-2.5">
              <span className="mono-label">Terminal</span>
              <CopyButton
                text={TERMINAL_LINES.filter((l) => l.command)
                  .map((l) => l.text)
                  .join("\n")}
                label="Copy"
                className="btn btn-secondary btn-xs"
              />
            </div>
            <TerminalTyping lines={TERMINAL_LINES} className="overflow-auto p-5 font-mono text-[13px] leading-[24px] text-ink" />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-paper grain">
        <div className="relative mx-auto max-w-[1560px] px-6 py-24 md:px-[72px] md:py-32">
          <SideNote note="next" side="left" className="top-32" />
          <p className="max-w-[1000px] font-serif text-[52px] leading-none tracking-[-0.04em] text-black md:text-[80px] lg:text-[104px]">
            Review the next one
            <br />
            in order.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/login" className="btn btn-primary btn-lg w-[260px]">
              {user ? "Open the app" : "Sign In"}
            </Link>
          </div>
          <pre
            className="pointer-events-none absolute right-10 bottom-10 hidden font-mono text-[11px] leading-[17px] text-black/[0.18] lg:block"
            aria-hidden="true"
          >{`create_guide({
  pr: "acme/web#412",
  sections: [
    { title: "Data model", refs: ["db/schema.ts"] },
    { title: "Checkout API", refs: ["api/checkout.ts#1-3"] },
  ],
})`}</pre>
        </div>
      </section>

      <Footer signedIn={Boolean(user)} repoUrl={REPO} />
    </div>
  );
}
