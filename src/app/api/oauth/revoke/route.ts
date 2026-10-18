import { CORS_HEADERS, readForm, revokeToken } from "@/lib/oauth/server";

export async function POST(req: Request) {
  const form = await readForm(req);
  const token = form.get("token");
  if (token) await revokeToken(token);
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
