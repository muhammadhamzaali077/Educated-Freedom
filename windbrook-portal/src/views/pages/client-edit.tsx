import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';
import type { FullClient, PersonRow } from '../../lib/clients.js';
import { AccountRowView } from '../components/account-row.js';
import { LiabilityRowView } from '../components/liability-row.js';
import { AppLayout } from '../layouts/app-layout.js';

const dollars = (cents: number) => (cents / 100).toFixed(2);
const dollarsOrEmpty = (cents: number | null | undefined) =>
  cents == null ? '' : (cents / 100).toFixed(2);

export type FieldErrors = Record<string, string>;

type EditProps = {
  userName: string;
  userRole: string | null;
  data: FullClient;
  errors?: FieldErrors;
  flash?: string;
};

const FORM_VALIDATOR = `
(function(){
  function showError(field, message){
    const slot = field.nextElementSibling && field.nextElementSibling.classList.contains('field-error') ? field.nextElementSibling : null;
    if (!slot) return;
    if (message){ slot.textContent = message; field.setAttribute('aria-invalid','true'); }
    else { slot.textContent = ''; field.removeAttribute('aria-invalid'); }
  }
  function validate(field){
    const rule = field.getAttribute('data-validate');
    if (!rule) return;
    const v = (field.value || '').trim();
    if (rule === 'required'){ return showError(field, v ? '' : 'Required.'); }
    if (rule === 'last4'){ return showError(field, /^(\\d{4})?$/.test(v) ? '' : 'Four digits or blank.'); }
    if (rule === 'ssn'){ return showError(field, /^\\d{4}$/.test(v) ? '' : 'Four digits.'); }
    if (rule === 'money'){
      if (!v) return showError(field, '');
      const n = Number(v.replace(/[$,\\s]/g,''));
      return showError(field, (Number.isFinite(n) && n >= 0) ? '' : 'Use a positive amount.');
    }
    if (rule === 'rate'){
      if (!v) return showError(field, '');
      const n = Number(v.replace(/[%\\s]/g,''));
      return showError(field, (Number.isFinite(n) && n >= 0 && n <= 100) ? '' : 'Use a percent between 0 and 100.');
    }
    if (rule === 'dob'){
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(v)) return showError(field, 'Use YYYY-MM-DD.');
      const d = new Date(v + 'T00:00:00Z');
      if (Number.isNaN(d.getTime()) || d.getTime() > Date.now()) return showError(field, 'Not in the future.');
      const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear()-18);
      return showError(field, d.getTime() <= cutoff.getTime() ? '' : 'Person must be 18+.');
    }
    if (rule === 'day'){
      const n = Number(v);
      return showError(field, (Number.isInteger(n) && n >= 1 && n <= 31) ? '' : '1-31.');
    }
  }
  document.addEventListener('blur', function(e){
    const t = e.target;
    if (t && t.matches && t.matches('[data-validate]')) validate(t);
  }, true);
  document.addEventListener('htmx:afterSwap', function(){
    document.querySelectorAll('[data-validate][aria-invalid]').forEach(function(f){ validate(f); });
  });
  document.addEventListener('change', function(e){
    const t = e.target;
    if (t && t.id === 'add-spouse-toggle'){
      const block = document.getElementById('person2-block');
      if (block) block.hidden = !t.checked;
    }
  });
})();
`;

