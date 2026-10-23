/**
 * Color theme of the app. Members pick system, light or dark; the choice is kept per browser in
 * localStorage and applied as `data-theme` on <html> before the first paint (see themeScript).
 * The landing page, the branding page and the print layout always use the light theme.
 */
export type ThemePreference = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "omakaze:theme";
export const THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

export function isLightOnlyPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/branding" || pathname.startsWith("/branding/") || /\/print\/?$/.test(pathname);
}

export function parsePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/**
 * Runs inline in <head>, before anything is painted. Kept in sync with isLightOnlyPath and
 * parsePreference by hand, since it cannot import them.
 */
export const themeScript = `(function(){try{var p=location.pathname,d=document.documentElement,t="light";if(!(p==="/"||p==="/branding"||p.indexOf("/branding/")===0||/\\/print\\/?$/.test(p))){var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(s==="dark"||(s!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))t="dark"}d.setAttribute("data-theme",t)}catch(e){}})()`;
