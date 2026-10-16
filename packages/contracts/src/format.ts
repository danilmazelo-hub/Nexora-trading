import { D, placesOf } from './decimal';

/** Display helpers. They format server decimal strings; they never change stored values. */
export type Locale = 'ru' | 'en';
const INTL: Record<Locale, string> = { ru: 'ru-RU', en: 'en-US' };
export const DASH = '—';

const FIAT = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD']);

function nf(locale: Locale, min: number, max: number) {
  return new Intl.NumberFormat(INTL[locale], { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: true });
}

/** Intl accepts decimal strings exactly (no float conversion) in Node 24 / modern browsers. */
function fmt(locale: Locale, value: string, min: number, max: number): string {
  return nf(locale, min, max).format(value as unknown as number);
}

/** Typographic minus (U+2212) for every locale. */
function minus(_locale: Locale) {
  return '−';
}

/**
 * Money with an explicit currency. A non-zero amount smaller than one cent is shown as "<$0.01" with its sign
 * instead of a misleading 0.00 / -0.00 (QA-02/03, A07).
 */
export function formatMoney(amount: string | null | undefined, currency: string, locale: Locale = 'ru'): string {
  if (amount == null || amount === '') return DASH;
  const d = new D(amount);
  if (!d.isFinite()) return DASH;
  const isFiat = FIAT.has(currency);
  const places = isFiat ? 2 : 8;
  const unit = new D(10).pow(-places);
  const sign = d.isNegative() && !d.isZero() ? minus(locale) : '';
  if (!d.isZero() && d.abs().lt(unit.div(2))) {
    const tiny = fmt(locale, unit.toFixed(), places, places);
    return sign + '<' + (isFiat ? symbolOf(currency, tiny, locale) : tiny + ' ' + currency);
  }
  const body = fmt(locale, d.abs().toFixed(places), isFiat ? 2 : 0, places);
  return sign + (isFiat ? symbolOf(currency, body, locale) : body + ' ' + currency);
}

function symbolOf(currency: string, body: string, locale: Locale): string {
  const sym: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
  const s = sym[currency];
  if (!s) return body + ' ' + currency;
  return locale === 'ru' && currency !== 'USD' ? body + ' ' + s : s + body;
}

/** Price with the instrument precision derived from its tick size. */
export function formatPrice(price: string | null | undefined, tickSize: string, locale: Locale = 'ru'): string {
  if (price == null || price === '') return DASH;
  const p = placesOf(tickSize);
  return fmt(locale, new D(price).toFixed(p), p, p);
}

/** Percent points with sign: "+0.97%", "−1.20%", tiny non-zero values as "<0.01%"; null → "—" (never +0.00%). */
export function formatPercent(pp: string | null | undefined, locale: Locale = 'ru', places = 2): string {
  if (pp == null || pp === '') return DASH;
  const d = new D(pp);
  if (!d.isFinite()) return DASH;
  const sign = d.gt(0) ? '+' : d.lt(0) ? minus(locale) : '';
  const unit = new D(10).pow(-places);
  if (!d.isZero() && d.abs().lt(unit.div(2))) return sign + '<' + fmt(locale, unit.toFixed(), places, places) + '%';
  return sign + fmt(locale, d.abs().toFixed(places), places, places) + '%';
}

/** Quantity in base units; a non-zero quantity is never rendered as 0 (shows extra precision instead). */
export function formatQuantity(qty: string | null | undefined, step: string, locale: Locale = 'ru'): string {
  if (qty == null || qty === '') return DASH;
  const d = new D(qty);
  // Show at least the step precision and never drop significant digits of the stored quantity.
  const p = Math.min(18, Math.max(placesOf(step), d.decimalPlaces()));
  return fmt(locale, d.toFixed(p), 0, p);
}
