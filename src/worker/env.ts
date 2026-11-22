/**
 * Tipos mínimos de los bindings de Cloudflare que usa Credibas.
 * Se declaran explícitamente (en lugar de depender de @cloudflare/workers-types)
 * para mantener un único programa de TypeScript compartido con el cliente.
 */

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: {
    duration?: number;
    changes?: number;
    last_row_id?: number;
    rows_read?: number;
    rows_written?: number;
  };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

export interface R2Object {
  key: string;
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  httpMetadata?: { contentType?: string; contentDisposition?: string };
  customMetadata?: Record<string, string>;
}

export interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

export interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | Blob | ReadableStream,
    options?: {
      httpMetadata?: { contentType?: string; contentDisposition?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<R2Object>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    objects: R2Object[];
    truncated: boolean;
    cursor?: string;
  }>;
}

export interface Queue<T = unknown> {
  send(message: T, options?: { delaySeconds?: number }): Promise<void>;
  sendBatch(messages: Array<{ body: T; delaySeconds?: number }>): Promise<void>;
}

export interface QueueMessage<T = unknown> {
  id: string;
  timestamp: Date;
  body: T;
  attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export interface MessageBatch<T = unknown> {
  queue: string;
  messages: QueueMessage<T>[];
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface ScheduledController {
  cron: string;
  scheduledTime: number;
  noRetry(): void;
}

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailSendBinding {
  send(message: {
    to: string | EmailAddress;
    from: string | EmailAddress;
    subject: string;
    html?: string;
    text?: string;
    replyTo?: string | EmailAddress;
  }): Promise<{ messageId?: string }>;
}

export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  JOBS: Queue<import('./jobs/types').JobMessage>;
  EMAIL?: EmailSendBinding;
  ASSETS?: { fetch(request: Request): Promise<Response> };

  APP_ENV: string;
  APP_NAME: string;
  APP_URL: string;
  EMAIL_PROVIDER: string;
  PAYMENTS_PROVIDER: string;

  /** Secreto para firmar/verificar Turnstile. Sin él, en producción se rechaza el registro. */
  TURNSTILE_SECRET?: string;
  /** Site key pública de Turnstile; el cliente la lee desde /api/public/config. */
  TURNSTILE_SITE_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
  /** Relay HTTP de correo (Google Apps Script) cuando EMAIL_PROVIDER=relay. */
  MAIL_RELAY_URL?: string;
  MAIL_RELAY_SECRET?: string;
  /** Iteraciones PBKDF2; se sobreescribe en pruebas para acelerarlas. */
  PASSWORD_ITERATIONS?: string;
  /** Clave para webhooks de facturación. */
  BILLING_WEBHOOK_SECRET?: string;
}
