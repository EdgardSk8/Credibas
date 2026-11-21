import type { Env, MessageBatch, ScheduledController } from '../env';
import { dbFrom } from '../db';
import { sendEmail } from '../services/mailer';
import { purgeExpiredTokens } from '../repositories/tokens';
import { refreshOverdueInstallments } from '../repositories/loans';
import { refreshExpiredSubscriptions } from '../repositories/subscriptions';
import { purgeRateLimits } from '../repositories/rate-limits';
import { deleteExpiredSessions } from '../repositories/sessions';
import { calculateLateFeeCents } from '../../shared/finance/late-fees';
import { addDays, todayInTimezone } from '../../shared/finance/dates';
import { newId } from '../lib/crypto';
import type { JobMessage } from './types';

export async function handleQueue(env: Env, batch: MessageBatch<JobMessage>): Promise<void> {
  for (const message of batch.messages) {
    try {
      await processJob(env, message.body);
      message.ack();
    } catch (error) {
      console.error(`[queue] job ${message.body.type} falló (intento ${message.attempts}):`, error);
      message.retry({ delaySeconds: 60 });
    }
  }
}

async function processJob(env: Env, job: JobMessage): Promise<void> {
  const db = dbFrom(env.DB);
  const now = Date.now();

  switch (job.type) {
    case 'email.send':
      await sendEmail(env, { to: job.to, subject: job.subject, text: job.text, html: job.html });
      return;

    case 'maintenance.refresh-overdue': {
      await refreshOverdueInstallments(db, job.orgId, job.asOfDate, now);
      await accrueLateFeesForOrg(env, job.orgId, job.asOfDate, now);
      return;
    }

    case 'notifications.installment-reminders': {
      await createUpcomingReminders(env, job.orgId, job.asOfDate, now);
      return;
    }

    case 'notifications.overdue-digest': {
      await createOverdueDigest(env, job.orgId, job.asOfDate, now);
      return;
    }

    case 'billing.expire-subscriptions': {
      await refreshExpiredSubscriptions(db, now);
      return;
    }

    case 'cleanup.tokens': {
      await purgeExpiredTokens(db, now);
      await deleteExpiredSessions(db, now);
      await purgeRateLimits(db, now - 24 * 60 * 60 * 1000);
      return;
    }

    default: {
      const exhaustive: never = job;
      throw new Error(`Job no soportado: ${JSON.stringify(exhaustive)}`);
    }
  }
}

async function accrueLateFeesForOrg(env: Env, orgId: string, asOfDate: string, now: number): Promise<void> {
  const db = dbFrom(env.DB);
  const rows = await db.all<{
    id: string;
    total_cents: number;
    paid_cents: number;
    due_date: string;
    late_fee_daily_bps: number;
    grace_days: number;
    late_fee_accrued_cents: number;
  }>(
    `SELECT i.id, i.total_cents,
            (i.paid_principal_cents + i.paid_interest_cents + i.paid_fee_cents) AS paid_cents,
            i.due_date, l.late_fee_daily_bps, l.grace_days, i.late_fee_accrued_cents
       FROM installments i
       JOIN loans l ON l.id = i.loan_id
      WHERE i.org_id = ? AND i.version = l.schedule_version AND l.status = 'active'
        AND l.deleted_at IS NULL AND l.late_fee_daily_bps > 0
        AND i.status IN ('pending', 'partial', 'overdue') AND i.due_date < ?
      LIMIT 2000`,
    [orgId, asOfDate],
  );

  const statements: Array<{ sql: string; params: Array<string | number | null> }> = [];
  for (const row of rows) {
    const fee = calculateLateFeeCents({
      totalCents: row.total_cents,
      paidCents: row.paid_cents,
      dueDate: row.due_date,
      asOfDate,
      dailyBps: row.late_fee_daily_bps,
      graceDays: row.grace_days,
    });
    if (fee !== row.late_fee_accrued_cents) {
      statements.push({
        sql: `UPDATE installments SET late_fee_accrued_cents = ?, updated_at = ? WHERE org_id = ? AND id = ?`,
        params: [fee, now, orgId, row.id],
      });
    }
    if (statements.length >= 100) {
      await db.batch(statements.splice(0, statements.length));
    }
  }
  if (statements.length > 0) await db.batch(statements);
}

async function orgOwner(env: Env, orgId: string): Promise<{ userId: string; email: string; name: string } | null> {
  const db = dbFrom(env.DB);
  return db.first<{ userId: string; email: string; name: string }>(
    `SELECT u.id AS userId, u.email, o.name
       FROM organizations o JOIN users u ON u.id = o.owner_user_id
      WHERE o.id = ?`,
    [orgId],
  );
}

