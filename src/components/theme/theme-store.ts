"use client";

import { isLightOnlyPath, parsePreference, THEME_STORAGE_KEY, type Theme, type ThemePreference } from "@/lib/theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const THEME_COLORS: Record<Theme, string> = { light: "#fcfcfc", dark: "#101113" };

const listeners = new Set<() => void>();
let preference: ThemePreference | null = null;

function readPreference(): ThemePreference {
  try {
    return parsePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function getPreference(): ThemePreference {
  return (preference ??= readPreference());
}

export function subscribePreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called when another tab changed the stored preference. */
export function reloadPreference() {
  preference = readPreference();
  listeners.forEach((l) => l());
}

export function setPreference(next: ThemePreference, origin?: { x: number; y: number }) {
  preference = next;
  try {
    if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Private browsing or storage turned off: the choice lasts until the page is closed.
  }
  listeners.forEach((l) => l());
  applyTheme(origin ?? "fade");
}

function resolveTheme(): Theme {
  if (isLightOnlyPath(location.pathname)) return "light";
  const p = getPreference();
  if (p === "system") return matchMedia(DARK_QUERY).matches ? "dark" : "light";
  return p;
}

export function watchSystemTheme(onChange: () => void): () => void {
  const mq = matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Sets data-theme on <html> to the resolved theme. With an origin, the new theme is revealed in a
 * circle growing from that point; with "fade" the two themes cross-fade; without one it changes at
 * once (navigation, first load). Browsers without view transitions fade the colors instead.
 */
export function applyTheme(transition?: { x: number; y: number } | "fade") {
  const root = document.documentElement;
  const next = resolveTheme();
  const set = () => {
    root.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[next]);
  };
  if (root.dataset.theme === next) return set();
  if (!transition || matchMedia("(prefers-reduced-motion: reduce)").matches) return set();

  if (typeof document.startViewTransition !== "function") {
    root.classList.add("theme-fading");
    set();
    window.setTimeout(() => root.classList.remove("theme-fading"), 400);
    return;
  }

  const reveal = transition !== "fade";
  if (reveal) root.classList.add("theme-reveal");
  const vt = document.startViewTransition(set);
  if (reveal) {
    const { x, y } = transition;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    vt.ready
      .then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 560, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-new(root)" },
        );
      })
      .catch(() => {});
  }
  vt.finished.finally(() => root.classList.remove("theme-reveal")).catch(() => {});
}
