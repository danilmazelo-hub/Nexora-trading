import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { SessionController } from './session.controller';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

@Module({
  controllers: [SessionController, AccountsController],
  providers: [SessionService, SessionGuard, AccountsService],
  exports: [SessionService, SessionGuard, AccountsService],
})
export class SessionModule {}
