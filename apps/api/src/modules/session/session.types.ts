/** What the rest of the API knows about the caller: resolved only from the server-side session cookie. */
export interface DemoSessionContext {
  id: string;
  expiresAt: Date;
}

declare module 'express' {
  interface Request {
    demoSession?: DemoSessionContext;
  }
}
