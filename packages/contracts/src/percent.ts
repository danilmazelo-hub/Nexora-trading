import { D, toDecimalString } from './decimal';

/**
 * Every percentage in the API is expressed in PERCENT POINTS ("0.9724" means 0.9724 %).
 * External sources may deliver a fraction (0.009724) or percent points (0.9724); the unit is part of the
 * adapter contract and is NEVER guessed from the magnitude of the value (QA-10 / A12).
 */
export type PercentInputUnit = 'fraction' | 'percent';

export function normalizePercent(value: number | string | null | undefined, unit: PercentInputUnit, places = 4): string | null {
  if (value == null || value === '') return null;
  const d = new D(value);
  if (!d.isFinite()) return null;
  return toDecimalString(unit === 'fraction' ? d.times(100) : d, places);
}

/** Percent change between two prices in percent points; null when either side is missing or the base is zero. */
export function percentChange(current: string | null, base: string | null, places = 4): string | null {
  if (current == null || base == null) return null;
  const b = new D(base);
  if (b.isZero()) return null;
  return toDecimalString(new D(current).minus(b).div(b).times(100), places);
}
