export type JobMessage =
  | { type: 'email.send'; to: string; subject: string; text: string; html?: string }
  | { type: 'notifications.installment-reminders'; orgId: string; asOfDate: string }
  | { type: 'notifications.overdue-digest'; orgId: string; asOfDate: string }
  | { type: 'billing.expire-subscriptions' }
  | { type: 'billing.charge-due' }
  | { type: 'cleanup.tokens' }
  | { type: 'maintenance.refresh-overdue'; orgId: string; asOfDate: string };
