/// <reference types="@cloudflare/vitest-plugin/types" />

import type { D1Database, Queue, R2Bucket } from '../src/worker/env';

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    JOBS: Queue;
    APP_ENV: string;
    APP_NAME: string;
    APP_URL: string;
    EMAIL_PROVIDER: string;
    PAYMENTS_PROVIDER: string;
    PASSWORD_ITERATIONS: string;
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
}
