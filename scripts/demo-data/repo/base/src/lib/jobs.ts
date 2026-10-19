import { db } from "@/db";
import { jobs } from "@/db/jobs";

export type JobType = "reindex_search" | "expire_carts";

export async function enqueue(type: JobType, payload: Record<string, unknown> = {}) {
  await db.insert(jobs).values({ type, payload });
}

export async function runJob(type: JobType, payload: Record<string, unknown>) {
  void payload;
  switch (type) {
    case "reindex_search":
      return (await import("./search")).reindex();
    case "expire_carts":
      return (await import("./cart-expiry")).expireCarts();
  }
}
