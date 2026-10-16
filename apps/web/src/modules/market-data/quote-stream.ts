import { type QueryClient } from '@tanstack/react-query';
import { type Quote, QuoteEventSchema } from '@nexora/contracts';
import { API_BASE } from '../../shared/lib/api-client';

export type StreamState = 'idle' | 'connecting' | 'open' | 'reconnecting';
export const quoteKey = (id: string) => ['quote', id] as const;

const BACKOFF = [1000, 2000, 5000, 10000];

/**
 * One EventSource per tab for all instruments currently on screen (ADR 0003).
 * - subscribe(id) / release via the returned function (reference-counted);
 * - a change of the id set reconnects once (debounced); errors reconnect with backoff, never in parallel;
 * - events with an older seq than already applied are dropped; quotes go to the shared query cache.
 */
export class QuoteStreamManager {
  private refs = new Map<string, number>();
  private es: EventSource | null = null;
  private connectedIds = '';
  private lastSeq = -1;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(s: StreamState) => void>();
  state: StreamState = 'idle';
  /** Diagnostics for tests: how many EventSource objects were created. */
  opened = 0;

  constructor(
    private readonly qc: QueryClient,
    private readonly factory: (url: string) => EventSource = (url) => new EventSource(url, { withCredentials: true }),
  ) {}

  subscribe(id: string): () => void {
    this.refs.set(id, (this.refs.get(id) ?? 0) + 1);
    this.schedule(250);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const n = (this.refs.get(id) ?? 1) - 1;
      if (n <= 0) this.refs.delete(id);
      else this.refs.set(id, n);
      this.schedule(250);
    };
  }

  onState(fn: (s: StreamState) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setState(s: StreamState) {
    this.state = s;
    this.listeners.forEach((fn) => fn(s));
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.sync();
    }, ms);
  }

  private ids() {
    return [...this.refs.keys()].sort().join(',');
  }

  /** Opens/closes/replaces the single connection so that it matches the subscribed ids. */
  private sync(force = false) {
    const ids = this.ids();
    if (!force && ids === this.connectedIds && this.es) return;
    this.close();
    if (!ids) {
      this.setState('idle');
      return;
    }
    this.connectedIds = ids;
    this.setState(this.attempt > 0 ? 'reconnecting' : 'connecting');
    const es = this.factory(`${API_BASE}/market/stream?ids=${encodeURIComponent(ids)}`);
    this.opened++;
    this.es = es;
    es.onopen = () => {
      this.attempt = 0;
      this.setState('open');
    };
    es.addEventListener('quotes', (ev) => this.onEvent((ev as MessageEvent<string>).data));
    es.onerror = () => {
      // Take over reconnection ourselves: exactly one connection, growing delay.
      if (this.es !== es) return;
      this.close();
      const delay = BACKOFF[Math.min(this.attempt, BACKOFF.length - 1)]!;
      this.attempt++;
      this.setState('reconnecting');
      this.timer = setTimeout(() => {
        this.timer = null;
        this.sync(true);
      }, delay);
    };
  }

  private onEvent(raw: string) {
    let parsed;
    try {
      parsed = QuoteEventSchema.safeParse(JSON.parse(raw));
    } catch {
      return;
    }
    if (!parsed.success) return;
    const { seq, kind, quotes } = parsed.data;
    // A snapshot after reconnect may repeat the current tick; anything older is a duplicate.
    if (seq < this.lastSeq || (seq === this.lastSeq && kind === 'update')) return;
    this.lastSeq = seq;
    for (const q of quotes) this.qc.setQueryData<Quote>(quoteKey(q.instrumentId), q);
  }

  private close() {
    if (this.es) {
      this.es.onerror = null;
      this.es.close();
      this.es = null;
    }
    this.connectedIds = '';
  }

  /** Simulates a network drop (used by the test page and tests). */
  dropConnection() {
    if (this.es) this.es.onerror?.(new Event('error'));
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.close();
    this.refs.clear();
    this.listeners.clear();
  }
}
