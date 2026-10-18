import {
  RiArrowRightLine,
  RiCheckboxCircleFill,
  RiCodeSSlashLine,
  RiDownload2Line,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiFileList3Line,
  RiGitBranchLine,
  RiGithubFill,
  RiKey2Line,
  RiLock2Line,
  RiRefreshLine,
  RiSearchLine,
  RiSparkling2Line,
} from "@remixicon/react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EaseDemo } from "@/components/branding/EaseDemo";
import { Swatch, type Color } from "@/components/branding/Swatch";
import { DiffStat, GuideChip, PrStateTag } from "@/components/app/Badges";
import { DitherWordmark } from "@/components/landing/DitherWordmark";
import { NOTES } from "@/components/landing/notes";
import { Logo, LogoMark } from "@/components/ui/Logo";
import { shipporiMincho } from "@/app/landing-font";

// Not linked from anywhere and kept out of search results.
export const metadata: Metadata = {
  title: "Branding",
  description: "Logos, colors, type and components of Omakaze.",
  robots: { index: false, follow: false },
};

const SECTIONS = [
  ["logo", "Logo"],
  ["wordmark", "Wordmark"],
  ["color", "Color"],
  ["type", "Type"],
  ["components", "Components"],
  ["surfaces", "Surfaces"],
  ["motion", "Motion"],
  ["icons", "Icons"],
  ["voice", "Voice"],
] as const;

const CORE: Color[] = [
  { name: "Ink", hex: "#141518", use: "Primary buttons, wordmark, brand gradient base" },
  { name: "Paper", hex: "#fcfcfc", use: "Page background" },
  { name: "Signal", hex: "#25fff9", use: "Active state, selection, dithered pixels" },
  { name: "Blue deep", hex: "#133264", use: "Gradient top, links, merged" },
  { name: "Blue bright", hex: "#147dba", use: "Gradient bottom, generating" },
  { name: "Mist", hex: "#eaebf1", use: "Self-host section background" },
];

const NEUTRALS: Color[] = [
  { name: "Foreground", hex: "#171717", use: "Default text" },
  { name: "Heading", hex: "#181a1b", use: "Section headings" },
  { name: "Stat", hex: "#2a2a2a", use: "Large numbers" },
  { name: "Text", hex: "#3f3f3f", use: "Guide prose" },
  { name: "UI", hex: "#565656", use: "Links, ghost buttons" },
  { name: "Body", hex: "#727272", use: "Body copy, leads" },
  { name: "Nav", hex: "#777777", use: "Navigation links" },
  { name: "Meta", hex: "#898989", use: "Timestamps, metadata" },
  { name: "Muted", hex: "#919191", use: "Captions" },
  { name: "Sub", hex: "#a2a2a2", use: "Placeholders" },
  { name: "Tab", hex: "#cccccc", use: "Tab borders" },
  { name: "Line", hex: "#d4d4d4", use: "Dashed rules" },
  { name: "Line header", hex: "#dedede", use: "Header rule" },
  { name: "Frame", hex: "#e0e0e0", use: "Dashed frames" },
  { name: "Wash", hex: "#f4f4f3", use: "Subtle fills" },
];

const SEMANTIC: Color[] = [
  { name: "Teal", hex: "#4ed3cf", use: "Additions" },
  { name: "Olive", hex: "#54702f", use: "Open pull requests" },
  { name: "Danger", hex: "#bf000f", use: "Deletions, closed, destructive" },
  { name: "Moved", hex: "#7c4dd8", use: "Moved code" },
  { name: "Highlight", hex: "#eae058", use: "Outdated guides" },
  { name: "Blue mist", hex: "#a9b8c8", use: "Labels on the blue gradient" },
];

const DARK: Color[] = [
  { name: "Night", hex: "#080808", use: "Footer" },
  { name: "Night 2", hex: "#0c0c0b", use: "Dark sections" },
  { name: "Panel dark", hex: "#171717", use: "Panels on dark" },
  { name: "Rule dark", hex: "#383535", use: "Rules on dark" },
  { name: "Border dark", hex: "#444444", use: "Borders on dark" },
];

