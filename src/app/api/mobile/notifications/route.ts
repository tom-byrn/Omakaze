import { z } from "zod";
import { errorResponse, readJson } from "@/lib/http";
import { mobileContext, NO_STORE } from "@/lib/mobile/context";
import { DIGEST_OPTIONS } from "@/lib/notifications/digest";
import { getPreferences, mutedWorkspaces, notificationsEnabled, savePreferences, setWorkspaceMuted } from "@/lib/notifications/prefs";
import { pushEnabled } from "@/lib/notifications/push";
import { HttpError } from "@/lib/http";
import { mailEnabled } from "@/lib/mail";

async function state(userId: string, workspaceId: string) {
  const [prefs, muted] = await Promise.all([getPreferences(userId), mutedWorkspaces(userId)]);
  return {
    enabled: notificationsEnabled(),
    emailAvailable: mailEnabled(),
    pushAvailable: pushEnabled(),
    digestOptions: DIGEST_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    preferences: prefs,
    workspaceMuted: muted.has(workspaceId),
  };
}

/** GET /api/mobile/notifications — the member's notification settings (they apply to every workspace). */
export async function GET(req: Request) {
  try {
    const { user, workspace } = await mobileContext(req);
    return Response.json(await state(user.id, workspace.id), { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  }
}

const schema = z.object({
  email: z.boolean().optional(),
  push: z.boolean().optional(),
  guideReady: z.boolean().optional(),
  newVersion: z.boolean().optional(),
  replies: z.boolean().optional(),
  pullActivity: z.boolean().optional(),
  digest: z.enum(["minutes", "hourly", "daily"]).optional(),
  /** Mute this token's workspace (no email or push from it). */
  workspaceMuted: z.boolean().optional(),
});

/** PATCH /api/mobile/notifications — change some settings; the rest stay as they are. */
export async function PATCH(req: Request) {
  try {
    const { user, workspace } = await mobileContext(req);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid settings");
    const { workspaceMuted, ...patch } = parsed.data;
    if (Object.keys(patch).length > 0) await savePreferences(user.id, { ...(await getPreferences(user.id)), ...patch });
    if (workspaceMuted !== undefined) await setWorkspaceMuted(user.id, workspace.id, workspaceMuted);
    return Response.json(await state(user.id, workspace.id), { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  }
}
