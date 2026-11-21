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
 * Envío de correo desacoplado del proveedor. En desarrollo (`console`) solo
 * escribe un resumen sin datos sensibles en el log.
 */
export async function sendEmail(env: Env, message: MailMessage): Promise<void> {
  const provider = (env.EMAIL_PROVIDER ?? 'console').toLowerCase();

  if (provider === 'console') {
    console.log(`[email:console] to=${message.to} subject="${message.subject}"`);
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

  console.warn(`[email] proveedor desconocido "${provider}", se omite el envío`);
}
