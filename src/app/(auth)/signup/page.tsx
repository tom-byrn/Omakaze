import { redirect } from "next/navigation";
import { AuthForms } from "@/components/auth/AuthForms";
import { getAuthMethods } from "@/lib/auth/methods";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/http";
import { homePathFor } from "@/lib/workspaces";

export const metadata = { title: "Create account" };

export default async function SignupPage(props: PageProps<"/signup">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next, "") : "";
  const invite = typeof sp.invite === "string" ? sp.invite : undefined;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const user = await getCurrentUser();
  if (user && !invite) redirect(next || (await homePathFor(user)));
  const methods = await getAuthMethods();
  return (
    <div>
      <span className="eyebrow">Create account</span>
      <h1 className="h2 mt-6">Create an account.</h1>
      <p className="lead mt-3 mb-8">
        {invite ? "Create an account to accept the invite." : "Accounts are free on self-hosted instances."}
      </p>
      <AuthForms mode="signup" methods={methods} next={next || undefined} invite={invite} initialError={error} />
    </div>
  );
}
