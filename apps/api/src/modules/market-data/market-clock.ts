import { Injectable } from '@nestjs/common';
import { loadEnv } from '../../config/env';
import { TICK } from '../../domain/market-sim/simulator';
import { PrismaService } from '../../infra/database/prisma.service';

export interface ClockState {
  seed: number;
  mode: 'REALTIME' | 'FIXED';
  fixedAt: number | null;
}

/**
 * Market time and seed (MarketSettings row "default", env MARKET_FIXED_TIME overrides for tests/demos).
 * Times are snapped to the 2-second tick grid so every client sees the same quote within a tick.
 */
@Injectable()
export class MarketClock {
  private state: ClockState | null = null;
  private loadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async refresh(force = false): Promise<ClockState> {
    if (!force && this.state && Date.now() - this.loadedAt < 5_000) return this.state;
    const env = loadEnv();
    let row: { seed: number; clockMode: 'REALTIME' | 'FIXED'; fixedAt: Date | null } | null = null;
    try {
      row = await this.prisma.marketSettings.findUnique({ where: { id: 'default' } });
    } catch {
      row = null; // database down: keep simulating from env defaults
    }
    const fixedEnv = env.MARKET_FIXED_TIME ? Date.parse(env.MARKET_FIXED_TIME) : null;
    this.state = {
      seed: row?.seed ?? env.MARKET_SEED,
      mode: fixedEnv != null || row?.clockMode === 'FIXED' ? 'FIXED' : 'REALTIME',
      fixedAt: fixedEnv ?? (row?.clockMode === 'FIXED' && row.fixedAt ? row.fixedAt.getTime() : null),
    };
    this.loadedAt = Date.now();
    return this.state;
  }

  /** Current market time (ms UTC) snapped to the tick grid. */
  async now(): Promise<number> {
    const s = await this.refresh();
    const t = s.mode === 'FIXED' && s.fixedAt != null ? s.fixedAt : Date.now();
    return Math.floor(t / TICK) * TICK;
  }
}
