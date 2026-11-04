"use client";

import { RiCheckDoubleLine, RiCheckLine, RiFileList3Line, RiPagesLine, RiScrollToBottomLine, RiSettings3Line, RiTextWrap } from "@remixicon/react";
import clsx from "clsx";
import { useEffect, useRef } from "react";

function Item({
  role,
  checked,
  icon,
  label,
  hint,
  extra,
  onPick,
}: {
  role: "menuitemradio" | "menuitemcheckbox";
  checked: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  extra?: React.ReactNode;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={checked}
      title={hint}
      onClick={onPick}
      className={clsx("flex w-full items-center gap-3 px-3 py-2 text-left text-[14px] hover:bg-black/[0.04]", checked ? "text-ink" : "text-ui")}
    >
      <span className="text-black/50">{icon}</span>
      <span className="flex-1">{label}</span>
      {extra}
      <RiCheckLine size={15} className={clsx("text-ink", !checked && "invisible")} aria-hidden />
    </button>
  );
}

/** The guide viewer's view options behind a gear: layout, all files, resolved conversations and line wrapping. */
export function ViewMenu({
  scrollView,
  onScrollView,
  allFiles,
  onAllFiles,
  wrap,
  onWrap,
  resolved,
}: {
  scrollView: boolean;
  onScrollView: (scroll: boolean) => void;
  allFiles: boolean;
  onAllFiles: () => void;
  wrap: boolean;
  onWrap: () => void;
  /** Missing when there are no resolved conversations, or in the read-only view. */
  resolved?: { count: number; shown: boolean; onToggle: () => void } | null;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute("open");

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.removeAttribute("open");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ref.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details ref={ref} className="group relative">
      <summary
        className="btn btn-ghost btn-xs cursor-pointer list-none group-open:bg-black/[0.06] group-open:text-ink [&::-webkit-details-marker]:hidden"
        aria-haspopup="menu"
        aria-label="View options"
        title="View options"
      >
        <RiSettings3Line size={15} />
      </summary>
      <div role="menu" aria-label="View options" className="absolute top-[calc(100%+8px)] right-0 z-40 w-[250px] border border-solid bg-paper grain">
        <p className="mono-label border-b border-dashed border-line px-3 py-2">Layout</p>
        <Item
          role="menuitemradio"
          checked={!scrollView}
          icon={<RiPagesLine size={15} />}
          label="Sections"
          hint="One section at a time"
          onPick={() => {
            onScrollView(false);
            close();
          }}
        />
        <Item
          role="menuitemradio"
          checked={scrollView}
          icon={<RiScrollToBottomLine size={15} />}
          label="Scroll"
          hint="Every section on one page"
          onPick={() => {
            onScrollView(true);
            close();
          }}
        />
        <p className="mono-label border-t border-b border-dashed border-line px-3 py-2">Show</p>
        <Item
          role="menuitemcheckbox"
          checked={allFiles}
          icon={<RiFileList3Line size={15} />}
          label="All files"
          hint="Show every changed file"
          onPick={() => {
            onAllFiles();
            close();
          }}
        />
        {resolved ? (
          <Item
            role="menuitemcheckbox"
            checked={resolved.shown}
            icon={<RiCheckDoubleLine size={15} />}
            label="Show resolved"
            hint={`${resolved.count} resolved conversation${resolved.count === 1 ? "" : "s"} on this pull request`}
            extra={<span className="font-mono text-[10px] text-black/50">{resolved.count}</span>}
            onPick={resolved.onToggle}
          />
        ) : null}
        <Item role="menuitemcheckbox" checked={wrap} icon={<RiTextWrap size={15} />} label="Wrap long lines" hint="Wrap long lines" onPick={onWrap} />
      </div>
    </details>
  );
}
