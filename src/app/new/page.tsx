import { AppHeader } from "@/components/app/AppHeader";
import { NewWorkspaceForm } from "@/components/app/NewWorkspaceForm";
import { requireUser } from "@/lib/auth/session";
import { listUserWorkspaces } from "@/lib/workspaces";

export const metadata = { title: "New workspace" };

export default async function NewWorkspacePage() {
  const user = await requireUser("/new");
  const list = await listUserWorkspaces(user.id);
  return (
    <div className="min-h-screen">
      <AppHeader user={user} current={null} workspaces={list.map((w) => ({ slug: w.workspace.slug, name: w.workspace.name }))} />
      <main className="mx-auto max-w-[560px] px-4 py-16">
        <span className="eyebrow">New workspace</span>
        <h1 className="h2 mt-6">Create a workspace.</h1>
        <p className="lead mt-3">A workspace groups repositories, guides and the people who review them.</p>
        <NewWorkspaceForm />
      </main>
    </div>
  );
}
