import { describe, expect, it } from 'vitest';
import { validateInquiry } from '../src/inquiries';

const TODAY = '2026-10-18';

const valid = {
  name: 'Jordan Lee',
  email: 'Jordan.Lee@Example.com',
  message: 'Is the unit still available in November?',
};

describe('validateInquiry', () => {
  it('accepts a minimal question and normalizes it', () => {
    const result = validateInquiry({ ...valid, name: '  Jordan Lee ' }, TODAY);
    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'question',
        name: 'Jordan Lee',
        email: 'jordan.lee@example.com',
        phone: null,
        message: valid.message,
        moveInDate: null,
        tourDate: null,
      },
    });
  });

  it('reports every missing required field at once', () => {
    const result = validateInquiry({}, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(['email', 'message', 'name']);
  });

  it('treats non-object bodies as empty', () => {
    expect(validateInquiry(null, TODAY).ok).toBe(false);
    expect(validateInquiry('hello', TODAY).ok).toBe(false);
  });

  it.each(['plainaddress', 'missing@tld', 'two@@example.com', 'spaces in@example.com'])(
    'rejects the email %s',
    (email) => {
      const result = validateInquiry({ ...valid, email }, TODAY);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.email).toBe('Enter a valid email address');
    },
  );

  it('validates optional phone numbers', () => {
    expect(validateInquiry({ ...valid, phone: '(360) 555-0142' }, TODAY).ok).toBe(true);
    expect(validateInquiry({ ...valid, phone: '+1 360 555 0142' }, TODAY).ok).toBe(true);
    expect(validateInquiry({ ...valid, phone: '555' }, TODAY).ok).toBe(false);
    expect(validateInquiry({ ...valid, phone: 'call me maybe' }, TODAY).ok).toBe(false);
  });

  it('enforces message length limits', () => {
    expect(validateInquiry({ ...valid, message: 'Hi there' }, TODAY).ok).toBe(false);
    expect(validateInquiry({ ...valid, message: 'a'.repeat(2001) }, TODAY).ok).toBe(false);
    expect(validateInquiry({ ...valid, message: 'a'.repeat(2000) }, TODAY).ok).toBe(true);
  });

  it('rejects move-in dates in the past or that do not exist', () => {
    const past = validateInquiry({ ...valid, moveInDate: '2026-10-17' }, TODAY);
    const impossible = validateInquiry({ ...valid, moveInDate: '2026-02-30' }, TODAY);
    expect(past.ok).toBe(false);
    expect(impossible.ok).toBe(false);
    if (!past.ok) expect(past.errors.moveInDate).toMatch(/past/);
    if (!impossible.ok) expect(impossible.errors.moveInDate).toBe('Enter a valid date');
    expect(validateInquiry({ ...valid, moveInDate: TODAY }, TODAY).ok).toBe(true);
  });

  describe('tour requests', () => {
    it('require a tour date from tomorrow up to 60 days out', () => {
      expect(validateInquiry({ ...valid, kind: 'tour' }, TODAY).ok).toBe(false);
      expect(validateInquiry({ ...valid, kind: 'tour', tourDate: TODAY }, TODAY).ok).toBe(false);
      expect(validateInquiry({ ...valid, kind: 'tour', tourDate: '2026-12-18' }, TODAY).ok).toBe(false);

      const result = validateInquiry({ ...valid, kind: 'tour', tourDate: '2026-10-19' }, TODAY);
      expect(result.ok && result.value.tourDate).toBe('2026-10-19');
    });

    it('ignore a tour date sent with a plain question', () => {
      const result = validateInquiry({ ...valid, kind: 'question', tourDate: '2026-10-20' }, TODAY);
      expect(result.ok && result.value.tourDate).toBeNull();
    });
  });

  it('rejects unknown inquiry kinds', () => {
    const result = validateInquiry({ ...valid, kind: 'offer' }, TODAY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.kind).toBeDefined();
  });
});
