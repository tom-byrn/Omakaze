"use client";

import { RiCloseLine, RiGithubFill, RiMenuLine } from "@remixicon/react";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/Logo";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#agents", label: "Agents" },
  { href: "#self-host", label: "Self-host" },
];

export function SiteHeader({ repoUrl }: { repoUrl: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className="fixed inset-x-0 top-0 z-40 h-16">
      <div
        className={clsx(
          "absolute inset-0 border-b border-dashed transition-colors duration-500 ease-io",
          scrolled ? "border-transparent bg-transparent" : "border-line-header bg-[rgba(252,252,252,0.97)] backdrop-blur-md md:bg-paper",
        )}
      />
      <div
        className={clsx(
          "relative mx-auto flex h-full max-w-[1560px] items-center px-4 transition-all duration-500 ease-io md:px-[72px]",
        )}
      >
        <div
          className={clsx(
            "flex w-full items-center gap-8 border px-4 transition-all duration-500 ease-io",
            scrolled ? "h-12 border-solid bg-paper grain md:px-5" : "h-16 border-transparent md:px-0",
          )}
        >
          <Logo />
          <nav className="ml-auto hidden items-center gap-6 md:flex" aria-label="Main">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="nav-link">
                {l.label}
              </a>
            ))}
            <a href={repoUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm h-9 px-5">
              <RiGithubFill size={16} aria-hidden="true" />
              GitHub
            </a>
          </nav>
          <button
            type="button"
            className="ml-auto md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <RiCloseLine size={22} /> : <RiMenuLine size={22} />}
          </button>
        </div>
      </div>
      <div
        className={clsx(
          "fixed inset-x-0 top-16 bottom-0 border-t border-dashed border-black/10 bg-paper transition-[opacity,visibility] duration-200 ease-in md:hidden",
          open ? "visible opacity-100" : "invisible opacity-0",
        )}
      >
        <nav className="flex flex-col px-6 pt-4" aria-label="Mobile">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="border-t border-dashed border-black/20 py-4 font-serif text-[20px] tracking-[-1px] text-black first:border-t-0"
            >
              {l.label}
            </a>
          ))}
          <a href={repoUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-lg mt-6 w-full">
            <RiGithubFill size={18} aria-hidden="true" />
            View on GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
