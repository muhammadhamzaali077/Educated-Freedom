import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  accountBalanceSnapshots,
  accounts,
  clientPersons,
  clients,
  expenseBudget,
  liabilities,
  reports,
  user,
} from '../db/schema.js';
import { renderSacsSvg, type SacsSnapshot } from '../reports/sacs/render.js';
import { renderTccSvg, type TccBubble, type TccSnapshot } from '../reports/tcc/render.js';
import {
  type ReportInputs,
  type ReportTotals,
  computeReport,
} from './calculations.js';
import {
  type AccountRow,
  type FullClient,
  type LiabilityRow,
  type SnapshotRow,
  loadClient,
} from './clients.js';
import {
  defaultSacsAssignments,
  defaultTccAssignments,
  type LayoutPayload,
} from './layouts.js';

export type AccountSnapshot = {
  account: AccountRow;
  latest: SnapshotRow | null;
};

export type LiabilityWithLatest = {
  liability: LiabilityRow;
  /** Liability "latest" is the row's own balance + updated_at, since liabilities
   * aren't snapshotted in a dedicated table — `liabilities.balance_cents` is
   * always the most recently saved value. */
  latestBalanceCents: number;
  latestAsOf: string | Date;
};

export async function loadAccountsWithLatestSnapshots(
  clientId: string,
): Promise<AccountSnapshot[]> {
  const accountRows = await db.select().from(accounts).where(eq(accounts.clientId, clientId));
  if (accountRows.length === 0) return [];

  const ids = accountRows.map((a) => a.id);
  const snaps = await db
    .select()
    .from(accountBalanceSnapshots)
    .orderBy(desc(accountBalanceSnapshots.asOfDate));

  const latestByAcct = new Map<string, SnapshotRow>();
  for (const s of snaps) {
    if (!ids.includes(s.accountId)) continue;
    if (!latestByAcct.has(s.accountId)) latestByAcct.set(s.accountId, s);
  }

  return accountRows.map((account) => ({
    account,
    latest: latestByAcct.get(account.id) ?? null,
  }));
}

export async function loadLiabilitiesWithLatest(clientId: string): Promise<LiabilityWithLatest[]> {
  const rows = await db
    .select()
    .from(liabilities)
    .where(eq(liabilities.clientId, clientId));
  return rows.map((row) => ({
    liability: row,
    latestBalanceCents: row.balanceCents,
    latestAsOf: row.updatedAt,
  }));
}

/**
 * Build ReportInputs from a client + a map of submitted (or pre-filled) balances.
 * `balances` keys are account IDs; values are integer cents.
 * `liabilityBalances` keys are liability IDs; values are integer cents.
 * `trustOverrideCents` lets the caller specify the trust property value directly
 * when there is no class='trust' account; if omitted, trust accounts in the DB
 * are summed.
 */
