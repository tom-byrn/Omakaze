import { Panel } from "@/components/settings/Panel";
import { ShareLinkList } from "@/components/share/ShareLinkList";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { env } from "@/lib/env";
import { requireWorkspace, roleAtLeast } from "@/lib/workspaces";
import { saveShareSettingsAction } from "../../share-actions";
import { shareLinkRows } from "../../share-rows";

export const metadata = { title: "Share links" };

export default async function SharingSettingsPage(props: PageProps<"/w/[slug]/settings/sharing">) {
  const { slug } = await props.params;
  const { workspace, role, user } = await requireWorkspace(slug);
  const admin = roleAtLeast(role, "admin");
  const instanceOn = env().SHARE_LINKS_ENABLED;
  const links = await shareLinkRows(slug, workspace, { userId: user.id, role });
  return (
    <div className="flex flex-col gap-6">
      {!instanceOn ? (
        <p className="border border-dashed border-highlight bg-highlight/10 px-3 py-2 text-[13px] text-ink">
          Share links are turned off on this instance (<code className="font-mono text-[12px]">SHARE_LINKS_ENABLED</code>). Links can&apos;t be
          created or opened.
        </p>
      ) : null}
      <Panel
        title="Share links"
        description="Read-only links to a guide for people outside the workspace. Anyone with a link can read the guide and its diffs without signing in. Create them with Share on a guide."
      >
        <ActionForm action={saveShareSettingsAction.bind(null, slug)} className="flex max-w-[560px] flex-col gap-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="shareLinksEnabled"
              defaultChecked={workspace.shareLinksEnabled}
              disabled={!admin}
              className="mt-1 h-4 w-4 accent-ink"
            />
            <span>
              <span className="block text-[14px] text-ink">Allow share links in this workspace</span>
              <span className="block text-[13px] leading-[20px] text-body">
                Turning this off stops every link from opening until it is turned on again. Links are not revoked.
              </span>
            </span>
          </label>
          <div>
            <label className="field-label" htmlFor="share-role">
              Who can create links
            </label>
            <select id="share-role" name="shareLinkRole" className="input max-w-[280px]" defaultValue={workspace.shareLinkRole} disabled={!admin}>
              <option value="admin">Admins and owners</option>
              <option value="member">All members</option>
            </select>
          </div>
          {admin ? (
            <div>
              <SubmitButton pendingText="Saving…">Save</SubmitButton>
            </div>
          ) : null}
        </ActionForm>
      </Panel>

      <Panel
        title="Active links"
        description="Links that have not expired or been revoked. Members can revoke the links they created; admins and owners can revoke any link."
      >
        <ShareLinkList links={links} slug={slug} showPull />
      </Panel>
    </div>
  );
}
