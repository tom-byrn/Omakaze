import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { verifyPayload } from "@/lib/crypto";
import { env } from "@/lib/env";
import { saveGitHubApp } from "@/lib/github/app";
import { gh } from "@/lib/github/client";

/** Redirect target of the GitHub App manifest flow: exchange the code for app credentials. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = env().APP_URL;
  const user = await getCurrentUser();
  if (!user?.isInstanceAdmin) return NextResponse.redirect(`${base}/`);
  const state = verifyPayload<{ uid: string }>(url.searchParams.get("state"), "github-manifest");
  const code = url.searchParams.get("code");
  if (!state || state.uid !== user.id || !code) {
    return NextResponse.redirect(`${base}/admin?error=${encodeURIComponent("GitHub App setup expired. Try again.")}`);
  }
  try {
    const app = await gh<{
      id: number;
      slug: string;
      pem: string;
      webhook_secret: string | null;
      client_id: string;
      client_secret: string;
      html_url: string;
    }>(null, `/app-manifests/${code}/conversions`, { method: "POST" });
    await saveGitHubApp(app);
    return NextResponse.redirect(`${base}/admin?created=${encodeURIComponent(app.slug)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "GitHub App creation failed";
    return NextResponse.redirect(`${base}/admin?error=${encodeURIComponent(message)}`);
  }
}
