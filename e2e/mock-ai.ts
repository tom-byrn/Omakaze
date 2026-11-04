/**
 * A stand-in for an AI provider: an OpenAI-compatible Chat Completions server (the "ollama"
 * provider talks to it) that streams a canned guide. Used by e2e/ai-reviewers.spec.ts.
 *
 * - The guide answers the `guided_pr` request for the demo pull request #131 (CDN image loader).
 *   When the prompt carries AI reviewer findings, the sections discuss them, as a real model is
 *   asked to (src/lib/ai-reviewers/signals.ts, AI_FINDINGS_INSTRUCTIONS).
 * - Every request is recorded: GET /__mock/requests returns the system and user prompts.
 */
import http from "node:http";
import { E2E } from "./config";

export const MOCK_AI_MODEL = "demo-model";

export type MockAiRequest = { at: string; model: string; system: string; user: string; schema: string | null };

function guideFor(user: string) {
  const claude = user.includes("### Claude Code Review");
  const greptile = user.includes("### Greptile");
  const reviewed = claude || greptile;
  const loaderBody = [
    "`cdnLoader` is the custom [next/image loader](diff:src/lib/images.ts#L7-L10). For every image Next.js asks it for a URL at a given width and quality, and it answers with the CDN's resizer URL: the image host is stripped and the rest of the path is appended to `/resize/w=…,q=…`.",
    "",
    "Responses are cached at the edge for a year. A new upload gets a new path, so nothing needs purging when a product photo changes.",
    "",
    "| Input `src` | Output |",
    "| --- | --- |",
    "| `https://images.acme-storefront.com/p/42/front.jpg`, width 640 | `https://cdn.acme-storefront.com/resize/w=640,q=75/p/42/front.jpg` |",
    "",
    ...(claude
      ? [
          "> [!WARNING]",
          "> **Claude Code Review** flagged [the host check](diff:src/lib/images.ts#L8): holds, local images go through the loader too.",
          "",
        ]
      : []),
    ...(greptile
      ? [
          "**Greptile** flagged [path encoding](diff:src/lib/images.ts#L9): minor, uploads get generated names.",
          "",
        ]
      : []),
    "Check that the default quality of 75 matches what the product pages asked for before (Next.js also defaults to 75).",
  ].join("\n");
  return {
    title: "Serve product images through the CDN resizer",
    summary: [
      "Product images now go through the CDN's resizer instead of Next.js image optimization: a custom loader turns each `next/image` request into a resizer URL that is cached at the edge. The largest product page drops from 2.1 MB to 640 KB.",
      "",
      reviewed
        ? "The AI review finding that matters is the loader's host check (section 01)."
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    sections: [
      { title: "A loader that builds CDN resizer URLs", body: loaderBody, refs: ["src/lib/images.ts"] },
      {
        title: "Switching next/image to the custom loader",
        body: "The [image config](diff:next.config.ts#L5-L6) points `next/image` at the new loader. `remotePatterns` stays, so images from other hosts are still rejected by `next/image` itself.\n\nWith a custom loader, Next.js no longer resizes images on the server, so the `/_next/image` route stops doing work.",
        refs: ["next.config.ts"],
      },
    ],
  };
}

function answer(schema: string | null, user: string): unknown {
  if (schema === "guided_pr") return guideFor(user);
  // Any other request (none in the demo): an empty object the caller rejects loudly.
  return {};
}

export type MockAiServer = { url: string; close: () => Promise<void> };

/** Start on 127.0.0.1:`port` (default E2E_PORT + 500). `delayMs` spreads the streamed answer out. */
export async function startMockAi(opts: { port?: number; delayMs?: number } = {}): Promise<MockAiServer> {
  const port = opts.port ?? E2E.port + 500;
  const requests: MockAiRequest[] = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname === "/__mock/requests") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ requests }));
      return;
    }
    if (req.method === "GET" && url.pathname.endsWith("/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ id: MOCK_AI_MODEL, object: "model" }] }));
      return;
    }
    if (req.method !== "POST" || !url.pathname.endsWith("/chat/completions")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: `No mock route for ${req.method} ${url.pathname}` } }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      model: string;
      stream?: boolean;
      messages: { role: string; content: string | { type: string; text?: string }[] }[];
      response_format?: { json_schema?: { name?: string } };
    };
    const text = (role: string) =>
      body.messages
        .filter((m) => m.role === role)
        .map((m) => (typeof m.content === "string" ? m.content : m.content.map((p) => p.text ?? "").join("")))
        .join("\n");
    const schema = body.response_format?.json_schema?.name ?? null;
    const user = text("user");
    requests.push({ at: new Date().toISOString(), model: body.model, system: text("system"), user, schema });
    const content = JSON.stringify(answer(schema, user));
    const base = { id: `chatcmpl-mock${requests.length}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: body.model };
    if (!body.stream) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ...base, object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] }));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const parts = content.match(/[\s\S]{1,120}/g) ?? [];
    const pause = (opts.delayMs ?? 1500) / Math.max(1, parts.length);
    for (const [i, part] of parts.entries()) {
      const delta = i === 0 ? { role: "assistant", content: part } : { content: part };
      res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
      await new Promise((r) => setTimeout(r, pause));
    }
    res.write(
      `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 } })}\n\n`,
    );
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => server.close(() => r())) };
}

/** Requests the running mock received (it runs in the spec's process; this reads it over HTTP). */
export async function mockAiRequests(url: string): Promise<MockAiRequest[]> {
  const res = await fetch(`${url}/__mock/requests`);
  return ((await res.json()) as { requests: MockAiRequest[] }).requests;
}