async function createUpcomingReminders(env: Env, orgId: string, asOfDate: string, now: number): Promise<void> {
  const db = dbFrom(env.DB);
  const preferences = await db.first<{ value_json: string }>(
    `SELECT value_json FROM settings WHERE org_id = ? AND key = 'org.preferences'`,
    [orgId],
  );
  let reminderDays = 2;
  if (preferences) {
    try {
      const parsed = JSON.parse(preferences.value_json) as { reminderDaysBeforeDue?: number };
      if (typeof parsed.reminderDaysBeforeDue === 'number') reminderDays = parsed.reminderDaysBeforeDue;
    } catch {
      // Ignora preferencias inválidas y usa el valor por defecto.
    }
  }

  const targetDate = addDays(asOfDate, reminderDays);
  const count = await db.count(
    `SELECT COUNT(*) AS total FROM installments i
       JOIN loans l ON l.id = i.loan_id
      WHERE i.org_id = ? AND i.version = l.schedule_version AND l.status = 'active'
        AND l.deleted_at IS NULL AND i.status IN ('pending', 'partial', 'overdue') AND i.due_date = ?`,
    [orgId, targetDate],
  );
  if (count === 0) return;

  const owner = await orgOwner(env, orgId);
  if (!owner) return;

  await db.run(
    `INSERT INTO notifications (id, org_id, user_id, type, title, body, channel, status, data_json, created_at, sent_at, read_at)
     VALUES (?, ?, ?, 'installment_reminder', ?, ?, 'in_app', 'sent', ?, ?, ?, NULL)`,
    [
      newId('ntf'),
      orgId,
      owner.userId,
      `${count} cuota(s) vencen en ${reminderDays} día(s)`,
      `Revisa la agenda de cobros del ${targetDate}.`,
      JSON.stringify({ date: targetDate, count }),
      now,
      now,
    ],
  );
}

async function createOverdueDigest(env: Env, orgId: string, asOfDate: string, now: number): Promise<void> {
  const db = dbFrom(env.DB);
  const row = await db.first<{ count: number; amount: number }>(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(i.principal_cents + i.interest_cents + i.fee_cents
              - i.paid_principal_cents - i.paid_interest_cents - i.paid_fee_cents), 0) AS amount
       FROM installments i
       JOIN loans l ON l.id = i.loan_id
      WHERE i.org_id = ? AND i.version = l.schedule_version AND l.status = 'active'
        AND l.deleted_at IS NULL AND i.status IN ('pending', 'partial', 'overdue') AND i.due_date < ?`,
    [orgId, asOfDate],
  );
  if (!row || Number(row.count) === 0) return;

  const owner = await orgOwner(env, orgId);
  if (!owner) return;

  await db.run(
    `INSERT INTO notifications (id, org_id, user_id, type, title, body, channel, status, data_json, created_at, sent_at, read_at)
     VALUES (?, ?, ?, 'overdue_digest', ?, ?, 'in_app', 'sent', ?, ?, ?, NULL)`,
    [
      newId('ntf'),
      orgId,
      owner.userId,
      `${Number(row.count)} cuota(s) vencidas`,
      'Revisa la gestión de cobros y contacta a los clientes con promesas pendientes.',
      JSON.stringify({ count: Number(row.count), amountCents: Number(row.amount), asOfDate }),
      now,
      now,
    ],
  );
}

export async function runScheduled(env: Env, controller: ScheduledController): Promise<void> {
  const db = dbFrom(env.DB);
  const now = Date.now();

  await refreshExpiredSubscriptions(db, now);

  const orgs = await db.all<{ id: string; timezone: string }>(
    `SELECT id, timezone FROM organizations WHERE status = 'active' LIMIT 500`,
  );

  for (const org of orgs) {
    const asOfDate = todayInTimezone(org.timezone);
    await refreshOverdueInstallments(db, org.id, asOfDate, now);
  }

  if (controller.cron === '0 13 * * *') {
    for (const org of orgs) {
      const asOfDate = todayInTimezone(org.timezone);
      await env.JOBS.send({ type: 'maintenance.refresh-overdue', orgId: org.id, asOfDate } satisfies JobMessage);
      await env.JOBS.send({ type: 'notifications.installment-reminders', orgId: org.id, asOfDate } satisfies JobMessage);
      await env.JOBS.send({ type: 'notifications.overdue-digest', orgId: org.id, asOfDate } satisfies JobMessage);
    }
    await env.JOBS.send({ type: 'cleanup.tokens' } satisfies JobMessage);
    await env.JOBS.send({ type: 'billing.expire-subscriptions' } satisfies JobMessage);
  }
}
