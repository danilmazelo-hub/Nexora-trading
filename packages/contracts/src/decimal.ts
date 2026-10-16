import Decimal from 'decimal.js';
import { z } from 'zod';

/** High-precision decimal used for every money/quantity calculation. */
export const D = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -40, toExpPos: 40 });
export type DecimalValue = InstanceType<typeof D>;

const DECIMAL_RE = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/** JSON representation of money and quantities: plain decimal string, no exponent, no thousand separators. */
export const DecimalStringSchema = z.string().max(64).regex(DECIMAL_RE, 'Ожидается десятичное число');

export function isDecimalString(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 64 && DECIMAL_RE.test(v);
}

/** Serialises a decimal to a fixed number of places (half-up) without exponent notation. `-0` becomes `0`. */
export function toDecimalString(value: Decimal.Value | DecimalValue, places?: number): string {
  const d = new D(value as Decimal.Value);
  const s = places == null ? d.toFixed() : d.toFixed(places);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

/** Number of decimal places implied by a step such as "0.0001" → 4, "1" → 0. */
export function placesOf(step: string): number {
  const i = step.indexOf('.');
  return i < 0 ? 0 : step.length - i - 1;
}

/** Sums decimal strings exactly. */
export function sumDecimals(values: readonly string[]): string {
  return toDecimalString(values.reduce((acc, v) => acc.plus(v), new D(0)));
}
