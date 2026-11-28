import { setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { SESSION_COOKIE, SESSION_TTL_MS } from '../repositories/sessions';
import type { AppEnv } from '../types';

function isSecure(c: Context<AppEnv>): boolean {
  return new URL(c.req.url).protocol === 'https:';
}

/** Cookie de sesión HttpOnly compartida por el login y la demo pública. */
export function setSessionCookie(c: Context<AppEnv>, token: string, ttlMs = SESSION_TTL_MS): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(ttlMs / 1000),
  });
}
