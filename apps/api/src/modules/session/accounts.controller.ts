import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { type Account } from '@nexora/contracts';
import { CurrentSession, SessionGuard } from './session.guard';
import { AccountsService, toAccountDto } from './accounts.service';
import { type DemoSessionContext } from './session.types';

@Controller('me/accounts')
@UseGuards(SessionGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  async list(@CurrentSession() s: DemoSessionContext): Promise<{ items: Account[] }> {
    return { items: (await this.accounts.list(s.id)).map(toAccountDto) };
  }

  @Get(':id')
  async get(@CurrentSession() s: DemoSessionContext, @Param('id') id: string): Promise<Account> {
    return toAccountDto(await this.accounts.getOwned(s.id, id));
  }
}
