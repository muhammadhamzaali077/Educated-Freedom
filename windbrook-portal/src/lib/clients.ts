import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  accountBalanceSnapshots,
  accounts,
  clientPersons,
  clients,
  expenseBudget,
  liabilities,
  reports,
} from '../db/schema.js';
import {
  REQUIRED_SACS_CLASSES,
  type AccountInput,
  type AccountClass,
  type BudgetInput,
  type HouseholdInput,
  type LiabilityInput,
  type PersonInput,
} from './validation.js';

const STALE_DAYS = 90;
const MS_PER_DAY = 86_400_000;

export type ClientRow = typeof clients.$inferSelect;
export type PersonRow = typeof clientPersons.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type LiabilityRow = typeof liabilities.$inferSelect;
export type BudgetRow = typeof expenseBudget.$inferSelect;
export type SnapshotRow = typeof accountBalanceSnapshots.$inferSelect;

export type ClientStatus = 'ready' | 'stale' | 'needs_setup';

export type FullClient = {
  client: ClientRow;
  persons: PersonRow[];
  accounts: AccountRow[];
  liabilities: LiabilityRow[];
  budget: BudgetRow | null;
};

export type ListedClient = {
  client: ClientRow;
  persons: PersonRow[];
  status: ClientStatus;
  lastMeetingDate: string | null;
};

export async function listClients(): Promise<ListedClient[]> {
  const allClients = await db.select().from(clients).orderBy(asc(clients.householdName));
  if (allClients.length === 0) return [];

  const allPersons = await db.select().from(clientPersons).orderBy(asc(clientPersons.personIndex));
  const allAccounts = await db.select().from(accounts);
  const allReports = await db.select().from(reports).orderBy(desc(reports.meetingDate));

  const personsBy = groupBy(allPersons, (p) => p.clientId);
  const accountsBy = groupBy(allAccounts, (a) => a.clientId);
  const lastMeetingBy = new Map<string, string>();
  for (const r of allReports) {
    if (!lastMeetingBy.has(r.clientId)) lastMeetingBy.set(r.clientId, r.meetingDate);
  }

  const allSnapshots = await db.select().from(accountBalanceSnapshots);
  const snapshotsByAccount = groupBy(allSnapshots, (s) => s.accountId);

  return allClients.map((c) => ({
    client: c,
    persons: personsBy.get(c.id) ?? [],
    status: computeStatus({
      persons: personsBy.get(c.id) ?? [],
      accounts: accountsBy.get(c.id) ?? [],
      snapshotsByAccount,
    }),
    lastMeetingDate: lastMeetingBy.get(c.id) ?? null,
  }));
}

export async function loadClient(id: string): Promise<FullClient | null> {
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) return null;

  const [personsRows, accountsRows, liabilitiesRows, budgetRows] = await Promise.all([
    db.select().from(clientPersons).where(eq(clientPersons.clientId, id)).orderBy(asc(clientPersons.personIndex)),
    db
      .select()
      .from(accounts)
      .where(eq(accounts.clientId, id))
      .orderBy(asc(accounts.accountClass), asc(accounts.displayOrder), asc(accounts.createdAt)),
    db
      .select()
      .from(liabilities)
      .where(eq(liabilities.clientId, id))
      .orderBy(asc(liabilities.displayOrder), asc(liabilities.createdAt)),
    db.select().from(expenseBudget).where(eq(expenseBudget.clientId, id)).limit(1),
  ]);

  return {
    client,
    persons: personsRows,
    accounts: accountsRows,
    liabilities: liabilitiesRows,
    budget: budgetRows[0] ?? null,
  };
}

