"use client";

import { useEffect, useRef } from "react";

const WORD = "Omakaze";
const REF = 100;
const TRACKING = -0.05;
const SIGNAL = [37, 255, 249];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

type Metrics = { adv: number[]; width: number; asc: number; desc: number };
type Geom = { w: number; h: number; size: number; scale: number; base: number };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

function context(c: HTMLCanvasElement) {
  return c.getContext("2d", { willReadFrequently: true })!;
}

function measure(family: string): Metrics {
  const ctx = context(canvas(1, 1));
  ctx.font = `400 ${REF}px ${family}`;
  const adv = [...WORD].map((ch) => ctx.measureText(ch).width);
  const width = adv.reduce((s, a) => s + a, 0) + TRACKING * REF * (WORD.length - 1);
  const m = ctx.measureText(WORD);
  return { adv, width, asc: m.actualBoundingBoxAscent, desc: Math.max(0, m.actualBoundingBoxDescent) };
}

function geometry(met: Metrics, w: number): Geom {
  const scale = (w * 0.995) / met.width;
  const pad = 0.03 * REF * scale;
  return { w, scale, size: REF * scale, base: pad + met.asc * scale, h: Math.ceil((met.asc + met.desc) * scale + pad * 2) };
}

/** Draws the word one letter at a time so tracking matches the CSS letter-spacing in every browser. */
function drawWord(ctx: CanvasRenderingContext2D, met: Metrics, g: Geom, family: string, k: number, fill: string) {
  ctx.font = `400 ${g.size * k}px ${family}`;
  ctx.fillStyle = fill;
  ctx.textBaseline = "alphabetic";
  let x = 0;
  [...WORD].forEach((ch, i) => {
    ctx.fillText(ch, x * k, g.base * k);
    x += (met.adv[i] + TRACKING * REF) * g.scale;
  });
}

/**
 * The footer wordmark as a 4×4 ordered dither that thins out toward the floor. Under the pointer it
 * resolves back into the sharp serif, with a cyan fringe where the two meet. Decorative; redraws only
 * while the pointer moves or the focus eases in and out.
 */
export function DitherWordmark({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const area = cv?.parentElement;
    if (!cv || !area) return;
    const out = cv.getContext("2d")!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const family = getComputedStyle(cv).fontFamily;
    const pointer = { x: -1e4, y: -1e4, focus: 0, target: 0 };
    let met: Metrics | null = null;
    let g: Geom | null = null;
    let dpr = 1, cell = 3, cols = 0, rows = 0, raf = 0, timer = 0, lastW = 0, cancelled = false;
    let cov: Uint8ClampedArray, sharp: HTMLCanvasElement, tmp: HTMLCanvasElement;
    let dither: HTMLCanvasElement, ditherImg: ImageData, mask: HTMLCanvasElement, maskImg: ImageData;

    function layout() {
      const w = cv!.clientWidth;
      if (!met || !w) return;
      g = geometry(met, w);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cell = w < 640 ? 2 : 3;
      cv!.width = Math.round(w * dpr);
      cv!.height = Math.round(g.h * dpr);
      cv!.style.height = `${g.h}px`;
      cols = Math.ceil(w / cell);
      rows = Math.ceil(g.h / cell);
      const c = canvas(cols, rows);
      const cx = context(c);
      drawWord(cx, met, g, family, 1 / cell, "#fff");
      cov = cx.getImageData(0, 0, cols, rows).data;
      sharp = canvas(cv!.width, cv!.height);
      drawWord(context(sharp), met, g, family, dpr, "rgba(255,255,255,0.94)");
      tmp = canvas(cv!.width, cv!.height);
      dither = canvas(cols, rows);
      ditherImg = context(dither).createImageData(cols, rows);
      mask = canvas(cols, rows);
      maskImg = context(mask).createImageData(cols, rows);
      draw();
    }

    function draw() {
      if (!g) return;
      const radius = Math.max(90, g.w * 0.15), inner = radius * 0.3;
      const d = ditherImg.data, m = maskImg.data, live = pointer.focus > 0.002;
      d.fill(0);
      m.fill(0);
      for (let j = 0; j < rows; j++) {
        const tone = 1 - 0.88 * smooth(0.18, 1, j / rows);
        const dy = (j + 0.5) * cell - pointer.y;
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i, o = k * 4, a = cov[o + 3] / 255, t = BAYER[(j & 3) * 4 + (i & 3)];
          let f = 0;
          if (live) {
            const dx = (i + 0.5) * cell - pointer.x, dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < radius) f = pointer.focus * (1 - smooth(inner, radius, dist));
          }
          if (f > t) {
            m[o + 3] = 255;
            continue;
          }
          const edge = f > 0 && f > t - 0.2;
          if (a * tone > t || (edge && a > 0.4)) {
            d[o] = edge ? SIGNAL[0] : 255;
            d[o + 1] = 255;
            d[o + 2] = edge ? SIGNAL[2] : 255;
            d[o + 3] = edge ? 255 : 232;
          }
        }
      }
      const w = cols * cell * dpr, h = rows * cell * dpr;
      context(dither).putImageData(ditherImg, 0, 0);
      out.clearRect(0, 0, cv!.width, cv!.height);
      out.imageSmoothingEnabled = false;
      out.drawImage(dither, 0, 0, w, h);
      if (!live) return;
      context(mask).putImageData(maskImg, 0, 0);
      const t = context(tmp);
      t.globalCompositeOperation = "source-over";
      t.clearRect(0, 0, tmp.width, tmp.height);
      t.drawImage(sharp, 0, 0);
      t.globalCompositeOperation = "destination-in";
      t.imageSmoothingEnabled = false;
      t.drawImage(mask, 0, 0, w, h);
      out.drawImage(tmp, 0, 0);
    }

    function tick() {
      raf = 0;
      pointer.focus += reduced ? pointer.target - pointer.focus : (pointer.target - pointer.focus) * 0.14;
      draw();
      if (Math.abs(pointer.target - pointer.focus) > 0.003) kick();
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.target = 1;
      kick();
    };
    const onLeave = () => {
      pointer.target = 0;
      kick();
    };
    area.addEventListener("pointermove", onMove);
    area.addEventListener("pointerleave", onLeave);

    const ro = new ResizeObserver(() => {
      if (cv.clientWidth === lastW) return;
      lastW = cv.clientWidth;
      clearTimeout(timer);
      timer = window.setTimeout(layout, 100);
    });

    document.fonts.load(`400 ${REF}px ${family}`).catch(() => {}).then(() => {
      if (cancelled) return;
      met = measure(family);
      lastW = cv.clientWidth;
      layout();
      ro.observe(cv);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      ro.disconnect();
      area.removeEventListener("pointermove", onMove);
      area.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={className} style={{ aspectRatio: "1176 / 230" }} />;
}