export async function buildReportInputs(
  clientId: string,
  balances: Map<string, number>,
  liabilityBalances: Map<string, number>,
  trustOverrideCents?: number,
): Promise<{
  inputs: ReportInputs;
  totals: ReportTotals;
}> {
  const data = await loadClient(clientId);
  if (!data) throw new Error(`Client ${clientId} not found`);

  const monthlyInflowCents = data.persons.reduce((sum, p) => sum + p.monthlyInflowCents, 0);
  const monthlyOutflowCents = data.budget?.monthlyOutflowCents ?? 0;
  const homeownerDeductibleCents = data.budget?.homeownerDeductibleCents ?? 0;
  const autoDeductibleCents = data.budget?.autoDeductibleCents ?? 0;
  const medicalDeductibleCents = data.budget?.medicalDeductibleCents ?? 0;

  const balOf = (id: string) => balances.get(id) ?? 0;

  const retirementAccountsP1 = data.accounts
    .filter((a) => a.accountClass === 'retirement' && a.personIndex === 1)
    .map((a) => ({ balanceCents: balOf(a.id) }));
  const retirementAccountsP2 = data.accounts
    .filter((a) => a.accountClass === 'retirement' && a.personIndex === 2)
    .map((a) => ({ balanceCents: balOf(a.id) }));
  // PRD §User Story 1 — same NR set as buildTccRenderInput / defaultTccAssignments:
  // non_retirement, investment, AND private_reserve. Trust is summed separately.
  const nonRetirementAccounts = data.accounts
    .filter(
      (a) =>
        a.accountClass === 'non_retirement' ||
        a.accountClass === 'investment' ||
        a.accountClass === 'private_reserve',
    )
    .map((a) => ({ balanceCents: balOf(a.id) }));

  const trustAccounts = data.accounts.filter((a) => a.accountClass === 'trust');
  const trustValueCents =
    trustOverrideCents ??
    trustAccounts.reduce((sum, a) => sum + balOf(a.id), 0);

  const liabilitiesArr = data.liabilities.map((l) => ({
    balanceCents: liabilityBalances.get(l.id) ?? l.balanceCents,
  }));

  const inputs: ReportInputs = {
    monthlyInflowCents,
    monthlyOutflowCents,
    homeownerDeductibleCents,
    autoDeductibleCents,
    medicalDeductibleCents,
    retirementAccountsP1,
    retirementAccountsP2,
    nonRetirementAccounts,
    trustValueCents,
    liabilities: liabilitiesArr,
  };

  return { inputs, totals: computeReport(inputs) };
}

export type SaveReportArgs = {
  clientId: string;
  reportType: 'SACS' | 'TCC';
  meetingDate: string;
  generatedByUserId: string;
  balances: Array<{
    accountId: string;
    balanceCents: number;
    cashBalanceCents: number | null;
    isStale: boolean;
  }>;
  liabilityBalances: Array<{ liabilityId: string; balanceCents: number }>;
  trustOverrideCents?: number;
  inputs: ReportInputs;
  totals: ReportTotals;
  /**
   * Layout assignments at generation time. Stored verbatim in snapshot_json
   * so re-downloading this specific report 6 months from now produces the
   * same image even if the client's saved layout has since changed.
   */
  layoutUsed: { type: 'SACS' | 'TCC'; assignments: Record<string, string> };
};

export async function saveReport(args: SaveReportArgs): Promise<string> {
  const asOfDate = args.meetingDate;
  const snapshotJson = JSON.stringify({
    inputs: args.inputs,
    totals: args.totals,
    balances: args.balances,
    liabilityBalances: args.liabilityBalances,
    layoutUsed: args.layoutUsed,
  });

  const [created] = await db
    .insert(reports)
    .values({
      clientId: args.clientId,
      reportType: args.reportType,
      meetingDate: args.meetingDate,
      generatedByUserId: args.generatedByUserId,
      snapshotJson,
      status: 'draft',
    })
    .returning();
  if (!created) throw new Error('Failed to insert report');

  if (args.balances.length > 0) {
    await db.insert(accountBalanceSnapshots).values(
      args.balances.map((b) => ({
        accountId: b.accountId,
        balanceCents: b.balanceCents,
        cashBalanceCents: b.cashBalanceCents,
        asOfDate,
        isStale: b.isStale,
        recordedInReportId: created.id,
      })),
    );
  }

  // Liability balances aren't snapshot-tabled — keep `liabilities.balance_cents`
  // current so the next report's "use last" sees the latest figure.
  for (const l of args.liabilityBalances) {
    await db
      .update(liabilities)
      .set({ balanceCents: l.balanceCents, updatedAt: new Date() })
      .where(eq(liabilities.id, l.liabilityId));
  }

  return created.id;
}

export function hasAllSacsRequired(accs: AccountRow[]): boolean {
  return ['inflow', 'outflow', 'private_reserve'].every((cls) =>
    accs.some((a) => a.accountClass === cls),
  );
}

// =============================================================================
// Report history listing
// =============================================================================
export type ReportRow = typeof reports.$inferSelect;

