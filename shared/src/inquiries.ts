import { addDays } from './format';
import type { InquiryKind } from './types';
import {
  asRecord,
  asTrimmedString,
  emailError,
  isValidIsoDate,
  nameError,
  phoneError,
  validationResult,
  type FieldErrors,
  type ValidationResult,
} from './validation';

export interface InquiryInput {
  kind: InquiryKind;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  moveInDate: string | null;
  tourDate: string | null;
}

export type InquiryErrors = FieldErrors<InquiryInput>;

export type InquiryValidation = ValidationResult<InquiryInput>;

export const INQUIRY_LIMITS = {
  messageMin: 10,
  messageMax: 2000,
  /** How far ahead a tour can be requested. */
  tourWindowDays: 60,
} as const;

/**
 * Validates a contact or tour request for a listing. Used by the contact form
 * for inline errors and by the API before anything is stored.
 *
 * @param today Calendar date (YYYY-MM-DD) that relative rules are checked against.
 */
export function validateInquiry(input: unknown, today: string): InquiryValidation {
  const body = asRecord(input);
  const errors: InquiryErrors = {};

  if (body.kind !== undefined && body.kind !== 'question' && body.kind !== 'tour') {
    errors.kind = 'Choose whether you have a question or want a tour';
  }
  const kind: InquiryKind = body.kind === 'tour' ? 'tour' : 'question';

  const name = asTrimmedString(body.name);
  errors.name = nameError(name);

  const email = asTrimmedString(body.email).toLowerCase();
  errors.email = emailError(email);

  const phone = asTrimmedString(body.phone);
  errors.phone = phoneError(phone);

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

  return validationResult(
    {
      kind,
      name,
      email,
      phone: phone || null,
      message,
      moveInDate: moveInDate || null,
      tourDate: kind === 'tour' ? tourDate : null,
    },
    errors,
  );
}
