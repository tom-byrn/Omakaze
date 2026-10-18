import { authorizationServerMetadata, CORS_HEADERS } from "@/lib/oauth/server";

/** Some MCP clients look here before RFC 8414 metadata. */
export function GET() {
  return Response.json(authorizationServerMetadata(), { headers: CORS_HEADERS });
}
