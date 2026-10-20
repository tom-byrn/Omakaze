/** Money is stored as integer cents. These helpers format and round it. */

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function roundCents(value: number): number {
  return Math.round(value + Number.EPSILON);
}

/** A percentage of an amount in cents, rounded to whole cents. */
export function percentOf(cents: number, percent: number): number {
  return roundCents((cents * percent) / 100);
}
