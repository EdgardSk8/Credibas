import { app } from '../../src/worker/app';
import type { Env, ExecutionContext } from '../../src/worker/env';

interface PagesFunctionContext {
  request: Request;
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
}

/**
 * Entry de Cloudflare Pages Functions: reutiliza la misma app Hono del Worker.
 * En Pages no existen Queues ni Cron; los envíos a cola se omiten en `enqueueJob`.
 */
export function onRequest(context: PagesFunctionContext): Response | Promise<Response> {
  const executionCtx: ExecutionContext = {
    waitUntil: context.waitUntil,
    passThroughOnException: () => undefined,
  };

  return app.fetch(context.request, context.env, executionCtx as Parameters<typeof app.fetch>[2]);
}