const FONTS = [
  {
    name: "Newsreader",
    role: "Display and headings",
    token: "--font-serif",
    className: "font-serif",
    weights: "Variable 200–800, roman and italic. Headings use 400.",
    sample: "Review the next one in order.",
    source: "@fontsource-variable/newsreader",
  },
  {
    name: "Geist Sans",
    role: "Interface and body",
    token: "--font-sans",
    className: "font-sans",
    weights: "400 for text, 500 for emphasis.",
    sample: "Changes are grouped by what they do.",
    source: "geist",
  },
  {
    name: "Geist Mono",
    role: "Labels, code and data",
    token: "--font-mono",
    className: "font-mono",
    weights: "400. Labels are uppercase with 0.08em tracking.",
    sample: "create_guide({ pr: \"acme/web#412\" })",
    source: "geist",
  },
];

const SCALE = [
  { name: ".h1", spec: "Newsreader 72 / 1 · −2.88px", el: <p className="h1">One section at a time.</p> },
  { name: ".h2", spec: "Newsreader 44 / 1 · −0.025em", el: <p className="h2">What reviewers get.</p> },
  { name: ".h3", spec: "Newsreader 32 / 1.1 · −0.025em", el: <p className="h3">Changes that are understandable.</p> },
  { name: ".h4", spec: "Newsreader 22 / 1.1 · −0.01em", el: <p className="h4">Comments go to GitHub.</p> },
  {
    name: ".lead",
    spec: "Geist 16 / 22.4 · −0.48px",
    el: <p className="lead max-w-[560px]">Omakaze splits a pull request into sections. Each section explains one part of the change.</p>,
  },
  {
    name: ".body-copy",
    spec: "Geist 16 / 26 · −0.4px",
    el: (
      <p className="body-copy max-w-[560px]">
        A guided PR puts the change in reading order: data model, logic, API, interface, tests.
      </p>
    ),
  },
  { name: ".mono-label", spec: "Geist Mono 10 / 15 · 0.08em · uppercase", el: <p className="mono-label">Terminal</p> },
  { name: ".eyebrow", spec: "Geist Mono 10 · dashed border", el: <span className="eyebrow">Open source · Self-hosted · MCP</span> },
];

const ICONS = [
  ["GitBranch", RiGitBranchLine],
  ["Github", RiGithubFill],
  ["CodeSSlash", RiCodeSSlashLine],
  ["FileList3", RiFileList3Line],
  ["Search", RiSearchLine],
  ["Sparkling2", RiSparkling2Line],
  ["Refresh", RiRefreshLine],
  ["Key2", RiKey2Line],
  ["Lock2", RiLock2Line],
  ["FileCopy", RiFileCopyLine],
  ["ExternalLink", RiExternalLinkLine],
  ["CheckboxCircle", RiCheckboxCircleFill],
] as const;