export interface ReportHistoryRow {
  report: ReportRow;
  generatedByName: string;
  staleCount: number;
}

export async function loadReportsForClient(
  clientId: string,
  opts: { type?: 'SACS' | 'TCC' | 'All'; sort?: 'asc' | 'desc' } = {},
): Promise<ReportHistoryRow[]> {
  const all = await db.select().from(reports).where(eq(reports.clientId, clientId));
  const filtered =
    !opts.type || opts.type === 'All' ? all : all.filter((r) => r.reportType === opts.type);

  // Sort by meeting_date primarily, then generated_at as tiebreaker
  const sorted = filtered.sort((a, b) => {
    const md = a.meetingDate.localeCompare(b.meetingDate);
    if (md !== 0) return md;
    return a.generatedAt.getTime() - b.generatedAt.getTime();
  });
  if (opts.sort !== 'asc') sorted.reverse();

  if (sorted.length === 0) return [];

  // Resolve generator user names in one query
  const userIds = Array.from(new Set(sorted.map((r) => r.generatedByUserId)));
  const { user } = await import('../db/schema.js');
  const { inArray } = await import('drizzle-orm');
  const userRows = await db.select().from(user).where(inArray(user.id, userIds));
  const nameByUserId = new Map(userRows.map((u) => [u.id, u.name]));

  return sorted.map((r) => ({
    report: r,
    generatedByName: nameByUserId.get(r.generatedByUserId) ?? 'Unknown',
    staleCount: countStaleInSnapshot(r.snapshotJson),
  }));
}

function countStaleInSnapshot(snapshotJson: string): number {
  try {
    const parsed = JSON.parse(snapshotJson) as SnapshotPayload;
    return (parsed.balances ?? []).filter((b) => b.isStale).length;
  } catch {
    return 0;
  }
}

// =============================================================================
// "Duplicate as new" — load a source report's balances for prefilling the
// generator. Returns the snapshot's balance map keyed by account/liability id.
// =============================================================================
export interface PrefillFromReport {
  reportType: 'SACS' | 'TCC';
  balanceByAccountId: Map<string, { balanceCents: number; cashBalanceCents: number | null; isStale: boolean }>;
  liabilityBalanceById: Map<string, number>;
}

// =============================================================================
// Dashboard data aggregator
// =============================================================================
export interface DashboardData {
  hero: {
    quarterlyPrepared: number;
    quarterlyTotalClients: number;
    contextPhrase: string;
    sparkline: Array<{ date: Date; count: number }>;
    sparklinePeak: { count: number; monthLabel: string };
    sparklineCurrent: number;
  };
  secondary: {
    averagePortfolioCents: number | null;
    portfolioCount: number;
    staleAccountCount: number;
    mostStale: { clientId: string; householdName: string; daysSince: number } | null;
    nextMeeting: { clientId: string; householdName: string; daysFromNow: number; date: Date } | null;
  };
  households: Array<{
    id: string;
    householdName: string;
    personsLabel: string;
    netWorthCents: number | null;
    deltaCents: number | null;
    status: 'ready' | 'stale' | 'needs_setup';
  }>;
  activity: Array<{
    id: string;
    date: Date;
    description: string;
    actor: string;
    actionLabel: string;
    href: string;
  }>;
}

const MS_PER_DAY = 86_400_000;
const STALE_THRESHOLD_DAYS = 90;

const monthLabelFmt = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });
const monthShortFmt = new Intl.DateTimeFormat('en-US', { month: 'short' });
const longDateFmt = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });

