import { Panel } from "@/components/settings/Panel";
import { ActionForm } from "@/components/ui/ActionForm";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { env } from "@/lib/env";
import { requireWorkspace, roleAtLeast } from "@/lib/workspaces";
import { deleteWorkspaceAction, leaveWorkspaceAction, updateWorkspaceAction } from "./actions";

export const metadata = { title: "Settings" };

export default async function GeneralSettingsPage(props: PageProps<"/w/[slug]/settings">) {
  const { slug } = await props.params;
  const { workspace, role } = await requireWorkspace(slug);
  const admin = roleAtLeast(role, "admin");
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Workspace" description="Name and URL of this workspace.">
        <ActionForm action={updateWorkspaceAction.bind(null, slug)} className="flex max-w-[480px] flex-col gap-4">
          <div>
            <label className="field-label" htmlFor="name">
              Name
            </label>
            <input id="name" name="name" defaultValue={workspace.name} className="input" disabled={!admin} required />
          </div>
          <div>
            <label className="field-label" htmlFor="slug">
              URL
            </label>
            <div className="flex items-center">
              <span className="flex h-10 items-center border border-r-0 border-[#cfcfcf] bg-wash px-3 font-mono text-[12px] text-meta">
                {env().APP_URL.replace(/^https?:\/\//, "")}/w/
              </span>
              <input id="slug" name="slug" defaultValue={workspace.slug} className="input font-mono" disabled={!admin} required />
            </div>
          </div>
          {admin ? (
            <div>
              <SubmitButton pendingText="Saving…">Save</SubmitButton>
            </div>
          ) : null}
        </ActionForm>
      </Panel>

      <Panel title="Leave workspace" description="You lose access to its repositories and guides.">
        <ConfirmButton
          action={leaveWorkspaceAction.bind(null, slug)}
          confirm="Leave this workspace?"
          className="btn btn-secondary btn-sm"
        >
          Leave workspace
        </ConfirmButton>
      </Panel>

      {role === "owner" ? (
        <Panel
          tone="danger"
          title="Delete workspace"
          description="Deletes the workspace, its guides, comments history, tokens and invites. GitHub data is not touched."
        >
          <ActionForm action={deleteWorkspaceAction.bind(null, slug)} className="flex max-w-[480px] flex-col gap-3">
            <label className="field-label" htmlFor="confirm">
              Type <span className="text-danger">{workspace.slug}</span> to confirm
            </label>
            <input id="confirm" name="confirm" className="input font-mono" autoComplete="off" />
            <div>
              <SubmitButton className="btn btn-danger btn-sm" pendingText="Deleting…">
                Delete workspace
              </SubmitButton>
            </div>
          </ActionForm>
        </Panel>
      ) : null}
    </div>
  );
}
