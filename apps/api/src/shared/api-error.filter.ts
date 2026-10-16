import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type ApiErrorBody } from '@nexora/contracts';
import { type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from './app-error';

/** Renders every error as { code, message, fieldErrors?, requestId } without internal details. */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly log = new Logger('ApiError');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const requestId = req.requestId ?? 'unknown';
    const { status, body } = this.map(exception, requestId);
    if (status >= 500) this.log.error(`${requestId} ${req.method} ${req.originalUrl} → ${body.code}`, exception instanceof Error ? exception.stack : String(exception));
    if (res.headersSent) return res.end();
    res.status(status).json(body);
  }

  private map(e: unknown, requestId: string): { status: number; body: ApiErrorBody } {
    if (e instanceof AppError) return { status: e.status, body: { code: e.code, message: e.message, fieldErrors: e.fieldErrors, requestId } };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of e.issues) (fieldErrors[issue.path.join('.') || '_'] ??= []).push(issue.message);
      return { status: 400, body: { code: 'VALIDATION_FAILED', message: 'Проверьте введённые данные', fieldErrors, requestId } };
    }
    if (isDbUnavailable(e)) return { status: 503, body: { code: 'DB_UNAVAILABLE', message: 'База данных временно недоступна. Повторите позже.', requestId } };
    if (e instanceof HttpException) {
      const status = e.getStatus();
      if (status === 404) return { status, body: { code: 'ROUTE_NOT_FOUND', message: 'Такого адреса API нет', requestId } };
      if (status === 400) return { status, body: { code: 'VALIDATION_FAILED', message: 'Некорректный запрос', requestId } };
      if (status === 429) return { status, body: { code: 'RATE_LIMITED', message: 'Слишком много запросов', requestId } };
    }
    return { status: 500, body: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера. Сообщите requestId поддержке.', requestId } };
  }
}

export function isDbUnavailable(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientInitializationError) return true;
  if (e instanceof Prisma.PrismaClientKnownRequestError) return ['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(e.code);
  if (e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientRustPanicError) {
    return /connect|connection|terminat|ECONNREFUSED/i.test(e.message);
  }
  return false;
}
