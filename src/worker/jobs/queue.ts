import type { Env } from '../env';
import type { JobMessage } from './types';

/**
 * Encola un trabajo si el entorno tiene binding de Queues. En Cloudflare Pages
 * (sitio de pruebas) no existe `JOBS`: se omite sin romper la petición.
 */
export async function enqueueJob(env: Env, message: JobMessage): Promise<void> {
  if (!env.JOBS) return;
  await env.JOBS.send(message);
}
