import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';
import { type ReportTotals } from '../../lib/calculations.js';
import type {
  AccountSnapshot,
  LiabilityWithLatest,
} from '../../lib/reports.js';
import { CalculationsPanel } from '../components/calculations-panel.js';
import { ReportPreviewPlaceholder } from '../components/report-preview-placeholder.js';
import { AppLayout } from '../layouts/app-layout.js';

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const formatLastValue = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

type ReportNewProps = {
  userName: string;
  userRole: string | null;
  clientId: string;
  householdName: string;
  reportType: 'SACS' | 'TCC';
  defaultMeetingDate: string;
  person1Name: string | null;
  person2Name: string | null;
  /** All accounts of this client with the latest snapshot (if any). */
  accountSnapshots: AccountSnapshot[];
  liabilities: LiabilityWithLatest[];
  totals: ReportTotals;
  fieldsTotal: number;
  fieldsReady: number;
  /**
   * Optional prefill from a source report ("Duplicate as new" flow). When
   * present, BalanceField/LiabilityField render the source values into the
   * input's `value` so the user lands on a fully-populated checklist.
   */
  prefillBalances?: Map<
    string,
    { balanceCents: number; cashBalanceCents: number | null; isStale: boolean }
  >;
  prefillLiabilities?: Map<string, number>;
};

const FORM_HELPER_JS = `
(function(){
  // Click "Use last" -> fill input + set hidden stale flag + dispatch change
  document.addEventListener('click', function(e){
    var btn = e.target && e.target.closest && e.target.closest('[data-use-last]');
    if (!btn) return;
    e.preventDefault();
    var inputId = btn.getAttribute('data-target');
    var staleId = btn.getAttribute('data-stale');
    var value = btn.getAttribute('data-value');
    var input = document.getElementById(inputId);
    var stale = staleId ? document.getElementById(staleId) : null;
    if (!input) return;
    input.value = value;
    if (stale) stale.value = '1';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    var indicator = document.getElementById(inputId + '-stale-mark');
    if (indicator) indicator.hidden = false;
  });

  // Typing in a balance input clears the "use last" stale flag.
  document.addEventListener('input', function(e){
    var t = e.target;
    if (!t || !t.matches || !t.matches('input[data-balance-input]')) return;
    var staleId = t.getAttribute('data-stale-flag');
    var stale = staleId ? document.getElementById(staleId) : null;
    if (stale && stale.value === '1' && t.value !== t.dataset.lastValue) {
      stale.value = '0';
      var indicator = document.getElementById(t.id + '-stale-mark');
      if (indicator) indicator.hidden = true;
    }
  });
})();
`;

export const ReportNewPage: FC<ReportNewProps> = (props) => {
  return (
    <AppLayout
      title={`New ${props.reportType} · ${props.householdName}`}
      active="reports"
      crumbs={[
        { label: 'Clients', href: '/clients' },
        { label: props.householdName, href: `/clients/${props.clientId}` },
        { label: `New ${props.reportType}` },
      ]}
      userName={props.userName}
      userRole={props.userRole}
    >
      <div class="report-new">
        <form
          method="post"
          action={`/clients/${props.clientId}/reports`}
          class="report-form"
          novalidate
        >
          <input type="hidden" name="reportType" value={props.reportType} />

          <header class="report-form-header">
            <h1 class="form-title">Quarterly Update — {props.householdName}</h1>
            <p class="report-form-subtitle">
              <em>Meeting on </em>
              <input
                type="date"
                name="meetingDate"
                value={props.defaultMeetingDate}
                required
                class="field-input report-meeting-date num"
                aria-label="Meeting date"
              />
              <span class="report-form-subtitle-tag">{props.reportType}</span>
            </p>
          </header>

          <div
            class="report-fields"
            hx-post={`/clients/${props.clientId}/reports/preview`}
            hx-trigger="change delay:300ms from:input, change delay:300ms from:select"
            hx-target="#calculations"
            hx-swap="outerHTML"
            hx-include="closest form"
          >
            {props.reportType === 'SACS' ? (
              <SacsFieldGroups {...props} />
            ) : (
              <TccFieldGroups {...props} />
            )}
          </div>

          <CalculationsPanel
            clientId={props.clientId}
            reportType={props.reportType}
            totals={props.totals}
            fieldsReady={props.fieldsReady}
            fieldsTotal={props.fieldsTotal}
            hasMeetingDate={Boolean(props.defaultMeetingDate)}
          />
        </form>

        <aside class="report-preview-pane" aria-label="Live preview">
          <ReportPreviewPlaceholder reportType={props.reportType} />
        </aside>
      </div>

      <script>{raw(FORM_HELPER_JS)}</script>
    </AppLayout>
  );
};

