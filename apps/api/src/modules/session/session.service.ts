import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { type SessionState } from '@nexora/contracts';
import { loadEnv } from '../../config/env';
import { PrismaService } from '../../infra/database/prisma.service';
import { AppError } from '../../shared/app-error';
import { hashSessionToken, isWellFormedToken, newSessionToken } from './token';
import { type DemoSessionContext } from './session.types';

const TOUCH_EVERY_MS = 60_000;
export const DEFAULT_DISPLAY_NAME = 'Демо-трейдер';

type Tx = Prisma.TransactionClient;

/** Hook used by later tasks (ledger funding) to initialise a fresh account inside the creation transaction. */
export type AccountInitializer = (tx: Tx, account: { id: string; sessionId: string; currency: string }) => Promise<void>;

@Injectable()
export class SessionService {
  private initializers: AccountInitializer[] = [];
  constructor(private readonly prisma: PrismaService) {}

  registerAccountInitializer(fn: AccountInitializer) {
    this.initializers.push(fn);
  }

  private ttlMs() {
    return loadEnv().SESSION_TTL_HOURS * 3_600_000;
  }

  /** Creates session + profile + main USD account atomically. Returns the cookie token (shown once). */
  async create(locale: 'ru' | 'en' = 'ru'): Promise<{ token: string; session: DemoSessionContext }> {
    const token = newSessionToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs());
    const session = await this.prisma.$transaction(async (tx) => {
      const s = await tx.demoSession.create({ data: { tokenHash: hashSessionToken(token), expiresAt, lastSeenAt: now } });
      await tx.demoProfile.create({ data: { sessionId: s.id, displayName: DEFAULT_DISPLAY_NAME, locale } });
      await this.createMainAccount(tx, s.id);
      return s;
    });
    return { token, session: { id: session.id, expiresAt: session.expiresAt } };
  }

  /** Creates an ACTIVE main USD account and runs registered initialisers (e.g. starting funds). */
  async createMainAccount(tx: Tx, sessionId: string) {
    const acc = await tx.account.create({ data: { sessionId, kind: 'MAIN', currency: 'USD' } });
    for (const init of this.initializers) await init(tx, acc);
    return acc;
  }

  /**
   * Resolves the cookie token to a live session. Missing/unknown → SESSION_REQUIRED, expired/revoked →
   * SESSION_EXPIRED. Sliding expiry is extended at most once a minute.
   */
  async resolve(token: unknown): Promise<{ session: DemoSessionContext; refreshed: boolean }> {
    if (!isWellFormedToken(token)) throw new AppError('SESSION_REQUIRED', 401, 'Войдите в демо, чтобы продолжить');
    const s = await this.prisma.demoSession.findUnique({ where: { tokenHash: hashSessionToken(token) } });
    if (!s) throw new AppError('SESSION_REQUIRED', 401, 'Демосессия не найдена. Войдите в демо заново.');
    const now = Date.now();
    if (s.revokedAt || s.expiresAt.getTime() <= now) throw new AppError('SESSION_EXPIRED', 401, 'Демосессия истекла. Войдите в демо заново.');
    if (now - s.lastSeenAt.getTime() < TOUCH_EVERY_MS) return { session: { id: s.id, expiresAt: s.expiresAt }, refreshed: false };
    const expiresAt = new Date(now + this.ttlMs());
    await this.prisma.demoSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date(now), expiresAt } });
    return { session: { id: s.id, expiresAt }, refreshed: true };
  }

  async revoke(sessionId: string) {
    await this.prisma.demoSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  }

  async state(sessionId: string, resumed: boolean): Promise<SessionState> {
    const s = await this.prisma.demoSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { profile: true, accounts: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } } },
    });
    const profile = s.profile ?? { displayName: DEFAULT_DISPLAY_NAME, locale: 'ru', updatedAt: s.createdAt };
    return {
      session: { id: s.id, createdAt: s.createdAt.toISOString(), expiresAt: s.expiresAt.toISOString(), scenario: s.scenario, resumed },
      profile: { displayName: profile.displayName, locale: profile.locale === 'en' ? 'en' : 'ru', updatedAt: profile.updatedAt.toISOString() },
      accounts: s.accounts.map((a) => ({ id: a.id, kind: a.kind, currency: a.currency, status: a.status, createdAt: a.createdAt.toISOString() })),
    };
  }

  async updateProfile(sessionId: string, patch: { displayName?: string; locale?: 'ru' | 'en' }) {
    await this.prisma.demoProfile.update({ where: { sessionId }, data: patch });
  }
}
