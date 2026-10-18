import { redirect } from "next/navigation";
import { AuthForms } from "@/components/auth/AuthForms";
import { getAuthMethods } from "@/lib/auth/methods";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/http";
import { homePathFor } from "@/lib/workspaces";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next, "") : "";
  const invite = typeof sp.invite === "string" ? sp.invite : undefined;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const user = await getCurrentUser();
  if (user && !invite) redirect(next || (await homePathFor(user)));
  const methods = await getAuthMethods();
  return (
    <div>
      <span className="eyebrow">Sign in</span>
      <h1 className="h2 mt-6">Sign in to Guided PRs.</h1>
      <p className="lead mt-3 mb-8">Use your GitHub account to see your repositories and pull requests.</p>
      <AuthForms mode="login" methods={methods} next={next || undefined} invite={invite} initialError={error} />
    </div>
  );
}
