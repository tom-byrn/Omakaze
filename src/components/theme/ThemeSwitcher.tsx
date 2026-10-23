"use client";

import { RiComputerLine, RiMoonLine, RiSunLine } from "@remixicon/react";
import clsx from "clsx";
import { useSyncExternalStore } from "react";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";
import { getPreference, setPreference, subscribePreference } from "./theme-store";

const OPTIONS: Record<ThemePreference, { label: string; Icon: typeof RiSunLine }> = {
  system: { label: "System", Icon: RiComputerLine },
  light: { label: "Light", Icon: RiSunLine },
  dark: { label: "Dark", Icon: RiMoonLine },
};

/** System, light or dark, as a segmented control with a sliding marker under the current choice. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const current = useSyncExternalStore(subscribePreference, getPreference, () => "system" as const);
  const index = THEME_PREFERENCES.indexOf(current);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={clsx("relative grid grid-cols-3 border border-solid border-line bg-white p-0.5", className)}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0.5 left-0.5 w-[calc((100%-4px)/3)] bg-ink transition-transform duration-300 ease-snap"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {THEME_PREFERENCES.map((p) => {
        const { label, Icon } = OPTIONS[p];
        const active = p === current;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            title={label}
            onClick={(e) => {
              if (active) return;
              // Keyboard activation reports 0,0: reveal from the button's center instead.
              const box = e.currentTarget.getBoundingClientRect();
              const fromPointer = e.clientX !== 0 || e.clientY !== 0;
              setPreference(p, {
                x: fromPointer ? e.clientX : box.left + box.width / 2,
                y: fromPointer ? e.clientY : box.top + box.height / 2,
              });
            }}
            className={clsx(
              "relative z-[1] flex h-7 items-center justify-center gap-1.5 px-2 text-[12px] transition-colors duration-300",
              active ? "text-white" : "text-ui hover:text-ink",
            )}
          >
            <Icon size={14} aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
