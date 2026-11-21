import { app } from './app';
import { handleQueue, runScheduled } from './jobs/handlers';
import type { Env, ExecutionContext, MessageBatch, ScheduledController } from './env';
import type { JobMessage } from './jobs/types';
/**
 * Entrypoint del Worker: API, tareas programadas (Cron) y cola de trabajos.
 */
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    return app.fetch(request, env, ctx as Parameters<typeof app.fetch>[2]);
  },

  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(runScheduled(env, controller));
  },

  queue(batch: MessageBatch<JobMessage>, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(handleQueue(env, batch));
  },
};