export async function loadDashboardData(): Promise<DashboardData> {
  const [clientList, reportList, snapshotList, userList, personList, accountList] =
    await Promise.all([
      db.select().from(clients),
      db.select().from(reports),
      db.select().from(accountBalanceSnapshots),
      db.select().from(user),
      db.select().from(clientPersons),
      db.select().from(accounts),
    ]);

  // ---- HERO: quarterly meetings prepared ----
  const now = new Date();
  const qStart = startOfQuarter(now);
  const qEnd = endOfQuarter(now);
  const qStartIso = formatYmd(qStart);
  const qEndIso = formatYmd(qEnd);

  const reportsThisQuarter = reportList.filter(
    (r) => r.meetingDate >= qStartIso && r.meetingDate <= qEndIso,
  );
  const preparedClientIds = new Set(reportsThisQuarter.map((r) => r.clientId));
  const remainingClients = clientList.filter((c) => !preparedClientIds.has(c.id));

  const quarterDueBy = new Date(qEnd.getTime() + 14 * MS_PER_DAY);
  const remainingNames = remainingClients.slice(0, 3).map((c) => firstWord(c.householdName));
  const contextPhrase =
    remainingClients.length === 0
      ? 'All households prepared this quarter — well ahead of the close.'
      : remainingClients.length === 1
        ? `${remainingNames[0]} remains — due by ${longDateFmt.format(quarterDueBy)}.`
        : `${remainingNames.length} households remain — ${joinAnd(remainingNames)} due by ${longDateFmt.format(quarterDueBy)}.`;

  // ---- Sparkline: 12-month report counts ----
  const sparkline = buildSparkline(reportList, now, 12);
  const peak = sparkline.reduce((best, p) => (p.count > best.count ? p : best), {
    date: now,
    count: 0,
  });
  const sparklinePeak = {
    count: peak.count,
    monthLabel: monthShortFmt.format(peak.date),
  };
  const sparklineCurrent = sparkline[sparkline.length - 1]?.count ?? 0;

  // ---- Latest report per client (used by several panels) ----
  // For "next meeting" we walk the most recent meeting date across all types.
  const sortedReports = [...reportList].sort((a, b) =>
    a.meetingDate.localeCompare(b.meetingDate),
  );
  const latestByClient = new Map<string, typeof reportList[number]>();
  for (const r of sortedReports) latestByClient.set(r.clientId, r);

  // For the household card delta we explicitly use the latest two TCC
  // reports — TCC's grand total is the net worth figure. Comparing across
  // mixed types (SACS at the same meeting_date carries the same balances
  // and produces an identical grand total, yielding a misleading $0 delta).
  const tccSortedByMeeting = sortedReports.filter((r) => r.reportType === 'TCC');
  const latestTccByClient = new Map<string, typeof reportList[number]>();
  const priorTccByClient = new Map<string, typeof reportList[number]>();
  for (const r of tccSortedByMeeting) {
    if (latestTccByClient.has(r.clientId)) {
      priorTccByClient.set(r.clientId, latestTccByClient.get(r.clientId)!);
    }
    latestTccByClient.set(r.clientId, r);
  }

  // ---- Secondary stats ----
  const portfolios: number[] = [];
  for (const [, r] of latestByClient) {
    try {
      const totals = (JSON.parse(r.snapshotJson) as { totals?: { grandTotalCents?: number } })
        .totals;
      if (totals?.grandTotalCents != null) portfolios.push(totals.grandTotalCents);
    } catch {
      /* skip malformed snapshot */
    }
  }
  const averagePortfolioCents =
    portfolios.length > 0
      ? Math.round(portfolios.reduce((a, b) => a + b, 0) / portfolios.length)
      : null;

  // Stale: snapshots older than 90 days, OR accounts with no snapshot.
  const newestSnapshotByAccount = new Map<string, Date>();
  for (const s of snapshotList) {
    const cur = newestSnapshotByAccount.get(s.accountId);
    const sDate = new Date(`${s.asOfDate}T00:00:00`);
    if (!cur || sDate > cur) newestSnapshotByAccount.set(s.accountId, sDate);
  }
  const cutoff = now.getTime() - STALE_THRESHOLD_DAYS * MS_PER_DAY;
  let staleAccountCount = 0;
  let mostStaleAccountId: string | null = null;
  let mostStaleDays = 0;
  for (const acc of accountList) {
    const newest = newestSnapshotByAccount.get(acc.id);
    if (!newest) {
      staleAccountCount++;
      continue;
    }
    if (newest.getTime() < cutoff) {
      staleAccountCount++;
      const days = Math.floor((now.getTime() - newest.getTime()) / MS_PER_DAY);
      if (days > mostStaleDays) {
        mostStaleDays = days;
        mostStaleAccountId = acc.id;
      }
    }
  }
  const mostStaleAccount = mostStaleAccountId
    ? accountList.find((a) => a.id === mostStaleAccountId)
    : null;
  const mostStaleClient = mostStaleAccount
    ? clientList.find((c) => c.id === mostStaleAccount.clientId)
    : null;
  const mostStale = mostStaleClient
    ? {
        clientId: mostStaleClient.id,
        householdName: mostStaleClient.householdName,
        daysSince: mostStaleDays,
      }
    : null;

  // Next meeting: latest meeting + 90 days, picked across all clients with reports.
  const upcoming: Array<{ clientId: string; householdName: string; date: Date }> = [];
  for (const c of clientList) {
    const latest = latestByClient.get(c.id);
    if (!latest) continue;
    const nextDate = new Date(
      new Date(`${latest.meetingDate}T00:00:00`).getTime() + 90 * MS_PER_DAY,
    );
    if (nextDate >= now) upcoming.push({ clientId: c.id, householdName: c.householdName, date: nextDate });
  }
  upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
  const nextMeeting = upcoming[0]
    ? {
        clientId: upcoming[0].clientId,
        householdName: upcoming[0].householdName,
        daysFromNow: Math.max(
          0,
          Math.ceil((upcoming[0].date.getTime() - now.getTime()) / MS_PER_DAY),
        ),
        date: upcoming[0].date,
      }
    : null;

  // ---- Households grid ----
  const personsByClient = new Map<string, typeof personList>();
  for (const p of personList) {
    const list = personsByClient.get(p.clientId) ?? [];
    list.push(p);
    personsByClient.set(p.clientId, list);
  }
  const accountsByClient = new Map<string, typeof accountList>();
  for (const a of accountList) {
    const list = accountsByClient.get(a.clientId) ?? [];
    list.push(a);
    accountsByClient.set(a.clientId, list);
  }

  const households = clientList
    .slice()
    .sort((a, b) => a.householdName.localeCompare(b.householdName))
    .map((c) => {
      const persons = (personsByClient.get(c.id) ?? []).sort((a, b) => a.personIndex - b.personIndex);
      const personsLabel =
        persons.length === 0
          ? 'No persons added'
          : persons.length === 1
            ? `${persons[0]!.firstName} ${persons[0]!.lastName}`
            : `${persons[0]!.firstName} & ${persons[1]!.firstName} ${persons[1]!.lastName}`;

      const latest = latestTccByClient.get(c.id);
      const prior = priorTccByClient.get(c.id);
      const netWorth = latest ? safeGrandTotal(latest.snapshotJson) : null;
      const priorWorth = prior ? safeGrandTotal(prior.snapshotJson) : null;
      const delta = netWorth != null && priorWorth != null ? netWorth - priorWorth : null;

      const accs = accountsByClient.get(c.id) ?? [];
      const status = computeClientStatus(accs, persons, newestSnapshotByAccount, cutoff);

      return {
        id: c.id,
        householdName: c.householdName,
        personsLabel,
        netWorthCents: netWorth,
        deltaCents: delta,
        status,
      };
    });

  // ---- Activity (latest 12 reports) ----
  const userById = new Map(userList.map((u) => [u.id, u]));
  const clientById = new Map(clientList.map((c) => [c.id, c]));
  const recentReports = [...reportList]
    .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())
    .slice(0, 12);
  const activity = recentReports.map((r) => {
    const cl = clientById.get(r.clientId);
    const u = userById.get(r.generatedByUserId);
    const householdName = cl?.householdName ?? 'Unknown household';
    return {
      id: r.id,
      date: r.generatedAt,
      description: `Generated ${r.reportType} for ${householdName}`,
      actor: u?.name ?? 'Unknown',
      actionLabel: 'Report generated',
      href: `/clients/${r.clientId}/reports/${r.id}`,
    };
  });

  return {
    hero: {
      quarterlyPrepared: preparedClientIds.size,
      quarterlyTotalClients: clientList.length,
      contextPhrase,
      sparkline,
      sparklinePeak,
      sparklineCurrent,
    },
    secondary: {
      averagePortfolioCents,
      portfolioCount: portfolios.length,
      staleAccountCount,
      mostStale,
      nextMeeting,
    },
    households,
    activity,
  };
}

