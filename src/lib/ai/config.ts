import type { AiProvider } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { env } from "@/lib/env";

export type AiConfig = {
  provider: AiProvider;
  model: string;
  apiKey: string | null;
  baseUrl: string;
  instructions: string | null;
  source: "workspace" | "instance";
};

export const PROVIDERS: { id: AiProvider; label: string; defaultModel: string; baseUrl: string; keyRequired: boolean }[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultModel: "anthropic/claude-opus-5.5",
    baseUrl: "https://openrouter.ai/api/v1",
    keyRequired: true,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultModel: "claude-opus-5-5",
    baseUrl: "https://api.anthropic.com",
    keyRequired: true,
  },
  { id: "openai", label: "OpenAI", defaultModel: "", baseUrl: "https://api.openai.com/v1", keyRequired: true },
  {
    id: "openai-compatible",
    label: "OpenAI-compatible (Ollama, vLLM, LM Studio, …)",
    defaultModel: "",
    baseUrl: "http://localhost:11434/v1",
    keyRequired: false,
  },
];

export function providerInfo(id: AiProvider) {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

type WorkspaceAiFields = {
  aiProvider: AiProvider | null;
  aiModel: string | null;
  aiBaseUrl: string | null;
  aiApiKeyEnc: string | null;
  aiInstructions: string | null;
};

/** Effective AI configuration: workspace settings first, then instance defaults from env. */
export function resolveAiConfig(ws: WorkspaceAiFields): AiConfig | null {
  if (ws.aiProvider) {
    const info = providerInfo(ws.aiProvider);
    const apiKey = ws.aiApiKeyEnc ? decrypt(ws.aiApiKeyEnc) : null;
    const model = ws.aiModel || info.defaultModel;
    if (!model || (info.keyRequired && !apiKey)) return null;
    return {
      provider: ws.aiProvider,
      model,
      apiKey,
      baseUrl: (ws.aiBaseUrl || info.baseUrl).replace(/\/+$/, ""),
      instructions: ws.aiInstructions,
      source: "workspace",
    };
  }
  const e = env();
  if (e.AI_PROVIDER) {
    const info = providerInfo(e.AI_PROVIDER);
    const model = e.AI_MODEL || info.defaultModel;
    if (!model || (info.keyRequired && !e.AI_API_KEY)) return null;
    return {
      provider: e.AI_PROVIDER,
      model,
      apiKey: e.AI_API_KEY ?? null,
      baseUrl: (e.AI_BASE_URL || info.baseUrl).replace(/\/+$/, ""),
      instructions: ws.aiInstructions,
      source: "instance",
    };
  }
  return null;
}

export function describeAiConfig(cfg: AiConfig | null): string {
  if (!cfg) return "Not configured";
  return `${providerInfo(cfg.provider).label} · ${cfg.model}`;
}
