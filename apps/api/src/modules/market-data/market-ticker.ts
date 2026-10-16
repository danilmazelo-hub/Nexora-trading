import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Observable, share } from 'rxjs';
import { TICK } from '../../domain/market-sim/simulator';
import { MarketClock } from './market-clock';

/**
 * One process-wide tick stream (every 2 s). It only runs while at least one SSE client is connected
 * (share() with refCount), so idle servers do not compute quotes. Emits the market time of the tick.
 */
@Injectable()
export class MarketTicker implements OnModuleDestroy {
  private connections = 0;
  readonly ticks$: Observable<number>;

  constructor(private readonly clock: MarketClock) {
    this.ticks$ = new Observable<number>((sub) => {
      let last = -1;
      const timer = setInterval(() => {
        void this.clock.now().then((t) => {
          if (t !== last) {
            last = t;
            sub.next(t);
          }
        });
      }, TICK / 2);
      return () => clearInterval(timer);
    }).pipe(share());
  }

  connected() {
    this.connections++;
  }
  disconnected() {
    this.connections = Math.max(0, this.connections - 1);
  }
  get activeConnections() {
    return this.connections;
  }

  onModuleDestroy() {
    this.connections = 0;
  }
}
