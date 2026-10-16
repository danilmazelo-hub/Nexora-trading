import { type CanActivate, createParamDecorator, type ExecutionContext, Injectable } from '@nestjs/common';
import { type CookieOptions, type Request, type Response } from 'express';
import { loadEnv } from '../../config/env';
import { AppError } from '../../shared/app-error';
import { SessionService } from './session.service';
import { type DemoSessionContext } from './session.types';
import { SESSION_COOKIE } from './token';

export function sessionCookieOptions(expiresAt?: Date): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: loadEnv().COOKIE_SECURE, path: '/', ...(expiresAt ? { expires: expiresAt } : {}) };
}

/** Resolves the caller's demo session from the cookie; every owner check downstream uses req.demoSession. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    try {
      const { session, refreshed } = await this.sessions.resolve(req.cookies?.[SESSION_COOKIE]);
      if (refreshed) res.cookie(SESSION_COOKIE, req.cookies[SESSION_COOKIE], sessionCookieOptions(session.expiresAt));
      req.demoSession = session;
      return true;
    } catch (e) {
      if (e instanceof AppError && e.code === 'SESSION_EXPIRED') res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
      throw e;
    }
  }
}

export const CurrentSession = createParamDecorator((_: unknown, ctx: ExecutionContext): DemoSessionContext => {
  const s = ctx.switchToHttp().getRequest<Request>().demoSession;
  if (!s) throw new AppError('SESSION_REQUIRED', 401, 'Войдите в демо, чтобы продолжить');
  return s;
});
