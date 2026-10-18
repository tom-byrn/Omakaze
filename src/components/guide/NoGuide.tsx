import Link from "next/link";
import { CopyButton } from "@/components/ui/CopyButton";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function NoGuide({
  startManual,
  prompt,
  canGenerate,
  slug,
  body,
  generateButton,
}: {
  prompt: string;
  canGenerate: boolean;
  slug: string;
  repositoryId: string;
  prNumber: number;
  body: React.ReactNode;
  generateButton: React.ReactNode;
  startManual: () => Promise<void>;
}) {
  return (
    <div className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(380px,42%)_minmax(0,1fr)]">
      <div className="border-r border-dashed border-line bg-paper grain">
        <div className="mx-auto max-w-[620px] px-6 py-12 lg:px-10">
          <span className="eyebrow">No guide yet</span>
          <h2 className="h2 mt-6">Create a guided walkthrough.</h2>
          <p className="lead mt-3">Split this pull request into sections, each with an explanation and the code it covers.</p>

          <div className="mt-10 border border-black/15 bg-white">
            <div className="border-b border-dashed border-line px-5 py-4">
              <p className="mono-label">Option 1 · Your agent</p>
              <p className="mt-2 text-[14px] leading-[22px] text-body">
                Paste this into Claude Code, Codex, Cursor or another agent connected to the Guided PRs MCP server.
              </p>
            </div>
            <div className="px-5 py-4">
              <pre className="border border-dashed border-line bg-paper p-3 font-mono text-[12px] leading-[18px] whitespace-pre-wrap text-ink">{prompt}</pre>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <CopyButton text={prompt} label="Copy prompt" className="btn btn-primary btn-sm" />
                <Link href={`/w/${slug}/settings/tokens`} className="link text-[13px]">
                  Set up the MCP server
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-6 border border-black/15 bg-white">
            <div className="border-b border-dashed border-line px-5 py-4">
              <p className="mono-label">Option 2 · Built-in AI</p>
              <p className="mt-2 text-[14px] leading-[22px] text-body">
                {canGenerate
                  ? "Generate the guide with the AI provider configured for this workspace."
                  : "Configure OpenRouter, Anthropic, OpenAI or a local model to generate guides here."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              {generateButton}
              {!canGenerate ? (
                <Link href={`/w/${slug}/settings/ai`} className="link text-[13px]">
                  Configure AI
                </Link>
              ) : null}
            </div>
          </div>

          <div className="mt-6 border border-black/15 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="mono-label">Option 3 · Write it yourself</p>
                <p className="mt-2 text-[14px] leading-[22px] text-body">Start an empty draft and add sections in the editor.</p>
              </div>
              <form action={startManual}>
                <SubmitButton className="btn btn-secondary btn-sm" pendingText="Creating…">
                  Start a draft
                </SubmitButton>
              </form>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-wash">
        <div className="mx-auto max-w-[820px] px-6 py-12">
          <p className="mono-label">Pull request description</p>
          <div className="mt-4 border border-black/15 bg-white px-6 py-5">
            {body ?? <p className="text-[14px] text-muted">No description.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
