import { Controller, Get, type MessageEvent, Param, Query, Req, Sse } from '@nestjs/common';
import { type CandlesResponse, CandlesQuerySchema, type Quote, type QuoteEvent } from '@nexora/contracts';
import { type Request } from 'express';
import { concat, defer, from, map, mergeMap, Observable } from 'rxjs';
import { z } from 'zod';
import { AppError } from '../../shared/app-error';
import { parse } from '../../shared/zod';
import { DemoScenarioPolicy } from '../ledger/scenario-policy';
import { SessionService } from '../session/session.service';
import { SESSION_COOKIE } from '../session/token';
import { MarketDataService } from './market-data.service';
import { MarketTicker } from './market-ticker';

const IdsSchema = z.object({
  ids: z
    .string()
    .max(2000)
    .transform((s) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))])
    .refine((a) => a.length >= 1 && a.length <= 60, 'Укажите от 1 до 60 инструментов'),
});

/**
 * Market data is readable without a session; when a demo session cookie is present its scenario applies
 * (QUOTES_UNAVAILABLE → unavailable quotes for this session only).
 */
@Controller('market')
export class MarketDataController {
  constructor(
    private readonly market: MarketDataService,
    private readonly ticker: MarketTicker,
    private readonly sessions: SessionService,
    private readonly policy: DemoScenarioPolicy,
  ) {}

  private async unavailableFor(req: Request): Promise<boolean> {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return false;
    try {
      const { session } = await this.sessions.resolve(token);
      return this.policy.quotesUnavailable(session.id);
    } catch {
      return false;
    }
  }

  @Get('status')
  async status() {
    return { ...(await this.market.status()), streams: this.ticker.activeConnections };
  }

  @Get('quotes')
  async quotes(@Req() req: Request, @Query() q: unknown): Promise<{ items: Quote[]; asOf: string }> {
    const { ids } = parse(IdsSchema, q);
    const items = await this.market.quotes(ids, { unavailable: await this.unavailableFor(req) });
    return { items, asOf: new Date().toISOString() };
  }

  @Get('quotes/:id')
  async quote(@Req() req: Request, @Param('id') id: string): Promise<Quote> {
    return this.market.quote(id, { unavailable: await this.unavailableFor(req) });
  }

  @Get('instruments/:id/candles')
  async candles(@Req() req: Request, @Param('id') id: string, @Query() q: unknown): Promise<CandlesResponse> {
    const query = parse(CandlesQuerySchema, q);
    return this.market.candles(id, query.interval, { ...query, unavailable: await this.unavailableFor(req) });
  }

  /**
   * One SSE channel per browser tab for the instruments it shows. The first event is always a full snapshot
   * (also after a reconnect with Last-Event-ID), then one "update" per 2-second tick. Event id = seq =
   * tick number, so clients drop duplicates and stale events.
   */
  @Sse('stream')
  stream(@Req() req: Request, @Query() q: unknown): Observable<MessageEvent> {
    const { ids } = parse(IdsSchema, q);
    return defer(async () => {
      const known = await this.market.knownIds(ids);
      if (!known.length) throw new AppError('INSTRUMENT_NOT_FOUND', 404, 'Нет известных инструментов для подписки');
      return { known, unavailable: await this.unavailableFor(req) };
    }).pipe(
      mergeMap(({ known, unavailable }) => {
        const event = (kind: QuoteEvent['kind'], t: number): Promise<MessageEvent> =>
          this.market.quotes(known, { unavailable, t }).then((quotes) => {
            const seq = Math.floor(t / 2000);
            return { id: String(seq), type: 'quotes', data: { seq, kind, quotes } satisfies QuoteEvent };
          });
        return new Observable<MessageEvent>((sub) => {
          this.ticker.connected();
          let lastSeq = -1;
          const s = concat(
            defer(async () => event('snapshot', await this.market.now())),
            this.ticker.ticks$.pipe(mergeMap((t) => from(event('update', t)))),
          ).subscribe({
            next: (e) => {
              const seq = Number(e.id);
              if (seq <= lastSeq) return; // never send a duplicate or older tick
              lastSeq = seq;
              sub.next(e);
            },
            error: (err) => sub.error(err),
          });
          return () => {
            s.unsubscribe();
            this.ticker.disconnected();
          };
        });
      }),
      map((e) => e),
    );
  }
}
