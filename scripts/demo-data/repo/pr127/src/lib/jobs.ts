import { db } from "@/db";
import { jobs } from "@/db/jobs";

export type JobType = "reindex_search" | "expire_carts" | "send_order_confirmation";

export async function enqueue(type: JobType, payload: Record<string, unknown> = {}) {
  await db.insert(jobs).values({ type, payload });
}

export async function runJob(type: JobType, payload: Record<string, unknown>) {
  switch (type) {
    case "reindex_search":
      return (await import("./search")).reindex();
    case "expire_carts":
      return (await import("./cart-expiry")).expireCarts();
    case "send_order_confirmation": {
      const { loadConfirmation } = await import("./orders");
      const order = await loadConfirmation(String(payload.orderId));
      // Orders without an email address (guest checkout without one) get no confirmation.
      if (!order) return;
      return (await import("./email/order-confirmation")).sendOrderConfirmation(order);
    }
  }
}
