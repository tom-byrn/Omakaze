import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { APICallError } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  buildAuthorizeUrl,
  CHATGPT_REDIRECT_URI,
  ChatgptError,
  connectionUsable,
  finishChatgptSignIn,
  grantsPlanUsage,
  newPendingSignIn,
  parseCallback,
  parseChatgptModels,
  planRequestBody,
  verifyIdToken,
  type ChatgptConnection,
} from "@/lib/ai/chatgpt";
import type { AiConfig } from "@/lib/ai/config";
import { AiError, chatgptAiError, generateJson, toAiError } from "@/lib/ai/providers";

const mock = vi.hoisted(() => ({ model: null as unknown, settings: null as unknown }));
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: (settings: unknown) => {
    mock.settings = settings;
    return { responses: () => mock.model };
  },
}));

describe("buildAuthorizeUrl", () => {
  it("registers a new client with PKCE, the host ID and plan scopes", () => {
    const pending = newPendingSignIn(null);
    const url = new URL(buildAuthorizeUrl({ pending, hostId: "urn:uuid:host" }));
    const q = url.searchParams;
    expect(`${url.origin}${url.pathname}`).toBe("https://auth.openai.com/api/accounts/authorize");
    expect(q.get("client_id")).toBe("dynamic_agent_client");
    expect(q.get("agent_name_hint")).toBe("Omakaze");
    expect(q.get("ext_agent_host_id")).toBe("urn:uuid:host");
    expect(q.get("redirect_uri")).toBe(CHATGPT_REDIRECT_URI);
    expect(q.get("scope")?.split(" ")).toEqual(expect.arrayContaining(["offline_access", "resource.invoke", "chatgpt.tokens.use.direct"]));
    expect(q.get("resource")).toBe("https://api.openai.com/v1");
    expect(q.get("state")).toBe(pending.state);
    expect(q.get("nonce")).toBe(pending.nonce);
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("code_challenge")).toBe(createHash("sha256").update(pending.verifier).digest("base64url"));
    expect(q.has("id_token_hint")).toBe(false);
    expect(q.has("prompt")).toBe(false);
  });

  it("signs back in with the issued client and hints", () => {
    const pending = newPendingSignIn("oaiapp_123");
    const q = new URL(
      buildAuthorizeUrl({ pending, hostId: "urn:uuid:host", idTokenHint: "id.tok.en", loginHint: "a@example.com", consent: true }),
    ).searchParams;
    expect(q.get("client_id")).toBe("oaiapp_123");
    expect(q.has("agent_name_hint")).toBe(false);
    expect(q.get("id_token_hint")).toBe("id.tok.en");
    expect(q.get("login_hint")).toBe("a@example.com");
    expect(q.get("prompt")).toBe("consent");
  });
});

describe("parseCallback", () => {
  it("reads the pasted address or its query string", () => {
    expect(parseCallback(` ${CHATGPT_REDIRECT_URI}?code=c1&state=s1&client_id=oaiapp_1&scope=openid `)).toMatchObject({
      code: "c1",
      state: "s1",
      clientId: "oaiapp_1",
    });
    expect(parseCallback("code=c2&state=s2")).toMatchObject({ code: "c2", state: "s2" });
    expect(parseCallback("?error=access_denied&state=s3")).toMatchObject({ error: "access_denied", state: "s3" });
  });

  it("rejects anything without a code or error", () => {
    expect(parseCallback("")).toBeNull();
    expect(parseCallback("http://127.0.0.1:1456/auth/callback")).toBeNull();
    expect(parseCallback("hello")).toBeNull();
  });
});

describe("finishChatgptSignIn", () => {
  const pending = { ...newPendingSignIn(null), state: "s" };
  const finish = (p: typeof pending, pasted: string) => finishChatgptSignIn("u1", p, pasted);

  it("refuses expired, mismatched, cancelled and unregistered callbacks before exchanging the code", async () => {
    await expect(finish({ ...pending, createdAt: Date.now() - 60 * 60 * 1000 }, "code=c&state=s")).rejects.toThrow(/expired/);
    await expect(finish(pending, "nothing here")).rejects.toThrow(/Paste the full address/);
    await expect(finish(pending, "code=c&state=other")).rejects.toThrow(/different sign-in/);
    await expect(finish(pending, "error=access_denied&state=s")).rejects.toThrow(/cancelled/);
    await expect(finish(pending, "code=c&state=s")).rejects.toThrow(/did not finish registering/);
    await expect(finish(pending, "code=c&state=s&client_id=dynamic_agent_client")).rejects.toThrow(/did not finish registering/);
    await expect(finish({ ...pending, clientId: "oaiapp_1" }, "code=c&state=s&client_id=oaiapp_2")).rejects.toThrow(/different client/);
  });
});

