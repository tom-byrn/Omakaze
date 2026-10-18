import { bundledLanguages, createHighlighter, type Highlighter } from "shiki";

/** Compact token: [text, paletteIndex, fontStyle?] (fontStyle bits: 1 italic, 2 bold, 4 underline). */
export type Tok = [string, number] | [string, number, number];

export const THEME = "github-light";

const EXTENSIONS: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  py: "python",
  pyi: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sql: "sql",
  md: "markdown",
  mdx: "mdx",
  json: "json",
  jsonc: "jsonc",
  json5: "json5",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  html: "html",
  htm: "html",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "fish",
  ps1: "powershell",
  prisma: "prisma",
  graphql: "graphql",
  gql: "graphql",
  proto: "protobuf",
  tf: "hcl",
  hcl: "hcl",
  xml: "xml",
  svg: "xml",
  ini: "ini",
  lua: "lua",
  dart: "dart",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  scala: "scala",
  r: "r",
  jl: "julia",
  clj: "clojure",
  zig: "zig",
  nim: "nim",
  ml: "ocaml",
  sol: "solidity",
  vim: "viml",
  diff: "diff",
  patch: "diff",
  dockerfile: "dockerfile",
  mk: "make",
  gradle: "groovy",
  groovy: "groovy",
  tex: "latex",
  csv: "csv",
};

const FILENAMES: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "make",
  gemfile: "ruby",
  rakefile: "ruby",
  ".env": "dotenv",
  ".bashrc": "bash",
  ".zshrc": "bash",
  "caddyfile": "nginx",
};

export function languageForPath(path: string): string | null {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (FILENAMES[name]) return FILENAMES[name];
  if (name.startsWith("dockerfile")) return "dockerfile";
  if (name.startsWith(".env")) return "dotenv";
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  const lang = EXTENSIONS[ext];
  if (lang && lang in bundledLanguages) return lang;
  return null;
}

let highlighterPromise: Promise<Highlighter> | null = null;
const loading = new Map<string, Promise<void>>();

async function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({ themes: [THEME], langs: [] });
  return highlighterPromise;
}

async function ensureLanguage(hl: Highlighter, lang: string): Promise<boolean> {
  if (!(lang in bundledLanguages)) return false;
  if (hl.getLoadedLanguages().includes(lang)) return true;
  let p = loading.get(lang);
  if (!p) {
    p = hl.loadLanguage(lang as keyof typeof bundledLanguages).then(() => undefined);
    loading.set(lang, p);
  }
  try {
    await p;
    return true;
  } catch {
    return false;
  }
}

export class Palette {
  colors: string[] = [];
  private index = new Map<string, number>();
  constructor(defaultColor = "#24292e") {
    this.get(defaultColor);
  }
  get(color: string | undefined): number {
    const c = (color ?? this.colors[0]).toUpperCase();
    let i = this.index.get(c);
    if (i === undefined) {
      i = this.colors.length;
      this.colors.push(c);
      this.index.set(c, i);
    }
    return i;
  }
}

/** Tokenize source into lines of compact tokens. Falls back to plain text. */
export async function tokenize(code: string, lang: string | null, palette: Palette): Promise<Tok[][]> {
  const plain = () => code.split("\n").map((l) => [[l, 0] as Tok]);
  if (!lang) return plain();
  const hl = await getHighlighter();
  if (!(await ensureLanguage(hl, lang))) return plain();
  try {
    const lines = hl.codeToTokensBase(code, {
      lang: lang as keyof typeof bundledLanguages,
      theme: THEME,
      tokenizeMaxLineLength: 1500,
    });
    return lines.map((line) =>
      line.map((t) => {
        const idx = palette.get(t.color);
        const style = typeof t.fontStyle === "number" && t.fontStyle > 0 ? t.fontStyle : 0;
        return style ? ([t.content, idx, style] as Tok) : ([t.content, idx] as Tok);
      }),
    );
  } catch {
    return plain();
  }
}

/** Highlight a code block to HTML (used for markdown code fences). */
export async function highlightToHtml(code: string, lang: string | null): Promise<string> {
  const hl = await getHighlighter();
  const resolved = lang && (lang in bundledLanguages ? lang : (EXTENSIONS[lang.toLowerCase()] ?? null));
  const ok = resolved ? await ensureLanguage(hl, resolved) : false;
  return hl.codeToHtml(code, { lang: ok && resolved ? resolved : "text", theme: THEME });
}
