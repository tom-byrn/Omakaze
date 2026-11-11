"use client";

import { RiCloseLine, RiZoomInLine, RiZoomOutLine } from "@remixicon/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const STEP = 1.25;
/** "Fit" may enlarge a small diagram, but not past this. */
const MAX_FIT = 1.5;
/** Opening at "fit" mustn't shrink the text past this; a wider diagram opens scrollable instead. */
const MIN_OPEN = 0.6;
/** Space around the diagram inside the scroll area (matches p-6). */
const PAD = 24;

const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** The diagram's own size, from its viewBox (or width/height attributes). */
function naturalSize(svg: string): { w: number; h: number } {
  const box = /viewBox="([^"]+)"/.exec(svg)?.[1].trim().split(/[\s,]+/).map(Number);
  if (box && box.length === 4 && box[2] > 0 && box[3] > 0) return { w: box[2], h: box[3] };
  const w = Number(/<svg[^>]*\swidth="([\d.]+)/.exec(svg)?.[1]);
  const h = Number(/<svg[^>]*\sheight="([\d.]+)/.exec(svg)?.[1]);
  return { w: w || 800, h: h || 600 };
}

/**
 * The full-window view of a Mermaid diagram (Mermaid.tsx): fits the diagram to the window, zooms
 * with the buttons, + / - / 0 or ctrl + wheel (pinch), and pans by dragging or scrolling.
 *
 * `svg` holds copies of the rendered charts whose ids were renamed, so they don't clash with the
 * inline ones still on the page.
 */
export function MermaidDialog({ svg, onClose }: { svg: { light: string; dark: string }; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [natural] = useState(() => naturalSize(svg.light));
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  // null: fit to the window (and keep fitting as it resizes).
  const [zoom, setZoom] = useState<number | null>(null);
  // Where to keep still while zooming: a point in the scroll area and its spot on the diagram (0-1).
  const anchor = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; id: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    // Focus the diagram, not the first toolbar button, so the arrow keys pan straight away.
    scrollRef.current?.focus();
    // Without this the page behind scrolls when the diagram reaches its edge.
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth - PAD * 2, h: el.clientHeight - PAD * 2 });
    measure();
    // A long diagram on a small screen would fit only as a smudge: open it at a readable size.
    const opening = Math.min((el.clientWidth - PAD * 2) / natural.w, (el.clientHeight - PAD * 2) / natural.h);
    if (opening < MIN_OPEN) setZoom(MIN_OPEN);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [natural]);

  const fit = box ? clamp(Math.min(box.w / natural.w, box.h / natural.h, MAX_FIT)) : 1;
  const scale = zoom ?? fit;

  /** Zooms to `next`, keeping the diagram point under (x, y) — or the middle of the view — in place. */
  const zoomTo = useCallback(
    (next: number | null, at?: { x: number; y: number }) => {
      const el = scrollRef.current;
      const stage = el?.firstElementChild as HTMLElement | null;
      const chart = stage?.firstElementChild as HTMLElement | null;
      if (el && chart) {
        const rect = el.getBoundingClientRect();
        const cr = chart.getBoundingClientRect();
        const x = at ? at.x - rect.left : el.clientWidth / 2;
        const y = at ? at.y - rect.top : el.clientHeight / 2;
        anchor.current = { x, y, fx: (rect.left + x - cr.left) / cr.width, fy: (rect.top + y - cr.top) / cr.height };
      }
      setZoom(next === null ? null : clamp(next));
    },
    [],
  );

  // After a zoom, scroll so the anchored point is back under the pointer.
  useLayoutEffect(() => {
    const a = anchor.current;
    const el = scrollRef.current;
    const chart = el?.firstElementChild?.firstElementChild as HTMLElement | null;
    if (!a || !el || !chart) return;
    anchor.current = null;
    el.scrollLeft = chart.offsetLeft + a.fx * chart.offsetWidth - a.x;
    el.scrollTop = chart.offsetTop + a.fy * chart.offsetHeight - a.y;
  }, [scale]);

  // ctrl + wheel (and trackpad pinch) zooms; it needs a non-passive listener to stop the browser zooming the page.
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(scaleRef.current * Math.exp(-e.deltaY * 0.01), { x: e.clientX, y: e.clientY });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keep keys inside the dialog: the guide moves between sections on ← / →.
    e.stopPropagation();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "+" || e.key === "=") zoomTo(scale * STEP);
    else if (e.key === "-" || e.key === "_") zoomTo(scale / STEP);
    else if (e.key === "0") zoomTo(null);
    else return;
    e.preventDefault();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || e.button !== 0 || e.pointerType !== "mouse") return;
    if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, id: e.pointerId };
    el.setPointerCapture(e.pointerId);
    setDragging(true);
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = scrollRef.current;
    if (!d || !el || d.id !== e.pointerId) return;
    el.scrollLeft = d.left - (e.clientX - d.x);
    el.scrollTop = d.top - (e.clientY - d.y);
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  const pannable = box !== null && (natural.w * scale > box.w || natural.h * scale > box.h);

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label="Diagram"
      onClose={onClose}
      onKeyDown={onKeyDown}
      // A click on the backdrop lands on the <dialog> itself.
      onClick={(e) => e.target === e.currentTarget && dialogRef.current?.close()}
      className="mermaid-dialog m-auto h-[calc(100dvh-32px)] max-h-none w-[calc(100vw-32px)] max-w-none flex-col border border-black/15 bg-white p-0 text-ink backdrop:bg-[rgb(0_0_0/0.55)] open:flex"
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-dashed border-line px-3 py-2">
        <p className="mono-label mr-auto pl-1">Diagram</p>
        <button type="button" className="btn btn-ghost btn-xs" aria-label="Zoom out" title="Zoom out (−)" onClick={() => zoomTo(scale / STEP)} disabled={scale <= MIN_SCALE}>
          <RiZoomOutLine size={15} />
        </button>
        <span className="w-12 text-center font-mono text-[11px] text-muted tabular-nums" aria-live="polite">
          {Math.round(scale * 100)}%
        </span>
        <button type="button" className="btn btn-ghost btn-xs" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomTo(scale * STEP)} disabled={scale >= MAX_SCALE}>
          <RiZoomInLine size={15} />
        </button>
        <button type="button" className="btn btn-ghost btn-xs aria-pressed:bg-black/[0.06] aria-pressed:text-ink" aria-pressed={zoom === null} title="Fit to window (0)" onClick={() => zoomTo(null)}>
          Fit
        </button>
        <button type="button" className="btn btn-ghost btn-xs aria-pressed:bg-black/[0.06] aria-pressed:text-ink" aria-pressed={zoom === 1} title="Actual size" onClick={() => zoomTo(1)}>
          100%
        </button>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        <button type="button" className="btn btn-ghost btn-xs" aria-label="Close" title="Close (Esc)" onClick={() => dialogRef.current?.close()}>
          <RiCloseLine size={16} />
        </button>
      </div>
      <div
        ref={scrollRef}
        tabIndex={0}
        aria-label="Diagram, scroll or drag to pan"
        className={`mermaid-dialog-scroll min-h-0 flex-1 overflow-auto overscroll-contain bg-paper select-none ${pannable ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Grows with the diagram so it scrolls; centres it when it's smaller than the window. */}
        <div className="grid min-h-full w-max min-w-full place-items-center p-6">
          <div className="mermaid-zoom" style={{ width: natural.w * scale, height: natural.h * scale, visibility: box ? undefined : "hidden" }}>
            <div className="mermaid-light" dangerouslySetInnerHTML={{ __html: svg.light }} />
            <div className="mermaid-dark" dangerouslySetInnerHTML={{ __html: svg.dark }} />
          </div>
        </div>
      </div>
      <p className="shrink-0 border-t border-dashed border-line px-4 py-1.5 font-mono text-[10px] tracking-[0.06em] text-muted uppercase max-sm:hidden">
        Drag or scroll to pan · Ctrl + scroll to zoom · Esc to close
      </p>
    </dialog>,
    document.body,
  );
}
