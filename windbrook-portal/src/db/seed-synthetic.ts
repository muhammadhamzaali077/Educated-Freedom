/**
 * Synthetic-data seed — three client households per PRD §Prototype, each
 * with 4 quarters of report history (SACS + TCC) for the demo walkthrough.
 *
 * Production gate
 * ---------------
 * Wired into `package.json` `start` so it runs on every Railway boot.
 * Gated on the `ENABLE_SYNTHETIC_SEED` env var:
 *   ENABLE_SYNTHETIC_SEED=1   → seed runs (prototype walkthrough environment)
 *   anything else / unset     → exits immediately, no demo data
 * Set the env var in Railway → service → Variables for the prototype
 * deploy; remove it before V1 production handover so customer DBs don't
 * get demo accounts dropped in.
 *
 * Idempotency
 * -----------
 * Two layers of skip:
 *   1. If any of the three seed households already exists by householdName,
 *      the whole script exits with "data already present" — fast no-op for
 *      every redeploy after the first.
 *   2. The per-client loop also checks each name before insert (defensive
 *      — handles partial-run states where 1 of 3 was inserted before crash).
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from './client.js';
import * as schema from './schema.js';
import { computeReport, type ReportInputs } from '../lib/calculations.js';
import { defaultTccAssignments } from '../lib/layouts.js';

// Production gate — bail before any DB reads/writes if the prototype-data
// flag isn't set. ESM hoists static imports above this, so opening the
// SQLite connection in client.js still happens (~1 ms) but we exit
// before any real work. To gate before DB open, refactor all imports
// to dynamic `await import(...)` calls below this block.
if (process.env.ENABLE_SYNTHETIC_SEED !== '1') {
  console.log('[seed:synthetic] ENABLE_SYNTHETIC_SEED != 1, skipping');
  process.exit(0);
}

const $ = (d: number) => Math.round(d * 100);

const QUARTERS = [
  { meetingDate: '2025-04-21', multiplier: 0.92, label: 'Q2 2025' },
  { meetingDate: '2025-07-21', multiplier: 0.95, label: 'Q3 2025' },
  { meetingDate: '2025-10-21', multiplier: 0.97, label: 'Q4 2025' },
  { meetingDate: '2026-01-21', multiplier: 1.0, label: 'Q1 2026' },
];

type AccountClass = 'inflow' | 'outflow' | 'private_reserve' | 'investment' | 'retirement' | 'non_retirement' | 'trust';

interface SeedAccount {
  accountClass: AccountClass;
  accountType: string;
  institution: string;
  accountNumberLastFour: string | null;
  personIndex: number | null;
  isJoint: boolean;
  /** Current-quarter (Q1 2026) baseline balance in dollars. */
  baselineDollars: number;
  cashBaselineDollars?: number;
  /** Quarters where this balance was carried forward as "use last". */
  staleAtQuarters?: string[];
}

interface SeedLiability {
  creditorName: string;
  liabilityType: string;
  baselineBalanceDollars: number;
  rateBps: number | null;
  payoffDate: string | null;
}

interface SeedClient {
  householdName: string;
  trustPropertyAddress: string;
  persons: Array<{ index: 1 | 2; firstName: string; lastName: string; dob: string; ssn: string; monthlyInflowDollars: number }>;
  accounts: SeedAccount[];
  budget: {
    monthlyOutflowDollars: number;
    automatedTransferDay: number;
    homeownerDeductibleDollars: number;
    autoDeductibleDollars: number;
    medicalDeductibleDollars: number;
  };
  liabilities: SeedLiability[];
}

