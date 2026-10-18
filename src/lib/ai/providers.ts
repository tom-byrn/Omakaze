import { createAnthropic, type AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  APICallError,
  jsonSchema,
  Output,
  RetryError,
  StreamProviderError,
  streamText,
  type FinishReason,
  type JSONSchema7,
  type LanguageModel,
  type ProviderMetadata,
} from "ai";
import type { z } from "zod";
import { env } from "@/lib/env";
import { chatgptFetch, ChatgptError, MANAGE_USAGE_URL } from "./chatgpt";
import { providerInfo, type AiConfig } from "./config";

export class AiError extends Error {
  constructor(
    message: string,
    public retryable = false,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export type JsonRequest<T> = {
  system: string;
  user: string;
  /** zod schema used to validate the response */
  schema: z.ZodType<T>;
  /** JSON schema sent to providers that support structured outputs */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  maxTokens?: number;
};

const ANTHROPIC_DEFAULT_URL = "https://api.anthropic.com";

/** Models that accept `effort`. */
function supportsEffort(model: string): boolean {
  return /^claude-(opus|sonnet|fable|haiku|mythos)-5/.test(model) || /^claude-(opus-4-[678]|sonnet-4-6)/.test(model);
}

/** Models that support server-side refusal fallbacks with `fallbacks: "default"`. */
function supportsServerFallback(model: string): boolean {
  return ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"].includes(model);
}

/** Anthropic base URLs are stored without the `/v1` that the AI SDK expects. */
export function anthropicApiBase(baseUrl: string): string {
  return /\/v1$/.test(baseUrl) ? baseUrl : `${baseUrl}/v1`;
}

export function languageModel(cfg: AiConfig): LanguageModel {
  const apiKey = cfg.apiKey ?? undefined;
  switch (cfg.provider) {
    case "anthropic":
      return createAnthropic({ apiKey, baseURL: anthropicApiBase(cfg.baseUrl) })(cfg.model);
    case "openai":
      return createOpenAI({ apiKey, baseURL: cfg.baseUrl })(cfg.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey, baseURL: cfg.baseUrl })(cfg.model);
    case "chatgpt":
      // The token comes from the user's connection and is refreshed per request, so a long generation outlives it.
      return createOpenAI({ apiKey: "chatgpt-plan", baseURL: cfg.baseUrl, fetch: chatgptFetch(cfg.chatgptConnectionId!) }).responses(cfg.model);
    default:
      // OpenRouter, Ollama, LM Studio and other servers that speak the Chat Completions API.
      return createOpenAICompatible({
        name: cfg.provider,
        baseURL: cfg.baseUrl,
        apiKey,
        supportsStructuredOutputs: true,
        headers: cfg.provider === "openrouter" ? { "HTTP-Referer": env().APP_URL, "X-Title": "Omakaze" } : undefined,
      }).chatModel(cfg.model);
  }
}

type ProviderOptions = Parameters<typeof streamText>[0]["providerOptions"];

function providerOptions(cfg: AiConfig): ProviderOptions {
  // Plan requests are not stored and take instructions as developer messages.
  if (cfg.provider === "chatgpt") return { openai: { store: false, systemMessageMode: "developer" as const } };
  if (cfg.provider !== "anthropic") return undefined;
  const anthropic = {
    ...(supportsEffort(cfg.model) ? { effort: "high" as const } : {}),
    // Retry policy declines on Anthropic's recommended fallback model.
    ...(supportsServerFallback(cfg.model) && cfg.baseUrl === ANTHROPIC_DEFAULT_URL ? { fallbacks: "default" as const } : {}),
  } satisfies AnthropicLanguageModelOptions;
  return { anthropic };
}

export function extractJson(text: string): unknown {
  let s = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new AiError("The model did not return JSON.", true);
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    throw new AiError("The model returned malformed JSON.", true);
  }
}

function validate<T>(value: unknown, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new AiError(`The model output did not match the expected shape: ${issues}`, true);
  }
  return parsed.data;
}

/** One streamed request. With `structured`, the JSON schema is sent as the provider's structured output format. */
async function streamJson<T>(cfg: AiConfig, req: JsonRequest<T>, structured: boolean): Promise<string> {
  const result = streamText({
    model: languageModel(cfg),
    system: req.system,
    prompt: req.user,
    // Plan requests reject max_output_tokens.
    maxOutputTokens: cfg.provider === "chatgpt" ? undefined : (req.maxTokens ?? (cfg.provider === "anthropic" ? 64000 : 32000)),
    ...(structured
      ? { output: Output.object({ schema: jsonSchema(req.jsonSchema as JSONSchema7), name: req.schemaName }) }
      : {}),
    providerOptions: providerOptions(cfg),
    maxRetries: 2,
    timeout: { totalMs: 20 * 60 * 1000 },
    // Errors are thrown from the loop below instead of logged.
    onError: () => {},
  });
  let text = "";
  let finishReason: FinishReason | undefined;
  let metadata: ProviderMetadata | undefined;
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") text += part.text;
    else if (part.type === "finish-step") metadata = part.providerMetadata;
    else if (part.type === "finish") finishReason = part.finishReason;
    else if (part.type === "error") throw part.error;
    else if (part.type === "abort") throw new AiError("The request was aborted.", true);
  }
  if (finishReason === "content-filter") {
    const details = metadata?.anthropic?.stopDetails as { category?: string } | undefined;
    throw new AiError(`The model declined to generate this guide (${details?.category ?? "no category"}).`);
  }
  if (finishReason === "length") {
    throw new AiError("The response was cut off at the token limit. Try a model with a larger output limit.");
  }
  if (!text.trim()) throw new AiError("The provider returned an empty response.", true);
  return text;
}