// ----- helpers -----
function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1);
}
function endOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q + 3, 0, 23, 59, 59);
}
function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function firstWord(s: string): string {
  const parts = s.trim().split(/\s+/);
  return parts[0] ?? s;
}
function joinAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function buildSparkline(
  reportRows: Array<{ meetingDate: string; generatedAt: Date }>,
  asOf: Date,
  monthCount: number,
): Array<{ date: Date; count: number }> {
  const buckets: Array<{ date: Date; count: number }> = [];
  const start = new Date(asOf.getFullYear(), asOf.getMonth() - (monthCount - 1), 1);
  for (let i = 0; i < monthCount; i++) {
    buckets.push({ date: new Date(start.getFullYear(), start.getMonth() + i, 1), count: 0 });
  }
  const indexFor = (year: number, month: number): number => {
    return (year - start.getFullYear()) * 12 + (month - start.getMonth());
  };
  for (const r of reportRows) {
    const d = new Date(`${r.meetingDate}T00:00:00`);
    const idx = indexFor(d.getFullYear(), d.getMonth());
    if (idx >= 0 && idx < buckets.length) buckets[idx]!.count++;
  }
  return buckets;
}

function safeGrandTotal(snapshotJson: string): number | null {
  try {
    const parsed = JSON.parse(snapshotJson) as { totals?: { grandTotalCents?: number } };
    return parsed.totals?.grandTotalCents ?? null;
  } catch {
    return null;
  }
}

