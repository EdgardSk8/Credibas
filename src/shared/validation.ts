import { z } from 'zod';

export const dateOnlySchema = z.iso.date();
export const currencySchema = z.enum(['NIO', 'USD']);

/**
 * Los identificadores de Credibas son UUID con prefijo de dominio
 * (usr_, org_, cli_, lon_...), por eso no se valida con idSchema.
 */
export const idSchema = z
  .string()
  .regex(/^[a-z]{3}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Identificador inválido');

export const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128, 'La contraseña es demasiado larga')
  .regex(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/, 'La contraseña debe incluir al menos una letra')
  .regex(/\d/, 'La contraseña debe incluir al menos un número');

export const emailSchema = z.email('Ingresa un correo válido').max(254).transform((value) => value.trim().toLowerCase());

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Ingresa tu nombre').max(120),
  email: emailSchema,
  password: passwordSchema,
  turnstileToken: z.string().optional(),
  acceptTerms: z.literal(true, { message: 'Debes aceptar los términos y la política de privacidad' }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Ingresa tu contraseña').max(200),
  turnstileToken: z.string().optional(),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(500),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const verifyEmailCodeSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Ingresa el código de 6 dígitos'),
});

export const resendVerificationSchema = z.object({ email: emailSchema });

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'El nombre del negocio es obligatorio').max(120),
  currency: currencySchema.default('NIO'),
  timezone: z.string().max(64).default('America/Managua'),
});

export const inviteMemberSchema = z.object({
  email: emailSchema,
  roleKey: z.enum(['admin', 'supervisor', 'collector', 'viewer']),
});

export const updateMemberSchema = z.object({
  roleKey: z.enum(['owner', 'admin', 'supervisor', 'collector', 'viewer']),
  status: z.enum(['active', 'suspended']).optional(),
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === undefined || value === null || value === '' ? null : value));

export const clientReferenceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  relationship: z.string().trim().max(80).optional(),
  address: z.string().trim().max(200).optional(),
});

export const clientInputSchema = z.object({
  fullName: z.string().trim().min(2, 'El nombre es obligatorio').max(160),
  identification: optionalText(40),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .max(254)
    .nullable()
    .optional()
    .transform((value) => (value ? value.toLowerCase() : null))
    .refine((value) => value === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Correo inválido'),
  address: optionalText(240),
  references: z.array(clientReferenceSchema).max(10).default([]),
  notes: optionalText(2000),
  status: z.enum(['active', 'inactive', 'blocked']).default('active'),
});

export const loanInputSchema = z
  .object({
    clientId: idSchema,
    currency: currencySchema,
    principalCents: z.number().int().positive('El capital debe ser mayor a cero'),
    interestRateBps: z.number().int().min(0).max(10_000),
    amortizationMethod: z.enum(['flat_interest', 'fixed_installment', 'declining_principal']),
    installmentCount: z.number().int().min(1).max(520),
    frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'custom']),
    customDays: z.number().int().positive().max(365).nullable().optional(),
    disbursementDate: dateOnlySchema,
    firstDueDate: dateOnlySchema,
    feeCents: z.number().int().min(0).default(0),
    lateFeeDailyBps: z.number().int().min(0).max(1000).default(0),
    graceDays: z.number().int().min(0).max(120).default(0),
    notes: optionalText(2000),
  })
  .superRefine((value, ctx) => {
    if (value.firstDueDate < value.disbursementDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['firstDueDate'],
        message: 'La primera cuota no puede vencer antes del desembolso',
      });
    }
    if (value.frequency === 'custom' && !value.customDays) {
      ctx.addIssue({
        code: 'custom',
        path: ['customDays'],
        message: 'Indica cada cuántos días se cobra',
      });
    }
  });

export const loanAdjustmentSchema = z.object({
  reason: z.string().trim().min(5, 'Explica el motivo del ajuste').max(500),
  installmentCount: z.number().int().min(1).max(520).optional(),
  interestRateBps: z.number().int().min(0).max(10_000).optional(),
  firstDueDate: dateOnlySchema.optional(),
});

export const paymentInputSchema = z.object({
  loanId: idSchema,
  amountCents: z.number().int().positive('El monto debe ser mayor a cero'),
  method: z.enum(['cash', 'transfer', 'card', 'other']),
  paidAt: dateOnlySchema,
  reference: optionalText(120),
  notes: optionalText(1000),
  mode: z.enum(['regular', 'capital']).default('regular'),
});

export const reversePaymentSchema = z.object({
  reason: z.string().trim().min(10, 'Describe el motivo de la reversión').max(500),
});

export const collectionAssignmentSchema = z.object({
  clientId: idSchema,
  loanId: idSchema.nullable().optional(),
  collectorMemberId: idSchema,
  nextContactAt: dateOnlySchema.nullable().optional(),
  notes: optionalText(1000),
});

