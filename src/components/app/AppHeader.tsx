import { RiArrowDownSLine, RiCheckLine, RiAddLine } from "@remixicon/react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { LogoMark } from "@/components/ui/Logo";
import { NavLinks } from "./NavLinks";

type WorkspaceItem = { slug: string; name: string };

export function AppHeader({
  user,
  current,
  workspaces,
}: {
  user: { name: string; email: string | null; avatarUrl: string | null; isInstanceAdmin: boolean };
  current: WorkspaceItem | null;
  workspaces: WorkspaceItem[];
}) {
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-dashed border-line-header bg-[rgba(252,252,252,0.97)] backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1560px] items-center gap-6 px-4 lg:px-8">
        <Link href={current ? `/w/${current.slug}` : "/"} className="flex items-center gap-2.5" aria-label="Home">
          <LogoMark />
          <span className="hidden font-serif text-[19px] tracking-[-0.02em] text-black sm:inline">Omakaze</span>
        </Link>
        <span className="h-6 border-l border-dashed border-line" aria-hidden="true" />
        {current ? (
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-[14px] tracking-[-0.02em] text-ink">
              <span className="max-w-[180px] truncate">{current.name}</span>
              <RiArrowDownSLine size={16} className="text-black/50 transition-transform group-open:rotate-180" />
            </summary>
            <div className="absolute left-0 top-[calc(100%+12px)] z-40 w-64 border border-solid bg-paper grain">
              <p className="mono-label border-b border-dashed border-line px-3 py-2">Workspaces</p>
              <ul className="max-h-72 overflow-auto py-1">
                {workspaces.map((w) => (
                  <li key={w.slug}>
                    <Link
                      href={`/w/${w.slug}`}
                      className="flex items-center gap-2 px-3 py-2 text-[14px] text-ui hover:bg-black/[0.04] hover:text-ink"
                    >
                      <span className="flex-1 truncate">{w.name}</span>
                      {w.slug === current.slug ? <RiCheckLine size={14} /> : null}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/new"
                className="flex items-center gap-2 border-t border-dashed border-line px-3 py-2.5 text-[13px] text-ui hover:text-ink"
              >
                <RiAddLine size={14} /> New workspace
              </Link>
            </div>
          </details>
        ) : null}
        {current ? <NavLinks slug={current.slug} /> : null}
        <div className="ml-auto flex items-center gap-4">
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-2" aria-label="Account menu">
              <Avatar src={user.avatarUrl} name={user.name} size={28} />
            </summary>
            <div className="absolute right-0 top-[calc(100%+12px)] z-40 w-60 border border-solid bg-paper grain">
              <div className="border-b border-dashed border-line px-3 py-3">
                <p className="truncate text-[14px] text-ink">{user.name}</p>
                {user.email ? <p className="truncate font-mono text-[11px] text-meta">{user.email}</p> : null}
              </div>
              <Link href="/account" className="block px-3 py-2 text-[14px] text-ui hover:bg-black/[0.04] hover:text-ink">
                Account
              </Link>
              {user.isInstanceAdmin ? (
                <Link href="/admin" className="block px-3 py-2 text-[14px] text-ui hover:bg-black/[0.04] hover:text-ink">
                  Instance settings
                </Link>
              ) : null}
              <a
                href="https://github.com/tom-byrn/guided-prs#readme"
                target="_blank"
                rel="noreferrer"
                className="block px-3 py-2 text-[14px] text-ui hover:bg-black/[0.04] hover:text-ink"
              >
                Documentation
              </a>
              <form action="/api/auth/logout" method="post" className="border-t border-dashed border-line">
                <button type="submit" className="w-full px-3 py-2.5 text-left text-[14px] text-ui hover:text-ink">
                  Sign out
                </button>
              </form>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
