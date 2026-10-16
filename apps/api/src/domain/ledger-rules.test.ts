import { describe, expect, it } from 'vitest';
import { requestHash, reverseEntries, validateEntries } from './ledger-rules';

const usd = (acc: string, amount: string) => ({ ledgerAccountId: acc, asset: 'USD', amount });
const btc = (acc: string, amount: string) => ({ ledgerAccountId: acc, asset: 'BTC', amount });

describe('ledger rules (D05)', () => {
  it('accepts a balanced USD transaction', () => {
    expect(validateEntries([usd('u', '50000'), usd('sys', '-50000')])).toBeNull();
  });

  it('requires zero sum per asset; USD and BTC are never netted together', () => {
    // +1 USD and -1 BTC would "sum to zero" if assets were mixed — must be rejected.
    expect(validateEntries([usd('u', '1'), btc('sys', '-1')])?.code).toBe('LEDGER_UNBALANCED');
  });

  it('a swap balances each side separately', () => {
    expect(validateEntries([usd('u', '-100'), usd('sys', '100'), btc('u', '0.001'), btc('sys', '-0.001')])).toBeNull();
  });

  it('rejects single, zero or malformed postings', () => {
    expect(validateEntries([usd('u', '1')])?.code).toBe('VALIDATION_FAILED');
    expect(validateEntries([usd('u', '0'), usd('s', '0')])?.code).toBe('VALIDATION_FAILED');
    expect(validateEntries([usd('u', '1e3'), usd('s', '-1e3')])?.code).toBe('VALIDATION_FAILED');
  });

  it('exact decimal arithmetic (0.1 + 0.2 - 0.3 = 0)', () => {
    expect(validateEntries([usd('a', '0.1'), usd('b', '0.2'), usd('c', '-0.3')])).toBeNull();
  });

  it('request hash ignores entry order but not amounts', () => {
    const a = requestHash({ type: 'X', entries: [usd('a', '1'), usd('b', '-1')] });
    const b = requestHash({ type: 'X', entries: [usd('b', '-1.00'), usd('a', '1.0')] });
    const c = requestHash({ type: 'X', entries: [usd('a', '2'), usd('b', '-2')] });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('reversal negates every posting', () => {
    expect(reverseEntries([usd('a', '10'), usd('b', '-10')]).map((e) => e.amount)).toEqual(['-10', '10']);
  });
});
