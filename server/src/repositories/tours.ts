import type { TourRequest, TourRequestInput } from '@hearth/shared';
import type { Database } from '../../db/connection';

interface TourRow {
  id: number;
  listing_id: number;
  tour_type: TourRequest['tourType'];
  tour_date: string;
  time_slot: string;
  name: string;
  email: string;
  phone: string | null;
  status: TourRequest['status'];
  created_at: string;
}

/** Slots already taken for a listing, as "YYYY-MM-DD HH:MM" keys. */
export function bookedSlots(db: Database, listingId: number, from: string): Set<string> {
  const rows = db
    .prepare("SELECT tour_date, time_slot FROM tours WHERE listing_id = ? AND tour_date >= ? AND status <> 'cancelled'")
    .all(listingId, from) as unknown as Pick<TourRow, 'tour_date' | 'time_slot'>[];
  return new Set(rows.map((row) => `${row.tour_date} ${row.time_slot}`));
}

export function createTour(db: Database, listingId: number, clientId: string, input: TourRequestInput): TourRequest {
  const row = db
    .prepare(
      `INSERT INTO tours (listing_id, client_id, tour_type, tour_date, time_slot, name, email, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(listingId, clientId, input.tourType, input.date, input.time, input.name, input.email, input.phone) as unknown as TourRow;
  return {
    id: row.id,
    listingId: row.listing_id,
    tourType: row.tour_type,
    date: row.tour_date,
    time: row.time_slot,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    createdAt: row.created_at,
  };
}
