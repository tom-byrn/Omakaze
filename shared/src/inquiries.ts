import { addDays } from './format';
import type { InquiryKind } from './types';

export interface InquiryInput {
  kind: InquiryKind;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  moveInDate: string | null;
  tourDate: string | null;
}

export type InquiryErrors = Partial<Record<keyof InquiryInput, string>>;

export type InquiryValidation =
  | { ok: true; value: InquiryInput }
  | { ok: false; errors: InquiryErrors };

export const INQUIRY_LIMITS = {
  nameMax: 80,
  messageMin: 10,
  messageMax: 2000,
  /** How far ahead a tour can be requested. */
  tourWindowDays: 60,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_CHARACTERS = /^[\d\s().+-]+$/;

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/**
 * Validates a contact or tour request for a listing. Used by the contact form
 * for inline errors and by the API before anything is stored.
 *
 * @param today Calendar date (YYYY-MM-DD) that relative rules are checked against.
 */
export function validateInquiry(input: unknown, today: string): InquiryValidation {
  const body = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const errors: InquiryErrors = {};

  if (body.kind !== undefined && body.kind !== 'question' && body.kind !== 'tour') {
    errors.kind = 'Choose whether you have a question or want a tour';
  }
  const kind: InquiryKind = body.kind === 'tour' ? 'tour' : 'question';

  const name = asTrimmedString(body.name);
  if (!name) {
    errors.name = 'Enter your name';
  } else if (name.length > INQUIRY_LIMITS.nameMax) {
    errors.name = `Name must be ${INQUIRY_LIMITS.nameMax} characters or fewer`;
  }

  const email = asTrimmedString(body.email).toLowerCase();
  if (!email) {
    errors.email = 'Enter your email address';
  } else if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address';
  }

  const phoneRaw = asTrimmedString(body.phone);
  const phoneDigits = phoneRaw.replace(/\D/g, '');
  if (phoneRaw && (!PHONE_CHARACTERS.test(phoneRaw) || phoneDigits.length < 7 || phoneDigits.length > 15)) {
    errors.phone = 'Enter a valid phone number';
  }

  const message = asTrimmedString(body.message);
  if (message.length < INQUIRY_LIMITS.messageMin) {
    errors.message = `Write a short message (at least ${INQUIRY_LIMITS.messageMin} characters)`;
  } else if (message.length > INQUIRY_LIMITS.messageMax) {
    errors.message = `Message must be ${INQUIRY_LIMITS.messageMax.toLocaleString('en-US')} characters or fewer`;
  }

  const moveInDate = asTrimmedString(body.moveInDate);
  if (moveInDate) {
    if (!isValidIsoDate(moveInDate)) {
      errors.moveInDate = 'Enter a valid date';
    } else if (moveInDate < today) {
      errors.moveInDate = 'Move-in date can’t be in the past';
    }
  }

  const tourDate = asTrimmedString(body.tourDate);
  if (kind === 'tour') {
    if (!tourDate) {
      errors.tourDate = 'Pick a day for your tour';
    } else if (!isValidIsoDate(tourDate)) {
      errors.tourDate = 'Enter a valid date';
    } else if (tourDate <= today) {
      errors.tourDate = 'Tours can be booked from tomorrow onwards';
    } else if (tourDate > addDays(today, INQUIRY_LIMITS.tourWindowDays)) {
      errors.tourDate = `Tours can be booked up to ${INQUIRY_LIMITS.tourWindowDays} days ahead`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      kind,
      name,
      email,
      phone: phoneRaw || null,
      message,
      moveInDate: moveInDate || null,
      tourDate: kind === 'tour' ? tourDate : null,
    },
  };
}
