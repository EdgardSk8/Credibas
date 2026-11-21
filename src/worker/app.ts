import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { csrfMiddleware, errorHandler, requestIdMiddleware } from './middleware/core';
import { organizationMiddleware, sessionMiddleware } from './middleware/session';
import { authRoutes } from './routes/auth';
import { organizationRoutes } from './routes/organizations';
import { clientRoutes } from './routes/clients';
import { loanRoutes } from './routes/loans';
import { installmentRoutes } from './routes/installments';
import { paymentRoutes } from './routes/payments';
import { collectionRoutes } from './routes/collections';
import { cashRoutes } from './routes/cash';
import { reportRoutes } from './routes/reports';
import { subscriptionRoutes } from './routes/subscriptions';
import { notificationRoutes } from './routes/notifications';
import { adminRoutes } from './routes/admin';
import { publicRoutes } from './routes/public';
import { webhookRoutes } from './routes/webhooks';
import type { AppEnv } from './types';

export const app = new Hono<AppEnv>();

app.use('*', requestIdMiddleware);

app.use(
  '/api/*',
  secureHeaders({
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    crossOriginResourcePolicy: 'same-origin',
    crossOriginOpenerPolicy: 'same-origin',
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
  }),
);

app.use('/api/*', async (c, next) => {
  await next();
  // Respuestas financieras nunca se cachean en intermediarios.
  c.header('cache-control', 'no-store');
});

app.use('/api/*', csrfMiddleware);
app.use('/api/*', sessionMiddleware);
app.use('/api/*', organizationMiddleware);

app.route('/api/auth', authRoutes);
app.route('/api/organizations', organizationRoutes);
app.route('/api/clients', clientRoutes);
app.route('/api/loans', loanRoutes);
app.route('/api/installments', installmentRoutes);
app.route('/api/payments', paymentRoutes);
app.route('/api/collections', collectionRoutes);
app.route('/api/cash', cashRoutes);
app.route('/api/reports', reportRoutes);
app.route('/api/subscriptions', subscriptionRoutes);
app.route('/api/notifications', notificationRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/public', publicRoutes);
app.route('/api/webhooks', webhookRoutes);

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: { code: 'not_found', message: 'Ruta no encontrada' } }, 404);
  }
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.text('No encontrado', 404);
});

app.onError(errorHandler);
