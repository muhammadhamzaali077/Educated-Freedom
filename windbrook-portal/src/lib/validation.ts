import { z } from 'zod';

const MIN_AGE_YEARS = 18;

export const ACCOUNT_CLASSES = [
  'retirement',
  'non_retirement',
  'inflow',
  'outflow',
  'private_reserve',
  'investment',
  'trust',
] as const;
export type AccountClass = (typeof ACCOUNT_CLASSES)[number];

export const REQUIRED_SACS_CLASSES: AccountClass[] = ['inflow', 'outflow', 'private_reserve'];

export const RETIREMENT_TYPES = ['IRA Rollover', 'Roth IRA', 'Traditional IRA', '401K', 'Other'] as const;
export const INVESTMENT_TYPES = [
  'Schwab One',
  'Schwab Brokerage',
  'Vanguard Brokerage',
  'Fidelity Brokerage',
  'Other',
] as const;
export const OTHER_NR_TYPES = [
  'Family Trust',
  'Stock Plan',
  'Cash Management',
  'Brokerage',
  'Other',
] as const;

const ssnLast4 = z
  .string()
  .trim()
  .regex(/^\d{4}$/, 'Must be exactly 4 digits');

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const dobOver18 = isoDate.refine(
  (s) => {
    const d = new Date(`${s}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return false;
    if (d.getTime() > Date.now()) return false;
    const yearsAgo = new Date();
    yearsAgo.setFullYear(yearsAgo.getFullYear() - MIN_AGE_YEARS);
    return d.getTime() <= yearsAgo.getTime();
  },
  { message: 'Person must be 18+ and DOB cannot be in the future' },
);

export const moneyCents = z.preprocess(
  (v) => (v == null || v === '' ? '0' : String(v)),
  z
    .string()
    .trim()
    .transform((s, ctx) => {
      const cleaned = s.replace(/[$,\s]/g, '');
      if (!cleaned) return 0;
      const num = Number(cleaned);
      if (!Number.isFinite(num)) {
        ctx.addIssue({ code: 'custom', message: 'Not a valid amount' });
        return z.NEVER;
      }
      if (num < 0) {
        ctx.addIssue({ code: 'custom', message: 'Must be zero or greater' });
        return z.NEVER;
      }
      return Math.round(num * 100);
    }),
);

export const interestRateBps = z
  .string()
  .trim()
  .transform((s, ctx) => {
    if (!s) return null;
    const cleaned = s.replace(/[%\s]/g, '');
    const num = Number(cleaned);
    if (!Number.isFinite(num) || num < 0) {
      ctx.addIssue({ code: 'custom', message: 'Not a valid rate' });
      return z.NEVER;
    }
    return Math.round(num * 100);
  })
  .nullable();

export const personIndexSchema = z.coerce.number().int().refine((n) => n === 1 || n === 2, {
  message: 'Person must be 1 or 2',
});

export const householdSchema = z.object({
  householdName: z.string().trim().min(1, 'Required').max(120),
  meetingCadence: z.string().trim().min(1).default('quarterly'),
  trustPropertyAddress: z.string().trim().max(240).optional().nullable(),
});

export const personSchema = z.object({
  personIndex: personIndexSchema,
  firstName: z.string().trim().min(1, 'Required').max(60),
  lastName: z.string().trim().min(1, 'Required').max(60),
  dateOfBirth: dobOver18,
  ssnLastFour: ssnLast4,
  monthlyInflowCents: moneyCents,
});

export const accountSchema = z.object({
  accountClass: z.enum(ACCOUNT_CLASSES),
  accountType: z.string().trim().min(1, 'Required').max(60),
  institution: z.string().trim().min(1, 'Required').max(60),
  accountNumberLastFour: z
    .string()
    .trim()
    .regex(/^(\d{4})?$/, 'Use 4 digits or leave blank')
    .optional()
    .or(z.literal(''))
    .transform((s) => (s ? s : null)),
  personIndex: z
    .preprocess(
      (v) => (v === '' || v == null ? null : v),
      z.coerce.number().int().refine((n) => n === 1 || n === 2, 'Person must be 1 or 2').nullable(),
    )
    .nullable(),
  isJoint: z
    .preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean())
    .default(false),
  displayOrder: z.coerce.number().int().nonnegative().default(0),
});

export const liabilitySchema = z.object({
  creditorName: z.string().trim().min(1, 'Required').max(80),
  liabilityType: z.string().trim().min(1, 'Required').max(40),
  balanceCents: moneyCents,
  interestRateBps,
  payoffDate: z
    .preprocess(
      (v) => (v === '' || v == null ? null : v),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
        .nullable(),
    )
    .nullable(),
  displayOrder: z.coerce.number().int().nonnegative().default(0),
});

export const budgetSchema = z.object({
  monthlyOutflowCents: moneyCents,
  automatedTransferDay: z.coerce
    .number()
    .int()
    .min(1, 'Must be 1–31')
    .max(31, 'Must be 1–31')
    .default(28),
  homeownerDeductibleCents: moneyCents,
  autoDeductibleCents: moneyCents,
  medicalDeductibleCents: moneyCents,
});

export type HouseholdInput = z.infer<typeof householdSchema>;
export type PersonInput = z.infer<typeof personSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
export type LiabilityInput = z.infer<typeof liabilitySchema>;
export type BudgetInput = z.infer<typeof budgetSchema>;

/**
 * Field-level validation rules consumed by the client-side
 * blur-validator (`public/vendor/forms.js`). Server is authoritative —
 * this is for instant feedback only.
 */
export const FIELD_RULES = {
  ssn: { pattern: '^\\d{4}$', message: 'Four digits.' },
  dob: { type: 'date-past-18', message: '18+ and not in the future.' },
  money: { type: 'money', message: 'Use a positive amount.' },
  rate: { type: 'rate', message: 'Use percent, e.g. 3.99' },
  required: { type: 'required', message: 'Required.' },
  last4: { pattern: '^(\\d{4})?$', message: 'Four digits or blank.' },
  day: { type: 'day-of-month', message: '1–31.' },
} as const;
