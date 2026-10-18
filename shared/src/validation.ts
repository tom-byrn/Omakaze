/** Building blocks for validating untrusted form input, shared by every form the API accepts. */

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors<T> };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_CHARACTERS = /^[\d\s().+-]+$/;

export const NAME_MAX_LENGTH = 80;

/** Treats anything that isn't a plain object (null, arrays, strings) as an empty one. */
export function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

export function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** A finite number from a JSON number or a numeric string, otherwise null. */
export function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** True for real calendar dates in YYYY-MM-DD form (so not 2026-02-30). */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function nameError(name: string): string | undefined {
  if (!name) return 'Enter your name';
  if (name.length > NAME_MAX_LENGTH) return `Name must be ${NAME_MAX_LENGTH} characters or fewer`;
  return undefined;
}

export function emailError(email: string): string | undefined {
  if (!email) return 'Enter your email address';
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return 'Enter a valid email address';
  return undefined;
}

/** Phone numbers are optional everywhere; an empty string is fine. */
export function phoneError(phone: string): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '').length;
  if (!PHONE_CHARACTERS.test(phone) || digits < 7 || digits > 15) return 'Enter a valid phone number';
  return undefined;
}

/** Wraps up a validation: `ok` with the value unless any field has an error message. */
export function validationResult<T>(value: T, errors: FieldErrors<T>): ValidationResult<T> {
  const messages = Object.entries(errors).filter(([, message]) => typeof message === 'string');
  if (messages.length > 0) {
    return { ok: false, errors: Object.fromEntries(messages) as FieldErrors<T> };
  }
  return { ok: true, value };
}
