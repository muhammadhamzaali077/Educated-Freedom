/**
 * Locked SACS / TCC math. Single source of truth. Every number on a generated
 * report traces back to one of these functions (CLAUDE.md §4).
 *
 * Inputs: integer cents. Outputs: integer cents.
 * No floats, no currency strings, no rounding decisions inside the module.
 */

export interface AccountBalance {
  /** Total balance for the account, in cents. */
  balanceCents: number;
  /**
   * Optional sub-display for accounts that show a "cash" sub-bubble.
   * Per Rebecca (transcript 900): the cash figure is included in the parent
   * balance — calculations IGNORE this field. It's display only.
   */
  cashBalanceCents?: number;
}

export interface LiabilityBalance {
  balanceCents: number;
}

export interface ReportInputs {
  monthlyInflowCents: number;
  monthlyOutflowCents: number;
  homeownerDeductibleCents: number;
  /** Single car. Doubled inside computeTarget per the Sagan PDF "x 2 = $...- Auto". */
  autoDeductibleCents: number;
  medicalDeductibleCents: number;
  retirementAccountsP1: AccountBalance[];
  retirementAccountsP2: AccountBalance[];
  /** EXCLUDES the trust (Rebecca, transcript 1088). */
  nonRetirementAccounts: AccountBalance[];
  /** Zillow Zestimate of the trust property — its own term in Grand Total. */
  trustValueCents: number;
  liabilities: LiabilityBalance[];
}

export interface ReportTotals {
  excessCents: number;
  targetCents: number;
  p1RetirementCents: number;
  p2RetirementCents: number;
  nonRetirementCents: number;
  trustCents: number;
  grandTotalCents: number;
  /** Display only; never feeds Grand Total (locked at transcript 1156). */
  liabilitiesTotalCents: number;
}

/** Excess = Inflow − Outflow. Negative when outflow > inflow. */
export function computeExcess(inflowCents: number, outflowCents: number): number {
  return inflowCents - outflowCents;
}

/**
 * Target = (6 × monthlyExpenses) + homeDeductible + (2 × autoDeductible) + medicalDeductible.
 * The 2× auto follows the Sagan PDF "x 2 = $0,000- Auto" notation (single-car
 * deductible doubled as a household reserve heuristic).
 */
export function computeTarget(
  monthlyExpensesCents: number,
  deductibles: { home: number; auto: number; medical: number },
): number {
  return (
    6 * monthlyExpensesCents +
    deductibles.home +
    2 * deductibles.auto +
    deductibles.medical
  );
}

/** Sum of balanceCents across accounts. cashBalanceCents is ignored. */
export function computeRetirementTotal(accounts: AccountBalance[]): number {
  let sum = 0;
  for (const a of accounts) sum += a.balanceCents;
  return sum;
}

/**
 * Sum of non-retirement account balances.
 * Caller must NOT pass the trust — it's its own term in Grand Total
 * (Rebecca, transcript 1088). Also ignores cashBalanceCents.
 */
export function computeNonRetirementTotal(accounts: AccountBalance[]): number {
  let sum = 0;
  for (const a of accounts) sum += a.balanceCents;
  return sum;
}

/** Sum of liability balances. Display only. */
export function computeLiabilitiesTotal(liabilities: LiabilityBalance[]): number {
  let sum = 0;
  for (const l of liabilities) sum += l.balanceCents;
  return sum;
}

/**
 * Grand Total = P1 retirement + P2 retirement + non-retirement + trust.
 * Liabilities are NEVER subtracted (locked at transcript 1156).
 */
export function computeGrandTotal(
  p1RetirementCents: number,
  p2RetirementCents: number,
  nonRetirementCents: number,
  trustCents: number,
): number {
  return p1RetirementCents + p2RetirementCents + nonRetirementCents + trustCents;
}

/** Convenience: run the full pipeline. */
export function computeReport(inputs: ReportInputs): ReportTotals {
  const excessCents = computeExcess(inputs.monthlyInflowCents, inputs.monthlyOutflowCents);
  const targetCents = computeTarget(inputs.monthlyOutflowCents, {
    home: inputs.homeownerDeductibleCents,
    auto: inputs.autoDeductibleCents,
    medical: inputs.medicalDeductibleCents,
  });
  const p1RetirementCents = computeRetirementTotal(inputs.retirementAccountsP1);
  const p2RetirementCents = computeRetirementTotal(inputs.retirementAccountsP2);
  const nonRetirementCents = computeNonRetirementTotal(inputs.nonRetirementAccounts);
  const liabilitiesTotalCents = computeLiabilitiesTotal(inputs.liabilities);
  const grandTotalCents = computeGrandTotal(
    p1RetirementCents,
    p2RetirementCents,
    nonRetirementCents,
    inputs.trustValueCents,
  );
  return {
    excessCents,
    targetCents,
    p1RetirementCents,
    p2RetirementCents,
    nonRetirementCents,
    trustCents: inputs.trustValueCents,
    grandTotalCents,
    liabilitiesTotalCents,
  };
}
