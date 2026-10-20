import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { wishlists } from "@/db/schema";

export default async function SharedWishlistPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const [list] = await db.select().from(wishlists).where(eq(wishlists.shareToken, token)).limit(1);
  if (!list) notFound();
  return (
    <main className="wishlist">
      <h1>{list.name}</h1>
      <p>Shared wishlist. Items you buy from it are not marked as purchased yet.</p>
    </main>
  );
}