export function computeStatus(args: {
  persons: PersonRow[];
  accounts: AccountRow[];
  snapshotsByAccount: Map<string, SnapshotRow[]>;
}): ClientStatus {
  const { persons, accounts: accs, snapshotsByAccount } = args;
  const hasPerson1 = persons.some((p) => p.personIndex === 1);
  const hasAllSacs = REQUIRED_SACS_CLASSES.every((cls) => accs.some((a) => a.accountClass === cls));
  if (!hasPerson1 || !hasAllSacs) return 'needs_setup';

  const cutoff = Date.now() - STALE_DAYS * MS_PER_DAY;
  let anyStale = false;
  let anyFresh = false;
  for (const a of accs) {
    const snapshots = snapshotsByAccount.get(a.id) ?? [];
    if (snapshots.length === 0) {
      anyStale = true;
      continue;
    }
    const newest = snapshots.reduce<SnapshotRow>((acc, s) =>
      new Date(s.asOfDate).getTime() > new Date(acc.asOfDate).getTime() ? s : acc,
    snapshots[0] as SnapshotRow);
    if (new Date(newest.asOfDate).getTime() < cutoff) anyStale = true;
    else anyFresh = true;
  }
  if (anyStale) return 'stale';
  return anyFresh ? 'ready' : 'stale';
}

export async function createDraftClient(): Promise<string> {
  const [created] = await db
    .insert(clients)
    .values({ householdName: 'New Household' })
    .returning({ id: clients.id });
  if (!created) throw new Error('Failed to create draft client');
  const id = created.id;

  const seed = REQUIRED_SACS_CLASSES.map((cls, i) => ({
    clientId: id,
    accountClass: cls,
    accountType:
      cls === 'inflow' ? 'Inflow' : cls === 'outflow' ? 'Outflow' : 'Private Reserve',
    institution: 'Pinnacle',
    isJoint: true,
    displayOrder: i,
    floorCents: 100_000,
  }));
  await db.insert(accounts).values(seed);

  return id;
}

export async function deleteClient(id: string) {
  await db.delete(clients).where(eq(clients.id, id));
}

export async function saveClientHousehold(id: string, input: HouseholdInput) {
  await db
    .update(clients)
    .set({
      householdName: input.householdName,
      meetingCadence: input.meetingCadence,
      trustPropertyAddress: input.trustPropertyAddress ?? null,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, id));
}

export async function upsertPerson(clientId: string, input: PersonInput) {
  const existing = await db
    .select()
    .from(clientPersons)
    .where(and(eq(clientPersons.clientId, clientId), eq(clientPersons.personIndex, input.personIndex)))
    .limit(1);
  const row = {
    clientId,
    personIndex: input.personIndex,
    firstName: input.firstName,
    lastName: input.lastName,
    dateOfBirth: input.dateOfBirth,
    ssnLastFour: input.ssnLastFour,
    monthlyInflowCents: input.monthlyInflowCents,
    updatedAt: new Date(),
  };
  if (existing.length === 0) {
    await db.insert(clientPersons).values(row);
  } else {
    await db
      .update(clientPersons)
      .set(row)
      .where(and(eq(clientPersons.clientId, clientId), eq(clientPersons.personIndex, input.personIndex)));
  }
}

export async function deletePerson(clientId: string, personIndex: 1 | 2) {
  await db
    .delete(clientPersons)
    .where(and(eq(clientPersons.clientId, clientId), eq(clientPersons.personIndex, personIndex)));
}

export async function createAccount(
  clientId: string,
  input: { accountClass: AccountClass; personIndex?: number | null },
): Promise<AccountRow> {
  const order = await db.$count(accounts, eq(accounts.clientId, clientId));
  const defaults = defaultsForClass(input.accountClass, input.personIndex ?? null);
  const [created] = await db
    .insert(accounts)
    .values({
      clientId,
      accountClass: input.accountClass,
      accountType: defaults.accountType,
      institution: defaults.institution,
      personIndex: defaults.personIndex,
      isJoint: defaults.isJoint,
      displayOrder: order,
      floorCents: 100_000,
    })
    .returning();
  if (!created) throw new Error('Failed to create account');
  return created;
}