// =============================================================================
// Three household templates (PRD §Prototype shapes)
// =============================================================================
const SEED_CLIENTS: SeedClient[] = [
  {
    householdName: 'Cole Household',
    trustPropertyAddress: '47 Linden Ct, Atlanta GA',
    persons: [
      { index: 1, firstName: 'Marcus', lastName: 'Cole', dob: '1979-03-12', ssn: '7124', monthlyInflowDollars: 14500 },
    ],
    accounts: [
      { accountClass: 'inflow', accountType: 'Inflow', institution: 'Pinnacle', accountNumberLastFour: '0181', personIndex: null, isJoint: true, baselineDollars: 8500, cashBaselineDollars: 1200 },
      { accountClass: 'outflow', accountType: 'Outflow', institution: 'Pinnacle', accountNumberLastFour: '0182', personIndex: null, isJoint: true, baselineDollars: 4500, cashBaselineDollars: 800 },
      { accountClass: 'private_reserve', accountType: 'Private Reserve', institution: 'Pinnacle', accountNumberLastFour: '0183', personIndex: null, isJoint: true, baselineDollars: 38000, cashBaselineDollars: 1000 },
      { accountClass: 'retirement', accountType: 'Roth IRA', institution: 'Vanguard', accountNumberLastFour: '4471', personIndex: 1, isJoint: false, baselineDollars: 145000, staleAtQuarters: ['Q3 2025'] },
      { accountClass: 'retirement', accountType: 'IRA Rollover', institution: 'Vanguard', accountNumberLastFour: '4472', personIndex: 1, isJoint: false, baselineDollars: 312000 },
      { accountClass: 'retirement', accountType: '401K', institution: 'Vanguard', accountNumberLastFour: '4473', personIndex: 1, isJoint: false, baselineDollars: 198500 },
      { accountClass: 'investment', accountType: 'Schwab One', institution: 'Schwab', accountNumberLastFour: '8821', personIndex: null, isJoint: true, baselineDollars: 84000 },
      { accountClass: 'trust', accountType: 'Family Trust', institution: 'Cole Family Trust', accountNumberLastFour: null, personIndex: null, isJoint: true, baselineDollars: 785000 },
    ],
    budget: {
      monthlyOutflowDollars: 11500,
      automatedTransferDay: 20,
      homeownerDeductibleDollars: 2500,
      autoDeductibleDollars: 1000,
      medicalDeductibleDollars: 3000,
    },
    liabilities: [
      { creditorName: 'Lakeview Mortgage', liabilityType: 'Mortgage', baselineBalanceDollars: 412000, rateBps: 399, payoffDate: '2049-06-01' },
    ],
  },

  {
    householdName: 'Lipski Family',
    trustPropertyAddress: '128 Oakhill Pl, Atlanta GA',
    persons: [
      { index: 1, firstName: 'Jonathan', lastName: 'Lipski', dob: '1968-04-12', ssn: '4321', monthlyInflowDollars: 22000 },
      { index: 2, firstName: 'Sandra', lastName: 'Lipski', dob: '1970-11-03', ssn: '8765', monthlyInflowDollars: 0 },
    ],
    accounts: [
      { accountClass: 'inflow', accountType: 'Inflow', institution: 'Pinnacle', accountNumberLastFour: '1102', personIndex: null, isJoint: true, baselineDollars: 14200, cashBaselineDollars: 1500 },
      { accountClass: 'outflow', accountType: 'Outflow', institution: 'Pinnacle', accountNumberLastFour: '1103', personIndex: null, isJoint: true, baselineDollars: 6500, cashBaselineDollars: 1000 },
      { accountClass: 'private_reserve', accountType: 'Private Reserve', institution: 'Pinnacle', accountNumberLastFour: '1104', personIndex: null, isJoint: true, baselineDollars: 96500, cashBaselineDollars: 1000 },
      { accountClass: 'retirement', accountType: 'Roth IRA', institution: 'Schwab', accountNumberLastFour: '5511', personIndex: 1, isJoint: false, baselineDollars: 218000 },
      { accountClass: 'retirement', accountType: 'IRA Rollover', institution: 'Schwab', accountNumberLastFour: '5512', personIndex: 1, isJoint: false, baselineDollars: 487000, staleAtQuarters: ['Q4 2025'] },
      { accountClass: 'retirement', accountType: 'Roth IRA', institution: 'Schwab', accountNumberLastFour: '6611', personIndex: 2, isJoint: false, baselineDollars: 132000 },
      { accountClass: 'retirement', accountType: 'IRA Rollover', institution: 'Schwab', accountNumberLastFour: '6612', personIndex: 2, isJoint: false, baselineDollars: 255000 },
      { accountClass: 'investment', accountType: 'Schwab One', institution: 'Schwab', accountNumberLastFour: '9911', personIndex: null, isJoint: true, baselineDollars: 165000 },
      { accountClass: 'non_retirement', accountType: 'Stock Plan', institution: 'Computershare', accountNumberLastFour: '7301', personIndex: 1, isJoint: false, baselineDollars: 78000 },
      { accountClass: 'trust', accountType: 'Family Trust', institution: 'Lipski Family Trust', accountNumberLastFour: null, personIndex: null, isJoint: true, baselineDollars: 1250000 },
    ],
    budget: {
      monthlyOutflowDollars: 17500,
      automatedTransferDay: 20,
      homeownerDeductibleDollars: 5000,
      autoDeductibleDollars: 1000,
      medicalDeductibleDollars: 4500,
    },
    liabilities: [
      { creditorName: 'Lakeview Mortgage', liabilityType: 'Mortgage', baselineBalanceDollars: 685000, rateBps: 425, payoffDate: '2050-04-01' },
      { creditorName: 'GM Financial', liabilityType: 'Auto', baselineBalanceDollars: 28500, rateBps: 549, payoffDate: '2027-08-15' },
    ],
  },

  {
    householdName: 'Park-Rivera Family',
    trustPropertyAddress: '203 Crestwood Dr, Atlanta GA',
    persons: [
      { index: 1, firstName: 'Daniel', lastName: 'Park', dob: '1975-09-22', ssn: '3344', monthlyInflowDollars: 35000 },
      { index: 2, firstName: 'Ana', lastName: 'Rivera', dob: '1977-02-08', ssn: '5566', monthlyInflowDollars: 18000 },
    ],
    accounts: [
      { accountClass: 'inflow', accountType: 'Inflow', institution: 'Pinnacle', accountNumberLastFour: '2201', personIndex: null, isJoint: true, baselineDollars: 21500, cashBaselineDollars: 2500 },
      { accountClass: 'outflow', accountType: 'Outflow', institution: 'Pinnacle', accountNumberLastFour: '2202', personIndex: null, isJoint: true, baselineDollars: 9800, cashBaselineDollars: 1500 },
      { accountClass: 'private_reserve', accountType: 'Private Reserve', institution: 'Pinnacle', accountNumberLastFour: '2203', personIndex: null, isJoint: true, baselineDollars: 145000, cashBaselineDollars: 1000 },
      { accountClass: 'retirement', accountType: 'Roth IRA', institution: 'Vanguard', accountNumberLastFour: '7711', personIndex: 1, isJoint: false, baselineDollars: 285000 },
      { accountClass: 'retirement', accountType: 'IRA Rollover', institution: 'Vanguard', accountNumberLastFour: '7712', personIndex: 1, isJoint: false, baselineDollars: 615000, staleAtQuarters: ['Q2 2025'] },
      { accountClass: 'retirement', accountType: '401K', institution: 'Vanguard', accountNumberLastFour: '7713', personIndex: 1, isJoint: false, baselineDollars: 422000 },
      { accountClass: 'retirement', accountType: 'Other', institution: 'Fidelity', accountNumberLastFour: '7714', personIndex: 1, isJoint: false, baselineDollars: 125000 },
      { accountClass: 'retirement', accountType: 'Roth IRA', institution: 'Vanguard', accountNumberLastFour: '8811', personIndex: 2, isJoint: false, baselineDollars: 178000 },
      { accountClass: 'retirement', accountType: 'IRA Rollover', institution: 'Vanguard', accountNumberLastFour: '8812', personIndex: 2, isJoint: false, baselineDollars: 295000 },
      { accountClass: 'retirement', accountType: 'Other', institution: 'Vanguard SEP', accountNumberLastFour: '8813', personIndex: 2, isJoint: false, baselineDollars: 88000, staleAtQuarters: ['Q3 2025', 'Q4 2025'] },
      { accountClass: 'investment', accountType: 'Schwab One', institution: 'Schwab', accountNumberLastFour: '9921', personIndex: 1, isJoint: false, baselineDollars: 215000 },
      { accountClass: 'investment', accountType: 'Schwab Brokerage', institution: 'Schwab', accountNumberLastFour: '9922', personIndex: null, isJoint: true, baselineDollars: 380000 },
      { accountClass: 'non_retirement', accountType: 'Cash Management', institution: 'StoneCastle', accountNumberLastFour: '5501', personIndex: null, isJoint: true, baselineDollars: 195000 },
      { accountClass: 'non_retirement', accountType: 'Stock Plan', institution: 'Computershare ESPP', accountNumberLastFour: '5502', personIndex: 1, isJoint: false, baselineDollars: 72000 },
      { accountClass: 'trust', accountType: 'Family Trust', institution: 'Park-Rivera Trust', accountNumberLastFour: null, personIndex: null, isJoint: true, baselineDollars: 2100000 },
    ],
    budget: {
      monthlyOutflowDollars: 28000,
      automatedTransferDay: 20,
      homeownerDeductibleDollars: 7500,
      autoDeductibleDollars: 1000,
      medicalDeductibleDollars: 5000,
    },
    liabilities: [
      { creditorName: 'Lakeview Mortgage', liabilityType: 'Mortgage', baselineBalanceDollars: 1075000, rateBps: 475, payoffDate: '2052-09-01' },
      { creditorName: 'GM Financial', liabilityType: 'Auto', baselineBalanceDollars: 42000, rateBps: 549, payoffDate: '2027-12-01' },
      { creditorName: 'Lexus Financial', liabilityType: 'Auto', baselineBalanceDollars: 31500, rateBps: 489, payoffDate: '2028-04-01' },
    ],
  },
];

