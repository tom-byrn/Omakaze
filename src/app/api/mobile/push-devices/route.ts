import { z } from "zod";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { mobileContext } from "@/lib/mobile/context";
import { isExpoPushToken, registerPushDevice, removePushDevice } from "@/lib/notifications/push";

const schema = z.object({
  token: z.string().refine(isExpoPushToken, "token must be an Expo push token"),
  platform: z.enum(["ios", "android"]),
  deviceName: z.string().max(100).nullish(),
});

/** POST /api/mobile/push-devices {token, platform, deviceName} — send this member's notifications to the device. */
export async function POST(req: Request) {
  try {
    const { user } = await mobileContext(req);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid device");
    await registerPushDevice(user.id, parsed.data);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/mobile/push-devices?token=ExponentPushToken[...] — stop pushing to the device (on sign-out). */
export async function DELETE(req: Request) {
  try {
    const { user } = await mobileContext(req);
    const token = new URL(req.url).searchParams.get("token");
    if (!token) throw new HttpError(400, "token is required");
    await removePushDevice(user.id, token);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