const SacsFieldGroups: FC<ReportNewProps> = ({ accountSnapshots, prefillBalances }) => {
  const inflow = accountSnapshots.find((s) => s.account.accountClass === 'inflow') ?? null;
  const outflow = accountSnapshots.find((s) => s.account.accountClass === 'outflow') ?? null;
  const reserve = accountSnapshots.find((s) => s.account.accountClass === 'private_reserve') ?? null;
  const investments = accountSnapshots.filter((s) => s.account.accountClass === 'investment');
  const pf = (id: string) => prefillBalances?.get(id);

  return (
    <>
      <FieldSection title="Cashflow accounts">
        {inflow ? <BalanceField snapshot={inflow} cashSubField required prefill={pf(inflow.account.id)} /> : null}
        {outflow ? <BalanceField snapshot={outflow} cashSubField required prefill={pf(outflow.account.id)} /> : null}
        {reserve ? <BalanceField snapshot={reserve} cashSubField required prefill={pf(reserve.account.id)} /> : null}
      </FieldSection>

      {investments.length > 0 ? (
        <FieldSection title="Investment brokerage">
          {investments.map((s) => (
            <BalanceField snapshot={s} cashSubField={false} required={false} prefill={pf(s.account.id)} />
          ))}
        </FieldSection>
      ) : null}
    </>
  );
};

const TccFieldGroups: FC<ReportNewProps> = ({
  accountSnapshots,
  liabilities,
  person1Name,
  person2Name,
  prefillBalances,
  prefillLiabilities,
}) => {
  const p1Retirement = accountSnapshots.filter(
    (s) => s.account.accountClass === 'retirement' && s.account.personIndex === 1,
  );
  const p2Retirement = accountSnapshots.filter(
    (s) => s.account.accountClass === 'retirement' && s.account.personIndex === 2,
  );
  const nonRet = accountSnapshots.filter(
    (s) => s.account.accountClass === 'non_retirement' || s.account.accountClass === 'investment',
  );
  const trustAcc = accountSnapshots.find((s) => s.account.accountClass === 'trust') ?? null;
  const pf = (id: string) => prefillBalances?.get(id);
  const pfLiab = (id: string) => prefillLiabilities?.get(id);

  return (
    <>
      {p1Retirement.length > 0 ? (
        <FieldSection title={`${person1Name ?? 'Person 1'} retirement`}>
          {p1Retirement.map((s) => (
            <BalanceField snapshot={s} cashSubField required prefill={pf(s.account.id)} />
          ))}
        </FieldSection>
      ) : null}

      {p2Retirement.length > 0 ? (
        <FieldSection title={`${person2Name ?? 'Person 2'} retirement`}>
          {p2Retirement.map((s) => (
            <BalanceField snapshot={s} cashSubField required prefill={pf(s.account.id)} />
          ))}
        </FieldSection>
      ) : null}

      {nonRet.length > 0 ? (
        <FieldSection title="Non-retirement">
          {nonRet.map((s) => (
            <BalanceField snapshot={s} cashSubField required prefill={pf(s.account.id)} />
          ))}
        </FieldSection>
      ) : null}

      <FieldSection title="Trust property">
        {trustAcc ? (
          <BalanceField
            snapshot={trustAcc}
            cashSubField={false}
            required
            label="Zillow Zestimate"
            prefill={pf(trustAcc.account.id)}
          />
        ) : (
          <p class="sub-help">No trust account on file. Add one in the client profile to include.</p>
        )}
      </FieldSection>

      {liabilities.length > 0 ? (
        <FieldSection title="Liabilities current balance">
          {liabilities.map((l) => (
            <LiabilityField liability={l} prefillCents={pfLiab(l.liability.id)} />
          ))}
        </FieldSection>
      ) : null}
    </>
  );
};

const FieldSection: FC<{ title: string; children?: unknown }> = ({ title, children }) => (
  <section class="report-field-section">
    <p class="form-section-label">{title}</p>
    <div class="report-field-list">{children}</div>
  </section>
);

