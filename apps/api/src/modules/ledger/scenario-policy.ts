import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service';

/** Demo scenarios that change how operations behave for ONE session (D06). Other sessions are unaffected. */
@Injectable()
export class DemoScenarioPolicy {
  constructor(private readonly prisma: PrismaService) {}

  private async scenario(sessionId: string) {
    const s = await this.prisma.demoSession.findUnique({ where: { id: sessionId }, select: { scenario: true } });
    return s?.scenario ?? 'STARTER';
  }

  /** OPERATION_FAILURE: money operations fail after the first posting and roll back completely. */
  async operationsFail(sessionId: string): Promise<boolean> {
    return (await this.scenario(sessionId)) === 'OPERATION_FAILURE';
  }

  /** QUOTES_UNAVAILABLE: market data is reported as unavailable for this session. */
  async quotesUnavailable(sessionId: string): Promise<boolean> {
    return (await this.scenario(sessionId)) === 'QUOTES_UNAVAILABLE';
  }
}
