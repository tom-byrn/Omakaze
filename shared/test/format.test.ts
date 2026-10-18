import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  formatAddress,
  formatAvailability,
  formatCompactPrice,
  formatListedAgo,
  formatLotSize,
  formatPercent,
  formatRent,
} from '../src/format';

describe('price formatting', () => {
  it('formats rent with a monthly suffix', () => {
    expect(formatRent(2450)).toBe('$2,450/mo');
  });

  it.each([
    [950, '$950'],
    [1000, '$1K'],
    [2450, '$2.5K'],
    [12_500, '$13K'],
    [20_000, '$20K'],
    [600_000, '$600K'],
    [825_000, '$825K'],
    [1_250_000, '$1.25M'],
    [2_000_000, '$2M'],
  ])('compacts %d to %s', (amount, expected) => {
    expect(formatCompactPrice(amount)).toBe(expected);
  });
});

describe('sale formatting', () => {
  it('formats lot sizes in square feet up to a quarter acre, then in acres', () => {
    expect(formatLotSize(5200)).toBe('5,200 sqft');
    expect(formatLotSize(10_890)).toBe('0.25 acres');
    expect(formatLotSize(43_560)).toBe('1 acre');
  });

  it('formats ratios as percentages without trailing zeros', () => {
    expect(formatPercent(1.0296)).toBe('103%');
    expect(formatPercent(0.28)).toBe('28%');
    expect(formatPercent(0.035, 1)).toBe('3.5%');
  });
});

describe('formatAddress', () => {
  it('uses # for short unit numbers and a comma for named units', () => {
    expect(formatAddress('1180 Shore Drive', '6C')).toBe('1180 Shore Drive #6C');
    expect(formatAddress('200 Millrace Road', 'Loft 4')).toBe('200 Millrace Road, Loft 4');
    expect(formatAddress('9 Gull Lane', null)).toBe('9 Gull Lane');
  });
});

describe('date helpers', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts whole days between dates', () => {
    expect(daysBetween('2026-10-01', '2026-10-18')).toBe(17);
    expect(daysBetween('2026-10-18', '2026-10-01')).toBe(-17);
  });

  it('describes availability and listing age', () => {
    expect(formatAvailability('2026-10-01', '2026-10-18')).toBe('Available now');
    expect(formatAvailability('2026-11-01', '2026-10-18')).toBe('Available Nov 1');
    expect(formatListedAgo('2026-10-18', '2026-10-18')).toBe('Listed today');
    expect(formatListedAgo('2026-10-15', '2026-10-18')).toBe('Listed 3 days ago');
    expect(formatListedAgo('2026-10-04', '2026-10-18')).toBe('Listed 2 weeks ago');
  });
});