export async function updateAccount(accountId: string, input: AccountInput) {
  await db
    .update(accounts)
    .set({
      accountClass: input.accountClass,
      accountType: input.accountType,
      institution: input.institution,
      accountNumberLastFour: input.accountNumberLastFour,
      personIndex: input.personIndex,
      isJoint: input.isJoint,
      displayOrder: input.displayOrder,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, accountId));
}

export async function deleteAccount(accountId: string) {
  await db.delete(accounts).where(eq(accounts.id, accountId));
}

export async function createLiability(clientId: string): Promise<LiabilityRow> {
  const order = await db.$count(liabilities, eq(liabilities.clientId, clientId));
  const [created] = await db
    .insert(liabilities)
    .values({
      clientId,
      creditorName: '',
      liabilityType: 'Mortgage',
      balanceCents: 0,
      displayOrder: order,
    })
    .returning();
  if (!created) throw new Error('Failed to create liability');
  return created;
}

export async function updateLiability(liabilityId: string, input: LiabilityInput) {
  await db
    .update(liabilities)
    .set({
      creditorName: input.creditorName,
      liabilityType: input.liabilityType,
      balanceCents: input.balanceCents,
      interestRateBps: input.interestRateBps,
      payoffDate: input.payoffDate,
      displayOrder: input.displayOrder,
      updatedAt: new Date(),
    })
    .where(eq(liabilities.id, liabilityId));
}

export async function deleteLiability(liabilityId: string) {
  await db.delete(liabilities).where(eq(liabilities.id, liabilityId));
}

export async function upsertBudget(clientId: string, input: BudgetInput) {
  const existing = await db
    .select()
    .from(expenseBudget)
    .where(eq(expenseBudget.clientId, clientId))
    .limit(1);
  const row = {
    clientId,
    monthlyOutflowCents: input.monthlyOutflowCents,
    automatedTransferDay: input.automatedTransferDay,
    homeownerDeductibleCents: input.homeownerDeductibleCents ?? 0,
    autoDeductibleCents: input.autoDeductibleCents ?? 0,
    medicalDeductibleCents: input.medicalDeductibleCents ?? 0,
    updatedAt: new Date(),
  };
  if (existing.length === 0) {
    await db.insert(expenseBudget).values(row);
  } else {
    await db.update(expenseBudget).set(row).where(eq(expenseBudget.clientId, clientId));
  }
}

export async function countAccountsByClass(clientId: string, cls: AccountClass): Promise<number> {
  return db.$count(
    accounts,
    and(eq(accounts.clientId, clientId), eq(accounts.accountClass, cls)),
  );
}

export async function countRetirementForPerson(clientId: string, personIndex: number): Promise<number> {
  return db.$count(
    accounts,
    and(
      eq(accounts.clientId, clientId),
      eq(accounts.accountClass, 'retirement'),
      eq(accounts.personIndex, personIndex),
    ),
  );
}

function defaultsForClass(cls: AccountClass, personIndex: number | null) {
  switch (cls) {
    case 'inflow':
      return { accountType: 'Inflow', institution: 'Pinnacle', personIndex: null, isJoint: true };
    case 'outflow':
      return { accountType: 'Outflow', institution: 'Pinnacle', personIndex: null, isJoint: true };
    case 'private_reserve':
      return { accountType: 'Private Reserve', institution: 'Pinnacle', personIndex: null, isJoint: true };
    case 'retirement':
      return {
        accountType: 'Roth IRA',
        institution: 'Schwab',
        personIndex: personIndex ?? 1,
        isJoint: false,
      };
    case 'investment':
      return { accountType: 'Schwab Brokerage', institution: 'Schwab', personIndex: null, isJoint: true };
    case 'trust':
      return { accountType: 'Family Trust', institution: '', personIndex: null, isJoint: true };
    case 'non_retirement':
      return { accountType: 'Brokerage', institution: '', personIndex: null, isJoint: true };
  }
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}