export const collectionActivitySchema = z.object({
  clientId: idSchema,
  loanId: idSchema.nullable().optional(),
  assignmentId: idSchema.nullable().optional(),
  type: z.enum(['call', 'visit', 'message', 'promise', 'note']),
  outcome: optionalText(120),
  notes: optionalText(2000),
  promiseAmountCents: z.number().int().min(0).nullable().optional(),
  promiseDate: dateOnlySchema.nullable().optional(),
});

export const openCashRegisterSchema = z.object({
  openingBalanceCents: z.number().int().min(0).default(0),
  notes: optionalText(500),
});

export const closeCashRegisterSchema = z.object({
  countedBalanceCents: z.number().int().min(0),
  notes: optionalText(500),
});

export const cashMovementSchema = z.object({
  direction: z.enum(['in', 'out']),
  category: z.enum(['capital', 'interes', 'mora', 'comision', 'gasto', 'ajuste', 'otro']),
  amountCents: z.number().int().positive(),
  description: optionalText(500),
});

export const organizationSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  currency: currencySchema.optional(),
  timezone: z.string().max(64).optional(),
  dateFormat: z.enum(['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']).optional(),
  defaultLateFeeDailyBps: z.number().int().min(0).max(1000).optional(),
  defaultGraceDays: z.number().int().min(0).max(120).optional(),
  allocationOrder: z
    .array(z.enum(['late_fee', 'interest', 'principal', 'fee']))
    .min(1)
    .optional(),
  paymentMethods: z.array(z.enum(['cash', 'transfer', 'card', 'other'])).min(1).optional(),
});

export const subscriptionRequestSchema = z.object({
  planKey: z.string().min(1).max(40),
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
  note: optionalText(300),
});

export const subscriptionRequestResolutionSchema = z.object({
  note: optionalText(500),
});

export const subscriptionQuoteSchema = z.object({
  planKey: z.string().trim().min(1).max(40),
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
  moduleKeys: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  addons: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(40),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .max(20)
    .default([]),
});

export const moduleCatalogSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guion bajo').min(2).max(40),
  name: z.string().trim().min(2).max(80),
  description: optionalText(240),
  priceMonthlyCents: z.number().int().min(0),
  priceYearlyCents: z.number().int().min(0),
  isCore: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
  features: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  dependencyKeys: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  planKeys: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});

export const addonCatalogSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guion bajo').min(2).max(40),
  name: z.string().trim().min(2).max(80),
  description: optionalText(240),
  metric: z.enum([
    'users',
    'clients',
    'active_loans',
    'storage_mb',
    'collectors',
    'branches',
    'exports_per_month',
    'history_days',
  ]),
  unitAmount: z.number().int().positive().max(1_000_000),
  unitLabel: z.string().trim().min(1).max(40),
  priceMonthlyCents: z.number().int().min(0),
  priceYearlyCents: z.number().int().min(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
  plans: z
    .array(
      z.object({
        planKey: z.string().trim().min(1).max(40),
        maxQuantity: z.number().int().min(0).max(100),
      }),
    )
    .max(10)
    .default([]),
});

export const confirmBillingPaymentSchema = z.object({
  invoiceId: idSchema,
  provider: z.enum(['manual', 'transfer', 'card', 'other']),
  reference: optionalText(120),
  amountCents: z.number().int().positive(),
  notes: optionalText(500),
});

export const adminPlanSchema = z.object({
  key: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(80),
  description: optionalText(240),
  priceMonthlyCents: z.number().int().min(0),
  priceYearlyCents: z.number().int().min(0),
  currency: z.string().trim().min(3).max(3).default('USD'),
  trialDays: z.number().int().min(0).max(90).default(0),
  graceDays: z.number().int().min(0).max(90).default(7),
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  features: z.array(z.string().trim().min(1).max(160)).default([]),
  limits: z.record(z.string(), z.number().int().min(0)),
});

export const adminOrganizationUpdateSchema = z.object({
  status: z.enum(['active', 'suspended', 'closed']).optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
  subscriptionStatus: z.enum(['trialing', 'active', 'past_due', 'canceled', 'expired']).optional(),
  planKey: z.string().min(1).max(40).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: z.string().trim().max(40).optional(),
  sort: z.string().trim().max(40).optional(),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

export const publicContactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  company: optionalText(120),
  message: z.string().trim().min(10, 'Cuéntanos un poco más').max(2000),
  turnstileToken: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ClientInput = z.infer<typeof clientInputSchema>;
export type LoanInput = z.infer<typeof loanInputSchema>;
export type PaymentInput = z.infer<typeof paymentInputSchema>;
export type CollectionActivityInput = z.infer<typeof collectionActivitySchema>;
export type OrganizationSettingsInput = z.infer<typeof organizationSettingsSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
