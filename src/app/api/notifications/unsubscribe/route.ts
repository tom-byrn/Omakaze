import { applyUnsubscribe, readUnsubscribeToken } from "@/lib/notifications/prefs";

/**
 * POST /api/notifications/unsubscribe?token=… — one-click unsubscribe (RFC 8058): mail clients
 * POST `List-Unsubscribe=One-Click` to the List-Unsubscribe URL of a notification email. The signed
 * token is the permission, so no session or same-origin check applies.
 */
export async function POST(req: Request) {
  const scope = readUnsubscribeToken(new URL(req.url).searchParams.get("token"));
  if (!scope) return Response.json({ error: "Invalid unsubscribe link" }, { status: 400 });
  await applyUnsubscribe(scope);
  return Response.json({ ok: true });
}
