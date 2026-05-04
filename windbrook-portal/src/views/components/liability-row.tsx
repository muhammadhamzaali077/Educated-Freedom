import type { FC } from 'hono/jsx';
import type { LiabilityRow } from '../../lib/clients.js';
import { Icon } from './icon.js';

type FieldErrors = Record<string, string>;

const LIABILITY_TYPES = ['Mortgage', 'Auto', 'Credit Card', 'Student Loan', 'Other'] as const;

const dollarsFromCents = (cents: number) => (cents / 100).toFixed(2);
const percentFromBps = (bps: number | null) => (bps == null ? '' : (bps / 100).toFixed(2));

export const LiabilityRowView: FC<{
  liability: LiabilityRow;
  clientId: string;
  errors?: FieldErrors;
}> = ({ liability, clientId, errors = {} }) => {
  const id = liability.id;
  const fname = (f: string) => `liab-${id}-${f}`;
  const inv = (f: string) => (errors[fname(f)] ? 'true' : undefined);
  const showRowError = errors[fname('row')];
  const anyFieldError = ['creditor', 'type', 'balance', 'rate', 'payoff'].some((f) => errors[fname(f)]);
  return (
    <div class="liab-row-wrap">
      <div class="liab-row" data-liability-id={id}>
        <input
          type="text"
          class="field-input"
          name={fname('creditor')}
          value={liability.creditorName}
          placeholder="Creditor"
          aria-label="Creditor"
          data-validate="required"
          aria-invalid={inv('creditor')}
        />
        <select
          class="field-input"
          name={fname('type')}
          aria-label="Type"
          aria-invalid={inv('type')}
        >
          {LIABILITY_TYPES.map((t) => (
            <option value={t} selected={liability.liabilityType === t}>
              {t}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputmode="decimal"
          class="field-input num"
          name={fname('balance')}
          value={dollarsFromCents(liability.balanceCents)}
          placeholder="Balance"
          aria-label="Balance"
          data-validate="money"
          aria-invalid={inv('balance')}
        />
        <input
          type="text"
          inputmode="decimal"
          class="field-input num"
          name={fname('rate')}
          value={percentFromBps(liability.interestRateBps)}
          placeholder="Rate %"
          aria-label="Interest rate percent"
          data-validate="rate"
          aria-invalid={inv('rate')}
        />
        <input
          type="date"
          class="field-input"
          name={fname('payoff')}
          value={liability.payoffDate ?? ''}
          aria-label="Payoff date"
          aria-invalid={inv('payoff')}
        />
        <button
          type="button"
          class="row-delete"
          aria-label="Remove liability"
          hx-delete={`/clients/${clientId}/liabilities/${id}`}
          hx-target="closest .liab-row-wrap"
          hx-swap="outerHTML"
          hx-confirm="Remove this liability?"
        >
          <Icon name="alert-circle" size={14} />
        </button>
      </div>
      {showRowError ? <p class="acc-row-error">{showRowError}</p> : null}
      {anyFieldError && !showRowError ? (
        <p class="acc-row-error">
          {Object.entries(errors)
            .filter(([k]) => k.startsWith(`liab-${id}-`))
            .map(([, v]) => v)
            .join(' · ')}
        </p>
      ) : null}
    </div>
  );
};