// =============================================================================
// Insert
// =============================================================================
async function getGeneratorUserId(): Promise<string> {
  const rows = await db.select().from(schema.user).limit(1);
  if (rows.length === 0) {
    throw new Error('No seeded users — run `pnpm db:seed` first.');
  }
  return rows[0]!.id;
}

async function clientExists(name: string): Promise<boolean> {
  const r = await db.select().from(schema.clients).where(eq(schema.clients.householdName, name));
  return r.length > 0;
}

async function insertClient(template: SeedClient): Promise<string> {
  const [client] = await db
    .insert(schema.clients)
    .values({
      householdName: template.householdName,
      meetingCadence: 'quarterly',
      trustPropertyAddress: template.trustPropertyAddress,
    })
    .returning();
  if (!client) throw new Error('insert client failed');

  for (const p of template.persons) {
    await db.insert(schema.clientPersons).values({
      clientId: client.id,
      personIndex: p.index,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dob,
      ssnLastFour: p.ssn,
      monthlyInflowCents: $(p.monthlyInflowDollars),
    });
  }

  await db.insert(schema.expenseBudget).values({
    clientId: client.id,
    monthlyOutflowCents: $(template.budget.monthlyOutflowDollars),
    automatedTransferDay: template.budget.automatedTransferDay,
    homeownerDeductibleCents: $(template.budget.homeownerDeductibleDollars),
    autoDeductibleCents: $(template.budget.autoDeductibleDollars),
    medicalDeductibleCents: $(template.budget.medicalDeductibleDollars),
  });

  for (let i = 0; i < template.accounts.length; i++) {
    const a = template.accounts[i]!;
    await db.insert(schema.accounts).values({
      clientId: client.id,
      accountClass: a.accountClass,
      accountType: a.accountType,
      institution: a.institution,
      accountNumberLastFour: a.accountNumberLastFour,
      personIndex: a.personIndex,
      isJoint: a.isJoint,
      displayOrder: i,
      floorCents: 100_000,
    });
  }

  for (let i = 0; i < template.liabilities.length; i++) {
    const l = template.liabilities[i]!;
    await db.insert(schema.liabilities).values({
      clientId: client.id,
      creditorName: l.creditorName,
      liabilityType: l.liabilityType,
      balanceCents: $(l.baselineBalanceDollars),
      interestRateBps: l.rateBps,
      payoffDate: l.payoffDate,
      displayOrder: i,
    });
  }

  return client.id;
}

