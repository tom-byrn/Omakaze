import Link from "next/link";
import { Panel } from "@/components/settings/Panel";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { resolveAiConfig } from "@/lib/ai/config";
import { env } from "@/lib/env";
import { formatInterval } from "@/lib/format";
import { requireWorkspace, roleAtLeast } from "@/lib/workspaces";
import { saveAutomationAction } from "../actions";

export const metadata = { title: "Automation" };

function Toggle({ name, label, help, defaultChecked, disabled }: { name: string; label: string; help: string; defaultChecked: boolean; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 border-t border-dashed border-line py-4 first:border-t-0">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="mt-1 h-4 w-4 accent-[#141518]" />
      <span>
        <span className="block text-[14px] text-ink">{label}</span>
        <span className="block text-[13px] leading-[20px] text-body">{help}</span>
      </span>
    </label>
  );
}

export default async function AutomationPage(props: PageProps<"/w/[slug]/settings/automation">) {
  const { slug } = await props.params;
  const { workspace, role } = await requireWorkspace(slug);
  const admin = roleAtLeast(role, "admin");
  const ai = resolveAiConfig(workspace);
  const poll = env().POLL_INTERVAL_SECONDS;
  return (
    <div className="flex flex-col gap-6">
      {!ai ? (
        <p className="border border-dashed border-highlight bg-highlight/10 px-3 py-2 text-[13px] text-ink">
          Automatic guides need an AI provider.{" "}
          <Link className="link" href={`/w/${slug}/settings/ai`}>
            Configure one
          </Link>
          .
        </p>
      ) : null}
      <Panel
        title="Pull request automation"
        description={
          <>
            Applies to every repository unless a repository overrides it on the{" "}
            <Link className="link" href={`/w/${slug}/repos`}>
              Repositories
            </Link>{" "}
            page. Events arrive by webhook (GitHub App or repository webhooks)
            {poll > 0 ? ` and by polling every ${formatInterval(poll)}` : ""}.
          </>
        }
      >
        <ActionForm action={saveAutomationAction.bind(null, slug)} className="flex flex-col">
          <Toggle
            name="autoGenerate"
            label="Create a guide for every new pull request"
            help="Runs the configured AI provider when a pull request is opened, reopened or marked ready for review, or when polling finds one without a guide."
            defaultChecked={workspace.autoGenerate}
            disabled={!admin}
          />
          <Toggle
            name="regenerateOnPush"
            label="Create a new version when commits are pushed"
            help="When automatic guides are on and new commits are pushed, the guide is generated again as a new version. Older versions stay available from the version menu."
            defaultChecked={workspace.regenerateOnPush}
            disabled={!admin}
          />
          <Toggle
            name="skipDrafts"
            label="Skip draft pull requests"
            help="Generate once the pull request is marked ready for review."
            defaultChecked={workspace.skipDrafts}
            disabled={!admin}
          />
          <Toggle
            name="postPrComment"
            label="Post a summary comment on GitHub"
            help="Adds a comment with the guide summary and section list to the pull request, and updates it for new versions."
            defaultChecked={workspace.postPrComment}
            disabled={!admin}
          />
          {admin ? (
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <SubmitButton pendingText="Saving…">Save</SubmitButton>
              </div>
            </div>
          ) : null}
        </ActionForm>
      </Panel>
    </div>
  );
}
