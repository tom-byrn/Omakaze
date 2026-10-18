import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, oauthClients } from "@/db/schema";
import { principalFromToken } from "@/lib/guides/access";
import { createMcpServer } from "@/lib/mcp/server";
import { CORS_HEADERS } from "@/lib/oauth/server";
import { env } from "@/lib/env";

export const maxDuration = 300;

function unauthorized(message: string) {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    {
      status: 401,
      headers: {
        ...CORS_HEADERS,
        "WWW-Authenticate": `Bearer realm="guided-prs", resource_metadata="${env().APP_URL}/.well-known/oauth-protected-resource/api/mcp"`,
      },
    },
  );
}

async function clientLabel(tokenId: string | null): Promise<string | undefined> {
  if (!tokenId) return undefined;
  const [row] = await db
    .select({ name: apiTokens.name, kind: apiTokens.kind, client: oauthClients.name })
    .from(apiTokens)
    .leftJoin(oauthClients, eq(oauthClients.id, apiTokens.oauthClientId))
    .where(eq(apiTokens.id, tokenId))
    .limit(1);
  return row?.client ?? row?.name ?? undefined;
}

async function handle(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  const token = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  if (!token) return unauthorized("Authentication required");
  const principal = await principalFromToken(token);
  if (!principal) return unauthorized("Invalid or expired token");

  const server = createMcpServer(principal, { name: await clientLabel(principal.tokenId) });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    // Room for base64-encoded screenshots and recordings sent to upload_asset.
    maxRequestBodySize: Math.ceil(env().MAX_UPLOAD_MB * 1.4 + 2) * 1024 * 1024,
  });
  await server.connect(transport);
  const res = await transport.handleRequest(req, {
    authInfo: { token, clientId: principal.tokenId ?? "token", scopes: ["mcp"], extra: { userId: principal.user.id } },
  });
  setTimeout(() => void server.close().catch(() => {}), 1000);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  headers.set("Access-Control-Expose-Headers", "mcp-session-id, WWW-Authenticate");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export { handle as GET, handle as POST, handle as DELETE };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
