import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { homePathFor } from "@/lib/workspaces";

/** /settings/... → the same settings page of the user's current workspace. */
export default async function SettingsRedirect(props: PageProps<"/settings/[[...rest]]">) {
  const { rest } = await props.params;
  const user = await requireUser("/settings");
  const home = await homePathFor(user);
  if (!home.startsWith("/w/")) redirect(home);
  const tail = (rest ?? []).filter((p) => /^[a-z-]+$/.test(p)).join("/");
  if ((rest ?? []).length > 0 && !tail) notFound();
  redirect(`${home}/settings${tail ? `/${tail}` : ""}`);
}