function unwrap(err: unknown): unknown {
  return RetryError.isInstance(err) ? (err.lastError ?? err) : err;
}

/** A 4xx that names the response format: the server does not support structured outputs. */
export function rejectsResponseFormat(err: unknown): boolean {
  const e = unwrap(err);
  if (!APICallError.isInstance(e) || ![400, 404, 422].includes(e.statusCode ?? 0)) return false;
  return /response_format|json_schema|json_object|structured|schema|text\.format/i.test(`${e.message} ${e.responseBody ?? ""}`);
}

/** Errors from ChatGPT plan requests, mapped to what the user can do about them. */
export function chatgptAiError(err: unknown): AiError | null {
  const e = unwrap(err);
  if (e instanceof ChatgptError) return new AiError(e.message, e.opts.retryable ?? false);
  const text = APICallError.isInstance(e) ? `${e.message} ${e.responseBody ?? ""}` : e instanceof Error ? e.message : "";
  const code = /\b(subscription_sharing_[a-z_]+|chatpass_v2_[a-z_]+)\b/.exec(text)?.[1];
  switch (code) {
    case "subscription_sharing_usage_limit_exceeded":
      return new AiError(
        `Your ChatGPT plan's usage limit was reached. See your usage at ${MANAGE_USAGE_URL}, or turn off your ChatGPT plan in Account settings to use the workspace provider.`,
      );
    case "subscription_sharing_usage_unavailable":
    case "subscription_sharing_user_unavailable":
      return new AiError("ChatGPT plan usage is temporarily unavailable. Try again later.", true);
    case "subscription_sharing_user_not_eligible":
      return new AiError("Your ChatGPT account can't use its plan here. Plan usage needs an eligible ChatGPT Plus or Pro plan.");
    case "subscription_sharing_invalid_user":
      return new AiError("ChatGPT did not accept your connection. If you disconnected Omakaze in ChatGPT, sign in again in Account settings.");
    case "subscription_sharing_unsupported_capability":
      return new AiError(`ChatGPT plan requests do not support part of this request: ${APICallError.isInstance(e) ? e.message : text}`);
    case undefined:
      break;
    default:
      return new AiError(`ChatGPT refused the request (${code}).`);
  }
  if (APICallError.isInstance(e)) {
    if (e.statusCode === 401) return new AiError("ChatGPT did not accept your connection. Sign in again in Account settings.");
    if (e.statusCode === 403) return new AiError(`ChatGPT refused the request: ${e.message}`);
    if (e.statusCode === 503) return new AiError("ChatGPT plan usage is temporarily unavailable. Try again later.", true);
  }
  return null;
}

export function toAiError(err: unknown, cfg: AiConfig): unknown {
  if (err instanceof AiError) return err;
  if (cfg.provider === "chatgpt") {
    const mapped = chatgptAiError(err);
    if (mapped) return mapped;
  }
  const label = providerInfo(cfg.provider).label;
  const e = unwrap(err);
  if (APICallError.isInstance(e)) {
    const status = e.statusCode;
    if (status === 401 || status === 403) return new AiError(`The ${label} API key was rejected.`);
    if (status === 429) return new AiError(`Rate limited by ${label}. Try again later.`, true);
    if (status == null) return new AiError(`Could not reach ${label} at ${cfg.baseUrl}: ${e.message}`, true);
    return new AiError(`${label} API error ${status}: ${e.message}`, status >= 500);
  }
  if (StreamProviderError.isInstance(e)) return new AiError(`${label} error: ${e.message}`, e.isRetryable);
  return err;
}

async function requestJson<T>(cfg: AiConfig, req: JsonRequest<T>): Promise<string> {
  try {
    return await streamJson(cfg, req, true);
  } catch (err) {
    if (!rejectsResponseFormat(err)) throw toAiError(err, cfg);
  }
  // The server rejected the structured output format: ask for JSON in the prompt only.
  try {
    return await streamJson(cfg, req, false);
  } catch (err) {
    throw toAiError(err, cfg);
  }
}

/** Ask the model for JSON matching `schema`. Retries once with the validation error on bad output. */
export async function generateJson<T>(cfg: AiConfig, req: JsonRequest<T>): Promise<T> {
  let user = req.user;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await requestJson(cfg, { ...req, user });
    try {
      return validate(extractJson(raw), req.schema);
    } catch (err) {
      if (attempt === 2 || !(err instanceof AiError)) throw err;
      user = `${req.user}\n\nYour previous answer could not be used: ${err.message}\nReturn only a JSON object matching the schema.`;
    }
  }
  throw new AiError("Unreachable");
}

/** Cheap request to verify credentials and model name from the settings page. */
export async function testAiConfig(cfg: AiConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const { z } = await import("zod");
    const schema = z.object({ ok: z.boolean() });
    const result = await generateJson(cfg, {
      system: "You are a connectivity check. Reply with JSON only.",
      user: 'Return {"ok": true}.',
      schema,
      jsonSchema: {
        type: "object",
        properties: { ok: { type: "boolean" } },
        required: ["ok"],
        additionalProperties: false,
      },
      schemaName: "check",
      maxTokens: 2000,
    });
    return { ok: result.ok === true, message: `Connected to ${cfg.model}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
