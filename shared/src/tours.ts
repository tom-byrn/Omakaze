import { addDays, parseIsoDate } from './format';
import {
  asRecord,
  asTrimmedString,
  emailError,
  isValidIsoDate,
  nameError,
  phoneError,
  validationResult,
  type ValidationResult,
} from './validation';

export const TOUR_TYPES = { in_person: 'In person', video: 'Video chat' } as const;

export type TourType = keyof typeof TOUR_TYPES;

/** Tours can be booked from tomorrow for this many days. */
export const TOUR_BOOKING_DAYS = 7;

/** Hourly slots: 10:00-17:00 on weekdays, 11:00-15:00 at weekends. */
export function tourSlots(date: string): string[] {
  const weekday = parseIsoDate(date).getUTCDay();
  const [first, last] = weekday === 0 || weekday === 6 ? [11, 15] : [10, 17];
  return Array.from({ length: last - first + 1 }, (_, i) => `${String(first + i).padStart(2, '0')}:00`);
}

export function tourDates(today: string, days = TOUR_BOOKING_DAYS): string[] {
  return Array.from({ length: days }, (_, i) => addDays(today, i + 1));
}

/** "13:00" -> "1:00 PM" */
export function formatTourTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return `${((hours + 11) % 12) + 1}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

export interface TourRequestInput {
  tourType: TourType;
  date: string;
  time: string;
  name: string;
  email: string;
  phone: string | null;
}

export function validateTourRequest(input: unknown, today: string): ValidationResult<TourRequestInput> {
  const body = asRecord(input);
  const tourType = body.tourType === 'video' ? 'video' : 'in_person';
  const date = asTrimmedString(body.date);
  const time = asTrimmedString(body.time);
  const name = asTrimmedString(body.name);
  const email = asTrimmedString(body.email).toLowerCase();
  const phone = asTrimmedString(body.phone);

  const bookable = isValidIsoDate(date) && tourDates(today).includes(date);
  return validationResult<TourRequestInput>(
    { tourType, date, time, name, email, phone: phone || null },
    {
      tourType:
        body.tourType === undefined || Object.hasOwn(TOUR_TYPES, String(body.tourType))
          ? undefined
          : 'Choose in person or video',
      date: bookable ? undefined : `Pick a day in the next ${TOUR_BOOKING_DAYS} days`,
      time: !bookable || tourSlots(date).includes(time) ? undefined : 'Pick one of the available times',
      name: nameError(name),
      email: emailError(email),
      phone: phoneError(phone),
    },
  );
}