export const ClientEditPage: FC<EditProps> = ({
  userName,
  userRole,
  data,
  errors = {},
  flash,
}) => {
  const { client, persons, accounts, liabilities, budget } = data;
  const person1 = persons.find((p) => p.personIndex === 1) ?? null;
  const person2 = persons.find((p) => p.personIndex === 2) ?? null;
  const hasPerson2 = person2 != null;
  const err = (k: string): string | undefined => errors[k];
  const inv = (k: string) => (errors[k] ? 'true' : undefined);

  const grouped = {
    retirement: accounts.filter((a) => a.accountClass === 'retirement'),
    inflow: accounts.find((a) => a.accountClass === 'inflow') ?? null,
    outflow: accounts.find((a) => a.accountClass === 'outflow') ?? null,
    privateReserve: accounts.find((a) => a.accountClass === 'private_reserve') ?? null,
    investment: accounts.filter((a) => a.accountClass === 'investment'),
    other: accounts.filter((a) => a.accountClass === 'non_retirement' || a.accountClass === 'trust'),
  };

  const retirementByPerson = {
    1: grouped.retirement.filter((a) => a.personIndex === 1).length,
    2: grouped.retirement.filter((a) => a.personIndex === 2).length,
  };

  return (
    <AppLayout
      title={`Edit · ${client.householdName}`}
      active="clients"
      crumbs={[
        { label: 'Clients', href: '/clients' },
        { label: client.householdName },
      ]}
      userName={userName}
      userRole={userRole}
    >
      <header class="form-header">
        <h1 class="form-title">{client.householdName || 'New Household'}</h1>
        <p class="label">Editing client profile</p>
        {flash ? <p class="form-flash-inline">{flash}</p> : null}
      </header>

      <form method="post" action={`/clients/${client.id}`} class="client-form" novalidate>
        {/* SECTION 1 — HOUSEHOLD */}
        <section class="form-section" aria-labelledby="section-household">
          <p class="form-section-label" id="section-household">
            Household
          </p>
          <div class="form-grid form-grid-2">
            <Field label="Household name" hint="Used in report headers" error={err('householdName')}>
              <input
                type="text"
                name="householdName"
                class="field-input"
                value={client.householdName}
                required
                data-validate="required"
                aria-invalid={inv('householdName')}
              />
            </Field>
            <Field label="Meeting cadence" error={err('meetingCadence')}>
              <select name="meetingCadence" class="field-input" aria-invalid={inv('meetingCadence')}>
                <option value="quarterly" selected={client.meetingCadence === 'quarterly'}>
                  Quarterly
                </option>
                <option value="semiannual" selected={client.meetingCadence === 'semiannual'}>
                  Semiannual
                </option>
                <option value="annual" selected={client.meetingCadence === 'annual'}>
                  Annual
                </option>
              </select>
            </Field>
            <Field label="Trust property address" hint="Optional — used for Zillow lookups">
              <input
                type="text"
                name="trustPropertyAddress"
                class="field-input"
                value={client.trustPropertyAddress ?? ''}
              />
            </Field>
          </div>
        </section>

        {/* SECTION 2 — PERSONS */}
        <section class="form-section" aria-labelledby="section-persons">
          <p class="form-section-label" id="section-persons">
            Persons
          </p>

          <PersonForm person={person1} index={1} errors={errors} />

          <label class="spouse-toggle">
            <input
              type="checkbox"
              id="add-spouse-toggle"
              name="hasPerson2"
              value="1"
              checked={hasPerson2}
            />
            <span>Add spouse / second person</span>
          </label>

          <div id="person2-block" hidden={!hasPerson2}>
            <PersonForm person={person2} index={2} errors={errors} />
          </div>
        </section>

        {/* SECTION 3 — ACCOUNTS */}
        <section class="form-section" aria-labelledby="section-accounts">
          <p class="form-section-label" id="section-accounts">
            Accounts
          </p>

          <SubSection title="Retirement">
            <p class="sub-help">
              Tax-deferred accounts owned by exactly one spouse. Maximum 6 per person.
            </p>
            <div id="retirement-list" class="acc-list">
              {grouped.retirement.map((a) => (
                <AccountRowView account={a} clientId={client.id} hasPerson2={hasPerson2} errors={errors} />
              ))}
            </div>
            <AddRetirementButtons clientId={client.id} hasPerson2={hasPerson2} caps={retirementByPerson} />
          </SubSection>

          <SubSection title="Inflow / Outflow / Private Reserve">
            <p class="sub-help">Required cashflow accounts — Pinnacle by default.</p>
            <div class="acc-list">
              {grouped.inflow ? (
                <AccountRowView account={grouped.inflow} clientId={client.id} hasPerson2={hasPerson2} errors={errors} />
              ) : null}
              {grouped.outflow ? (
                <AccountRowView account={grouped.outflow} clientId={client.id} hasPerson2={hasPerson2} errors={errors} />
              ) : null}
              {grouped.privateReserve ? (
                <AccountRowView account={grouped.privateReserve} clientId={client.id} hasPerson2={hasPerson2} errors={errors} />
              ) : null}
            </div>
          </SubSection>

          <SubSection title="Investment Brokerage">
            <p class="sub-help">Schwab side of SACS page 2. Maximum 4 accounts.</p>
            <div id="investment-list" class="acc-list">
              {grouped.investment.map((a) => (
                <AccountRowView account={a} clientId={client.id} hasPerson2={hasPerson2} errors={errors} />
              ))}
            </div>
            <button
              type="button"
              class="text-link-accent add-row-link"
              hx-post={`/clients/${client.id}/accounts`}
              hx-vals={'{"class":"investment"}'}
              hx-target="#investment-list"
              hx-swap="beforeend"
              disabled={grouped.investment.length >= 4}
            >
              + Add investment account
            </button>
          </SubSection>

          <SubSection title="Other Non-Retirement">
            <p class="sub-help">Brokerage, stock plans, family trust. Maximum 6.</p>
            <div id="other-list" class="acc-list">
              {grouped.other.map((a) => (
                <AccountRowView account={a} clientId={client.id} hasPerson2={hasPerson2} errors={errors} />
              ))}
            </div>
            <button
              type="button"
              class="text-link-accent add-row-link"
              hx-post={`/clients/${client.id}/accounts`}
              hx-vals={'{"class":"non_retirement"}'}
              hx-target="#other-list"
              hx-swap="beforeend"
              disabled={grouped.other.length >= 6}
            >
              + Add non-retirement account
            </button>
          </SubSection>
        </section>

        {/* SECTION 4 — BUDGET */}
        <section class="form-section" aria-labelledby="section-budget">
          <p class="form-section-label" id="section-budget">
            Expense Budget
          </p>
          <div class="form-grid form-grid-2">
            <Field label="Monthly outflow ($)" hint="Agreed expense budget" error={err('budget-monthlyOutflow')}>
              <input
                type="text"
                inputmode="decimal"
                name="budget-monthlyOutflow"
                class="field-input num"
                value={budget ? dollars(budget.monthlyOutflowCents) : ''}
                data-validate="money"
                aria-invalid={inv('budget-monthlyOutflow')}
              />
            </Field>
            <Field label="Automated transfer day" hint="Day of month, 1–31" error={err('budget-transferDay')}>
              <input
                type="number"
                min={1}
                max={31}
                name="budget-transferDay"
                class="field-input num"
                value={budget?.automatedTransferDay ?? 28}
                data-validate="day"
                aria-invalid={inv('budget-transferDay')}
              />
            </Field>
            <Field label="Homeowner deductible ($)" error={err('budget-homeownerDeductible')}>
              <input
                type="text"
                inputmode="decimal"
                name="budget-homeownerDeductible"
                class="field-input num"
                value={dollarsOrEmpty(budget?.homeownerDeductibleCents)}
                data-validate="money"
                aria-invalid={inv('budget-homeownerDeductible')}
              />
            </Field>
            <Field label="Auto deductible ($)" hint="Single car — doubled in Target calc" error={err('budget-autoDeductible')}>
              <input
                type="text"
                inputmode="decimal"
                name="budget-autoDeductible"
                class="field-input num"
                value={dollarsOrEmpty(budget?.autoDeductibleCents)}
                data-validate="money"
                aria-invalid={inv('budget-autoDeductible')}
              />
            </Field>
            <Field label="Medical deductible ($)" error={err('budget-medicalDeductible')}>
              <input
                type="text"
                inputmode="decimal"
                name="budget-medicalDeductible"
                class="field-input num"
                value={dollarsOrEmpty(budget?.medicalDeductibleCents)}
                data-validate="money"
                aria-invalid={inv('budget-medicalDeductible')}
              />
            </Field>
          </div>
        </section>

        {/* SECTION 5 — LIABILITIES */}
        <section class="form-section" aria-labelledby="section-liabilities">
          <p class="form-section-label" id="section-liabilities">
            Liabilities
          </p>
          <p class="sub-help">Joint by default. Displayed separately on TCC; never subtracted from Grand Total.</p>
          <div class="liab-grid-header">
            <span>Creditor</span>
            <span>Type</span>
            <span>Balance</span>
            <span>Rate</span>
            <span>Payoff</span>
            <span aria-hidden="true" />
          </div>
          <div id="liability-list" class="liab-list">
            {liabilities.map((l) => (
              <LiabilityRowView liability={l} clientId={client.id} errors={errors} />
            ))}
          </div>
          <button
            type="button"
            class="text-link-accent add-row-link"
            hx-post={`/clients/${client.id}/liabilities`}
            hx-target="#liability-list"
            hx-swap="beforeend"
          >
            + Add liability
          </button>
        </section>

        <footer class="form-footer">
          <a href={`/clients/${client.id}`} class="text-link-muted">
            Cancel
          </a>
          <button type="submit" class="btn btn-primary form-save">
            Save household
          </button>
        </footer>
      </form>

      <script>{raw(FORM_VALIDATOR)}</script>
    </AppLayout>
  );
};

