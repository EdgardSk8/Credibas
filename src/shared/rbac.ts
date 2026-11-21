export const PERMISSIONS = {
  orgRead: 'org.read',
  orgUpdate: 'org.update',
  orgSettings: 'org.settings',
  membersRead: 'members.read',
  membersInvite: 'members.invite',
  membersUpdate: 'members.update',
  membersRemove: 'members.remove',
  clientsRead: 'clients.read',
  clientsWrite: 'clients.write',
  clientsDelete: 'clients.delete',
  clientsDocuments: 'clients.documents',
  loansRead: 'loans.read',
  loansWrite: 'loans.write',
  loansAdjust: 'loans.adjust',
  loansCancel: 'loans.cancel',
  paymentsRead: 'payments.read',
  paymentsWrite: 'payments.write',
  paymentsReverse: 'payments.reverse',
  collectionsRead: 'collections.read',
  collectionsWrite: 'collections.write',
  cashRead: 'cash.read',
  cashWrite: 'cash.write',
  cashClose: 'cash.close',
  reportsRead: 'reports.read',
  reportsExport: 'reports.export',
  billingRead: 'billing.read',
  billingManage: 'billing.manage',
  auditRead: 'audit.read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type RoleKey = 'owner' | 'admin' | 'supervisor' | 'collector' | 'viewer';

export interface RoleTemplate {
  key: RoleKey;
  name: string;
  description: string;
  permissions: Permission[];
}

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

const ADMIN_PERMISSIONS = ALL_PERMISSIONS.filter((permission) => permission !== PERMISSIONS.billingManage);

const SUPERVISOR_PERMISSIONS: Permission[] = [
  PERMISSIONS.orgRead,
  PERMISSIONS.membersRead,
  PERMISSIONS.clientsRead,
  PERMISSIONS.clientsWrite,
  PERMISSIONS.clientsDocuments,
  PERMISSIONS.loansRead,
  PERMISSIONS.loansWrite,
  PERMISSIONS.loansAdjust,
  PERMISSIONS.paymentsRead,
  PERMISSIONS.paymentsWrite,
  PERMISSIONS.collectionsRead,
  PERMISSIONS.collectionsWrite,
  PERMISSIONS.cashRead,
  PERMISSIONS.cashWrite,
  PERMISSIONS.reportsRead,
  PERMISSIONS.reportsExport,
  PERMISSIONS.billingRead,
];

const COLLECTOR_PERMISSIONS: Permission[] = [
  PERMISSIONS.orgRead,
  PERMISSIONS.clientsRead,
  PERMISSIONS.loansRead,
  PERMISSIONS.paymentsRead,
  PERMISSIONS.paymentsWrite,
  PERMISSIONS.collectionsRead,
  PERMISSIONS.collectionsWrite,
  PERMISSIONS.cashRead,
];

const VIEWER_PERMISSIONS: Permission[] = [
  PERMISSIONS.orgRead,
  PERMISSIONS.clientsRead,
  PERMISSIONS.loansRead,
  PERMISSIONS.paymentsRead,
  PERMISSIONS.collectionsRead,
  PERMISSIONS.cashRead,
  PERMISSIONS.reportsRead,
  PERMISSIONS.billingRead,
];

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: 'owner',
    name: 'Propietario',
    description: 'Control total del negocio, incluida la facturación.',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: 'admin',
    name: 'Administrador',
    description: 'Administra la operación diaria sin gestionar la facturación.',
    permissions: ADMIN_PERMISSIONS,
  },
  {
    key: 'supervisor',
    name: 'Supervisor',
    description: 'Supervisa cartera, cobros y caja.',
    permissions: SUPERVISOR_PERMISSIONS,
  },
  {
    key: 'collector',
    name: 'Cobrador',
    description: 'Gestiona visitas, cobros y registra pagos.',
    permissions: COLLECTOR_PERMISSIONS,
  },
  {
    key: 'viewer',
    name: 'Consulta',
    description: 'Acceso de solo lectura a la información.',
    permissions: VIEWER_PERMISSIONS,
  },
];

export const ROLE_LABELS: Record<RoleKey, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  supervisor: 'Supervisor',
  collector: 'Cobrador',
  viewer: 'Consulta',
};

export function roleTemplate(key: RoleKey): RoleTemplate {
  const template = ROLE_TEMPLATES.find((item) => item.key === key);
  if (!template) throw new Error(`Rol desconocido: ${key}`);
  return template;
}

export function hasPermission(granted: readonly string[], required: Permission): boolean {
  return granted.includes(required);
}
