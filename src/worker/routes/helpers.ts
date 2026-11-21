import type { Context } from 'hono';
import { dbFrom } from '../db';
import type { AppEnv } from '../types';
import type { LoanContext } from '../services/loan-service';
import { getSubscription } from '../repositories/subscriptions';

export async function buildLoanContext(c: Context<AppEnv>): Promise<LoanContext> {
  const db = dbFrom(c.env.DB);
  const orgId = c.get('orgId') as string;
  const subscription = await getSubscription(db, orgId);

  return {
    orgId,
    orgName: c.get('orgName') ?? 'Credibas',
    orgCurrency: c.get('orgCurrency') ?? 'NIO',
    orgTimezone: c.get('orgTimezone'),
    subscriptionStatus: subscription?.status ?? 'expired',
    userId: c.get('userId') as string,
    ip: c.get('clientIp'),
    userAgent: c.req.header('user-agent') ?? 'unknown',
  };
}

export function requestMeta(c: Context<AppEnv>) {
  return { ip: c.get('clientIp'), userAgent: c.req.header('user-agent') ?? 'unknown' };
}