function computeClientStatus(
  accs: AccountRow[],
  persons: Array<{ personIndex: number }>,
  newestByAccount: Map<string, Date>,
  cutoffMs: number,
): 'ready' | 'stale' | 'needs_setup' {
  const hasPerson1 = persons.some((p) => p.personIndex === 1);
  const hasAllSacs = ['inflow', 'outflow', 'private_reserve'].every((cls) =>
    accs.some((a) => a.accountClass === cls),
  );
  if (!hasPerson1 || !hasAllSacs) return 'needs_setup';
  let anyStale = false;
  let anyFresh = false;
  for (const a of accs) {
    const newest = newestByAccount.get(a.id);
    if (!newest) {
      anyStale = true;
    } else if (newest.getTime() < cutoffMs) {
      anyStale = true;
    } else {
      anyFresh = true;
    }
  }
  if (anyStale) return 'stale';
  return anyFresh ? 'ready' : 'stale';
}

export async function loadReportPrefill(reportId: string): Promise<PrefillFromReport | null> {
  const [r] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  if (!r) return null;
  const parsed = parseSnapshot(r.snapshotJson);
  return {
    reportType: r.reportType,
    balanceByAccountId: new Map(
      (parsed.balances ?? []).map((b) => [
        b.accountId,
        {
          balanceCents: b.balanceCents,
          cashBalanceCents: b.cashBalanceCents,
          isStale: b.isStale,
        },
      ]),
    ),
    liabilityBalanceById: new Map(
      (parsed.liabilityBalances ?? []).map((l) => [l.liabilityId, l.balanceCents]),
    ),
  };
}

// =============================================================================
// SVG render from a saved report
// =============================================================================
type SnapshotPayload = {
  inputs: ReportInputs;
  totals: ReportTotals;
  balances: Array<{
    accountId: string;
    balanceCents: number;
    cashBalanceCents: number | null;
    isStale: boolean;
  }>;
  liabilityBalances: Array<{ liabilityId: string; balanceCents: number }>;
  layoutUsed?: LayoutPayload;
};

