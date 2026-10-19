/**
 * Authoring guidelines for guided PRs. Shared by the MCP server instructions
 * (for external agents) and the built-in AI generator.
 */
export const GUIDE_GUIDELINES = `A guided PR splits a pull request into an ordered set of sections. Each section has a markdown explanation (shown on the left) and the parts of the diff it covers (shown on the right). Reviewers read the sections in order.

Structure
- Start with a summary: 2-5 sentences on what the PR does and why, then any context a reviewer needs (a mermaid diagram of the flow or architecture is often useful for large PRs).
- Group changes by feature or concern, not by file. A file can appear in several sections when different parts of it serve different purposes (use line ranges for that).
- Order sections so each builds on the previous one. A common order: data model and migrations, core logic, API or server changes, UI, tests, configuration and docs.
- Use 2-10 sections. Small PRs can have one or two.
- Every changed line should belong to at least one section. Incidental edits (renames, formatting, lockfiles, generated code) can go in a final section such as "Supporting changes". Uncovered changes are added to an automatic "Other changes" section when the guide is finished.

Section bodies (GitHub-flavored markdown)
- Explain what changed, why, and how it works. Do not restate the diff line by line.
- Call out what a reviewer should check: risky logic, edge cases, migrations, security, performance, behaviour changes.
- Use headings, lists, tables (e.g. new endpoints, schema changes), inline code and fenced code blocks where they help.
- Use mermaid code blocks (\`\`\`mermaid) for flows, sequences and state machines.
- Link to specific lines with diff links: [label](diff:path/to/file.ts#L10-L24). Use #L10 for one line and diff:path#old:L5-L9 for removed lines.
- Images and videos (screenshots, recordings of the change) can be embedded with markdown image syntax or <video src="..."> after uploading them with upload_asset.
- Keep the tone factual and brief. No marketing language.

Diff references (refs)
- "path/to/file.ts" - every hunk of the file.
- "path/to/file.ts#2" - hunk 2 of the file ("#1,3" or "#1-3" for several). Hunk numbers come from get_pull_request / get_diff.
- "path/to/file.ts:40-88" - lines 40-88 of the new version (use "path:old:40-88" for removed code). Use ranges to split a large hunk or a new file across sections.
- "path/to/file.ts#2:40-60" - lines 40-60 within hunk 2.
- Object form is also accepted: {"path": "...", "hunks": [2], "lines": {"start": 40, "end": 88}, "note": "short caption", "expand": "function"}. "expand" controls the default context shown around the change: "none" (default), "function" (enclosing block) or "file".`;

export const AGENT_WORKFLOW = `Workflow
1. get_pull_request with the PR URL to see the files, hunks and head_sha.
2. get_diff to read the code (page through large diffs with the cursor), and read_file for surrounding context when needed.
3. Plan the sections. If get_pull_request shows a guide template, follow it.
4. Either call create_guide once with all sections, or call start_guide, then add_section for each section (the guide updates live for anyone viewing it), then finish_guide.
5. Check the coverage report returned by create_guide/finish_guide and fix sections if important changes are uncovered.
6. Reply with the guide URL.

Pass head_sha from get_pull_request to create_guide/start_guide so hunk numbers match the diff you read. If the PR changes in the meantime the call fails; re-read and retry.`;
