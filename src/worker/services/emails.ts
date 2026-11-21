/**
 * Plantillas de correo con la identidad de Credibas. HTML simple, sin
 * dependencias externas, compatible con clientes de correo.
 */
const BG = '#101817';
const ACCENT = '#35D6A0';
const TEXT = '#F0F4F2';

function layout(title: string, body: string, footerNote = 'Recibiste este correo porque tienes una cuenta en Credibas.'): string {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:${BG};font-family:'Helvetica Neue',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#16211f;border:1px solid rgba(240,244,242,0.08);border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <span style="font-size:20px;font-weight:700;color:${TEXT};letter-spacing:-0.02em;">credibas<span style="color:${ACCENT};">.</span></span>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px 32px;color:${TEXT};font-size:15px;line-height:1.65;">
                <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:${TEXT};font-weight:600;">${title}</h1>
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;border-top:1px solid rgba(240,244,242,0.08);color:rgba(240,244,242,0.55);font-size:12px;line-height:1.5;">
                ${footerNote}<br />Credibas · Gestión profesional de créditos
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(label: string, url: string): string {
  return `<p style="margin:24px 0;"><a href="${url}" style="display:inline-block;background:${ACCENT};color:#06251b;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">${label}</a></p>
<p style="margin:0;font-size:12px;color:rgba(240,244,242,0.55);word-break:break-all;">${url}</p>`;
}

export function verificationEmail(name: string, url: string): { subject: string; html: string; text: string } {
  return {
    subject: 'Confirma tu correo en Credibas',
    html: layout(
      `Hola, ${name}`,
      `<p style="margin:0 0 12px 0;">Confirma tu correo para activar tu cuenta y comenzar a configurar tu negocio.</p>${button('Confirmar correo', url)}<p style="margin:16px 0 0 0;font-size:13px;color:rgba(240,244,242,0.65);">El enlace expira en 24 horas y solo puede usarse una vez.</p>`,
      'Si no creaste una cuenta en Credibas, ignora este correo.',
    ),
    text: `Hola, ${name}. Confirma tu correo en Credibas: ${url} (expira en 24 horas).`,
  };
}

export function passwordResetEmail(name: string, url: string): { subject: string; html: string; text: string } {
  return {
    subject: 'Restablece tu contraseña de Credibas',
    html: layout(
      `Hola, ${name}`,
      `<p style="margin:0 0 12px 0;">Recibimos una solicitud para restablecer tu contraseña.</p>${button('Restablecer contraseña', url)}<p style="margin:16px 0 0 0;font-size:13px;color:rgba(240,244,242,0.65);">El enlace expira en 1 hora. Si no lo solicitaste, tu cuenta sigue segura.</p>`,
      'Si no solicitaste este cambio, puedes ignorar este correo.',
    ),
    text: `Restablece tu contraseña de Credibas: ${url} (expira en 1 hora).`,
  };
}

export function invitationEmail(name: string, orgName: string, roleName: string, url: string): { subject: string; html: string; text: string } {
  return {
    subject: `${name}, te invitaron a ${orgName} en Credibas`,
    html: layout(
      `Invitación a ${orgName}`,
      `<p style="margin:0 0 12px 0;">Te invitaron a colaborar en <strong>${orgName}</strong> con el rol de <strong>${roleName}</strong>.</p>${button('Aceptar invitación', url)}<p style="margin:16px 0 0 0;font-size:13px;color:rgba(240,244,242,0.65);">La invitación expira en 7 días.</p>`,
    ),
    text: `Te invitaron a ${orgName} en Credibas con el rol ${roleName}: ${url}`,
  };
}

export function paymentReceiptEmail(
  clientName: string,
  orgName: string,
  amount: string,
  loanCode: string,
  paymentDate: string,
): { subject: string; html: string; text: string } {
  return {
    subject: `Comprobante de pago · ${loanCode}`,
    html: layout(
      'Pago registrado',
      `<p style="margin:0 0 12px 0;">Hola, ${clientName}. Registramos tu pago en <strong>${orgName}</strong>.</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border-collapse:collapse;">
         <tr><td style="padding:8px 0;color:rgba(240,244,242,0.65);font-size:13px;">Préstamo</td><td style="padding:8px 0;text-align:right;font-weight:600;">${loanCode}</td></tr>
         <tr><td style="padding:8px 0;color:rgba(240,244,242,0.65);font-size:13px;">Fecha</td><td style="padding:8px 0;text-align:right;font-weight:600;">${paymentDate}</td></tr>
         <tr><td style="padding:8px 0;border-top:1px solid rgba(240,244,242,0.08);color:rgba(240,244,242,0.65);font-size:13px;">Monto</td><td style="padding:8px 0;border-top:1px solid rgba(240,244,242,0.08);text-align:right;font-weight:700;color:${ACCENT};">${amount}</td></tr>
       </table>
       <p style="margin:0;font-size:13px;color:rgba(240,244,242,0.65);">Gracias por tu pago.</p>`,
    ),
    text: `Pago registrado en ${orgName}: ${amount} para el préstamo ${loanCode} el ${paymentDate}.`,
  };
}

export function overdueReminderEmail(
  clientName: string,
  orgName: string,
  loanCode: string,
  dueDate: string,
  amount: string,
): { subject: string; html: string; text: string } {
  return {
    subject: `Recordatorio de cuota · ${loanCode}`,
    html: layout(
      'Tienes una cuota pendiente',
      `<p style="margin:0 0 12px 0;">Hola, ${clientName}. Te recordamos que la cuota del préstamo <strong>${loanCode}</strong> venció el <strong>${dueDate}</strong>.</p>
       <p style="margin:0 0 12px 0;">Saldo pendiente: <strong style="color:${ACCENT};">${amount}</strong></p>
       <p style="margin:0;font-size:13px;color:rgba(240,244,242,0.65);">Comunícate con ${orgName} para coordinar tu pago.</p>`,
    ),
    text: `Hola, ${clientName}. La cuota del préstamo ${loanCode} venció el ${dueDate}. Saldo pendiente: ${amount}.`,
  };
}

export function subscriptionReceiptEmail(
  orgName: string,
  planName: string,
  amount: string,
  periodLabel: string,
): { subject: string; html: string; text: string } {
  return {
    subject: 'Pago de suscripción confirmado',
    html: layout(
      'Suscripción activa',
      `<p style="margin:0 0 12px 0;">Confirmamos el pago de tu suscripción <strong>${planName}</strong> para <strong>${orgName}</strong>.</p>
       <p style="margin:0 0 12px 0;">Período: ${periodLabel}</p>
       <p style="margin:0;font-size:16px;font-weight:700;color:${ACCENT};">${amount}</p>`,
    ),
    text: `Suscripción ${planName} confirmada para ${orgName}. Período: ${periodLabel}. Monto: ${amount}.`,
  };
}
