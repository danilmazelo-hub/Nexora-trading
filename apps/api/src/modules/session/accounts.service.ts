import { Injectable } from '@nestjs/common';
import { type Account } from '@nexora/contracts';
import { PrismaService } from '../../infra/database/prisma.service';
import { AppError } from '../../shared/app-error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  list(sessionId: string) {
    return this.prisma.account.findMany({ where: { sessionId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
  }

  /**
   * Owner check: the account is looked up by id AND the caller's session. Someone else's (or a non-existent)
   * account gives the same 404, so existence is not disclosed.
   */
  async getOwned(sessionId: string, accountId: string, opts: { includeArchived?: boolean } = {}) {
    if (!UUID.test(accountId)) throw this.notFound();
    const acc = await this.prisma.account.findFirst({ where: { id: accountId, sessionId, ...(opts.includeArchived ? {} : { status: 'ACTIVE' }) } });
    if (!acc) throw this.notFound();
    return acc;
  }

  private notFound() {
    return new AppError('ACCOUNT_NOT_FOUND', 404, 'Счёт не найден');
  }
}

export function toAccountDto(a: { id: string; kind: 'MAIN'; currency: string; status: 'ACTIVE' | 'ARCHIVED'; createdAt: Date }): Account {
  return { id: a.id, kind: a.kind, currency: a.currency, status: a.status, createdAt: a.createdAt.toISOString() };
}