const Field: FC<{ label: string; hint?: string; error?: string; children?: unknown }> = ({
  label,
  hint,
  error,
  children,
}) => (
  <label class="form-field">
    <span class="form-field-label">{label}</span>
    {hint ? <span class="form-field-hint">{hint}</span> : null}
    {children}
    <span class="field-error">{error ?? ''}</span>
  </label>
);

const SubSection: FC<{ title: string; children?: unknown }> = ({ title, children }) => (
  <div class="form-subsection">
    <h3 class="form-subsection-title">{title}</h3>
    {children}
  </div>
);

const PersonForm: FC<{ person: PersonRow | null; index: 1 | 2; errors: FieldErrors }> = ({
  person,
  index,
  errors,
}) => {
  const k = (suffix: string) => `person${index}-${suffix}`;
  const e = (suffix: string) => errors[k(suffix)];
  const inv = (suffix: string) => (errors[k(suffix)] ? 'true' : undefined);
  return (
    <div class="person-block">
      <p class="form-subsection-title">{index === 1 ? 'Person 1' : 'Person 2'}</p>
      <div class="form-grid form-grid-3">
        <Field label="First name" error={e('firstName')}>
          <input
            type="text"
            class="field-input"
            name={k('firstName')}
            value={person?.firstName ?? ''}
            data-validate="required"
            aria-invalid={inv('firstName')}
          />
        </Field>
        <Field label="Last name" error={e('lastName')}>
          <input
            type="text"
            class="field-input"
            name={k('lastName')}
            value={person?.lastName ?? ''}
            data-validate="required"
            aria-invalid={inv('lastName')}
          />
        </Field>
        <Field label="Date of birth" error={e('dob')}>
          <input
            type="date"
            class="field-input"
            name={k('dob')}
            value={person?.dateOfBirth ?? ''}
            data-validate="dob"
            aria-invalid={inv('dob')}
          />
        </Field>
        <Field label="SSN last 4" error={e('ssn')}>
          <input
            type="text"
            inputmode="numeric"
            maxlength={4}
            class="field-input"
            name={k('ssn')}
            value={person?.ssnLastFour ?? ''}
            pattern="[0-9]{4}"
            data-validate="ssn"
            aria-invalid={inv('ssn')}
          />
        </Field>
        <Field label="Monthly inflow ($)" error={e('monthlyInflow')}>
          <input
            type="text"
            inputmode="decimal"
            class="field-input num"
            name={k('monthlyInflow')}
            value={person ? (person.monthlyInflowCents / 100).toFixed(2) : ''}
            data-validate="money"
            aria-invalid={inv('monthlyInflow')}
          />
        </Field>
      </div>
    </div>
  );
};

const AddRetirementButtons: FC<{
  clientId: string;
  hasPerson2: boolean;
  caps: { 1: number; 2: number };
}> = ({ clientId, hasPerson2, caps }) => (
  <div class="add-retirement-row">
    <button
      type="button"
      class="text-link-accent add-row-link"
      hx-post={`/clients/${clientId}/accounts`}
      hx-vals={'{"class":"retirement","personIndex":1}'}
      hx-target="#retirement-list"
      hx-swap="beforeend"
      disabled={caps[1] >= 6}
    >
      + For Person 1
    </button>
    {hasPerson2 ? (
      <button
        type="button"
        class="text-link-accent add-row-link"
        hx-post={`/clients/${clientId}/accounts`}
        hx-vals={'{"class":"retirement","personIndex":2}'}
        hx-target="#retirement-list"
        hx-swap="beforeend"
        disabled={caps[2] >= 6}
      >
        + For Person 2
      </button>
    ) : null}
  </div>
);
