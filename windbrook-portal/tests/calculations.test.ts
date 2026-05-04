/**
 * Locked rules pinned by tests. Every rule cites the transcript line where
 * Rebecca established it, so future changes can be traced to a real customer
 * decision. Update the rule + this test together — never one without the other.
 */
import { describe, expect, it } from 'vitest';
import {
  type AccountBalance,
  computeExcess,
  computeGrandTotal,
  computeLiabilitiesTotal,
  computeNonRetirementTotal,
  computeReport,
  computeRetirementTotal,
  computeTarget,
} from '../src/lib/calculations.js';

const $ = (dollars: number) => Math.round(dollars * 100);

describe('computeExcess (Rebecca, 24:28: Excess = Inflow − Outflow)', () => {
  it('subtracts outflow from inflow', () => {
    expect(computeExcess($(15000), $(12000))).toBe($(3000));
  });

  it('returns a negative when outflow exceeds inflow', () => {
    expect(computeExcess($(8000), $(10000))).toBe(-$(2000));
  });

  it('handles zero outflow', () => {
    expect(computeExcess($(15000), 0)).toBe($(15000));
  });
});

describe('computeTarget (PRD glossary + Sagan PDF "x 2 = $...- Auto")', () => {
  it('= 6× monthly expenses + home + 2×auto + medical', () => {
    const t = computeTarget($(12000), { home: $(2500), auto: $(1000), medical: $(3000) });
    // 6 × 12000 = 72,000  + 2,500 + 2 × 1,000 + 3,000 = 79,500
    expect(t).toBe($(79500));
  });

  it('all-zero inputs return zero', () => {
    expect(computeTarget(0, { home: 0, auto: 0, medical: 0 })).toBe(0);
  });

  it('doubles only the auto deductible, not home or medical', () => {
    const t = computeTarget(0, { home: $(1000), auto: $(1000), medical: $(1000) });
    // 0 + 1000 + 2*1000 + 1000 = 4000
    expect(t).toBe($(4000));
  });
});

describe('computeRetirementTotal (Rebecca, 26:15: per-spouse subtotals feed Grand Total)', () => {
  it('sums balanceCents across accounts', () => {
    const accs: AccountBalance[] = [
      { balanceCents: $(128000) },
      { balanceCents: $(215500) },
      { balanceCents: $(87200) },
    ];
    expect(computeRetirementTotal(accs)).toBe($(430700));
  });

  it('returns zero for an empty list', () => {
    expect(computeRetirementTotal([])).toBe(0);
  });

  it('IGNORES cashBalanceCents (Rebecca, transcript 900: cash is included in the parent)', () => {
    const accs: AccountBalance[] = [
      { balanceCents: $(128000), cashBalanceCents: $(5000) },
      { balanceCents: $(215500), cashBalanceCents: $(8000) },
    ];
    // 128,000 + 215,500 = 343,500 — cash sub-balances must NOT be added again
    expect(computeRetirementTotal(accs)).toBe($(343500));
  });
});

describe('computeNonRetirementTotal (Rebecca, transcript 1088: trust is excluded)', () => {
  it('sums non-retirement balances', () => {
    const accs: AccountBalance[] = [
      { balanceCents: $(45000) },
      { balanceCents: $(32000) },
    ];
    expect(computeNonRetirementTotal(accs)).toBe($(77000));
  });

  it('callers MUST not include the trust in this list', () => {
    // The contract: this function trusts its caller. Pass only non-retirement.
    // If a trust slipped in the rule would be violated. Assertion below documents
    // the rule by showing what excluding the trust looks like.
    const trustValue = $(750000);
    const nonRetWithoutTrust: AccountBalance[] = [
      { balanceCents: $(45000) },
      { balanceCents: $(32000) },
    ];
    const total = computeNonRetirementTotal(nonRetWithoutTrust);
    expect(total).toBe($(77000));
    expect(total).not.toBe($(77000) + trustValue);
  });
});

describe('computeLiabilitiesTotal (Rebecca, transcript 1156: never feeds Grand Total)', () => {
  it('sums liability balances', () => {
    const liabs = [{ balanceCents: $(325000) }, { balanceCents: $(24500) }];
    expect(computeLiabilitiesTotal(liabs)).toBe($(349500));
  });

  it('returns zero for an empty list', () => {
    expect(computeLiabilitiesTotal([])).toBe(0);
  });
});

describe('computeGrandTotal (Rebecca, transcript 1156: liabilities NEVER subtracted)', () => {
  it('sums P1 retirement + P2 retirement + non-retirement + trust', () => {
    expect(computeGrandTotal($(343500), $(87200), $(77000), $(750000))).toBe($(1257700));
  });

  it('does NOT subtract a liabilities figure (no liabilities argument exists)', () => {
    // The function signature itself enforces the rule — we cannot pass liabilities.
    const total = computeGrandTotal($(100000), $(50000), $(25000), $(500000));
    expect(total).toBe($(675000));
  });
});

describe('computeReport — integration with realistic Sagan-shaped numbers', () => {
  // Lipski-shaped sample matching the discovery transcript numbers.
  const inputs = {
    monthlyInflowCents: $(15000),
    monthlyOutflowCents: $(12000),
    homeownerDeductibleCents: $(2500),
    autoDeductibleCents: $(1000),
    medicalDeductibleCents: $(3000),
    retirementAccountsP1: [
      { balanceCents: $(128000), cashBalanceCents: $(5000) },
      { balanceCents: $(215500) },
    ],
    retirementAccountsP2: [{ balanceCents: $(87200) }],
    nonRetirementAccounts: [
      { balanceCents: $(45000) },
      { balanceCents: $(32000) },
    ],
    trustValueCents: $(750000),
    liabilities: [{ balanceCents: $(325000) }, { balanceCents: $(24500) }],
  };
  const result = computeReport(inputs);

  it('Excess', () => expect(result.excessCents).toBe($(3000)));
  it('Target = 72,000 + 2,500 + 2,000 + 3,000', () =>
    expect(result.targetCents).toBe($(79500)));
  it('P1 Retirement total ignores cashBalanceCents', () =>
    expect(result.p1RetirementCents).toBe($(343500)));
  it('P2 Retirement total', () => expect(result.p2RetirementCents).toBe($(87200)));
  it('Non-retirement total', () => expect(result.nonRetirementCents).toBe($(77000)));
  it('Trust value passes through', () => expect(result.trustCents).toBe($(750000)));
  it('Liabilities total is computed', () =>
    expect(result.liabilitiesTotalCents).toBe($(349500)));
  it('Grand Total = sum of four parts; liabilities NOT subtracted', () => {
    expect(result.grandTotalCents).toBe(
      result.p1RetirementCents +
        result.p2RetirementCents +
        result.nonRetirementCents +
        result.trustCents,
    );
    expect(result.grandTotalCents).toBe($(1257700));
    // Sanity: had liabilities been subtracted, the answer would be different.
    expect(result.grandTotalCents - result.liabilitiesTotalCents).toBe($(908200));
    expect(result.grandTotalCents).not.toBe($(908200));
  });
});
