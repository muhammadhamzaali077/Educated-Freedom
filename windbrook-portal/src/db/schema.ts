/**
 * All Drizzle tables live here. Conventions (locked in CLAUDE.md §9):
 *  - id:        text primary key, defaulted via crypto.randomUUID()
 *  - timestamps: integer({ mode: 'timestamp' }) — unix seconds
 *  - money:     integer cents, NEVER floats; column names end in `_cents`
 *  - dates:     text in ISO yyyy-mm-dd (DOB, payoff date, meeting date) —
 *               kept as text to discourage analytics on sensitive fields
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const uuid = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date());
const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date());

// =============================================================================
// better-auth tables
// JS property names match better-auth's expected camelCase; DB columns are
// snake_case. better-auth reads/writes via the JS prop, so the column name is
// transparent. Keep these definitions in sync with better-auth's schema.
// =============================================================================
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const authAccount = sqliteTable('auth_account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// =============================================================================
// Windbrook domain
// =============================================================================

export const clients = sqliteTable('clients', {
  id: uuid(),
  householdName: text('household_name').notNull(),
  meetingCadence: text('meeting_cadence').notNull().default('quarterly'),
  trustPropertyAddress: text('trust_property_address'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const clientPersons = sqliteTable(
  'client_persons',
  {
    id: uuid(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    personIndex: integer('person_index').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    dateOfBirth: text('date_of_birth').notNull(),
    ssnLastFour: text('ssn_last_four').notNull(),
    monthlyInflowCents: integer('monthly_inflow_cents').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    personIndexCheck: check('client_person_index_check', sql`${t.personIndex} IN (1, 2)`),
    ssnLengthCheck: check('client_person_ssn_length', sql`length(${t.ssnLastFour}) = 4`),
  }),
);

export const accounts = sqliteTable(
  'accounts',
  {
    id: uuid(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    personIndex: integer('person_index'),
    accountClass: text('account_class', {
      enum: [
        'retirement',
        'non_retirement',
        'inflow',
        'outflow',
        'private_reserve',
        'investment',
        'trust',
      ],
    }).notNull(),
    accountType: text('account_type').notNull(),
    institution: text('institution').notNull(),
    accountNumberLastFour: text('account_number_last_four'),
    displayOrder: integer('display_order').notNull().default(0),
    isJoint: integer('is_joint', { mode: 'boolean' }).notNull().default(false),
    floorCents: integer('floor_cents').notNull().default(100000),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    // Locked rule: retirement accounts must be person-owned, never joint.
    retirementOwnership: check(
      'account_retirement_ownership',
      sql`(${t.accountClass} <> 'retirement') OR (${t.personIndex} IS NOT NULL AND ${t.isJoint} = 0)`,
    ),
    personIndexValid: check(
      'account_person_index_valid',
      sql`${t.personIndex} IS NULL OR ${t.personIndex} IN (1, 2)`,
    ),
  }),
);

export const liabilities = sqliteTable('liabilities', {
  id: uuid(),
  clientId: text('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  creditorName: text('creditor_name').notNull(),
  liabilityType: text('liability_type').notNull(),
  balanceCents: integer('balance_cents').notNull(),
  interestRateBps: integer('interest_rate_bps'),
  payoffDate: text('payoff_date'),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const expenseBudget = sqliteTable('expense_budget', {
  id: uuid(),
  clientId: text('client_id')
    .notNull()
    .unique()
    .references(() => clients.id, { onDelete: 'cascade' }),
  monthlyOutflowCents: integer('monthly_outflow_cents').notNull(),
  automatedTransferDay: integer('automated_transfer_day').notNull().default(28),
  homeownerDeductibleCents: integer('homeowner_deductible_cents').notNull().default(0),
  autoDeductibleCents: integer('auto_deductible_cents').notNull().default(0),
  medicalDeductibleCents: integer('medical_deductible_cents').notNull().default(0),
  updatedAt: updatedAt(),
});

export const reports = sqliteTable(
  'reports',
  {
    id: uuid(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    reportType: text('report_type', { enum: ['SACS', 'TCC'] }).notNull(),
    meetingDate: text('meeting_date').notNull(),
    generatedAt: integer('generated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    generatedByUserId: text('generated_by_user_id')
      .notNull()
      .references(() => user.id),
    snapshotJson: text('snapshot_json').notNull(),
    pdfPath: text('pdf_path'),
    canvaDesignId: text('canva_design_id'),
    canvaEditUrl: text('canva_edit_url'),
    status: text('status', { enum: ['draft', 'final'] })
      .notNull()
      .default('draft'),
  },
  (t) => ({
    clientMeetingIdx: index('reports_client_meeting_idx').on(t.clientId, t.meetingDate),
  }),
);

export const accountBalanceSnapshots = sqliteTable('account_balance_snapshots', {
  id: uuid(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  balanceCents: integer('balance_cents').notNull(),
  cashBalanceCents: integer('cash_balance_cents'),
  asOfDate: text('as_of_date').notNull(),
  isStale: integer('is_stale', { mode: 'boolean' }).notNull().default(false),
  recordedInReportId: text('recorded_in_report_id').references(() => reports.id, {
    onDelete: 'cascade',
  }),
});

/**
 * Per-user Canva Connect API credentials. Tokens stored AES-GCM encrypted —
 * key derived from BETTER_AUTH_SECRET. UNIQUE on user_id so re-connecting
 * upserts (we never want two rows per user).
 */
export const canvaCredentials = sqliteTable('canva_credentials', {
  id: uuid(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  scope: text('scope'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Phase 7 will populate; column structure created now so migrations are stable.
export const bubbleLayouts = sqliteTable('bubble_layouts', {
  id: uuid(),
  clientId: text('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  reportType: text('report_type', { enum: ['SACS', 'TCC'] }).notNull(),
  layoutJson: text('layout_json').notNull(),
  updatedAt: updatedAt(),
});
