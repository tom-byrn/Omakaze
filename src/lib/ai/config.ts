import type { AiProvider } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { env } from "@/lib/env";

/** "chatgpt" is a user's own ChatGPT plan (see chatgpt.ts), never a workspace provider. */
export type AiConfigProvider = AiProvider | "chatgpt";

export type AiConfig = {
  provider: AiConfigProvider;
  model: string;
  apiKey: string | null;
  baseUrl: string;
  instructions: string | null;
  source: "workspace" | "instance" | "chatgpt";
  /** For "chatgpt": the connection whose token signs each request. */
  chatgptConnectionId?: string;
};

export type ProviderInfo = {
  id: AiConfigProvider;
  label: string;
  /** One line for the provider picker. */
  description: string;
  defaultModel: string;
  baseUrl: string;
  keyRequired: boolean;
  /** Runs on your own machine or network. */
  local: boolean;
  /** The model list can be loaded without an API key. */
  publicModels: boolean;
};

export const PROVIDERS: (ProviderInfo & { id: AiProvider })[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude models with your Anthropic API key.",
    defaultModel: "claude-opus-5-5",
    baseUrl: "https://api.anthropic.com",
    keyRequired: true,
    local: false,
    publicModels: false,
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "GPT models with your OpenAI API key.",
    defaultModel: "",
    baseUrl: "https://api.openai.com/v1",
    keyRequired: true,
    local: false,
    publicModels: false,
  },
  {
    id: "google",
    label: "Google",
    description: "Gemini models with a Google AI Studio API key.",
    defaultModel: "",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    keyRequired: true,
    local: false,
    publicModels: false,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "One key for models from many providers.",
    defaultModel: "anthropic/claude-opus-5.5",
    baseUrl: "https://openrouter.ai/api/v1",
    keyRequired: true,
    local: false,
    publicModels: true,
  },
  {
    id: "ollama",
    label: "Ollama",
    description: "Local models. The diff never leaves your network.",
    defaultModel: "",
    baseUrl: "http://localhost:11434/v1",
    keyRequired: false,
    local: true,
    publicModels: true,
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    description: "Local models served by LM Studio.",
    defaultModel: "",
    baseUrl: "http://localhost:1234/v1",
    keyRequired: false,
    local: true,
    publicModels: true,
  },
  {
    id: "openai-compatible",
    label: "OpenAI-compatible",
    description: "vLLM, LiteLLM, a company gateway or any server with /chat/completions.",
    defaultModel: "",
    // Kept from before the Ollama preset existed, so saved configurations without a base URL still work.
    baseUrl: "http://localhost:11434/v1",
    keyRequired: false,
    local: false,
    publicModels: true,
  },
];

export const CHATGPT_PROVIDER: ProviderInfo = {
  id: "chatgpt",
  label: "ChatGPT plan",
  description: "Your own ChatGPT Plus or Pro plan, connected with Sign in with ChatGPT.",
  defaultModel: "",
  baseUrl: "https://api.openai.com/v1",
  keyRequired: false,
  local: false,
  publicModels: false,
};

export function providerInfo(id: AiConfigProvider): ProviderInfo {
  if (id === "chatgpt") return CHATGPT_PROVIDER;
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

export type WorkspaceAiFields = {
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
