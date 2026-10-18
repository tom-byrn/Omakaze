import type { Contingency, FinancingType, Offer, OfferInput, OfferStatus, OfferWithListing, SaleSummary } from '@hearth/shared';
import type { Database } from '../../db/connection';
import { toListingSummary, type ListingRow, type ViewContext } from '../lib/serializers';
import { LISTING_COLUMNS, LISTING_FROM } from './listings';

interface OfferRow {
  id: number;
  listing_id: number;
  buyer_name: string;
  buyer_email: string;
  amount: number;
  financing: FinancingType;
  down_payment_percent: number;
  contingencies: string;
  closing_date: string;
  message: string | null;
  status: OfferStatus;
  counter_amount: number | null;
  seller_note: string | null;
  created_at: string;
  updated_at: string;
}

function toOffer(row: OfferRow): Offer {
  return {
    id: row.id,
    listingId: row.listing_id,
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email,
    amount: row.amount,
    financing: row.financing,
    downPaymentPercent: row.down_payment_percent,
    contingencies: JSON.parse(row.contingencies) as Contingency[],
    closingDate: row.closing_date,
    message: row.message,
    status: row.status,
    counterAmount: row.counter_amount,
    sellerNote: row.seller_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createOffer(db: Database, listingId: number, clientId: string, input: OfferInput): Offer {
  const row = db
    .prepare(
      `INSERT INTO offers (listing_id, client_id, buyer_name, buyer_email, amount, financing,
         down_payment_percent, contingencies, closing_date, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .get(
      listingId,
      clientId,
      input.buyerName,
      input.buyerEmail,
      input.amount,
      input.financing,
      input.downPaymentPercent,
      JSON.stringify(input.contingencies),
      input.closingDate,
      input.message,
    ) as unknown as OfferRow;
  return toOffer(row);
}

/** The client's offers, newest first, each with the home it was made on. */
export function listOffers(db: Database, view: ViewContext): OfferWithListing[] {
  const offers = (
    db
      .prepare('SELECT * FROM offers WHERE client_id = ? ORDER BY created_at DESC, id DESC')
      .all(view.clientId) as unknown as OfferRow[]
  ).map(toOffer);
  if (offers.length === 0) return [];

  const ids = [...new Set(offers.map((offer) => offer.listingId))];
  const listings = new Map(
    (
      db
        .prepare(`SELECT ${LISTING_COLUMNS} ${LISTING_FROM} WHERE l.id IN (${ids.map(() => '?').join(', ')})`)
        .all(view.clientId, ...ids) as unknown as ListingRow[]
    ).map((row) => [row.id, toListingSummary(row, view) as SaleSummary]),
  );

  return offers.flatMap((offer) => {
    const listing = listings.get(offer.listingId);
    return listing ? [{ ...offer, listing }] : [];
  });
}

export function findOffer(db: Database, id: number, clientId: string): Offer | null {
  const row = db.prepare('SELECT * FROM offers WHERE id = ? AND client_id = ?').get(id, clientId) as
    | OfferRow
    | undefined;
  return row ? toOffer(row) : null;
}

export function hasOpenOffer(db: Database, listingId: number, clientId: string): boolean {
  return (
    db
      .prepare(
        "SELECT 1 FROM offers WHERE listing_id = ? AND client_id = ? AND status IN ('submitted', 'countered')",
      )
      .get(listingId, clientId) !== undefined
  );
}

export function withdrawOffer(db: Database, id: number): Offer {
  const row = db
    .prepare(
      `UPDATE offers SET status = 'withdrawn', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? RETURNING *`,
    )
    .get(id) as unknown as OfferRow;
  return toOffer(row);
}
