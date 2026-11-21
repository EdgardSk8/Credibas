export type { JobMessage } from './jobs/types';

export type AppEnv = {
  Bindings: import('./env').Env;
  Variables: {
    requestId: string;
    /** Usuario autenticado (si la sesión es válida). */
    userId: string | null;
    sessionId: string | null;
    sessionOrgId: string | null;
    userEmail: string | null;
    userFullName: string | null;
    emailVerified: boolean;
    isPlatformAdmin: boolean;
    /** Organización activa resuelta desde la membresía, nunca desde el cliente. */
    orgId: string | null;
    orgName: string | null;
    orgCurrency: 'NIO' | 'USD' | null;
    orgTimezone: string;
    memberId: string | null;
    roleKey: string | null;
    permissions: string[];
    /** IP del cliente para rate limiting / auditoría. */
    clientIp: string;
  };
};
