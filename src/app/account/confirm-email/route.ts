import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { verifyPayload } from "@/lib/crypto";
import { env } from "@/lib/env";
import { EMAIL_CONFIRM_PURPOSE } from "@/lib/notifications/prefs";

/**
 * GET /account/confirm-email?sig=… — the link that confirms a user's address for notification
 * email. It must be opened by the same signed-in user, as with invite confirmations, so a link
 * sent to someone else's address can't confirm it for the account that asked.
 */
export async function GET(req: Request) {
  const base = env().APP_URL;
  const sig = new URL(req.url).searchParams.get("sig");
  const back = (result: string) => NextResponse.redirect(`${base}/account?email=${result}#notifications`);
  const data = verifyPayload<{ uid: string; email: string }>(sig, EMAIL_CONFIRM_PURPOSE);
  if (!data) return back("invalid");
  const user = await getCurrentUser();
  if (!user) {
    const here = `/account/confirm-email?sig=${encodeURIComponent(sig ?? "")}`;
    return NextResponse.redirect(`${base}/login?next=${encodeURIComponent(here)}`);
  }
  if (user.id !== data.uid) return back("other-user");
  if ((user.email ?? "").toLowerCase() !== data.email) return back("changed");
  if (!user.emailVerifiedAt) await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
  return back("confirmed");
}