async function generateQuarterlyHistory(
  clientId: string,
  template: SeedClient,
  generatorUserId: string,
): Promise<number> {
  const accountRows = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.clientId, clientId));
  const liabilityRows = await db
    .select()
    .from(schema.liabilities)
    .where(eq(schema.liabilities.clientId, clientId));

  const baselineByType = new Map(
    template.accounts.map((a) => [`${a.accountClass}|${a.accountType}|${a.accountNumberLastFour ?? ''}`, a]),
  );
  const liabBaselineByCreditor = new Map(
    template.liabilities.map((l) => [l.creditorName, l]),
  );

  let totalReports = 0;
  for (const q of QUARTERS) {
    for (const reportType of ['SACS', 'TCC'] as const) {
      const balances = accountRows.map((acc) => {
        const baseline = baselineByType.get(
          `${acc.accountClass}|${acc.accountType}|${acc.accountNumberLastFour ?? ''}`,
        );
        const baseDollars = baseline?.baselineDollars ?? 0;
        const cashDollars = baseline?.cashBaselineDollars;
        const isStale = (baseline?.staleAtQuarters ?? []).includes(q.label);
        // For stale entries, use the prior quarter's value (one multiplier step behind)
        const effective = isStale ? Math.max(0, q.multiplier - 0.03) : q.multiplier;
        const balanceCents = Math.round($(baseDollars) * effective);
        const cashBalanceCents =
          cashDollars != null ? Math.round($(cashDollars) * effective) : null;
        return {
          accountId: acc.id,
          balanceCents,
          cashBalanceCents,
          isStale,
        };
      });

      // Liabilities: small monthly paydown
      const liabilityBalances = liabilityRows.map((l) => {
        const baseline = liabBaselineByCreditor.get(l.creditorName);
        const base = $(baseline?.baselineBalanceDollars ?? l.balanceCents / 100);
        // Paydown: ~1% per quarter from oldest to current
        const stepsBack = QUARTERS.findIndex((qq) => qq.label === q.label);
        const paydown = base * (0.01 * (QUARTERS.length - 1 - stepsBack));
        return { liabilityId: l.id, balanceCents: Math.max(0, Math.round(base + paydown)) };
      });

      // Build calc inputs from balances + budget
      const balanceById = new Map(balances.map((b) => [b.accountId, b.balanceCents]));
      const monthlyInflowCents = template.persons.reduce((s, p) => s + $(p.monthlyInflowDollars), 0);
      const monthlyOutflowCents = $(template.budget.monthlyOutflowDollars);

      const retirementP1 = accountRows
        .filter((a) => a.accountClass === 'retirement' && a.personIndex === 1)
        .map((a) => ({ balanceCents: balanceById.get(a.id) ?? 0 }));
      const retirementP2 = accountRows
        .filter((a) => a.accountClass === 'retirement' && a.personIndex === 2)
        .map((a) => ({ balanceCents: balanceById.get(a.id) ?? 0 }));
      const nonRet = accountRows
        .filter((a) => a.accountClass === 'non_retirement' || a.accountClass === 'investment')
        .map((a) => ({ balanceCents: balanceById.get(a.id) ?? 0 }));
      const trustValueCents = accountRows
        .filter((a) => a.accountClass === 'trust')
        .reduce((s, a) => s + (balanceById.get(a.id) ?? 0), 0);

      const inputs: ReportInputs = {
        monthlyInflowCents,
        monthlyOutflowCents,
        homeownerDeductibleCents: $(template.budget.homeownerDeductibleDollars),
        autoDeductibleCents: $(template.budget.autoDeductibleDollars),
        medicalDeductibleCents: $(template.budget.medicalDeductibleDollars),
        retirementAccountsP1: retirementP1,
        retirementAccountsP2: retirementP2,
        nonRetirementAccounts: nonRet,
        trustValueCents,
        liabilities: liabilityBalances,
      };
      const totals = computeReport(inputs);

      const layoutAssignments = defaultTccAssignments(accountRows);
      const snapshotJson = JSON.stringify({
        inputs,
        totals,
        balances,
        liabilityBalances,
        layoutUsed: { type: reportType, assignments: layoutAssignments },
      });

      const generatedAt = new Date(`${q.meetingDate}T14:30:00`);
      const [created] = await db
        .insert(schema.reports)
        .values({
          clientId,
          reportType,
          meetingDate: q.meetingDate,
          generatedAt,
          generatedByUserId: generatorUserId,
          snapshotJson,
          status: 'final',
        })
        .returning();

      if (!created) throw new Error('failed to insert report');
      await db.insert(schema.accountBalanceSnapshots).values(
        balances.map((b) => ({
          accountId: b.accountId,
          balanceCents: b.balanceCents,
          cashBalanceCents: b.cashBalanceCents,
          asOfDate: q.meetingDate,
          isStale: b.isStale,
          recordedInReportId: created.id,
        })),
      );
      totalReports++;
    }
  }
  return totalReports;
}

