import type { FC } from 'hono/jsx';
import { formatCents } from '../../lib/format.js';
import type { ReportTotals } from '../../lib/calculations.js';

export type CalcPanelProps = {
  clientId: string;
  reportType: 'SACS' | 'TCC';
  totals: ReportTotals;
  fieldsReady: number;
  fieldsTotal: number;
  hasMeetingDate: boolean;
};

export const CalculationsPanel: FC<CalcPanelProps> = ({
  clientId: _clientId,
  reportType,
  totals,
  fieldsReady,
  fieldsTotal,
  hasMeetingDate,
}) => {
  const ready = fieldsReady === fieldsTotal && hasMeetingDate;
  return (
    <div id="calculations" class="calc-panel">
      <p class="form-section-label" style="margin-bottom: 24px">Calculations</p>

      <dl class="calc-grid">
        <dt>Excess</dt>
        <dd class="num">{formatCentsSigned(totals.excessCents)} <span class="calc-unit">/ mo</span></dd>

        <dt>Target</dt>
        <dd class="num">{formatCents(totals.targetCents)}</dd>

        {reportType === 'TCC' ? (
          <>
            <dt>Person 1 retirement</dt>
            <dd class="num">{formatCents(totals.p1RetirementCents)}</dd>

            <dt>Person 2 retirement</dt>
            <dd class="num">{formatCents(totals.p2RetirementCents)}</dd>

            <dt>Non-retirement</dt>
            <dd class="num">{formatCents(totals.nonRetirementCents)}</dd>

            <dt>Trust</dt>
            <dd class="num">{formatCents(totals.trustCents)}</dd>
          </>
        ) : null}
      </dl>

      {reportType === 'TCC' ? (
        <div class="calc-grand">
          <p class="calc-grand-label">Grand Total</p>
          <p class="calc-grand-value num">{formatCents(totals.grandTotalCents)}</p>
          <p class="calc-liabilities num">
            <span aria-hidden="true">— </span>
            <span class="calc-liabilities-label">Liabilities</span>{' '}
            {formatCents(totals.liabilitiesTotalCents)}
          </p>
        </div>
      ) : null}

      <button
        type="submit"
        class={`generate-btn ${ready ? '' : 'is-disabled'}`}
        disabled={!ready}
        aria-disabled={!ready}
      >
        Generate Report
      </button>
      <p class="generate-readiness num">
        {fieldsReady} of {fieldsTotal} fields ready{hasMeetingDate ? '' : ' · meeting date required'}
      </p>
    </div>
  );
};

function formatCentsSigned(cents: number): string {
  if (cents < 0) return `(${formatCents(Math.abs(cents))})`;
  return formatCents(cents);
}
