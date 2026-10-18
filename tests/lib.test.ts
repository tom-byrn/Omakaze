import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, hashPassword, signPayload, verifyPassword, verifyPayload } from "@/lib/crypto";
import { parsePullUrl } from "@/lib/github/pulls";
import { verifySignature } from "@/lib/github/webhooks";
import { formatRefLines, parseRefLines } from "@/lib/guides/ref-lines";
import { safeNext } from "@/lib/http";
import { agentPrompt } from "@/lib/prompts";
import { slugify } from "@/lib/workspaces";

describe("crypto", () => {
  it("round-trips encrypted secrets", () => {
    const c = encrypt("ghp_secret");
    expect(c.startsWith("v1:")).toBe(true);
    expect(c).not.toContain("ghp_secret");
    expect(decrypt(c)).toBe("ghp_secret");
  });

  it("rejects tampered ciphertext", () => {
    const c = encrypt("value");
    const tampered = `${c.slice(0, -2)}${c.slice(-2) === "AA" ? "BB" : "AA"}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it("signs and verifies payloads per purpose", () => {
    const token = signPayload({ uid: "u1" }, "test", 60);
    expect(verifyPayload<{ uid: string }>(token, "test")?.uid).toBe("u1");
    expect(verifyPayload(token, "other")).toBeNull();
    expect(verifyPayload(`${token}x`, "test")).toBeNull();
  });

  it("hashes passwords", async () => {
    const h = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});

describe("webhook signatures", () => {
  it("accepts valid and rejects invalid signatures", () => {
    const body = JSON.stringify({ action: "opened" });
    const sig = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`;
    expect(verifySignature(body, sig, "s3cret")).toBe(true);
    expect(verifySignature(body, sig, "other")).toBe(false);
    expect(verifySignature(body, null, "s3cret")).toBe(false);
  });
});

describe("parsePullUrl", () => {
  it("parses URLs and short forms", () => {
    expect(parsePullUrl("https://github.com/acme/web/pull/42")).toEqual({ owner: "acme", repo: "web", number: 42 });
    expect(parsePullUrl("https://github.com/acme/web/pull/42/files")).toEqual({ owner: "acme", repo: "web", number: 42 });
    expect(parsePullUrl("acme/web.js#7")).toEqual({ owner: "acme", repo: "web.js", number: 7 });
    expect(parsePullUrl("not a url")).toBeNull();
  });
});

describe("ref lines", () => {
  it("parses captions and round-trips", () => {
    const refs = parseRefLines("src/a.ts#2 | Retry logic\nsrc/b.ts:10-20\n\nsrc/c.ts");
    expect(refs).toEqual([
      { path: "src/a.ts", hunks: [2], note: "Retry logic" },
      { path: "src/b.ts", lines: { start: 10, end: 20, side: "new" } },
      { path: "src/c.ts" },
    ]);
    expect(formatRefLines(refs as never)).toBe("src/a.ts#2 | Retry logic\nsrc/b.ts:10-20\nsrc/c.ts");
  });
});

describe("misc", () => {
  it("only allows relative redirects", () => {
    expect(safeNext("/w/acme")).toBe("/w/acme");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext(null, "/x")).toBe("/x");
  });

  it("slugifies names", () => {
    expect(slugify("Acme Engineering!")).toBe("acme-engineering");
    expect(slugify("Ünïcödé Team")).toBe("unicode-team");
  });

  it("builds the agent prompt", () => {
    expect(agentPrompt("https://github.com/a/b/pull/1")).toBe("Create a guided PR for https://github.com/a/b/pull/1 using the Guided PRs MCP.");
  });
});
