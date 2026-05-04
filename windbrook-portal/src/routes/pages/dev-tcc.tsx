import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { renderTccSvg, type TccBubble, type TccSnapshot } from '../../reports/tcc/render.js';
import type { AuthVars } from '../../middleware/auth.js';
import { DevTccDiffPage } from '../../views/pages/dev-tcc-diff.js';
import { loadClient } from '../../lib/clients.js';
import { defaultTccAssignments } from '../../lib/layouts.js';
import { loadAccountsWithLatestSnapshots, buildReportInputs } from '../../lib/reports.js';

const app = new Hono<{ Variables: AuthVars }>();

const REFERENCE_PNG_PATH = join(process.cwd(), 'docs', 'references', 'TCC-reference.png');

app.get('/dev/refs/tcc.png', (c) => {
  const bytes = readFileSync(REFERENCE_PNG_PATH);
  c.header('Content-Type', 'image/png');
  c.header('Cache-Control', 'private, max-age=3600');
  return c.body(new Uint8Array(bytes));
});

app.get('/dev/tcc-diff', (c) => {
  const user = c.get('user');
  const role = (user as { role?: string | null }).role ?? null;

  const rows = [
    { label: '1 retirement / side · single client', svg: renderTccSvg(fixture(1, false)).page1 },
    { label: '3 retirement / side · couple', svg: renderTccSvg(fixture(3, true)).page1 },
    { label: '6 retirement / side · couple (stale flags on)', svg: renderTccSvg(fixture(6, true, true)).page1 },
  ];

  return c.html(<DevTccDiffPage userName={user.name} userRole={role} rows={rows} />);
});

/**
 * /dev/tcc-diff/:clientId — render a real client's TCC side-by-side with the
 * Sagan template image. Pulls each account's latest snapshot, builds the
 * default layout, and renders without persisting a report. Useful for
 * verifying that bug fixes (private_reserve inclusion, symmetric fill,
 * vertical rhythm) match the docx template against a known household.
 */
app.get('/dev/tcc-diff/:clientId', async (c) => {
  const user = c.get('user');
  const role = (user as { role?: string | null }).role ?? null;
  const clientId = c.req.param('clientId');

  const client = await loadClient(clientId);
  if (!client) return c.notFound();

  const snapshots = await loadAccountsWithLatestSnapshots(clientId);
  const balances = new Map<string, number>();
  const cashByAccount = new Map<string, number | null>();
  const staleByAccount = new Map<string, boolean>();
  for (const { account, latest } of snapshots) {
    balances.set(account.id, latest?.balanceCents ?? 0);
    cashByAccount.set(account.id, latest?.cashBalanceCents ?? null);
    staleByAccount.set(account.id, latest == null);
  }
  const liabBalances = new Map<string, number>(client.liabilities.map((l) => [l.id, l.balanceCents]));

  const { totals } = await buildReportInputs(clientId, balances, liabBalances);
  const layout = { type: 'TCC' as const, assignments: defaultTccAssignments(client.accounts) };
  const meetingDate = new Date().toISOString().slice(0, 10);

  const trustAccount = client.accounts.find((a) => a.accountClass === 'trust');
  const buildBubble = (a: (typeof client.accounts)[number]): TccBubble | null => {
    const slotId = layout.assignments[a.id];
    if (!slotId) return null;
    return {
      accountId: a.id,
      slotId,
      accountType: a.accountType,
      institution: a.institution,
      accountNumberLastFour: a.accountNumberLastFour,
      balanceCents: balances.get(a.id) ?? 0,
      cashCents: cashByAccount.get(a.id) ?? null,
      asOfDate: meetingDate,
      isStale: staleByAccount.get(a.id) ?? false,
    };
  };

  const snapshot: TccSnapshot = {
    householdName: client.client.householdName,
    meetingDate,
    asOfDate: meetingDate,
    persons: client.persons.map((p) => ({
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth,
      ssnLastFour: p.ssnLastFour,
    })),
    retirementBubbles: client.accounts
      .filter((a) => a.accountClass === 'retirement')
      .map(buildBubble)
      .filter((b): b is TccBubble => b != null),
    nonRetirementBubbles: client.accounts
      .filter(
        (a) =>
          a.accountClass === 'non_retirement' ||
          a.accountClass === 'investment' ||
          a.accountClass === 'private_reserve',
      )
      .map(buildBubble)
      .filter((b): b is TccBubble => b != null),
    trust: {
      valueCents: trustAccount ? (balances.get(trustAccount.id) ?? 0) : 0,
      asOfDate: meetingDate,
      isStale: trustAccount ? (staleByAccount.get(trustAccount.id) ?? false) : false,
    },
    liabilities: client.liabilities.map((l) => ({
      creditorName: l.creditorName,
      liabilityType: l.liabilityType,
      balanceCents: l.balanceCents,
      interestRateBps: l.interestRateBps,
      payoffDate: l.payoffDate,
      isStale: false,
    })),
    totals: {
      p1RetirementCents: totals.p1RetirementCents,
      p2RetirementCents: totals.p2RetirementCents,
      nonRetirementCents: totals.nonRetirementCents,
      trustCents: totals.trustCents,
      grandTotalCents: totals.grandTotalCents,
      liabilitiesTotalCents: totals.liabilitiesTotalCents,
    },
    staleFields: new Set<string>(),
  };

  const rows = [
    {
      label: `${client.client.householdName} · live snapshot`,
      svg: renderTccSvg(snapshot).page1,
    },
  ];

  return c.html(<DevTccDiffPage userName={user.name} userRole={role} rows={rows} />);
});

