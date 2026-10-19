import { beforeEach, describe, expect, it, vi } from "vitest";

// The routes' access check, with the database parts replaced: which link a token opens, which guide
// an id is, and the member check for requests without a token.
const state = vi.hoisted(() => ({
  opened: null as unknown,
  guides: new Map<string, unknown>(),
  member: vi.fn(),
  calls: [] as string[],
}));

vi.mock("@/lib/share/links", () => ({
  openShareLink: async (token: string, address: string) => {
    state.calls.push(`${token}@${address}`);
    return state.opened;
  },
  sharedVersions: async () => [],
}));
vi.mock("@/lib/guides/service", () => ({ getGuide: async (id: string) => state.guides.get(id) ?? null }));
vi.mock("@/lib/guides/access", () => ({ requireGuideAccess: state.member }));

const { requireGuideReadAccess } = await import("@/lib/share/access");

const link = {
  id: "link1",
  workspaceId: "ws1",
  repositoryId: "repo1",
  prNumber: 127,
  guideId: null,
  includeComments: false,
};
const workspace = { id: "ws1" };
const repo = { id: "repo1" };
const guide = (id: string, over: Record<string, unknown> = {}) => ({ id, workspaceId: "ws1", repositoryId: "repo1", prNumber: 127, status: "ready", ...over });

function req(path: string, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${path}`, { headers });
}

async function status(p: Promise<unknown>): Promise<number> {
  try {
    await p;
    return 200;
  } catch (err) {
    return (err as { status?: number }).status ?? 500;
  }
}

beforeEach(() => {
  state.opened = { state: "active", link, workspace, repo };
  state.guides = new Map([
    ["g127", guide("g127")],
    ["g128", guide("g128", { prNumber: 128 })],
    ["g127-draft", guide("g127-draft", { status: "draft" })],
    ["other-ws", guide("other-ws", { workspaceId: "ws2", repositoryId: "repo9" })],
  ]);
  state.member.mockReset();
  state.member.mockResolvedValue({ guide: guide("g128", { prNumber: 128 }), principal: { user: { id: "u1" } } });
  state.calls = [];
});

describe("requireGuideReadAccess", () => {
  it("uses the member check when there is no share token", async () => {
    const access = await requireGuideReadAccess(req("/api/guides/g128/file?path=a.ts"), "g128");
    expect(state.member).toHaveBeenCalledOnce();
    expect(access.share).toBeNull();
    expect(state.calls).toEqual([]);
  });

  it("opens the link's own guide without a session", async () => {
    const access = await requireGuideReadAccess(req("/api/guides/g127/file?path=a.ts&share=tok"), "g127");
    expect(access.guide.id).toBe("g127");
    expect(access.share?.id).toBe("link1");
    expect(access.principal).toBeNull();
    expect(state.member).not.toHaveBeenCalled();
  });

  it("refuses other guides: another pull request, a draft, another workspace, an unknown id", async () => {
    for (const id of ["g128", "g127-draft", "other-ws", "missing"]) {
      expect(await status(requireGuideReadAccess(req(`/api/guides/${id}/file?share=tok`), id))).toBe(404);
    }
    // The token is never traded for a member check.
    expect(state.member).not.toHaveBeenCalled();
  });

  it("opens comments only for links created with them", async () => {
    expect(await status(requireGuideReadAccess(req("/api/guides/g127/comments?share=tok"), "g127", { comments: true }))).toBe(404);
    state.opened = { state: "active", link: { ...link, includeComments: true }, workspace, repo };
    expect(await status(requireGuideReadAccess(req("/api/guides/g127/comments?share=tok"), "g127", { comments: true }))).toBe(200);
  });

  it("answers 404 for revoked, expired, invalid and disabled links, and 429 when rate limited", async () => {
    for (const opened of [{ state: "revoked", link }, { state: "expired", link }, { state: "invalid" }, { state: "disabled", scope: "workspace" }]) {
      state.opened = opened;
      expect(await status(requireGuideReadAccess(req("/api/guides/g127/status?share=tok"), "g127"))).toBe(404);
    }
    state.opened = { state: "limited" };
    expect(await status(requireGuideReadAccess(req("/api/guides/g127/status?share=tok"), "g127"))).toBe(429);
  });

  it("rate limits by the client address", async () => {
    await requireGuideReadAccess(req("/api/guides/g127/status?share=tok", { "x-forwarded-for": "203.0.113.9" }), "g127");
    expect(state.calls).toEqual(["tok@203.0.113.9"]);
  });
});