const BalanceField: FC<{
  snapshot: AccountSnapshot;
  cashSubField: boolean;
  required: boolean;
  label?: string;
  prefill?: { balanceCents: number; cashBalanceCents: number | null; isStale: boolean };
}> = ({ snapshot, cashSubField, required, label, prefill }) => {
  const a = snapshot.account;
  const last = snapshot.latest;
  const hasLast = last != null;
  const lastDate = hasLast ? dateFmt.format(new Date(last.asOfDate)) : null;
  const lastValueDollars = hasLast ? (last.balanceCents / 100).toFixed(2) : '';
  const balId = `bal-${a.id}`;
  const staleId = `stale-${a.id}`;
  const cashId = `cash-${a.id}`;
  const accLabel = label ?? `${a.accountType}${a.accountNumberLastFour ? ` ••${a.accountNumberLastFour}` : ''}`;
  const balValue = prefill ? (prefill.balanceCents / 100).toFixed(2) : '';
  const cashValue = prefill?.cashBalanceCents != null ? (prefill.cashBalanceCents / 100).toFixed(2) : '';
  const initialStale = prefill?.isStale ? '1' : '0';
  return (
    <div class="report-field">
      <div class="report-field-header">
        <label class="report-field-label" for={balId}>
          {accLabel}
          <span
            id={`${balId}-stale-mark`}
            class="stale-mark"
            aria-label="marked stale"
            hidden={!prefill?.isStale}
          >
            *
          </span>
        </label>
        <span class="report-field-institution">{a.institution}</span>
      </div>
      <div class="report-field-inputs">
        <input
          type="text"
          inputmode="decimal"
          id={balId}
          name={balId}
          value={balValue}
          class="field-input num report-field-input"
          aria-label={`Balance for ${accLabel}`}
          data-balance-input="true"
          data-stale-flag={staleId}
          data-required={required ? 'true' : 'false'}
        />
        {cashSubField ? (
          <input
            type="text"
            inputmode="decimal"
            id={cashId}
            name={cashId}
            value={cashValue}
            class="field-input num report-field-cash"
            placeholder="cash"
            aria-label={`Cash sub-balance for ${accLabel}`}
          />
        ) : null}
      </div>
      <input type="hidden" id={staleId} name={staleId} value={initialStale} />
      {hasLast ? (
        <p class="report-field-last">
          <em>Last: {formatLastValue(last.balanceCents)} as of {lastDate}.</em>{' '}
          <button
            type="button"
            class="text-link-accent report-use-last"
            data-use-last="true"
            data-target={balId}
            data-stale={staleId}
            data-value={lastValueDollars}
          >
            Use last
          </button>
        </p>
      ) : (
        <p class="report-field-last report-field-last-empty">
          <em>No prior value on file.</em>
        </p>
      )}
    </div>
  );
};

const LiabilityField: FC<{ liability: LiabilityWithLatest; prefillCents?: number }> = ({ liability, prefillCents }) => {
  const l = liability.liability;
  const balId = `liabbal-${l.id}`;
  const staleId = `liabstale-${l.id}`;
  const lastDate = dateFmt.format(new Date(liability.latestAsOf));
  const lastValueDollars = (liability.latestBalanceCents / 100).toFixed(2);
  return (
    <div class="report-field">
      <div class="report-field-header">
        <label class="report-field-label" for={balId}>
          {l.creditorName}
          <span
            id={`${balId}-stale-mark`}
            class="stale-mark"
            aria-label="marked stale"
            hidden
          >
            *
          </span>
        </label>
        <span class="report-field-institution">{l.liabilityType}</span>
      </div>
      <input
        type="text"
        inputmode="decimal"
        id={balId}
        name={balId}
        value={prefillCents != null ? (prefillCents / 100).toFixed(2) : ''}
        class="field-input num report-field-input"
        aria-label={`Current balance for ${l.creditorName}`}
        data-balance-input="true"
        data-stale-flag={staleId}
        data-required="true"
      />
      <input type="hidden" id={staleId} name={staleId} value="0" />
      <p class="report-field-last">
        <em>Last: {formatLastValue(liability.latestBalanceCents)} as of {lastDate}.</em>{' '}
        <button
          type="button"
          class="text-link-accent report-use-last"
          data-use-last="true"
          data-target={balId}
          data-stale={staleId}
          data-value={lastValueDollars}
        >
          Use last
        </button>
      </p>
    </div>
  );
};