function Section({
  id,
  n,
  title,
  intro,
  className = "",
  children,
}: {
  id: string;
  n: string;
  title: string;
  intro: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-16 border-b border-dashed border-line ${className}`}>
      <div className="mx-auto max-w-[1560px] px-4 py-16 md:px-[72px] md:py-24">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <span className="eyebrow">{n}</span>
            <h2 className="h2 mt-6">{title}</h2>
            <p className="body-copy mt-5 max-w-[380px]">{intro}</p>
          </div>
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Label({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return <p className={`mono-label mb-3 ${dark ? "!text-white/50" : ""}`}>{children}</p>;
}

function Palette({ title, colors, dark }: { title: string; colors: Color[]; dark?: boolean }) {
  return (
    <div>
      <Label dark={dark}>{title}</Label>
      <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${colors.length === 6 ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
        {colors.map((c) => (
          <Swatch key={c.name} color={c} dark={dark} />
        ))}
      </div>
    </div>
  );
}

function Download({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} download className="btn btn-secondary btn-sm">
      <RiDownload2Line size={14} aria-hidden="true" />
      {label}
    </a>
  );
}

export default function BrandingPage() {
  return (
    <div className={`${shipporiMincho.variable} bg-paper`}>
      <header className="sticky top-0 z-40 border-b border-dashed border-line-header bg-[rgba(252,252,252,0.97)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1560px] items-center gap-6 px-4 md:px-[72px]">
          <Logo />
          <span className="tag hidden sm:inline-flex">Brand</span>
          <nav className="ml-auto hidden items-center gap-5 lg:flex" aria-label="Sections">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="nav-link">
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-dashed border-black/[0.08] grain">
        <div className="pointer-events-none absolute inset-y-0 left-[72px] hidden border-l border-dashed border-black/[0.08] md:block" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-y-0 right-[72px] hidden border-r border-dashed border-black/[0.08] md:block" aria-hidden="true" />
        <div className="relative mx-auto max-w-[1560px] px-4 pt-20 pb-16 md:px-[72px] md:pt-28 md:pb-24">
          <div className="mx-auto flex max-w-[840px] flex-col items-center text-center">
            <div className="animate-reveal">
              <LogoMark size={88} />
            </div>
            <span className="eyebrow mt-8 animate-reveal">Brand guidelines</span>
            <h1 className="h1 mt-6 animate-reveal">The Omakaze brand.</h1>
            <p className="lead mt-6 max-w-[560px] animate-reveal">
              Logos, colors, type, components and motion used across the product and the landing page. Click a color to copy it.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Download href="/logo.svg" label="Logo" />
              <Download href="/logo-white.svg" label="Logo, white" />
              <Download href="/icon.svg" label="Favicon" />
            </div>
          </div>
          <div className="mt-14 grid grid-cols-2 gap-px border border-black/15 bg-black/15 font-mono text-[10px] tracking-[0.09em] text-black/60 uppercase sm:grid-cols-4">
            {[
              ["Name", "Omakaze"],
              ["From", "Omakase, “I leave it to you”"],
              ["Mark", "Crossed black-wood chopsticks"],
              ["Corners", "Square, radius 0"],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1.5 bg-white px-4 py-3.5">
                <span className="text-black/40">{k}</span>
                <span className="font-sans text-[13px] tracking-[-0.01em] text-ink normal-case">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Section
        id="logo"
        n="01 · Logo"
        title="The chopsticks."
        intro="A pair of crossed black-wood chopsticks. Use the black mark on light surfaces and the white mark on dark or blue ones. Leave at least half the mark's width clear around it."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: "On paper", cls: "bg-paper grain", invert: false, file: "/logo.svg" },
            { label: "On night", cls: "bg-night-2 grain-dark", invert: true, file: "/logo-white.svg" },
            { label: "On brand gradient", cls: "bg-brand-gradient", invert: true, file: "/logo-white.svg" },
          ].map((v) => (
            <div key={v.label} className="border border-black/15">
              <div className={`relative flex aspect-square items-center justify-center ${v.cls}`}>
                <span className="frm m-4" aria-hidden="true" />
                <LogoMark size={112} invert={v.invert} />
              </div>
              <div className="flex items-center justify-between border-t border-black/15 bg-white px-3 py-2.5">
                <span className="mono-label">{v.label}</span>
                <span className="font-mono text-[10px] text-black/40">{v.file.slice(1)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <Label>Lockup</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex h-36 items-center justify-center border border-black/15 bg-white grain">
              <Logo href="#logo" />
            </div>
            <div className="dark flex h-36 items-center justify-center border border-border-dark bg-night grain-dark">
              <Logo href="#logo" invert />
            </div>
          </div>
          <p className="mt-3 text-[13px] leading-[20px] text-meta">
            Mark at 26px, Newsreader 19px with −0.02em tracking, 10px gap.
          </p>
        </div>

        <div className="mt-10">
          <Label>Sizes</Label>
          <div className="flex flex-wrap items-end gap-8 border border-black/15 bg-white px-6 py-8">
            {[16, 24, 32, 48, 64, 96].map((s) => (
              <div key={s} className="flex flex-col items-center gap-3">
                <LogoMark size={s} />
                <span className="font-mono text-[10px] text-black/45">{s}px</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <Label>Don&apos;t</Label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { note: "Stretch it", style: { transform: "scaleX(1.6)" } },
              { note: "Rotate it", style: { transform: "rotate(35deg)" } },
              { note: "Recolor it", style: { filter: "invert(48%) sepia(90%) saturate(2400%) hue-rotate(320deg)" } },
              { note: "Black on dark", dark: true },
            ].map((d) => (
              <div key={d.note} className="border border-black/15">
                <div className={`relative flex h-32 items-center justify-center ${d.dark ? "bg-night-2" : "bg-white"}`}>
                  <span style={d.style}>
                    <LogoMark size={56} />
                  </span>
                  <span className="absolute inset-0 m-auto h-px w-[70%] -rotate-45 bg-danger/70" aria-hidden="true" />
                </div>
                <p className="border-t border-black/15 bg-white px-3 py-2 text-[12px] text-danger">{d.note}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <section id="wordmark" className="dark scroll-mt-16 bg-night grain-dark">
        <div className="mx-auto max-w-[1560px] px-4 py-16 md:px-[72px] md:py-24">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
            <div>
              <span className="eyebrow">02 · Wordmark</span>
              <h2 className="mt-6 font-serif text-[36px] leading-none tracking-[-1.44px] text-white sm:text-[44px] sm:tracking-[-0.025em]">
                Set in Newsreader.
              </h2>
              <p className="mt-5 max-w-[380px] text-[16px] leading-[26px] tracking-[-0.4px] text-white/60">
                The name is always written Omakaze, one word, capital O. In the footer it is drawn as a 4×4 ordered dither that
                sharpens under the pointer, with a signal-cyan fringe.
              </p>
            </div>
            <div className="flex flex-col justify-end gap-6">
              <p className="font-serif text-[64px] leading-none tracking-[-0.05em] text-white sm:text-[96px]">Omakaze</p>
              <div className="flex flex-wrap gap-2 font-mono text-[10px] tracking-[0.08em] uppercase">
                <span className="border border-white/25 px-2 py-1 text-white/60">Newsreader 400</span>
                <span className="border border-white/25 px-2 py-1 text-white/60">Tracking −0.05em</span>
                <span className="border border-dashed border-danger/70 px-2 py-1 text-[#ff8a8a] normal-case">Not OmaKaze · omakaze · OMAKAZE</span>
              </div>
            </div>
          </div>
          <div className="relative mt-14 select-none border-t border-dashed border-white/[0.16] pt-10">
            <DitherWordmark className="block w-full font-serif" />
            <p className="mt-3 font-mono text-[10px] tracking-[0.08em] text-white/35 uppercase">Hover the wordmark</p>
          </div>
        </div>
      </section>

      <Section
        id="color"
        n="03 · Color"
        title="Ink on paper."
        intro="Mostly near-black on off-white, with blue for brand moments and signal cyan for the one thing that is active. Every color is a Tailwind token in globals.css, for example bg-ink or text-signal."
      >
        <div className="flex flex-col gap-10">
          <Palette title="Core" colors={CORE} />
          <div>
            <Label>Brand gradient · bg-brand-gradient</Label>
            <div className="relative flex h-40 items-end justify-between border border-black/15 bg-brand-gradient p-4">
              <span className="font-mono text-[11px] text-[#a9b8c8]">#133264 27%</span>
              <span className="font-mono text-[11px] text-white/80">#147dba 144% · over ink, with grain</span>
            </div>
          </div>
          <div>
            <Label>Neutral ramp</Label>
            <div className="mb-3 flex h-14 border border-black/15">
              {NEUTRALS.map((c) => (
                <span key={c.name} className="flex-1" style={{ background: c.hex }} title={`${c.name} ${c.hex}`} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              {NEUTRALS.map((c) => (
                <Swatch key={c.name} color={c} />
              ))}
            </div>
          </div>
          <Palette title="Status and diff" colors={SEMANTIC} />
          <div className="dark border border-border-dark bg-night-2 p-4 grain-dark">
            <Palette title="Dark surfaces" colors={DARK} dark />
          </div>
        </div>
      </Section>

      <Section
        id="type"
        n="04 · Type"
        title="A serif voice, a mono hand."
        intro="Newsreader carries headings and buttons. Geist Sans does the work in the interface. Geist Mono labels things and shows code."
      >
        <div className="flex flex-col gap-3">
          {FONTS.map((f) => (
            <div key={f.name} className="border border-black/15 bg-white">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-dashed border-line px-5 py-3">
                <span className="mono-label">{f.role}</span>
                <span className="font-mono text-[11px] text-black/40">{f.token}</span>
                <span className="ml-auto font-mono text-[11px] text-black/40">{f.source}</span>
              </div>
              <div className="grid grid-cols-1 gap-6 px-5 py-6 md:grid-cols-[180px_minmax(0,1fr)]">
                <div>
                  <p className={`${f.className} text-[72px] leading-none tracking-[-0.03em] text-black`}>Aa</p>
                  <p className="mt-3 font-serif text-[22px] tracking-[-0.01em] text-black">{f.name}</p>
                  <p className="mt-1 text-[12px] leading-[18px] text-meta">{f.weights}</p>
                </div>
                <div className="flex min-w-0 flex-col justify-between gap-4">
                  <p className={`${f.className} text-[28px] leading-[1.15] tracking-[-0.02em] break-words text-ink sm:text-[34px]`}>
                    {f.sample}
                  </p>
                  <p className={`${f.className} text-[14px] leading-[22px] break-all text-black/55`}>
                    ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 &amp;→·—“”
                  </p>
                </div>
              </div>
            </div>
          ))}
          <div className="border border-black/15 bg-white">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-dashed border-line px-5 py-3">
              <span className="mono-label">Japanese side notes</span>
              <span className="font-mono text-[11px] text-black/40">--font-shippori</span>
              <span className="ml-auto font-mono text-[11px] text-black/40">Shippori Mincho, subset · OFL</span>
            </div>
            <div className="flex flex-col gap-6 px-5 py-6 sm:flex-row sm:items-start sm:gap-10">
              <div className="flex shrink-0 gap-6 text-black/70">
                {(["hero", "why", "features", "next"] as const).map((k) => (
                  <div key={k} className="flex flex-col items-center gap-4">
                    <span lang="ja" className="side-note-text">
                      {NOTES[k].ja}
                    </span>
                    <span className="side-note-rule" />
                  </div>
                ))}
              </div>
              <p className="max-w-[420px] text-[13px] leading-[20px] text-meta">
                Set vertically in the margins of landing page sections, at 20% opacity. The font file only contains the characters
                in the notes, so new text needs a new subset (scripts/subset-landing-font.mjs).
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10">
          <Label>Scale</Label>
          <div className="border border-black/15 bg-white">
            {SCALE.map((s) => (
              <div
                key={s.name}
                className="grid grid-cols-1 items-baseline gap-3 border-b border-dashed border-line px-5 py-5 last:border-b-0 md:grid-cols-[150px_minmax(0,1fr)]"
              >
                <div>
                  <p className="font-mono text-[12px] text-ink">{s.name}</p>
                  <p className="mt-1 font-mono text-[10px] leading-[15px] text-black/40">{s.spec}</p>
                </div>
                <div className="min-w-0">{s.el}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section
        id="components"
        n="05 · Components"
        title="Square, bordered, quiet."
        intro="Corners are always square. Buttons are set in Newsreader and shrink slightly when pressed. Tags and labels use uppercase mono."
      >
        <div className="flex flex-col gap-10">
          <div>
            <Label>Buttons</Label>
            <div className="flex flex-col gap-3 border border-black/15 bg-white p-5">
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-primary btn-lg">
                  Sign In with GitHub
                </button>
                <button type="button" className="btn btn-secondary btn-lg">
                  Copy Setup Prompt
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-primary btn-md">
                  Primary
                </button>
                <button type="button" className="btn btn-secondary btn-md">
                  Secondary
                </button>
                <button type="button" className="btn btn-danger btn-md">
                  Delete workspace
                </button>
                <button type="button" className="btn btn-ghost btn-md">
                  Ghost
                </button>
                <button type="button" className="btn btn-primary btn-md" disabled>
                  Disabled
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-primary btn-sm">
                  Small <RiArrowRightLine size={14} aria-hidden="true" />
                </button>
                <button type="button" className="btn btn-secondary btn-sm">
                  <RiGithubFill size={14} aria-hidden="true" /> GitHub
                </button>
                <button type="button" className="btn btn-secondary btn-xs">
                  Extra small
                </button>
              </div>
            </div>
            <div className="dark mt-3 flex flex-wrap items-center gap-3 border border-border-dark bg-night-2 p-5 grain-dark">
              <button type="button" className="btn btn-primary btn-md">
                Primary on dark
              </button>
              <button type="button" className="btn btn-secondary btn-md">
                Secondary on dark
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 border border-black/15 bg-brand-gradient p-5">
              <button type="button" className="btn btn-invert btn-md">
                Invert on blue
              </button>
              <button type="button" className="btn btn-invert btn-xs">
                Copy
              </button>
            </div>
            <p className="mt-3 font-mono text-[10px] leading-[15px] text-black/40">
              .btn + .btn-primary | .btn-secondary | .btn-danger | .btn-ghost | .btn-invert · .btn-lg | .btn-md | .btn-sm | .btn-xs
            </p>
          </div>

          <div>
            <Label>Tags and status</Label>
            <div className="flex flex-wrap items-center gap-2 border border-black/15 bg-white p-5">
              <PrStateTag state="open" />
              <PrStateTag state="draft" />
              <PrStateTag state="merged" />
              <PrStateTag state="closed" />
              <GuideChip status="generating" version={1} />
              <GuideChip status="ready" version={3} />
              <GuideChip status="ready" version={2} outdated />
              <GuideChip status="draft" version={1} />
              <GuideChip status="failed" version={1} />
              <DiffStat additions={388} deletions={41} />
              <span className="eyebrow">Eyebrow</span>
              <span className="flex items-center gap-1">
                <kbd className="kbd">⌘</kbd>
                <kbd className="kbd">K</kbd>
              </span>
            </div>
          </div>

          <div>
            <Label>Inputs</Label>
            <div className="grid grid-cols-1 gap-4 border border-black/15 bg-white p-5 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="b-name">
                  Workspace name
                </label>
                <input id="b-name" className="input" placeholder="Acme" />
              </div>
              <div>
                <label className="field-label" htmlFor="b-role">
                  Role
                </label>
                <select id="b-role" className="input" defaultValue="member">
                  <option value="owner">Owner</option>
                  <option value="member">Member</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="b-note">
                  Note
                </label>
                <textarea id="b-note" className="input" placeholder="What should reviewers check first?" />
              </div>
            </div>
          </div>

          <div>
            <Label>Cards and diff</Label>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="card flex min-h-[200px] flex-col justify-between gap-8 px-7 pt-7 pb-5 grain">
                <p className="font-serif text-[26px] leading-[1.1] tracking-[-0.01em] text-black">Changes that are understandable.</p>
                <p className="body-copy">Feature card: white, 15% black border, grain, serif title.</p>
              </div>
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-dashed border-line px-4 py-2.5">
                  <span className="font-mono text-[11px] text-ink">api/checkout.ts</span>
                  <DiffStat additions={2} deletions={1} />
                </div>
                <div className="diff-scroll">
                  <table className="diff-table">
                    <colgroup>
                      <col className="w-10" />
                      <col />
                    </colgroup>
                    <tbody>
                      <tr>
                        <td className="diff-num">12</td>
                        <td className="diff-code" data-marker=" ">
                          export async function checkout(cart: Cart) {"{"}
                        </td>
                      </tr>
                      <tr className="row-del">
                        <td className="diff-num">13</td>
                        <td className="diff-code" data-marker="−">
                          {"  const total = sum(cart.items);"}
                        </td>
                      </tr>
                      <tr className="row-add">
                        <td className="diff-num">13</td>
                        <td className="diff-code" data-marker="+">
                          {"  const total = sum(cart.items) - cart.discount;"}
                        </td>
                      </tr>
                      <tr className="row-add">
                        <td className="diff-num">14</td>
                        <td className="diff-code" data-marker="+">
                          {"  assert(total >= 0);"}
                        </td>
                      </tr>
                      <tr className="row-moved">
                        <td className="diff-num">15</td>
                        <td className="diff-code" data-marker=" ">
                          {"  return charge(total);"}
                        </td>
                      </tr>
                      <tr>
                        <td className="diff-num">16</td>
                        <td className="diff-code" data-marker=" ">
                          {"}"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="surfaces"
        n="06 · Surfaces"
        title="Grain and dashed lines."
        intro="Surfaces carry a faint fractal-noise grain. Structure is drawn with 1px dashed rules and frames rather than shadows. There are no rounded corners and no drop shadows."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            { label: "grain", note: "Paper with 5.5% noise", cls: "bg-paper grain" },
            { label: "grain-dark", note: "Night with 9% noise", cls: "bg-night-2 grain-dark", dark: true },
            { label: "bg-brand-gradient", note: "Deep to bright blue over ink", cls: "bg-brand-gradient", dark: true },
            { label: "bg-mist", note: "Cool grey section", cls: "bg-mist" },
            { label: "frm", note: "Dashed frame, inset", cls: "bg-white", frame: true },
            { label: "rail-x", note: "Dashed side rails", cls: "bg-white rail-x mx-10" },
          ].map((s) => (
            <div key={s.label} className="border border-black/15 bg-white">
              <div className={`relative h-40 ${s.cls}`}>{s.frame ? <span className="frm m-5" aria-hidden="true" /> : null}</div>
              <div className="flex items-baseline justify-between gap-3 border-t border-black/15 px-3 py-2.5">
                <span className="font-mono text-[11px] text-ink">{s.label}</span>
                <span className="text-[12px] text-meta">{s.note}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-10">
          <Label>Rules</Label>
          <div className="flex flex-col gap-6 border border-black/15 bg-white p-6">
            {[
              ["border-dashed border-line", "Section dividers"],
              ["border-dashed border-black/[0.08]", "Hero rails"],
              ["border-solid border-black/15", "Cards and panels"],
            ].map(([cls, note]) => (
              <div key={cls} className="flex items-center gap-4">
                <span className={`flex-1 border-t ${cls}`} />
                <span className="w-[260px] shrink-0 font-mono text-[10px] text-black/50">{cls}</span>
                <span className="hidden w-[140px] shrink-0 text-[12px] text-meta sm:block">{note}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section
        id="motion"
        n="07 · Motion"
        title="Quick to settle."
        intro="Motion is short and decelerates hard. Content fades in from a blur. Everything is turned off for people who prefer reduced motion."
      >
        <EaseDemo />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="border border-black/15 bg-white">
            <div className="flex h-32 items-center justify-center">
              <span className="animate-reveal font-serif text-[28px] tracking-[-0.02em] text-black [animation-iteration-count:infinite] [animation-duration:2.4s]">
                Reveal
              </span>
            </div>
            <p className="border-t border-black/15 px-3 py-2.5 font-mono text-[11px] text-ink">animate-reveal · 600ms</p>
          </div>
          <div className="border border-black/15 bg-white">
            <div className="flex h-32 items-center justify-center gap-2">
              <span className="dot animate-pulse-dot bg-blue-bright" />
              <span className="text-[13px] text-ui">Generating</span>
            </div>
            <p className="border-t border-black/15 px-3 py-2.5 font-mono text-[11px] text-ink">animate-pulse-dot · 1.4s</p>
          </div>
          <div className="border border-black/15 bg-white">
            <div className="flex h-32 items-center justify-center font-mono text-[13px] text-ink">
              docker compose up -d
              <span className="ml-0.5 inline-block h-4 w-[7px] animate-caret bg-ink" />
            </div>
            <p className="border-t border-black/15 px-3 py-2.5 font-mono text-[11px] text-ink">animate-caret · 1s steps</p>
          </div>
        </div>
      </Section>

      <Section
        id="icons"
        n="08 · Icons"
        title="Remix Icon, line style."
        intro="Icons come from @remixicon/react. Use the Line variants at 14–16px next to text; Fill only for brand marks and filled status."
      >
        <div className="grid grid-cols-3 gap-px border border-black/15 bg-black/15 sm:grid-cols-4 xl:grid-cols-6">
          {ICONS.map(([name, Icon]) => (
            <div key={name} className="flex flex-col items-center gap-3 bg-white px-3 py-6 text-ink">
              <Icon size={22} aria-hidden="true" />
              <span className="font-mono text-[10px] text-black/45">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="voice"
        n="09 · Voice"
        title="Brief and factual."
        intro="Interface text says what something does, in plain words. The landing page borrows the language of an omakase meal: each section is one dish, served in order."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="border border-black/15 bg-white p-5">
            <Label>Do</Label>
            <ul className="flex flex-col gap-2.5 text-[14px] leading-[21px] text-text">
              <li>Comments go to GitHub.</li>
              <li>Generate a guide for every new pull request.</li>
              <li>Expand unchanged lines in steps of twenty.</li>
            </ul>
          </div>
          <div className="border border-black/15 bg-white p-5">
            <Label>Don&apos;t</Label>
            <ul className="flex flex-col gap-2.5 text-[14px] leading-[21px] text-black/45 line-through decoration-danger/60">
              <li>Supercharge your code review workflow!</li>
              <li>Seamlessly leverage AI-powered insights.</li>
              <li>The best PR tool ever built 🚀</li>
            </ul>
          </div>
        </div>
        <div className="mt-10">
          <Label>Side notes</Label>
          <div className="border border-black/15 bg-white">
            {Object.entries(NOTES).map(([key, n]) => (
              <div
                key={key}
                className="grid grid-cols-1 gap-1 border-b border-dashed border-line px-5 py-3.5 last:border-b-0 sm:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] sm:items-baseline sm:gap-4"
              >
                <span className="font-mono text-[10px] tracking-[0.08em] text-black/40 uppercase">{key}</span>
                <span lang="ja" className="font-[family-name:var(--font-shippori)] text-[17px] tracking-[0.08em] text-ink">
                  {n.ja}
                </span>
                <span className="text-[13px] leading-[19px] text-meta">
                  <span className="italic">{n.romaji}</span> · {n.en}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <footer className="dark bg-night grain-dark">
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4 px-4 py-10 md:px-[72px]">
          <Logo invert />
          <span className="font-mono text-[10px] tracking-[0.08em] text-white/40 uppercase">
            Brand guidelines · MIT licensed project
          </span>
        </div>
      </footer>
    </div>
  );
}
