import { CORS_HEADERS, protectedResourceMetadata } from "@/lib/oauth/server";

/** RFC 9728 protected resource metadata for the MCP endpoint. */
export function GET() {
  return Response.json(protectedResourceMetadata(), { headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