export function parseSnapshot(json: string): SnapshotPayload {
  return JSON.parse(json) as SnapshotPayload;
}

/**
 * Build the layout assignments that should be used for rendering.
 * Order of precedence:
 *   1. `override` argument (used by the live editor when re-rendering on drop)
 *   2. snapshot.layoutUsed (locked at generation — used by Phase 8 PDF export)
 *   3. defaults (fresh client with no saved layout)
 */
export function resolveLayout(
  reportType: 'SACS' | 'TCC',
  client: FullClient,
  snapshot: SnapshotPayload,
  override: LayoutPayload | null,
): LayoutPayload {
  if (override) return override;
  if (snapshot.layoutUsed && snapshot.layoutUsed.assignments) return snapshot.layoutUsed;
  const defaults =
    reportType === 'TCC'
      ? defaultTccAssignments(client.accounts)
      : defaultSacsAssignments();
  return { type: reportType, assignments: defaults };
}

export function buildTccRenderInput(
  client: FullClient,
  snapshot: SnapshotPayload,
  layout: LayoutPayload,
  meetingDate: string,
): TccSnapshot {
  const balanceById = new Map(snapshot.balances.map((b) => [b.accountId, b]));
  const liabBalanceById = new Map(snapshot.liabilityBalances.map((l) => [l.liabilityId, l]));

  const buildBubble = (acc: AccountRow): TccBubble | null => {
    const slotId = layout.assignments[acc.id];
    if (!slotId) return null;
    const snap = balanceById.get(acc.id);
    return {
      accountId: acc.id,
      slotId,
      accountType: acc.accountType,
      institution: acc.institution,
      accountNumberLastFour: acc.accountNumberLastFour,
      balanceCents: snap?.balanceCents ?? 0,
      cashCents: snap?.cashBalanceCents ?? null,
      asOfDate: meetingDate,
      isStale: snap?.isStale ?? false,
    };
  };

  const retirementBubbles = client.accounts
    .filter((a) => a.accountClass === 'retirement')
    .map(buildBubble)
    .filter((b): b is TccBubble => b != null);
  // PRD §User Story 1 — TCC's non-retirement section spans every non-qualified
  // holding: non_retirement, investment (Schwab brokerage), AND private_reserve
  // (Pinnacle PR). Trust gets its own central circle, not a bubble. Inflow /
  // outflow are SACS-only and excluded here. Mirrors the filter in
  // src/lib/layouts.ts → defaultTccAssignments.
  const nonRetirementBubbles = client.accounts
    .filter(
      (a) =>
        a.accountClass === 'non_retirement' ||
        a.accountClass === 'investment' ||
        a.accountClass === 'private_reserve',
    )
    .map(buildBubble)
    .filter((b): b is TccBubble => b != null);

  const trustAccount = client.accounts.find((a) => a.accountClass === 'trust');
  const trustBalance = trustAccount ? balanceById.get(trustAccount.id) : undefined;

  return {
    householdName: client.client.householdName,
    meetingDate,
    asOfDate: meetingDate,
    persons: client.persons.map((p) => ({
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth,
      ssnLastFour: p.ssnLastFour,
    })),
    retirementBubbles,
    nonRetirementBubbles,
    trust: {
      valueCents: trustBalance?.balanceCents ?? snapshot.inputs.trustValueCents ?? 0,
      asOfDate: meetingDate,
      isStale: trustBalance?.isStale ?? false,
    },
    liabilities: client.liabilities.map((l) => ({
      creditorName: l.creditorName,
      liabilityType: l.liabilityType,
      balanceCents: liabBalanceById.get(l.id)?.balanceCents ?? l.balanceCents,
      interestRateBps: l.interestRateBps,
      payoffDate: l.payoffDate,
      isStale: false,
    })),
    totals: {
      p1RetirementCents: snapshot.totals.p1RetirementCents,
      p2RetirementCents: snapshot.totals.p2RetirementCents,
      nonRetirementCents: snapshot.totals.nonRetirementCents,
      trustCents: snapshot.totals.trustCents,
      grandTotalCents: snapshot.totals.grandTotalCents,
      liabilitiesTotalCents: snapshot.totals.liabilitiesTotalCents,
    },
    staleFields: new Set<string>(),
  };
}