async function main() {
  // Whole-script idempotency — if ANY of the seed households already
  // exists, exit immediately. Cheap pre-check that avoids opening the
  // expensive quarterly-report-generation loop on every redeploy.
  for (const tmpl of SEED_CLIENTS) {
    if (await clientExists(tmpl.householdName)) {
      console.log('[seed:synthetic] data already present, skipping');
      process.exit(0);
    }
  }

  console.log('[seed:synthetic] seeding 3 synthetic clients with 4 quarters of history…');

  const generatorUserId = await getGeneratorUserId();

  let totalClients = 0;
  let totalReports = 0;
  for (const tmpl of SEED_CLIENTS) {
    // Defensive per-client check (handles a partial-run crash state).
    if (await clientExists(tmpl.householdName)) {
      console.log(`[seed:synthetic] ✓ ${tmpl.householdName} already exists, skipping`);
      continue;
    }
    const clientId = await insertClient(tmpl);
    const reportCount = await generateQuarterlyHistory(clientId, tmpl, generatorUserId);
    totalClients++;
    totalReports += reportCount;
    console.log(`[seed:synthetic] ✓ ${tmpl.householdName} (${clientId}) — ${reportCount} reports`);
  }

  console.log(`[seed:synthetic] inserted ${totalClients} clients · ${totalReports} reports`);
  process.exit(0);
}

await main();
