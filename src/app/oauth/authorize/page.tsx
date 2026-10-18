import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { getCurrentUser } from "@/lib/auth/session";
import { OAuthError, validateAuthorizeRequest } from "@/lib/oauth/server";
import { listUserWorkspaces } from "@/lib/workspaces";
import { authorizeAction } from "./actions";

export const metadata = { title: "Authorize" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col grain">
      <header className="flex h-16 items-center border-b border-dashed border-line-header px-6 lg:px-12">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="relative w-full max-w-[460px] border border-black/15 bg-white p-8">{children}</div>
      </main>
    </div>
  );
}

export default async function AuthorizePage(props: PageProps<"/oauth/authorize">) {
  const sp = await props.searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") params.set(k, v);
  const pageError = params.get("error");
  if (pageError && !params.get("client_id")) {
    return (
      <Shell>
        <span className="eyebrow">Authorization</span>
        <h1 className="h3 mt-6">Something went wrong.</h1>
        <p className="body-copy mt-3">{pageError}</p>
      </Shell>
    );
  }
  let clientName: string;
  try {
    ({ clientName } = await validateAuthorizeRequest(params));
  } catch (err) {
    return (
      <Shell>
        <span className="eyebrow">Authorization</span>
        <h1 className="h3 mt-6">This request is not valid.</h1>
        <p className="body-copy mt-3">{err instanceof OAuthError ? err.message : "Invalid request."}</p>
      </Shell>
    );
  }
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`);
  const workspaces = await listUserWorkspaces(user.id);
  return (
    <Shell>
      <span className="eyebrow">Connect an agent</span>
      <h1 className="h3 mt-6">Allow {clientName} to use Omakaze?</h1>
      <p className="body-copy mt-3">
        It will be able to read pull requests in the workspace you choose and create or edit guides as you.
      </p>
      <div className="mt-6 flex items-center gap-3 border-y border-dashed border-line py-3">
        <Avatar src={user.avatarUrl} name={user.name} size={28} />
        <div>
          <p className="text-[14px] text-ink">{user.name}</p>
          {user.email ? <p className="font-mono text-[11px] text-meta">{user.email}</p> : null}
        </div>
      </div>
      {workspaces.length === 0 ? (
        <p className="mt-6 text-[14px] text-body">
          You have no workspace yet.{" "}
          <Link className="link" href="/new">
            Create one
          </Link>{" "}
          and try again.
        </p>
      ) : (
        <form action={authorizeAction} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="query" value={params.toString()} />
          <div>
            <label className="field-label" htmlFor="workspaceId">
              Workspace
            </label>
            <select id="workspaceId" name="workspaceId" className="input" defaultValue={user.lastWorkspaceId ?? workspaces[0].workspace.id}>
              {workspaces.map((w) => (
                <option key={w.workspace.id} value={w.workspace.id}>
                  {w.workspace.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <SubmitButton name="decision" value="allow" pendingText="Authorizing…">
              Allow
            </SubmitButton>
            <SubmitButton name="decision" value="deny" className="btn btn-secondary btn-md">
              Deny
            </SubmitButton>
          </div>
          <p className="text-[12px] text-muted">You can revoke access later in Settings → API tokens &amp; MCP.</p>
        </form>
      )}
    </Shell>
  );
}