describe("verifyIdToken", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1" };
  const now = Date.now();
  const good = { iss: "https://auth.openai.com", aud: "oaiapp_1", sub: "user-1", email: "a@example.com", nonce: "n", exp: now / 1000 + 600 };
  const token = (claims: Record<string, unknown>, kid = "k1") => {
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const input = `${enc({ alg: "RS256", kid })}.${enc(claims)}`;
    return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
  };
  const expected = { clientId: "oaiapp_1", nonce: "n", now };

  it("accepts a valid token", () => {
    expect(verifyIdToken(token(good), [jwk], expected)).toEqual({ sub: "user-1", email: "a@example.com" });
  });

  it("rejects wrong claims and signatures", () => {
    expect(() => verifyIdToken(token({ ...good, nonce: "x" }), [jwk], expected)).toThrow(/does not match/);
    expect(() => verifyIdToken(token({ ...good, aud: "oaiapp_2" }), [jwk], expected)).toThrow(/another client/);
    expect(() => verifyIdToken(token({ ...good, iss: "https://evil.example" }), [jwk], expected)).toThrow(/issuer/);
    expect(() => verifyIdToken(token({ ...good, exp: now / 1000 - 3600 }), [jwk], expected)).toThrow(/expired/);
    const [h, , s] = token(good).split(".");
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...good, sub: "user-2" })).toString("base64url")}.${s}`;
    expect(() => verifyIdToken(forged, [jwk], expected)).toThrow(/signature/);
  });

  it("reports keys it does not know", () => {
    expect(verifyIdToken(token(good, "k2"), [jwk], expected)).toBe("unknown-key");
  });
});

describe("plan requests", () => {
  it("forces store and stream off the unsupported fields", () => {
    const body = planRequestBody({ model: "m", input: [], store: true, max_output_tokens: 10, temperature: 0, user: "u", text: { format: {} } });
    expect(body).toEqual({ model: "m", input: [], store: false, stream: true, text: { format: {} } });
  });

  it("lists models with visibility list, in server order", () => {
    const data = {
      models: [
        { slug: "gpt-b", display_name: "GPT B", visibility: "list" },
        { slug: "gpt-hidden", display_name: "Hidden", visibility: "hide" },
        { slug: "gpt-a", display_name: "gpt-a", visibility: "list" },
      ],
    };
    expect(parseChatgptModels(data)).toEqual([{ id: "gpt-b", label: "GPT B" }, { id: "gpt-a", label: undefined }]);
    expect(parseChatgptModels({})).toEqual([]);
  });

  it("needs the plan scope, a refresh token, a model and the user's opt-in", () => {
    const conn = { enabled: true, refreshTokenEnc: "v1:x", model: "gpt-b", scopes: "openid chatgpt.tokens.use.direct" } as ChatgptConnection;
    expect(grantsPlanUsage(conn.scopes)).toBe(true);
    expect(connectionUsable(conn)).toBe(true);
    expect(connectionUsable({ ...conn, scopes: "openid offline_access" })).toBe(false);
    expect(connectionUsable({ ...conn, refreshTokenEnc: null })).toBe(false);
    expect(connectionUsable({ ...conn, model: null })).toBe(false);
    expect(connectionUsable({ ...conn, enabled: false })).toBe(false);
  });
});

describe("ChatGPT plan generation", () => {
  const cfg: AiConfig = {
    provider: "chatgpt",
    model: "gpt-b",
    apiKey: null,
    baseUrl: "https://api.openai.com/v1",
    instructions: null,
    source: "chatgpt",
    chatgptConnectionId: "conn-1",
  };
  const request = {
    system: "s",
    user: "u",
    schema: z.object({ ok: z.boolean() }),
    jsonSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
    schemaName: "check",
    maxTokens: 2000,
  };

  it("uses the Responses API without a token limit and with storage off", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: "stream-start" as const, warnings: [] },
          { type: "text-start" as const, id: "t" },
          { type: "text-delta" as const, id: "t", delta: '{"ok": true}' },
          { type: "text-end" as const, id: "t" },
          {
            type: "finish" as const,
            finishReason: { unified: "stop" as const, raw: "stop" },
            usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
          },
        ]),
      }),
    });
    mock.model = model;
    await expect(generateJson(cfg, request)).resolves.toEqual({ ok: true });
    expect(model.doStreamCalls[0].maxOutputTokens).toBeUndefined();
    expect(model.doStreamCalls[0].providerOptions).toMatchObject({ openai: { store: false, systemMessageMode: "developer" } });
    expect((mock.settings as { baseURL: string }).baseURL).toBe("https://api.openai.com/v1");
  });

  const planError = (status: number, code: string) =>
    new APICallError({
      message: code,
      url: "https://api.openai.com/v1/responses",
      requestBodyValues: {},
      statusCode: status,
      responseBody: JSON.stringify({ error: { code, message: code } }),
    });

  it("maps plan error codes", () => {
    const limit = chatgptAiError(planError(429, "subscription_sharing_usage_limit_exceeded"))!;
    expect(limit.message).toContain("https://chatgpt.com/settings/usage");
    expect(limit.retryable).toBe(false);
    expect(chatgptAiError(planError(503, "subscription_sharing_usage_unavailable"))!.retryable).toBe(true);
    expect(chatgptAiError(planError(403, "subscription_sharing_user_not_eligible"))!.message).toMatch(/Plus or Pro/);
    expect((toAiError(planError(401, "subscription_sharing_invalid_user"), cfg) as AiError).message).toMatch(/sign in again/);
    expect(chatgptAiError(new ChatgptError("expired", { reconnect: true }))!.message).toBe("expired");
  });
});
