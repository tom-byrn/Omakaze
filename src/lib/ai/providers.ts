import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { env } from "@/lib/env";
import type { AiConfig } from "./config";

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

/** Models that accept `output_config.effort`. */
function supportsEffort(model: string): boolean {
  return /^claude-(opus|sonnet|fable|haiku|mythos)-5/.test(model) || /^claude-(opus-4-[678]|sonnet-4-6)/.test(model);
}

/** Models that accept structured outputs via `output_config.format`. */
function supportsStructuredOutput(model: string): boolean {
  return /^claude-(opus|sonnet|fable|haiku|mythos)-5/.test(model) || /^claude-(opus-4-[5-8]|haiku-4-5|opus-4-1)/.test(model);
}

/** Models that support server-side refusal fallbacks with `fallbacks: "default"`. */
function supportsServerFallback(model: string): boolean {
  return ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"].includes(model);
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

async function anthropicJson<T>(cfg: AiConfig, req: JsonRequest<T>): Promise<string> {
  const baseURL = cfg.baseUrl || ANTHROPIC_DEFAULT_URL;
  const client = new Anthropic({
    apiKey: cfg.apiKey ?? undefined,
    baseURL,
    timeout: 20 * 60 * 1000,
    maxRetries: 2,
  });
  const fallback = supportsServerFallback(cfg.model) && baseURL === ANTHROPIC_DEFAULT_URL;
  try {
    const stream = client.beta.messages.stream({
      model: cfg.model,
      max_tokens: req.maxTokens ?? 64000,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
      ...(supportsEffort(cfg.model) || supportsStructuredOutput(cfg.model)
        ? {
            output_config: {
              ...(supportsEffort(cfg.model) ? { effort: "high" as const } : {}),
              ...(supportsStructuredOutput(cfg.model)
                ? { format: { type: "json_schema" as const, schema: req.jsonSchema } }
                : {}),
            },
          }
        : {}),
      // Retry policy declines on Anthropic's recommended fallback model.
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new AiError(`The model declined to generate this guide (${message.stop_details?.category ?? "no category"}).`);
    }
    if (message.stop_reason === "max_tokens") {
      throw new AiError("The response was cut off at the token limit. Try a model with a larger output limit.");
    }
    return message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new AiError("The Anthropic API key was rejected.");
    if (err instanceof Anthropic.RateLimitError) throw new AiError("Rate limited by Anthropic. Try again later.", true);
    if (err instanceof Anthropic.APIError) throw new AiError(`Anthropic API error ${err.status ?? ""}: ${err.message}`, (err.status ?? 500) >= 500);
    throw err;
  }
}

async function openAiCompatibleJson<T>(cfg: AiConfig, req: JsonRequest<T>): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  if (cfg.provider === "openrouter") {
    headers["HTTP-Referer"] = env().APP_URL;
    headers["X-Title"] = "Guided PRs";
  }
  const tokenField = cfg.provider === "openai" ? "max_completion_tokens" : "max_tokens";
  const formats: (Record<string, unknown> | null)[] = [
    { type: "json_schema", json_schema: { name: req.schemaName, strict: true, schema: req.jsonSchema } },
    { type: "json_object" },
    null,
  ];
  let lastError = "";
  for (const format of formats) {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      [tokenField]: req.maxTokens ?? 32000,
    };
    if (format) body.response_format = format;
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20 * 60 * 1000),
    });
    const text = await res.text();
    if (res.ok) {
      let data: { choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[]; error?: { message?: string } };
      try {
        data = JSON.parse(text);
      } catch {
        throw new AiError("The provider returned an invalid response.", true);
      }
      if (data.error?.message) throw new AiError(`Provider error: ${data.error.message}`, true);
      const choice = data.choices?.[0];
      if (choice?.message?.refusal) throw new AiError(`The model declined: ${choice.message.refusal}`);
      if (choice?.finish_reason === "length") throw new AiError("The response was cut off at the token limit.");
      const content = choice?.message?.content;
      if (!content) throw new AiError("The provider returned an empty response.", true);
      return content;
    }
    lastError = `${res.status}: ${text.slice(0, 400)}`;
    if (res.status === 401 || res.status === 403) throw new AiError("The API key was rejected by the provider.");
    if (res.status === 429) throw new AiError("Rate limited by the provider. Try again later.", true);
    if (res.status >= 500) throw new AiError(`Provider error ${lastError}`, true);
    // 400/404/422: an unsupported response_format is retried without it; anything else is final.
    if (!/response_format|json_schema|json_object|structured|schema/i.test(text)) break;
  }
  throw new AiError(`Provider request failed (${lastError})`);
}

/** Ask the model for JSON matching `schema`. Retries once with the validation error on bad output. */
export async function generateJson<T>(cfg: AiConfig, req: JsonRequest<T>): Promise<T> {
  let user = req.user;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw =
      cfg.provider === "anthropic" ? await anthropicJson(cfg, { ...req, user }) : await openAiCompatibleJson(cfg, { ...req, user });
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
