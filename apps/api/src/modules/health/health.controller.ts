import { Controller, Get, Res } from '@nestjs/common';
import { type HealthLive, type HealthReady } from '@nexora/contracts';
import { type Response } from 'express';
import { PrismaService } from '../../infra/database/prisma.service';

const VERSION = '0.1.0';
const READY_TIMEOUT_MS = 2000;

@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();
  constructor(private readonly prisma: PrismaService) {}

  /** Process is up. Never touches the database. */
  @Get('live')
  live(): HealthLive {
    return { status: 'ok', uptimeSec: Math.round((Date.now() - this.startedAt) / 1000), version: VERSION };
  }

  /** Dependencies are usable. Reports only up/down — no host, user or error text. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthReady> {
    const up = await this.pingDb();
    if (!up) res.status(503);
    return { status: up ? 'ok' : 'unavailable', checks: { database: up ? 'up' : 'down' } };
  }

  private async pingDb(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), READY_TIMEOUT_MS);
      });
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
