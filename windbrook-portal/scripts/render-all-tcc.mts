import { loadClient } from '../src/lib/clients.js';
import { defaultTccAssignments } from '../src/lib/layouts.js';
import { loadAccountsWithLatestSnapshots, buildReportInputs } from '../src/lib/reports.js';
import { renderTccSvg, type TccBubble } from '../src/reports/tcc/render.js';
import fs from 'node:fs';

const ids: Array<[string, string]> = [
  ['cole', '1638011a-b3f7-4c2f-9793-a9aa9f8ddc18'],
  ['lipski', '929641f0-ed69-4262-9451-6c98a608d5fd'],
  ['park', '522db097-2799-47ce-94d8-3c06c2ee7fa4'],
];

for (const [name, id] of ids) {
  const c = await loadClient(id);
  if (!c) {
    console.error(name, 'not found');
    continue;
  }
  const snaps = await loadAccountsWithLatestSnapshots(id);
  const balances = new Map<string, number>();
  const cash = new Map<string, number | null>();
  for (const { account, latest } of snaps) {
    balances.set(account.id, latest?.balanceCents ?? 0);
    cash.set(account.id, latest?.cashBalanceCents ?? null);
  }
  const liab = new Map(c.liabilities.map((l) => [l.id, l.balanceCents]));
  const { totals } = await buildReportInputs(id, balances, liab);
  const assigns = defaultTccAssignments(c.accounts);
  const trustAcc = c.accounts.find((x) => x.accountClass === 'trust');

  const buildBubble = (acc: (typeof c.accounts)[number]): TccBubble | null => {
    const slotId = assigns[acc.id];
    if (!slotId) return null;
    return {
      accountId: acc.id,
      slotId,
      accountType: acc.accountType,
      institution: acc.institution,
      accountNumberLastFour: acc.accountNumberLastFour,
      balanceCents: balances.get(acc.id) ?? 0,
      cashCents: cash.get(acc.id) ?? null,
      asOfDate: '2026-04-21',
      isStale: false,
    };
  };

  const ret = c.accounts
    .filter((x) => x.accountClass === 'retirement')
    .map(buildBubble)
    .filter((b): b is TccBubble => b != null);
  const nr = c.accounts
    .filter((x) => ['non_retirement', 'investment', 'private_reserve'].includes(x.accountClass))
    .map(buildBubble)
    .filter((b): b is TccBubble => b != null);

  const snap = {
    householdName: c.client.householdName,
    meetingDate: '2026-04-21',
    asOfDate: '2026-04-21',
    persons: c.persons.map((p) => ({
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth,
      ssnLastFour: p.ssnLastFour,
    })),
    retirementBubbles: ret,
    nonRetirementBubbles: nr,
    trust: {
      valueCents: trustAcc ? (balances.get(trustAcc.id) ?? 0) : 0,
      asOfDate: '2026-04-21',
      isStale: false,
    },
    liabilities: c.liabilities.map((l) => ({
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
  const { page1 } = renderTccSvg(snap);
  fs.writeFileSync(`D:/temp/wb/${name}-tcc.svg`, page1);
  console.log(name, 'ret=' + ret.length, 'nr=' + nr.length, 'liab=' + c.liabilities.length, 'bytes=' + page1.length);
}

process.exit(0);
