import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Logo } from "@/components/ui/Logo";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { getCurrentUser } from "@/lib/auth/session";
import { acceptInvite, getInviteByToken, InviteError } from "@/lib/invites";
import { getMembership } from "@/lib/workspaces";

export const metadata = { title: "Invite" };

export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const found = await getInviteByToken(token);
  const user = await getCurrentUser();
  const alreadyMember = found && user ? await getMembership(found.workspace.id, user.id) : null;

  async function accept() {
    "use server";
    const me = await getCurrentUser();
    if (!me) redirect(`/login?invite=${token}`);
    try {
      const { slug } = await acceptInvite(token, me);
      redirect(`/w/${slug}`);
    } catch (err) {
      if (err instanceof InviteError) redirect(`/invite/${token}?error=${encodeURIComponent(err.message)}`);
      throw err;
    }
  }

  return (
    <div className="flex min-h-screen flex-col grain">
      <header className="flex h-16 items-center border-b border-dashed border-line-header px-6 lg:px-12">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="relative w-full max-w-[480px] border border-black/15 bg-white p-8">
          <span className="eyebrow">Invitation</span>
          {!found || !found.usable ? (
            <>
              <h1 className="h3 mt-6">This invite is not valid.</h1>
              <p className="body-copy mt-3">It may have expired, been revoked or already been used. Ask for a new link.</p>
            </>
          ) : (
            <>
              <h1 className="h3 mt-6">Join {found.workspace.name}.</h1>
              <div className="mt-4 flex items-center gap-3 text-[14px] text-body">
                <Avatar src={found.inviter?.avatarUrl} name={found.inviter?.name} size={24} />
                <span>
                  {found.inviter?.name ?? "A workspace admin"} invited you as {found.invite.role === "admin" ? "an admin" : "a member"}.
                </span>
              </div>
              {found.invite.email ? (
                <p className="mt-2 font-mono text-[11px] text-meta">For {found.invite.email}</p>
              ) : null}
              {error ? <p className="mt-4 border border-dashed border-danger/40 px-3 py-2 text-[13px] text-danger">{error}</p> : null}
              <div className="mt-8 flex flex-wrap gap-2">
                {alreadyMember ? (
                  <Link href={`/w/${found.workspace.slug}`} className="btn btn-primary btn-md">
                    Open workspace
                  </Link>
                ) : user ? (
                  <form action={accept}>
                    <SubmitButton pendingText="Joining…">Accept invite as {user.name}</SubmitButton>
                  </form>
                ) : (
                  <>
                    <Link href={`/signup?invite=${token}`} className="btn btn-primary btn-md">
                      Create account
                    </Link>
                    <Link href={`/login?invite=${token}`} className="btn btn-secondary btn-md">
                      Sign in
                    </Link>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
