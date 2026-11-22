import type { Env } from '../env';
import { AppError } from '../lib/errors';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface ResendResponse {
  id?: string;
  message?: string;
}

function fromAddress(env: Env): { email: string; name: string } {
  return {
    email: env.EMAIL_FROM ?? 'no-reply@credibas.app',
    name: env.EMAIL_FROM_NAME ?? 'Credibas',
  };
}

/**
 * Envío de correo desacoplado del proveedor. En desarrollo (`console`) escribe
 * un resumen en el log y, fuera de producción, el contenido del correo para
 * poder copiar los enlaces de verificación o recuperación desde la terminal.
 */
export async function sendEmail(env: Env, message: MailMessage): Promise<void> {
  const provider = (env.EMAIL_PROVIDER ?? 'console').toLowerCase();

  if (provider === 'console') {
    console.log(`[email:console] to=${message.to} subject="${message.subject}"`);
    if ((env.APP_ENV ?? 'development') !== 'production') {
      console.log(`[email:console] ${message.text}`);
    }
    return;
  }

  if (provider === 'cloudflare' || provider === 'email') {
    if (!env.EMAIL) {
      throw new AppError('email_unavailable', 503, 'El servicio de correo no está configurado');
    }
    await env.EMAIL.send({
      to: message.to,
      from: fromAddress(env),
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return;
  }

  if (provider === 'resend') {
    if (!env.RESEND_API_KEY) {
      throw new AppError('email_unavailable', 503, 'Falta RESEND_API_KEY para enviar correos');
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromAddress(env).name} <${fromAddress(env).email}>`,
        to: [message.to],
        subject: message.subject,
        html: message.html ?? `<p>${message.text}</p>`,
        text: message.text,
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ResendResponse;
      console.error(`[email:resend] status=${response.status} message=${body.message ?? 'unknown'}`);
      throw new AppError('email_failed', 502, 'No pudimos enviar el correo. Intenta de nuevo.');
    }
    return;
  }

  // Relay HTTP propio (Google Apps Script + Gmail). Ver docs/EMAIL-RELAY.md.
  if (provider === 'relay' || provider === 'gmail') {
    if (!env.MAIL_RELAY_URL || !env.MAIL_RELAY_SECRET) {
      throw new AppError('email_unavailable', 503, 'El relay de correo no está configurado');
    }

    let response: Response;
    try {
      response = await fetch(env.MAIL_RELAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: env.MAIL_RELAY_SECRET,
          to: message.to,
          subject: message.subject,
          html: message.html ?? `<p>${message.text}</p>`,
          text: message.text,
          fromName: fromAddress(env).name,
        }),
      });
    } catch {
      throw new AppError('email_failed', 502, 'No pudimos enviar el correo. Intenta de nuevo.');
    }

    const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!response.ok || result?.ok !== true) {
      console.error(`[email:relay] status=${response.status} error=${result?.error ?? 'unknown'}`);
      throw new AppError('email_failed', 502, 'No pudimos enviar el correo. Intenta de nuevo.');
    }
    return;
  }

  console.warn(`[email] proveedor desconocido "${provider}", se omite el envío`);
}
