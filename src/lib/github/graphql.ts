import { env } from "@/lib/env";
import { ghFetch, GitHubError } from "./client";

/**
 * The GraphQL endpoint that belongs to a REST API base URL: `https://api.github.com/graphql` for
 * github.com, and `https://HOST/api/graphql` for GitHub Enterprise Server, whose REST API is at
 * `https://HOST/api/v3`. Other bases (GHE.com, proxies, the e2e mock) serve it at `<base>/graphql`.
 */
export function graphqlUrl(apiUrl: string = env().GITHUB_API_URL): string {
  const base = apiUrl.replace(/\/+$/, "");
  if (/\/api\/v3$/i.test(base)) return `${base.slice(0, -"/v3".length)}/graphql`;
  return `${base}/graphql`;
}

type GraphqlError = { type?: string; message?: string; path?: (string | number)[] };

// GitHub answers GraphQL errors with HTTP 200 and an `errors` list; map the types callers check.
const ERROR_STATUS: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, RATE_LIMITED: 429 };

/**
 * Run a GraphQL query or mutation. HTTP errors become GitHubError as in REST calls; GraphQL
 * errors become a GitHubError with status 404, 403 or 429 by error type, otherwise 422.
 */
export async function ghGraphql<T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await ghFetch(token, graphqlUrl(), { method: "POST", accept: "application/json", body: { query, variables } });
  const json = (await res.json()) as { data?: T | null; errors?: GraphqlError[] };
  if (json.errors && json.errors.length > 0) {
    const message = json.errors.map((e) => e.message).filter(Boolean).join("; ") || "GraphQL request failed";
    throw new GitHubError(`${message} (GitHub GraphQL)`, ERROR_STATUS[json.errors[0].type ?? ""] ?? 422, "graphql", json);
  }
  if (!json.data) throw new GitHubError("GitHub GraphQL returned no data", 502, "graphql", json);
  return json.data;
}
