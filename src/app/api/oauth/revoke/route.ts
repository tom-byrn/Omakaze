import { CORS_HEADERS, OAuthError, parseBasicAuth, readForm, revokeToken } from "@/lib/oauth/server";

/** POST /api/oauth/revoke (RFC 7009). */
export async function POST(req: Request) {
  try {
    const form = await readForm(req);
    const basic = parseBasicAuth(req.headers.get("authorization"));
    const clientId = basic?.id ?? form.get("client_id");
    if (!clientId) throw new OAuthError("invalid_client", "Identify the client with client_id or HTTP Basic authentication.", 401);
    const token = form.get("token");
    if (token) await revokeToken(token, { id: clientId, secret: basic?.secret ?? form.get("client_secret") });
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    if (err instanceof OAuthError) {
      return Response.json(
        { error: err.code, error_description: err.message },
        { status: err.status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } },
      );
    }
    throw err;
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
