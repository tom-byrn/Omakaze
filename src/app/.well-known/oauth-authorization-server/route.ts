import { authorizationServerMetadata, CORS_HEADERS } from "@/lib/oauth/server";

export function GET() {
  return Response.json(authorizationServerMetadata(), { headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
