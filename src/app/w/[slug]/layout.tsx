import { AppHeader } from "@/components/app/AppHeader";
import { listUserWorkspaces, requireWorkspace } from "@/lib/workspaces";

export default async function WorkspaceLayout(props: LayoutProps<"/w/[slug]">) {
  const { slug } = await props.params;
  const { user, workspace } = await requireWorkspace(slug);
  const list = await listUserWorkspaces(user.id);
  return (
    <div className="min-h-screen">
      <AppHeader
        user={user}
        current={{ slug: workspace.slug, name: workspace.name }}
        workspaces={list.map((w) => ({ slug: w.workspace.slug, name: w.workspace.name }))}
      />
      {props.children}
    </div>
  );
}