const $ = (d: number) => Math.round(d * 100);

function fixture(perSideCount: number, dual: boolean, stale = false): TccSnapshot {
  const bubblesP1: TccBubble[] = Array.from({ length: perSideCount }, (_, i) => ({
    accountId: `dev-p1-${i + 1}`,
    slotId: `p1-${i + 1}`,
    accountType: ['Roth IRA', 'IRA Rollover', '401K', 'Trad IRA', 'SEP IRA', 'Roth 401K'][i] ?? 'IRA',
    institution: 'Schwab',
    accountNumberLastFour: String(1000 + i),
    balanceCents: $([128000, 215500, 87200, 64500, 41000, 23000][i] ?? 50000),
    cashCents: $(5000),
    asOfDate: '2026-01-21',
    isStale: stale && i % 2 === 0,
  }));
  const bubblesP2: TccBubble[] = dual
    ? Array.from({ length: perSideCount }, (_, i) => ({
        accountId: `dev-p2-${i + 1}`,
        slotId: `p2-${i + 1}`,
        accountType: ['401K', 'Roth IRA', 'IRA Rollover', 'Trad IRA', 'SEP IRA', 'Roth 401K'][i] ?? 'IRA',
        institution: 'Vanguard',
        accountNumberLastFour: String(2000 + i),
        balanceCents: $([87200, 110000, 75000, 56000, 32000, 18000][i] ?? 40000),
        cashCents: $(3000),
        asOfDate: '2026-01-21',
        isStale: stale && i === 1,
      }))
    : [];

  const nonRetCount = Math.min(perSideCount, 4);
  const nonRetBubbles: TccBubble[] = Array.from({ length: nonRetCount * 2 }, (_, i) => {
    const side = i < nonRetCount ? 'l' : 'r';
    const idx = (i % nonRetCount) + 1;
    const types = ['Brokerage', 'Stock Plan', 'Cash Mgmt', 'Brokerage'];
    const insts = ['Wells Fargo', 'Computershare', 'StoneCastle', 'Schwab'];
    return {
      accountId: `dev-nr-${i + 1}`,
      slotId: `nr-${side}-${idx}`,
      accountType: types[i % 4] ?? 'Brokerage',
      institution: insts[i % 4] ?? '',
      accountNumberLastFour: String(3000 + i),
      balanceCents: $([45000, 32000, 18000, 22500][i % 4] ?? 25000),
      cashCents: $(2000),
      asOfDate: '2026-01-21',
      isStale: stale && i === 0,
    };
  });

  const persons = dual
    ? [
        { firstName: 'Jonathan', lastName: 'Lipski', dateOfBirth: '1975-04-12', ssnLastFour: '4321' },
        { firstName: 'Sandra', lastName: 'Lipski', dateOfBirth: '1977-11-03', ssnLastFour: '8765' },
      ]
    : [{ firstName: 'Maya', lastName: 'Reeves', dateOfBirth: '1982-07-04', ssnLastFour: '5544' }];

  const p1Total = bubblesP1.reduce((s, b) => s + b.balanceCents, 0);
  const p2Total = bubblesP2.reduce((s, b) => s + b.balanceCents, 0);
  const nrTotal = nonRetBubbles.reduce((s, b) => s + b.balanceCents, 0);
  const trustValue = $(750000);
  const liabilities = [
    { creditorName: 'Lakeview Mortgage', liabilityType: 'Mortgage', balanceCents: $(325000), interestRateBps: 399, payoffDate: '2050-04-01', isStale: stale },
    { creditorName: 'GM Financial', liabilityType: 'Auto', balanceCents: $(24500), interestRateBps: 549, payoffDate: '2027-08-15', isStale: false },
    { creditorName: 'Capital One', liabilityType: 'Credit Card', balanceCents: $(2500), interestRateBps: 2199, payoffDate: null, isStale: false },
  ];
  const liabTotal = liabilities.reduce((s, l) => s + l.balanceCents, 0);

  return {
    householdName: dual ? 'Lipski Family' : 'Reeves Household',
    meetingDate: '2026-04-21',
    asOfDate: '2026-01-21',
    persons,
    retirementBubbles: [...bubblesP1, ...bubblesP2],
    nonRetirementBubbles: nonRetBubbles,
    trust: { valueCents: trustValue, asOfDate: '2026-01-21', isStale: stale },
    liabilities,
    totals: {
      p1RetirementCents: p1Total,
      p2RetirementCents: p2Total,
      nonRetirementCents: nrTotal,
      trustCents: trustValue,
      grandTotalCents: p1Total + p2Total + nrTotal + trustValue,
      liabilitiesTotalCents: liabTotal,
    },
    staleFields: stale ? new Set(['p1-1', 'p2-2', 'trust', 'lakeview']) : new Set<string>(),
  };
}

export default app;
