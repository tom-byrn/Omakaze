"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = ["repos", "activity", "insights", "settings"] as const;

export function NavLinks({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/w/${slug}`;
  const first = pathname.startsWith(base) ? (pathname.slice(base.length).split("/")[1] ?? "") : "";
  const active = (SECTIONS as readonly string[]).includes(first) ? first : "pulls";
  const items = [
    { key: "pulls", href: base, label: "Pull requests" },
    { key: "repos", href: `${base}/repos`, label: "Repositories" },
    { key: "activity", href: `${base}/activity`, label: "Activity" },
    { key: "insights", href: `${base}/insights`, label: "Insights" },
    { key: "settings", href: `${base}/settings`, label: "Settings" },
  ];
  return (
    <nav className="hidden items-center gap-6 md:flex" aria-label="Workspace">
      {items.map((item) => (
        <Link key={item.key} href={item.href} className="nav-link" aria-current={active === item.key ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
