import { randomBytes } from 'node:crypto';
import { type NextFunction, type Request, type Response } from 'express';
import { REQUEST_ID_HEADER } from '@nexora/contracts';

declare module 'express' {
  interface Request {
    requestId: string;
  }
}

const SAFE = /^[A-Za-z0-9_-]{8,64}$/;

/** Assigns a request id (reuses a safe incoming one) and echoes it in the response header. */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header(REQUEST_ID_HEADER);
  req.requestId = incoming && SAFE.test(incoming) ? incoming : 'req_' + randomBytes(9).toString('base64url');
  res.setHeader(REQUEST_ID_HEADER, req.requestId);
  next();
}
