import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { verifyPayload } from "@/lib/crypto";
import { env } from "@/lib/env";
import { acceptInvite, INVITE_EMAIL_PURPOSE, InviteError } from "@/lib/invites";

/** GET /invite/<token>/confirm?sig=… — the link emailed to confirm an invite's address. */
export async function GET(req: Request, ctx: RouteContext<"/invite/[token]/confirm">) {
  const { token } = await ctx.params;
  const base = env().APP_URL;
  const sig = new URL(req.url).searchParams.get("sig");
  const back = (message: string) => NextResponse.redirect(`${base}/invite/${token}?error=${encodeURIComponent(message)}`);
  const data = verifyPayload<{ uid: string; email: string }>(sig, INVITE_EMAIL_PURPOSE);
  if (!data) return back("This confirmation link is not valid or has expired. Accept the invite again to get a new one.");

  const user = await getCurrentUser();
  if (!user) {
    const here = `/invite/${token}/confirm?sig=${encodeURIComponent(sig ?? "")}`;
    return NextResponse.redirect(`${base}/login?next=${encodeURIComponent(here)}`);
  }
  if (user.id !== data.uid) return back("Sign in with the account that asked for the confirmation link.");
  if ((user.email ?? "").toLowerCase() !== data.email) return back("Your account's email address has changed since the link was sent.");

  const verifiedAt = new Date();
  await db.update(users).set({ emailVerifiedAt: verifiedAt }).where(eq(users.id, user.id));
  try {
    const { slug } = await acceptInvite(token, { ...user, emailVerifiedAt: verifiedAt });
    return NextResponse.redirect(`${base}/w/${slug}`);
  } catch (err) {
    if (err instanceof InviteError) return back(err.message);
    throw err;
  }
}