export function buildSacsRenderInput(
  client: FullClient,
  snapshot: SnapshotPayload,
  meetingDate: string,
): SacsSnapshot {
  const balanceById = new Map(snapshot.balances.map((b) => [b.accountId, b]));
  const inflow = client.accounts.find((a) => a.accountClass === 'inflow');
  const outflow = client.accounts.find((a) => a.accountClass === 'outflow');
  const pr = client.accounts.find((a) => a.accountClass === 'private_reserve');
  const investment = client.accounts.filter((a) => a.accountClass === 'investment');

  const transferDay = client.budget?.automatedTransferDay ?? 28;

  const inflowSources = client.persons.map((p) => ({
    personFirstName: p.firstName,
    monthlyAmountCents: p.monthlyInflowCents,
  }));

  const stale = new Set<string>();
  if (inflow && balanceById.get(inflow.id)?.isStale) stale.add('inflow');
  if (outflow && balanceById.get(outflow.id)?.isStale) stale.add('outflow');
  if (pr && balanceById.get(pr.id)?.isStale) stale.add('privateReserveBalance');

  const targetBreakdown = {
    sixXExpensesCents: snapshot.inputs.monthlyOutflowCents * 6,
    homeownerDeductibleCents: snapshot.inputs.homeownerDeductibleCents,
    autoDeductibleCents: snapshot.inputs.autoDeductibleCents,
    medicalDeductibleCents: snapshot.inputs.medicalDeductibleCents,
  };

  const schwabBalance = investment.reduce(
    (sum, a) => sum + (balanceById.get(a.id)?.balanceCents ?? 0),
    0,
  );

  return {
    householdName: client.client.householdName,
    meetingDate,
    inflowSources,
    monthlyInflowCents: snapshot.inputs.monthlyInflowCents,
    monthlyOutflowCents: snapshot.inputs.monthlyOutflowCents,
    automatedTransferDay: transferDay,
    privateReserveBalanceCents: pr ? (balanceById.get(pr.id)?.balanceCents ?? 0) : 0,
    privateReserveMonthlyContributionCents: snapshot.totals.excessCents,
    pinnacleTargetCents: snapshot.totals.targetCents,
    pinnacleTargetBreakdown: targetBreakdown,
    schwabBalanceCents: schwabBalance,
    remainderCents: Math.max(
      0,
      (pr ? (balanceById.get(pr.id)?.balanceCents ?? 0) : 0) - snapshot.totals.targetCents,
    ),
    inflowFloorCents: inflow?.floorCents ?? 100_000,
    outflowFloorCents: outflow?.floorCents ?? 100_000,
    privateReserveFloorCents: pr?.floorCents ?? 100_000,
    staleFields: stale,
  };
}

export function renderReportPages(
  client: FullClient,
  reportRow: typeof reports.$inferSelect,
  override: LayoutPayload | null,
  options: { debug?: boolean } = {},
): { pages: string[]; layout: LayoutPayload } {
  const snapshot = parseSnapshot(reportRow.snapshotJson);
  const layout = resolveLayout(reportRow.reportType, client, snapshot, override);
  if (reportRow.reportType === 'TCC') {
    const tccInput = buildTccRenderInput(client, snapshot, layout, reportRow.meetingDate);
    return {
      pages: [renderTccSvg(tccInput, undefined, { debug: options.debug }).page1],
      layout,
    };
  }
  const sacsInput = buildSacsRenderInput(client, snapshot, reportRow.meetingDate);
  const { page1, page2 } = renderSacsSvg(sacsInput);
  return { pages: [page1, page2], layout };
}
