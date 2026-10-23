import { describe, expect, it } from "vitest";
import { isLightOnlyPath, parsePreference, themeScript, THEME_STORAGE_KEY } from "@/lib/theme";
import { darkTokenColor } from "@/lib/diff/token-colors";

/** Runs the inline head script against a fake document and returns the data-theme it set. */
function runScript(pathname: string, stored: string | null, systemDark: boolean): string | undefined {
  const attrs: Record<string, string> = {};
  const env = {
    location: { pathname },
    document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } },
    localStorage: { getItem: (k: string) => (k === THEME_STORAGE_KEY ? stored : null) },
    matchMedia: (q: string) => ({ matches: q === "(prefers-color-scheme: dark)" && systemDark }),
  };
  new Function(...Object.keys(env), themeScript)(...Object.values(env));
  return attrs["data-theme"];
}

describe("theme", () => {
  it("keeps the landing, branding and print pages light", () => {
    expect(isLightOnlyPath("/")).toBe(true);
    expect(isLightOnlyPath("/branding")).toBe(true);
    expect(isLightOnlyPath("/w/acme/acme/api/pull/4/print")).toBe(true);
    expect(isLightOnlyPath("/w/acme")).toBe(false);
    expect(isLightOnlyPath("/login")).toBe(false);
    expect(isLightOnlyPath("/s/abc")).toBe(false);
  });

  it("reads unknown stored values as system", () => {
    expect(parsePreference("dark")).toBe("dark");
    expect(parsePreference("light")).toBe("light");
    expect(parsePreference(null)).toBe("system");
    expect(parsePreference("blue")).toBe("system");
  });

  it("applies the stored or system theme before paint, matching isLightOnlyPath", () => {
    expect(runScript("/w/acme", null, true)).toBe("dark");
    expect(runScript("/w/acme", null, false)).toBe("light");
    expect(runScript("/w/acme", "dark", false)).toBe("dark");
    expect(runScript("/w/acme", "light", true)).toBe("light");
    for (const path of ["/", "/branding", "/w/acme/acme/api/pull/4/print"]) {
      expect(isLightOnlyPath(path)).toBe(true);
      expect(runScript(path, "dark", true)).toBe("light");
    }
  });

  it("maps github-light token colors to github-dark", () => {
    expect(darkTokenColor("#D73A49")).toBe("#F97583");
    expect(darkTokenColor("#d73a49")).toBe("#F97583");
    expect(darkTokenColor("#123456")).toBe("#123456");
  });
});
