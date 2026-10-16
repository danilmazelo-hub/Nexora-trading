import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { quoteKey, QuoteStreamManager } from './quote-stream';

class FakeES {
  static all: FakeES[] = [];
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  onopen: (() => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeES.all.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  close() {
    this.closed = true;
  }
  emit(seq: number, kind: 'snapshot' | 'update', last: string) {
    const quote = { instrumentId: 'BTC-USD', source: 'simulator:1', status: 'live', bid: last, ask: last, last, change: '0', changePct: '0.1000', changePeriod: '24h', observedAt: '2026-10-16T12:00:00.000Z', receivedAt: '2026-10-16T12:00:00.000Z' };
    this.listeners.quotes?.forEach((fn) => fn(new MessageEvent('quotes', { data: JSON.stringify({ seq, kind, quotes: [quote] }) })));
  }
}

describe('QuoteStreamManager (D11)', () => {
  let qc: QueryClient;
  let m: QuoteStreamManager;
  beforeEach(() => {
    vi.useFakeTimers();
    FakeES.all = [];
    qc = new QueryClient();
    m = new QuoteStreamManager(qc, (url) => new FakeES(url) as unknown as EventSource);
  });
  afterEach(() => {
    m.dispose();
    vi.useRealTimers();
  });
  const open = () => FakeES.all.filter((e) => !e.closed);

  it('many subscribers of several instruments share ONE connection', () => {
    const r1 = m.subscribe('BTC-USD');
    const r2 = m.subscribe('BTC-USD');
    m.subscribe('EUR-USD');
    vi.advanceTimersByTime(300);
    expect(open()).toHaveLength(1);
    expect(decodeURIComponent(open()[0]!.url)).toContain('ids=BTC-USD,EUR-USD');
    r1();
    vi.advanceTimersByTime(300);
    expect(open()).toHaveLength(1); // BTC still has a subscriber
    r2();
    vi.advanceTimersByTime(300);
    expect(decodeURIComponent(open()[0]!.url)).toContain('ids=EUR-USD');
    expect(open()).toHaveLength(1);
  });

  it('releasing all subscriptions closes the connection', () => {
    const r = m.subscribe('BTC-USD');
    vi.advanceTimersByTime(300);
    r();
    vi.advanceTimersByTime(300);
    expect(open()).toHaveLength(0);
    expect(m.state).toBe('idle');
  });

  it('drops duplicate and out-of-order events; writes quotes into the shared cache', () => {
    m.subscribe('BTC-USD');
    vi.advanceTimersByTime(300);
    const es = open()[0]!;
    es.emit(10, 'snapshot', '100.00');
    es.emit(11, 'update', '101.00');
    es.emit(11, 'update', '999.00'); // duplicate tick
    es.emit(9, 'update', '1.00'); // older tick
    expect(qc.getQueryData<{ last: string }>(quoteKey('BTC-USD'))?.last).toBe('101.00');
  });

  it('after a drop it reconnects once with backoff and accepts the fresh snapshot', () => {
    m.subscribe('BTC-USD');
    vi.advanceTimersByTime(300);
    const first = open()[0]!;
    first.emit(20, 'snapshot', '100.00');
    first.onerror?.(new Event('error'));
    expect(open()).toHaveLength(0);
    expect(m.state).toBe('reconnecting');
    vi.advanceTimersByTime(1000);
    expect(open()).toHaveLength(1);
    const second = open()[0]!;
    second.emit(20, 'snapshot', '100.50'); // same tick snapshot after reconnect is accepted
    expect(qc.getQueryData<{ last: string }>(quoteKey('BTC-USD'))?.last).toBe('100.50');
    second.emit(21, 'update', '101.00');
    expect(qc.getQueryData<{ last: string }>(quoteKey('BTC-USD'))?.last).toBe('101.00');
    // repeated failures never create parallel connections
    second.onerror?.(new Event('error'));
    vi.advanceTimersByTime(2000);
    open()[0]!.onerror?.(new Event('error'));
    vi.advanceTimersByTime(5000);
    expect(open()).toHaveLength(1);
    expect(m.opened).toBe(4);
  });

  it('ignores malformed events', () => {
    m.subscribe('BTC-USD');
    vi.advanceTimersByTime(300);
    open()[0]!.listeners.quotes?.forEach((fn) => fn(new MessageEvent('quotes', { data: '<html>' })));
    expect(qc.getQueryData(quoteKey('BTC-USD'))).toBeUndefined();
  });
});
