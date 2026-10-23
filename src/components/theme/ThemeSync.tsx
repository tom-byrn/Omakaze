"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { applyTheme, reloadPreference, watchSystemTheme } from "./theme-store";

/**
 * Keeps data-theme on <html> right after the inline script in the root layout set it: on
 * client-side navigation (the landing page is always light), when the system theme changes and
 * when another tab picks a different theme.
 */
export function ThemeSync() {
  const pathname = usePathname();

  useEffect(() => {
    applyTheme();
  }, [pathname]);

  useEffect(() => {
    const stopWatching = watchSystemTheme(() => applyTheme("fade"));
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY && e.key !== null) return;
      reloadPreference();
      applyTheme("fade");
    };
    window.addEventListener("storage", onStorage);
    return () => {
      stopWatching();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
