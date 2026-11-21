import { Hono } from 'hono';
import { dbFrom } from '../db';
import { requireAuth } from '../middleware/guards';
import type { AppEnv } from '../types';

export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.use('*', requireAuth);

notificationRoutes.get('/', async (c) => {
  const db = dbFrom(c.env.DB);
  const userId = c.get('userId') as string;

  const items = await db.all<{
    id: string;
    type: string;
    title: string;
    body: string | null;
    status: string;
    created_at: number;
    read_at: number | null;
  }>(
    `SELECT id, type, title, body, status, created_at, read_at
       FROM notifications
      WHERE user_id = ? OR (user_id IS NULL AND org_id = ?)
      ORDER BY created_at DESC
      LIMIT 30`,
    [userId, c.get('orgId')],
  );

  const unread = await db.count(
    `SELECT COUNT(*) AS total FROM notifications
      WHERE (user_id = ? OR (user_id IS NULL AND org_id = ?)) AND read_at IS NULL`,
    [userId, c.get('orgId')],
  );

  return c.json({
    unread,
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      body: item.body,
      status: item.status,
      createdAt: new Date(item.created_at).toISOString(),
      readAt: item.read_at ? new Date(item.read_at).toISOString() : null,
    })),
  });
});

notificationRoutes.post('/:id/read', async (c) => {
  const db = dbFrom(c.env.DB);
  await db.run(`UPDATE notifications SET status = 'read', read_at = ? WHERE id = ? AND (user_id = ? OR org_id = ?)`, [
    Date.now(),
    c.req.param('id'),
    c.get('userId'),
    c.get('orgId'),
  ]);
  return c.json({ ok: true });
});

notificationRoutes.post('/read-all', async (c) => {
  const db = dbFrom(c.env.DB);
  await db.run(
    `UPDATE notifications SET status = 'read', read_at = ?
      WHERE (user_id = ? OR (user_id IS NULL AND org_id = ?)) AND read_at IS NULL`,
    [Date.now(), c.get('userId'), c.get('orgId')],
  );
  return c.json({ ok: true });
});
