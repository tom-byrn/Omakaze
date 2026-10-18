import type { AiProvider } from "@/db/schema";
import { providerInfo } from "./config";
import { anthropicApiBase } from "./providers";

export type ModelOption = { id: string; label?: string };

export class ModelListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelListError";
  }
}

/** OpenAI lists embedding, audio and image models next to the chat models. */
const OPENAI_NON_CHAT = /embedding|tts|whisper|dall-e|davinci|babbage|moderation|transcribe|realtime|audio|image|search|sora/;

/**
 * Models the provider offers, from its model list endpoint (`/models` for OpenAI-style APIs,
 * Ollama, LM Studio and OpenRouter; `/v1/models` for Anthropic; `/models` for Gemini).
 * Only ids and names are returned, never the response body.
 */
export async function listModels(provider: AiProvider, baseUrl: string, apiKey: string | null): Promise<ModelOption[]> {
  const info = providerInfo(provider);
  const base = (baseUrl || info.baseUrl).replace(/\/+$/, "");
  let url: string;
  const headers: Record<string, string> = {};
  if (provider === "anthropic") {
    url = `${anthropicApiBase(base)}/models?limit=1000`;
    headers["anthropic-version"] = "2023-06-01";
    if (apiKey) headers["x-api-key"] = apiKey;
  } else if (provider === "google") {
    url = `${base}/models?pageSize=1000`;
    if (apiKey) headers["x-goog-api-key"] = apiKey;
  } else {
    url = `${base}/models`;
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  }

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000), redirect: "error" });
  } catch {
    throw new ModelListError(`Could not reach ${new URL(url).host}.`);
  }
  if (res.status === 401 || res.status === 403) throw new ModelListError("The API key was rejected.");
  if (!res.ok) throw new ModelListError(`The model list request failed (HTTP ${res.status}).`);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ModelListError("The model list was not valid JSON.");
  }
  return parseModelList(provider, data);
}

export function parseModelList(provider: AiProvider, data: unknown): ModelOption[] {
  const out: ModelOption[] = [];
  if (provider === "google") {
    const models = (data as { models?: unknown })?.models;
    if (!Array.isArray(models)) throw new ModelListError("Unexpected model list format.");
    for (const m of models as { name?: unknown; displayName?: unknown; supportedGenerationMethods?: unknown }[]) {
      if (typeof m?.name !== "string") continue;
      const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
      if (!methods.includes("generateContent")) continue;
      out.push({ id: m.name.replace(/^models\//, ""), label: typeof m.displayName === "string" ? m.displayName : undefined });
    }
  } else {
    const models = (data as { data?: unknown })?.data;
    if (!Array.isArray(models)) throw new ModelListError("Unexpected model list format.");
    for (const m of models as { id?: unknown; name?: unknown; display_name?: unknown }[]) {
      if (typeof m?.id !== "string" || !m.id) continue;
      if (provider === "openai" && OPENAI_NON_CHAT.test(m.id)) continue;
      const label = typeof m.display_name === "string" ? m.display_name : typeof m.name === "string" ? m.name : undefined;
      out.push({ id: m.id, label: label && label !== m.id ? label : undefined });
    }
  }
  const seen = new Set<string>();
  return out
    .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
    .sort((a, b) => a.id.localeCompare(b.id));
}
