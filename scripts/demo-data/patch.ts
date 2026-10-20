import { spawnSync } from "node:child_process";

/**
 * Unified diff hunks between two files, without file headers: the `patch` format GitHub's
 * pull request files API returns. Uses `git diff --no-index`, so it works outside a repository.
 * Pass null for a side that does not exist (added or removed files).
 */
export function unifiedPatch(oldFile: string | null, newFile: string | null): string | null {
  const result = spawnSync(
    "git",
    [
      "-c",
      "core.attributesFile=/dev/null",
      "-c",
      "diff.noprefix=false",
      "diff",
      "--no-index",
      "--no-color",
      "--no-ext-diff",
      "--diff-algorithm=histogram",
      "--indent-heuristic",
      "-U3",
      oldFile ?? "/dev/null",
      newFile ?? "/dev/null",
    ],
    { encoding: "utf8" },
  );
  // Exit code 1 means "files differ".
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) throw new Error(`git diff failed: ${result.stderr}`);
  // Drop the "diff --git", "index", "---" and "+++" header lines; identical files have no hunks.
  const start = result.stdout.indexOf("\n@@");
  if (start === -1) return null;
  return result.stdout.slice(start + 1).replace(/\n$/, "");
}
