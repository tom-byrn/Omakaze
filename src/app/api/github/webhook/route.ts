import { eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookDeliveries } from "@/db/schema";
import { repoWebhookSecret } from "@/lib/crypto";
import { getGitHubApp } from "@/lib/github/app";
import { handleWebhook, verifySignature } from "@/lib/github/webhooks";
import { newId } from "@/lib/ids";

/** GitHub webhooks (GitHub App and repository webhooks). */
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const event = req.headers.get("x-github-event") ?? "unknown";
  const deliveryId = req.headers.get("x-github-delivery") ?? newId();

  const app = await getGitHubApp().catch(() => null);
  const secrets = [app?.webhookSecret, repoWebhookSecret()].filter((s): s is string => Boolean(s));
  if (!secrets.some((s) => verifySignature(body, signature, s))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const inserted = await db
    .insert(webhookDeliveries)
    .values({
      id: deliveryId,
      event,
      action: typeof payload.action === "string" ? payload.action : null,
      repositoryFullName: (payload.repository as { full_name?: string } | undefined)?.full_name ?? null,
      status: "processed",
    })
    .onConflictDoNothing()
    .returning({ id: webhookDeliveries.id });
  if (inserted.length === 0) return Response.json({ ok: true, duplicate: true });

  try {
    const status = await handleWebhook(event, payload);
    if (status === "ignored") {
      await db.update(webhookDeliveries).set({ status }).where(eq(webhookDeliveries.id, deliveryId));
    }
    return Response.json({ ok: true, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[webhook]", event, message);
    await db.update(webhookDeliveries).set({ status: "failed", error: message.slice(0, 1000) }).where(eq(webhookDeliveries.id, deliveryId));
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
