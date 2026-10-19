"use client";

import { RiArrowDownSLine, RiDownload2Line, RiImageLine, RiMarkdownLine, RiPrinterLine } from "@remixicon/react";
import { useEffect, useId, useRef } from "react";

function Item({
  href,
  icon,
  title,
  description,
  newTab,
  onPick,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  newTab?: boolean;
  onPick: () => void;
}) {
  const id = useId();
  return (
    <a
      role="menuitem"
      href={href}
      download={newTab ? undefined : ""}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener" : undefined}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
      onClick={onPick}
      className="flex items-start gap-3 px-3 py-2.5 hover:bg-black/[0.04]"
    >
      <span className="mt-0.5 text-black/50">{icon}</span>
      <span className="min-w-0">
        <span id={`${id}-title`} className="block text-[14px] text-ink">
          {title}
        </span>
        <span id={`${id}-desc`} className="block text-[12px] leading-[17px] text-muted">
          {description}
        </span>
      </span>
    </a>
  );
}

/** Export a guide version: a Markdown download, or the print layout to save as a PDF. */
export function ExportMenu({ version, markdownHref, printHref }: { version: number; markdownHref: string; printHref: string }) {
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
      <summary className="btn btn-ghost btn-sm cursor-pointer list-none gap-1.5 [&::-webkit-details-marker]:hidden" aria-haspopup="menu">
        <RiDownload2Line size={13} /> Export
        <RiArrowDownSLine size={13} className="transition-transform group-open:rotate-180" />
      </summary>
      <div role="menu" aria-label="Export" className="absolute right-0 top-[calc(100%+8px)] z-40 w-[290px] border border-solid bg-paper grain">
        <p className="mono-label border-b border-dashed border-line px-3 py-2">Export version {version}</p>
        <Item href={markdownHref} icon={<RiMarkdownLine size={16} />} title="Markdown" description="A .md file with every section and the diff it covers." onPick={close} />
        <Item
          href={`${markdownHref}&embed_images=1`}
          icon={<RiImageLine size={16} />}
          title="Markdown with images"
          description="The same file with uploaded images inside it, for readers without access."
          onPick={close}
        />
        <div className="border-t border-dashed border-line">
          <Item href={printHref} newTab icon={<RiPrinterLine size={16} />} title="PDF (print)" description="Opens the print layout. Choose Save as PDF in the print dialog." onPick={close} />
        </div>
      </div>
    </details>
  );
}
