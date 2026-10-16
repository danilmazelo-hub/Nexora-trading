import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { LocaleSchema, ProfilePatchSchema, type SessionState } from '@nexora/contracts';
import { type Request, type Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/app-error';
import { parse } from '../../shared/zod';
import { CurrentSession, SessionGuard, sessionCookieOptions } from './session.guard';
import { SessionService } from './session.service';
import { type DemoSessionContext } from './session.types';
import { SESSION_COOKIE } from './token';

const CreateSchema = z.object({ locale: LocaleSchema.optional() }).default({});

@Controller()
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  /** Create a demo session, or resume the current one when the cookie is still valid. */
  @Post('demo/session')
  @HttpCode(200)
  async createOrResume(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: unknown): Promise<SessionState> {
    const { locale } = parse(CreateSchema, body ?? {});
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
      try {
        const { session } = await this.sessions.resolve(token);
        res.cookie(SESSION_COOKIE, token, sessionCookieOptions(session.expiresAt));
        return this.sessions.state(session.id, true);
      } catch (e) {
        if (!(e instanceof AppError)) throw e; // expired/unknown cookie → start a fresh session below
      }
    }
    const created = await this.sessions.create(locale);
    res.cookie(SESSION_COOKIE, created.token, sessionCookieOptions(created.session.expiresAt));
    return this.sessions.state(created.session.id, false);
  }

  @Get('demo/session')
  @UseGuards(SessionGuard)
  current(@CurrentSession() s: DemoSessionContext): Promise<SessionState> {
    return this.sessions.state(s.id, true);
  }

  /** Leave the demo: revokes the session server-side and clears the cookie. */
  @Delete('demo/session')
  @UseGuards(SessionGuard)
  @HttpCode(204)
  async leave(@CurrentSession() s: DemoSessionContext, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(s.id);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  }

  @Patch('me/profile')
  @UseGuards(SessionGuard)
  async patchProfile(@CurrentSession() s: DemoSessionContext, @Body() body: unknown): Promise<SessionState> {
    const patch = parse(ProfilePatchSchema, body);
    await this.sessions.updateProfile(s.id, patch);
    return this.sessions.state(s.id, true);
  }
}
