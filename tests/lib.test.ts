import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, hashPassword, signPayload, verifyPassword, verifyPayload } from "@/lib/crypto";
import { parsePullUrl } from "@/lib/github/pulls";
import { stripDiffLinks, stripMedia } from "@/lib/github/summary-comment";
import { verifySignature } from "@/lib/github/webhooks";
import { formatInterval } from "@/lib/format";
import { formatRefLines, parseRefLines } from "@/lib/guides/ref-lines";
import { isStaleGuide, STALE_GUIDE_MINUTES } from "@/lib/guides/service";
import { clientIp, safeNext } from "@/lib/http";
import { agentPrompt } from "@/lib/prompts";
import { isPublicAddress } from "@/lib/storage/remote";
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

  it("keeps expand and combined hunk and line ranges", () => {
    const text = "src/a.ts#2:10-20 +function | Validation\nsrc/b.ts +file";
    const refs = parseRefLines(text);
    expect(refs).toEqual([
      { path: "src/a.ts", hunks: [2], lines: { start: 10, end: 20, side: "new" }, expand: "function", note: "Validation" },
      { path: "src/b.ts", expand: "file" },
    ]);
    expect(formatRefLines(refs as never)).toBe(text);
  });
});

describe("stale guides", () => {
  it("only flags guides left generating", () => {
    const now = Date.parse("2026-10-18T12:00:00Z");
    const old = new Date(now - (STALE_GUIDE_MINUTES + 1) * 60_000);
    const recent = new Date(now - 5 * 60_000);
    expect(isStaleGuide({ status: "generating", updatedAt: old }, now)).toBe(true);
    expect(isStaleGuide({ status: "generating", updatedAt: recent }, now)).toBe(false);
    expect(isStaleGuide({ status: "ready", updatedAt: old }, now)).toBe(false);
  });
});

describe("formatInterval", () => {
  it("picks a readable unit", () => {
    expect(formatInterval(30)).toBe("30 seconds");
    expect(formatInterval(300)).toBe("5 minutes");
    expect(formatInterval(60)).toBe("1 minute");
    expect(formatInterval(7200)).toBe("2 hours");
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

describe("isPublicAddress", () => {
  it("refuses loopback, private, link-local and reserved ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::10.0.0.1", "[::1]"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "140.82.112.3", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it("rejects things that are not addresses", () => {
    expect(isPublicAddress("localhost")).toBe(false);
  });
});

describe("clientIp", () => {
  it("takes the address added by the trusted proxy", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("summary comment", () => {
  it("drops links into the diff and uploads that need sign-in", () => {
    const md = 'See [the check](diff:src/a.ts#L3).\n\n![Screenshot](/api/assets/1/a.png)\n\n<video src="/api/assets/2/b.mp4" controls></video>\n\nDone.';
    expect(stripMedia(stripDiffLinks(md)).replace(/\n{3,}/g, "\n\n").trim()).toBe("See the check.\n\nDone.");
  });
});
