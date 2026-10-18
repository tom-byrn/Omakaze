import { CORS_HEADERS, exchangeToken, OAuthError, parseBasicAuth, readForm } from "@/lib/oauth/server";

export async function POST(req: Request) {
  try {
    const form = await readForm(req);
    const tokens = await exchangeToken(form, parseBasicAuth(req.headers.get("authorization")));
    return Response.json(tokens, { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof OAuthError) {
      return Response.json({ error: err.code, error_description: err.message }, { status: err.status, headers: CORS_HEADERS });
    }
    console.error("[oauth] token error", err);
    return Response.json({ error: "server_error" }, { status: 500, headers: CORS_HEADERS });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
