import type { Inquiry, InquiryInput, InquiryKind } from '@hearth/shared';
import type { Database } from '../../db/connection';

interface InquiryRow {
  id: number;
  listing_id: number;
  kind: InquiryKind;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  move_in_date: string | null;
  tour_date: string | null;
  created_at: string;
}

function toInquiry(row: InquiryRow): Inquiry {
  return {
    id: row.id,
    listingId: row.listing_id,
    kind: row.kind,
    name: row.name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    moveInDate: row.move_in_date,
    tourDate: row.tour_date,
    createdAt: row.created_at,
  };
}

export function createInquiry(
  db: Database,
  listingId: number,
  clientId: string,
  input: InquiryInput,
): Inquiry {
  const row = db
    .prepare(
      `INSERT INTO inquiries (listing_id, client_id, kind, name, email, phone, message, move_in_date, tour_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .get(
      listingId,
      clientId,
      input.kind,
      input.name,
      input.email,
      input.phone,
      input.message,
      input.moveInDate,
      input.tourDate,
    ) as unknown as InquiryRow;
  return toInquiry(row);
}
