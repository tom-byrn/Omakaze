import { CORS_HEADERS, OAuthError, registerClient } from "@/lib/oauth/server";
import { clientIp, rateLimit } from "@/lib/http";

/** OAuth 2.0 Dynamic Client Registration (RFC 7591) for MCP clients. */
export async function POST(req: Request) {
  // Per address, plus an overall cap so forged addresses can't register clients without limit.
  if (!rateLimit(`dcr:${clientIp(req.headers)}`, 30, 60 * 60 * 1000) || !rateLimit("dcr:all", 500, 60 * 60 * 1000)) {
    return Response.json({ error: "slow_down", error_description: "Too many registrations" }, { status: 429, headers: CORS_HEADERS });
  }
  try {
    const meta = (await req.json()) as Record<string, unknown>;
    return Response.json(await registerClient(meta), { status: 201, headers: CORS_HEADERS });
  } catch (err) {
    if (err instanceof OAuthError) {
      return Response.json({ error: err.code, error_description: err.message }, { status: 400, headers: CORS_HEADERS });
    }
    return Response.json({ error: "invalid_client_metadata", error_description: "Invalid request body" }, { status: 400, headers: CORS_HEADERS });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
