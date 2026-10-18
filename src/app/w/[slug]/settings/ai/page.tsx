import { Panel } from "@/components/settings/Panel";
import { AiSettingsForm } from "@/components/settings/AiSettingsForm";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { describeAiConfig, PROVIDERS, resolveAiConfig } from "@/lib/ai/config";
import { env } from "@/lib/env";
import { requireWorkspace, roleAtLeast } from "@/lib/workspaces";
import { saveAiInstructionsAction, saveAiSettingsAction } from "../actions";

export const metadata = { title: "AI provider" };

export default async function AiSettingsPage(props: PageProps<"/w/[slug]/settings/ai">) {
  const { slug } = await props.params;
  const { workspace, role } = await requireWorkspace(slug);
  const admin = roleAtLeast(role, "admin");
  const effective = resolveAiConfig(workspace);
  const instanceDefault = env().AI_PROVIDER;
  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="Built-in generation"
        description="Omakaze can write guides with a model you choose. Agents connected over MCP do not need this."
      >
        <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-y-2 text-[14px]">
          <dt className="mono-label pt-0.5">Status</dt>
          <dd className="text-ink">{describeAiConfig(effective)}</dd>
          <dt className="mono-label pt-0.5">Source</dt>
          <dd className="text-body">
            {effective?.source === "workspace"
              ? "Workspace setting"
              : effective?.source === "instance"
                ? "Instance default (environment)"
                : instanceDefault
                  ? "Instance default is incomplete"
                  : "None"}
          </dd>
        </dl>
      </Panel>
      {admin ? (
        <Panel title="Provider" description="The API key is encrypted at rest and never shown again.">
          <AiSettingsForm
            action={saveAiSettingsAction.bind(null, slug)}
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
      {admin ? (
        <Panel
          title="Extra instructions"
          description="Added to every built-in generation in this workspace, whichever provider is in effect."
        >
          <ActionForm action={saveAiInstructionsAction.bind(null, slug)} className="flex max-w-[620px] flex-col gap-3">
            <textarea
              id="instructions"
              name="instructions"
              aria-label="Extra instructions"
              className="input"
              rows={4}
              maxLength={4000}
              defaultValue={workspace.aiInstructions ?? ""}
              placeholder="e.g. Always include a section on database migrations. Write in British English."
            />
            <div>
              <SubmitButton pendingText="Saving…">Save instructions</SubmitButton>
            </div>
          </ActionForm>
        </Panel>
      ) : (
        <p className="text-[13px] text-muted">Only admins can change the AI provider.</p>
      )}
    </div>
  );
}
