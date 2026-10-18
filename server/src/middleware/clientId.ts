import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/**
 * Hearth has no accounts. Favorites and inquiries are tied to an anonymous
 * client id that lives in a long-lived cookie; API clients (and tests) can
 * send it as a header instead.
 */
export const CLIENT_COOKIE = 'hearth_cid';
export const CLIENT_HEADER = 'x-hearth-client';

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

declare global {
  namespace Express {
    interface Request {
      clientId: string;
    }
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function clientId(): RequestHandler {
  return (req, res, next) => {
    const candidates = [req.get(CLIENT_HEADER), readCookie(req.headers.cookie, CLIENT_COOKIE)];
    const existing = candidates.find((value) => value !== undefined && CLIENT_ID_PATTERN.test(value));

    if (existing) {
      req.clientId = existing;
    } else {
      req.clientId = randomUUID();
      res.cookie(CLIENT_COOKIE, req.clientId, {
        maxAge: ONE_YEAR_MS,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
    }
    next();
  };
}
