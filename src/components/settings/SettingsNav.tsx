"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SettingsNav({ slug, role }: { slug: string; role: string }) {
  const pathname = usePathname();
  const base = `/w/${slug}/settings`;
  const items = [
    { href: base, label: "General" },
    { href: `${base}/members`, label: "Members" },
    { href: `${base}/github`, label: "GitHub" },
    { href: `${base}/template`, label: "Guide template" },
    { href: `${base}/ai`, label: "AI provider" },
    { href: `${base}/automation`, label: "Automation" },
    { href: `${base}/notifications`, label: "Notifications" },
    { href: `${base}/tokens`, label: "API tokens & MCP" },
  ];
  return (
    <nav aria-label="Settings" className="flex flex-row flex-wrap gap-1 lg:flex-col lg:gap-0 lg:border-l lg:border-dashed lg:border-line">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "relative px-3 py-2 text-[14px] tracking-[-0.02em] transition-colors lg:-ml-px lg:border-l lg:pl-4",
              active ? "text-ink lg:border-ink" : "text-nav hover:text-ink lg:border-transparent",
            )}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
      <p className="mt-4 hidden px-4 font-mono text-[10px] uppercase tracking-[0.08em] text-black/40 lg:block">Your role: {role}</p>
    </nav>
  );
}
