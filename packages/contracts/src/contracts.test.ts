import { describe, expect, it } from 'vitest';
import { formatMoney, formatPercent, formatPrice, formatQuantity } from './format';
import { normalizePercent, percentChange } from './percent';
import { isDecimalString, sumDecimals, toDecimalString } from './decimal';

describe('percent normalisation (A12 / QA-10)', () => {
  it('fraction input is scaled exactly once', () => {
    expect(normalizePercent(0.009724, 'fraction')).toBe('0.9724');
  });
  it('percent input is not scaled again', () => {
    expect(normalizePercent('0.9724', 'percent')).toBe('0.9724');
  });
  it('repeated normalisation of the same input is stable (no 0.97 → 97 jump)', () => {
    const a = normalizePercent(0.009724, 'fraction');
    const b = normalizePercent(0.009724, 'fraction');
    expect(a).toBe(b);
    expect(formatPercent(a, 'en')).toBe('+0.97%');
  });
  it('missing value stays missing (A13 / QA-11)', () => {
    expect(normalizePercent(null, 'percent')).toBeNull();
    expect(percentChange(null, '100')).toBeNull();
    expect(percentChange('100', '0')).toBeNull();
    expect(formatPercent(null)).toBe('—');
  });
  it('percent change in points', () => {
    expect(percentChange('110', '100')).toBe('10.0000');
  });
});

describe('money and quantity formatting (A07)', () => {
  it('formats USD with two places', () => {
    expect(formatMoney('50000', 'USD', 'en')).toBe('$50,000.00');
  });
  it('tiny negative amount is not -0.00', () => {
    expect(formatMoney('-0.0001', 'USD', 'en')).toBe('−<$0.01');
  });
  it('zero has no sign', () => {
    expect(formatMoney('-0', 'USD', 'en')).toBe('$0.00');
  });
  it('non-zero tiny quantity is never shown as 0', () => {
    expect(formatQuantity('0.0000125', '0.0001', 'en')).toBe('0.0000125');
  });
  it('price precision follows tick size', () => {
    expect(formatPrice('83408.0123', '0.01', 'en')).toBe('83,408.01');
  });
  it('missing values render as dash', () => {
    expect(formatMoney(null, 'USD')).toBe('—');
    expect(formatPrice(undefined, '0.01')).toBe('—');
  });
});

describe('decimal helpers', () => {
  it('sums exactly without float error', () => {
    expect(sumDecimals(['0.1', '0.2'])).toBe('0.3');
  });
  it('serialises without exponent and normalises -0', () => {
    expect(toDecimalString('1e-12')).toBe('0.000000000001');
    expect(toDecimalString('-0.000', 2)).toBe('0.00');
  });
  it('validates decimal strings', () => {
    expect(isDecimalString('50000.00')).toBe(true);
    expect(isDecimalString('1e5')).toBe(false);
    expect(isDecimalString('01')).toBe(false);
  });
});
