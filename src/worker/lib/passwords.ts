const encoder = new TextEncoder();
const PBKDF2_HASH = 'SHA-256';
const KEY_BITS = 256;
export const DEFAULT_PASSWORD_ITERATIONS = 600_000;
export const MIN_PASSWORD_ITERATIONS = 10_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function resolvePasswordIterations(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < MIN_PASSWORD_ITERATIONS) return DEFAULT_PASSWORD_ITERATIONS;
  return Math.trunc(parsed);
}

async function deriveBits(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: PBKDF2_HASH, salt, iterations },
    baseKey,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

export interface StoredPassword {
  hash: string;
  salt: string;
  iterations: number;
}

/**
 * Derivación con PBKDF2-SHA256 usando WebCrypto (primitiva estándar de la
 * plataforma). No se implementa criptografía propia.
 */
export async function hashPassword(password: string, iterations: number): Promise<StoredPassword> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await deriveBits(password, salt, iterations);
  return { hash: bytesToBase64(derived), salt: bytesToBase64(salt), iterations };
}

export async function verifyPassword(password: string, stored: StoredPassword): Promise<boolean> {
  const salt = base64ToBytes(stored.salt);
  const derived = await deriveBits(password, salt, stored.iterations);
  const expected = base64ToBytes(stored.hash);
  if (derived.length !== expected.length) return false;

  let diff = 0;
  for (let index = 0; index < derived.length; index += 1) {
    diff |= (derived[index] as number) ^ (expected[index] as number);
  }
  return diff === 0;
}
