// Builds src/app/fonts/shippori-mincho-landing.woff2: Shippori Mincho Regular cut down to the
// Japanese characters in src/components/landing/notes.ts.
//
//   node scripts/subset-landing-font.mjs path/to/ShipporiMincho-Regular.ttf
//
// Needs pyftsubset (pip install fonttools brotli). The full font is at
// https://github.com/google/fonts/tree/main/ofl/shipporimincho (SIL Open Font License 1.1).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/subset-landing-font.mjs <ShipporiMincho-Regular.ttf>");
  process.exit(1);
}

const notes = readFileSync(new URL("../src/components/landing/notes.ts", import.meta.url), "utf8");
// Kana, CJK punctuation and kanji.
const chars = [...new Set(notes.match(/[　-ヿ一-鿿]/gu) ?? [])].sort().join("");
const output = new URL("../src/app/fonts/shippori-mincho-landing.woff2", import.meta.url).pathname;

execFileSync(
  "pyftsubset",
  [source, `--text=${chars}`, "--layout-features=*", "--no-hinting", "--flavor=woff2", `--output-file=${output}`],
  { stdio: "inherit" },
);
console.log(`${chars.length} characters -> ${output}`);
