import { describe, expect, it } from 'vitest';
import { formatTourTime, tourDates, tourSlots, validateTourRequest } from '../src/tours';

const TODAY = '2026-10-18'; // a Sunday

const request = { tourType: 'video', date: '2026-10-20', time: '14:00', name: 'Ana Park', email: 'ana@example.com' };

describe('tour scheduling', () => {
  it('offers the next seven days, starting tomorrow', () => {
    expect(tourDates(TODAY)).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
    ]);
  });

  it('has longer hours on weekdays than at weekends', () => {
    expect(tourSlots('2026-10-19')).toEqual(['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']);
    expect(tourSlots('2026-10-24')).toEqual(['11:00', '12:00', '13:00', '14:00', '15:00']);
  });

  it('formats slot times for people', () => {
    expect(formatTourTime('10:00')).toBe('10:00 AM');
    expect(formatTourTime('12:00')).toBe('12:00 PM');
    expect(formatTourTime('17:00')).toBe('5:00 PM');
  });
});

describe('validateTourRequest', () => {
  it('accepts a request for an open slot', () => {
    expect(validateTourRequest(request, TODAY)).toEqual({ ok: true, value: { ...request, phone: null } });
  });

  it('rejects days outside the booking window and times outside opening hours', () => {
    const today = validateTourRequest({ ...request, date: TODAY }, TODAY);
    const weekendEvening = validateTourRequest({ ...request, date: '2026-10-24', time: '17:00' }, TODAY);
    expect(!today.ok && today.errors.date).toBe('Pick a day in the next 7 days');
    expect(!weekendEvening.ok && weekendEvening.errors.time).toBe('Pick one of the available times');
  });

  it('checks the contact details and tour type', () => {
    const result = validateTourRequest({ ...request, tourType: 'drone', name: '', email: 'ana', phone: '12' }, TODAY);
    expect(result.ok ? [] : Object.keys(result.errors).sort()).toEqual(['email', 'name', 'phone', 'tourType']);
  });
});
