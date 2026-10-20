import Link from "next/link";
import { ChatgptPlanBadge } from "@/components/app/ChatgptPlanBadge";
import { Panel } from "@/components/settings/Panel";
import { AiSettingsForm } from "@/components/settings/AiSettingsForm";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { chatgptConfigFor, chatgptPlansEnabled } from "@/lib/ai/chatgpt";
import { describeAiConfig, PROVIDERS, resolveAiConfig } from "@/lib/ai/config";
import { env } from "@/lib/env";
import { requireWorkspace, roleAtLeast } from "@/lib/workspaces";
import { listAiModelsAction, saveAiSettingsAction, saveChatgptPlansAction } from "../actions";

export const metadata = { title: "AI provider" };

export default async function AiSettingsPage(props: PageProps<"/w/[slug]/settings/ai">) {
  const { slug } = await props.params;
  const { workspace, role, user } = await requireWorkspace(slug);
  const admin = roleAtLeast(role, "admin");
  const effective = resolveAiConfig(workspace);
  const chatgptOn = chatgptPlansEnabled();
  const mine = await chatgptConfigFor(workspace, user.id);
  const instanceDefault = env().AI_PROVIDER;
  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="Built-in generation"
        description={
          <>
            Optional. Omakaze can write guides itself with a model you choose: a hosted API or a local model. If your team
            writes guides with its own agent (Claude Code, Codex, Cursor and others), it uses that agent&apos;s model over{" "}
            <Link href={`/w/${slug}/settings/tokens`} className="link">
              MCP
            </Link>{" "}
            and nothing here is needed.
          </>
        }
      >
        <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-y-2 text-[14px]">
          <dt className="mono-label pt-0.5">Status</dt>
          <dd className="text-ink">{effective ? describeAiConfig(effective) : "Off"}</dd>
          <dt className="mono-label pt-0.5">Source</dt>
          <dd className="text-body">
            {effective?.source === "workspace"
              ? "Workspace setting"
              : effective?.source === "instance"
                ? "Instance default (environment)"
                : instanceDefault
                  ? "Instance default is incomplete"
                  : "None. Guides come from agents over MCP, the REST API or the editor."}
          </dd>
          {mine ? (
            <>
              <dt className="mono-label pt-0.5">Your guides</dt>
              <dd className="flex flex-col gap-0.5 text-ink">
                {describeAiConfig(mine)}
                <ChatgptPlanBadge />
              </dd>
            </>
          ) : null}
        </dl>
      </Panel>
      {admin ? (
        <Panel
          title="Provider"
          description={
            effective?.source === "instance"
              ? "This workspace uses the instance default. Pick a provider to use your own instead. API keys are encrypted at rest and never shown again."
              : "API keys are encrypted at rest and never shown again."
          }
        >
          <AiSettingsForm
            action={saveAiSettingsAction.bind(null, slug)}
            listModels={listAiModelsAction.bind(null, slug)}
            providers={PROVIDERS}
            current={{
              provider: workspace.aiProvider,
              model: workspace.aiModel,
              baseUrl: workspace.aiBaseUrl,
              hasKey: Boolean(workspace.aiApiKeyEnc),
            }}
          />
        </Panel>
      ) : null}
      {chatgptOn ? (
        <Panel
          title="ChatGPT plans"
          description={
            <>
              Members can generate guides with their own ChatGPT Plus or Pro plan, connected in{" "}
              <Link href="/account#chatgpt" className="link">
                Account settings
              </Link>
              . Their guides then go to OpenAI under their account, even if this workspace uses a local model. Automated
              guides always use the provider above.
            </>
          }
        >
          {admin ? (
            <ActionForm action={saveChatgptPlansAction.bind(null, slug)} className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-[14px] text-ink">
                <input type="checkbox" name="allowChatgptPlans" defaultChecked={workspace.allowChatgptPlans} />
                Allow members to use their own ChatGPT plan
              </label>
              <div>
                <SubmitButton pendingText="Saving…">Save</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className="text-[14px] text-body">{workspace.allowChatgptPlans ? "Allowed in this workspace." : "Not allowed in this workspace."}</p>
          )}
        </Panel>
      ) : null}
      <Panel
        title="Writing instructions"
        description="Instructions and the section outline for every guide are part of the guide template, which the built-in AI follows with whichever provider is in effect, and which agents over MCP receive too."
        footer={
          <Link href={`/w/${slug}/settings/template`} className="link text-[13px]">
            {workspace.aiInstructions || workspace.guideTemplate ? "Edit the guide template" : "Set up a guide template"}
          </Link>
        }
      />
      {admin ? null : <p className="text-[13px] text-muted">Only admins can change the AI provider.</p>}
    </div>
  );
}
