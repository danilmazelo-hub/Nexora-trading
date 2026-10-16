import { Body, Controller, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { ResetRequestSchema, SCENARIOS, ScenarioRequestSchema, type SessionState } from '@nexora/contracts';
import { AppError } from '../../shared/app-error';
import { parse } from '../../shared/zod';
import { SCENARIO_INFO, ScenarioService } from './scenario.service';
import { CurrentSession, SessionGuard } from './session.guard';
import { SessionService } from './session.service';
import { type DemoSessionContext } from './session.types';

@Controller('demo')
@UseGuards(SessionGuard)
export class ScenarioController {
  constructor(
    private readonly scenarios: ScenarioService,
    private readonly sessions: SessionService,
  ) {}

  @Get('scenarios')
  list() {
    return { items: SCENARIOS.map((id) => ({ id, ...SCENARIO_INFO[id] })) };
  }

  /** Reset requires an explicit confirmation in the body: { confirm: true }. */
  @Post('reset')
  @HttpCode(200)
  async reset(@CurrentSession() s: DemoSessionContext, @Body() body: unknown): Promise<SessionState> {
    const b = (body ?? {}) as { confirm?: unknown };
    if (b.confirm !== true) throw new AppError('RESET_NOT_CONFIRMED', 400, 'Подтвердите сброс демосчёта');
    const { scenario } = parse(ResetRequestSchema, body);
    await this.scenarios.reset(s.id, scenario ?? 'STARTER');
    return this.sessions.state(s.id, true);
  }

  @Put('scenario')
  async setScenario(@CurrentSession() s: DemoSessionContext, @Body() body: unknown): Promise<SessionState> {
    const { scenario } = parse(ScenarioRequestSchema, body);
    await this.scenarios.setScenario(s.id, scenario);
    return this.sessions.state(s.id, true);
  }
}
