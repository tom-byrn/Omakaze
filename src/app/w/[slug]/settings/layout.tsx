import { SettingsNav } from "@/components/settings/SettingsNav";
import { requireWorkspace } from "@/lib/workspaces";

export default async function SettingsLayout(props: LayoutProps<"/w/[slug]/settings">) {
  const { slug } = await props.params;
  const { workspace, role } = await requireWorkspace(slug);
  return (
    <main className="mx-auto max-w-[1240px] px-4 py-10 lg:px-8">
      <span className="eyebrow">Settings · {workspace.name}</span>
      <h1 className="h2 mt-6">Workspace settings.</h1>
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <SettingsNav slug={slug} role={role} />
        <div className="min-w-0">{props.children}</div>
      </div>
    </main>
  );
}
