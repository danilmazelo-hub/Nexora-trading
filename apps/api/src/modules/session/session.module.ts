import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { ScenarioController } from './scenario.controller';
import { ScenarioService } from './scenario.service';
import { SessionController } from './session.controller';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

@Module({
  controllers: [SessionController, AccountsController, ScenarioController],
  providers: [SessionService, SessionGuard, AccountsService, ScenarioService],
  exports: [SessionService, SessionGuard, AccountsService, ScenarioService],
})
export class SessionModule {}
