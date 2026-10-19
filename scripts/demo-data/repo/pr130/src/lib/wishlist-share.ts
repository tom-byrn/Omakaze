import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { wishlists } from "@/db/schema";

/** A share token is 128 random bits; anyone with the link can view the list, nobody can edit it. */
export function newShareToken(): string {
  return randomBytes(16).toString("base64url");
}

export async function shareWishlist(wishlistId: string): Promise<string> {
  const token = newShareToken();
  await db.update(wishlists).set({ shareToken: token }).where(eq(wishlists.id, wishlistId));
  return token;
}

export async function unshareWishlist(wishlistId: string): Promise<void> {
  await db.update(wishlists).set({ shareToken: null }).where(eq(wishlists.id, wishlistId));
}
