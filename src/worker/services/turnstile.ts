import type { Env } from '../env';
import { AppError } from '../lib/errors';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
}

/**
 * Verificación server-side de Turnstile. En producción, si no hay secreto
 * configurado se falla cerrado: nunca se acepta un registro sin protección.
 */
export async function verifyTurnstile(env: Env, token: string | undefined, ip: string): Promise<void> {
  const secret = env.TURNSTILE_SECRET;

  if (!secret) {
    if (env.APP_ENV === 'production') {
      throw new AppError('turnstile_not_configured', 503, 'La protección anti-bots no está configurada');
    }
    return;
  }

  if (!token) {
    throw AppError.badRequest('Completa la verificación anti-bots');
  }

  const body = new URLSearchParams({ secret, response: token, remoteip: ip });
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });

  if (!response.ok) {
    throw new AppError('turnstile_unavailable', 503, 'No pudimos verificar la solicitud. Intenta de nuevo.');
  }

  const result = (await response.json()) as TurnstileResponse;
  if (!result.success) {
    throw AppError.badRequest('La verificación anti-bots falló. Recarga la página e intenta de nuevo.', result['error-codes']);
  }
}
