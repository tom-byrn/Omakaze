import { APICallError } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AiConfig } from "@/lib/ai/config";
import { parseModelList } from "@/lib/ai/models";
import { AiError, anthropicApiBase, generateJson, toAiError } from "@/lib/ai/providers";

const mock = vi.hoisted(() => ({ model: null as unknown }));
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: () => ({ chatModel: () => mock.model }),
}));

const cfg: AiConfig = {
  provider: "ollama",
  model: "qwen3:8b",
  apiKey: null,
  baseUrl: "http://localhost:11434/v1",
  instructions: null,
  source: "workspace",
};

const request = {
  system: "s",
  user: "u",
  schema: z.object({ ok: z.boolean() }),
  jsonSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
  schemaName: "check",
};

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function reply(text: string, finish: "stop" | "length" | "content-filter" = "stop") {
  return {
    stream: convertArrayToReadableStream([
      { type: "stream-start" as const, warnings: [] },
      { type: "text-start" as const, id: "t" },
      { type: "text-delta" as const, id: "t", delta: text },
      { type: "text-end" as const, id: "t" },
      { type: "finish" as const, finishReason: { unified: finish, raw: finish }, usage },
    ]),
  };
}

function httpError(status: number, body: string) {
  return new APICallError({
    message: body,
    url: "http://localhost:11434/v1/chat/completions",
    requestBodyValues: {},
    statusCode: status,
    responseBody: body,
    isRetryable: status >= 500,
  });
}

describe("generateJson", () => {
  beforeEach(() => {
    mock.model = null;
  });

  it("sends the JSON schema as structured output and validates the answer", async () => {
    const model = new MockLanguageModelV4({ doStream: async () => reply('{"ok": true}') });
    mock.model = model;
    await expect(generateJson(cfg, request)).resolves.toEqual({ ok: true });
    expect(model.doStreamCalls[0].responseFormat).toMatchObject({ type: "json", name: "check" });
  });

  it("retries without structured output when the server rejects response_format", async () => {
    const model = new MockLanguageModelV4({
      doStream: async (opts) => {
        if (opts.responseFormat?.type === "json") throw httpError(400, "response_format json_schema is not supported");
        return reply('Sure:\n```json\n{"ok": false}\n```');
      },
    });
    mock.model = model;
    await expect(generateJson(cfg, request)).resolves.toEqual({ ok: false });
    expect(model.doStreamCalls).toHaveLength(2);
    expect(model.doStreamCalls[1].responseFormat?.type ?? "text").toBe("text");
  });

  it("asks again once when the answer does not match the schema", async () => {
    const answers = ['{"ok": "yes"}', '{"ok": true}'];
    const model = new MockLanguageModelV4({ doStream: async () => reply(answers.shift()!) });
    mock.model = model;
    await expect(generateJson(cfg, request)).resolves.toEqual({ ok: true });
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain("could not be used");
  });

  it("reports refusals and cut-off responses", async () => {
    mock.model = new MockLanguageModelV4({ doStream: async () => reply("", "content-filter") });
    await expect(generateJson(cfg, request)).rejects.toThrow(/declined/);
    mock.model = new MockLanguageModelV4({ doStream: async () => reply('{"ok":', "length") });
    await expect(generateJson(cfg, request)).rejects.toThrow(/cut off/);
  });

  it("does not fall back on other client errors", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw httpError(404, "model 'qwen3:8b' not found");
      },
    });
    mock.model = model;
    await expect(generateJson(cfg, request)).rejects.toThrow(/Ollama API error 404/);
    expect(model.doStreamCalls).toHaveLength(1);
  });
});

describe("toAiError", () => {
  it("maps HTTP errors to messages and retry flags", () => {
    const rejected = toAiError(httpError(401, "bad key"), cfg) as AiError;
    expect(rejected.message).toBe("The Ollama API key was rejected.");
    expect(rejected.retryable).toBe(false);
    expect((toAiError(httpError(429, "slow down"), cfg) as AiError).retryable).toBe(true);
    expect((toAiError(httpError(503, "busy"), cfg) as AiError).retryable).toBe(true);
  });
});

describe("anthropicApiBase", () => {
  it("adds /v1 once", () => {
    expect(anthropicApiBase("https://api.anthropic.com")).toBe("https://api.anthropic.com/v1");
    expect(anthropicApiBase("https://proxy.example.com/v1")).toBe("https://proxy.example.com/v1");
  });
});

describe("parseModelList", () => {
  it("reads OpenAI-style lists and drops non-chat OpenAI models", () => {
    const data = { data: [{ id: "gpt-5.5" }, { id: "text-embedding-3-large" }, { id: "gpt-5.5" }, { id: "o5-mini" }] };
    expect(parseModelList("openai", data).map((m) => m.id)).toEqual(["gpt-5.5", "o5-mini"]);
    expect(parseModelList("ollama", { data: [{ id: "qwen3:8b" }, { id: "llama4" }] }).map((m) => m.id)).toEqual([
      "llama4",
      "qwen3:8b",
    ]);
  });

  it("keeps display names", () => {
    expect(parseModelList("anthropic", { data: [{ id: "claude-opus-5-5", display_name: "Claude Opus 5.5" }] })).toEqual([
      { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
    ]);
    expect(parseModelList("openrouter", { data: [{ id: "x/y", name: "X: Y" }] })).toEqual([{ id: "x/y", label: "X: Y" }]);
  });

  it("reads Gemini lists and keeps only text generation models", () => {
    const data = {
      models: [
        { name: "models/gemini-3-pro", displayName: "Gemini 3 Pro", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding-005", supportedGenerationMethods: ["embedContent"] },
      ],
    };
    expect(parseModelList("google", data)).toEqual([{ id: "gemini-3-pro", label: "Gemini 3 Pro" }]);
  });

  it("rejects unknown formats", () => {
    expect(() => parseModelList("openai-compatible", { models: [] })).toThrow(/Unexpected/);
  });
});
