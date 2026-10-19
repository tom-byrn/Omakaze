import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { users, workspaces } from "@/db/schema";
import { ActionForm, type FormState } from "@/components/ui/ActionForm";
import { Logo } from "@/components/ui/Logo";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { applyUnsubscribe, readUnsubscribeToken } from "@/lib/notifications/prefs";

export const metadata = { title: "Unsubscribe", robots: { index: false } };

/** The page an email's unsubscribe link opens. No sign-in: the signed link is the permission. */
export default async function UnsubscribePage(props: PageProps<"/unsubscribe">) {
  const sp = await props.searchParams;
  const token = typeof sp.token === "string" ? sp.token : null;
  const scope = readUnsubscribeToken(token);
  const [user] = scope ? await db.select({ email: users.email }).from(users).where(eq(users.id, scope.uid)).limit(1) : [];
  const [ws] = scope?.ws ? await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, scope.ws)).limit(1) : [];

  async function unsubscribe(): Promise<FormState> {
    "use server";
    const s = readUnsubscribeToken(token);
    if (!s) return { error: "This link is not valid." };
    await applyUnsubscribe(s);
    return {
      ok: true,
      message: s.ws ? "Done. You won't get email about this workspace anymore." : "Done. You won't get notification email from Omakaze anymore.",
    };
  }

  const valid = Boolean(scope && user && (!scope.ws || ws));
  return (
    <div className="flex min-h-screen flex-col grain">
      <header className="flex h-16 items-center border-b border-dashed border-line-header px-6 lg:px-12">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="relative w-full max-w-[480px] border border-black/15 bg-white p-6 sm:p-8">
          <span className="eyebrow">Email notifications</span>
          {!valid ? (
            <>
              <h1 className="h3 mt-6">This link is not valid.</h1>
              <p className="body-copy mt-3">
                It may be from an old email. Change what you get in your{" "}
                <Link className="link" href="/account#notifications">
                  notification settings
                </Link>
                .
              </p>
            </>
          ) : (
            <>
              <h1 className="h3 mt-6">{ws ? `Stop email about ${ws.name}?` : "Unsubscribe from Omakaze email?"}</h1>
              <p className="body-copy mt-3">
                {ws
                  ? `${user?.email} won't get notifications about the ${ws.name} workspace. Other workspaces are not affected.`
                  : `${user?.email} won't get any notification email. Invites and confirmation links still arrive.`}
              </p>
              <ActionForm action={unsubscribe} className="mt-8 flex flex-col items-start gap-4">
                <SubmitButton pendingText="Unsubscribing…">{ws ? `Mute ${ws.name}` : "Unsubscribe"}</SubmitButton>
              </ActionForm>
              <p className="mt-6 border-t border-dashed border-line pt-4 text-[13px] text-muted">
                To turn email back on or choose which notifications you get, open your{" "}
                <Link className="link" href="/account#notifications">
                  notification settings
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
