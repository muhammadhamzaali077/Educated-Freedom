import type { FC } from 'hono/jsx';
import type { AccountRow } from '../../lib/clients.js';
import {
  INVESTMENT_TYPES,
  OTHER_NR_TYPES,
  RETIREMENT_TYPES,
} from '../../lib/validation.js';
import { Icon } from './icon.js';

type FieldErrors = Record<string, string>;

type Props = {
  account: AccountRow;
  clientId: string;
  hasPerson2: boolean;
  errors?: FieldErrors;
};

export const AccountRowView: FC<Props> = ({ account, clientId, hasPerson2, errors = {} }) => {
  switch (account.accountClass) {
    case 'inflow':
    case 'outflow':
    case 'private_reserve':
      return <SacsRequiredRow account={account} errors={errors} />;
    case 'retirement':
      return <RetirementRow account={account} clientId={clientId} hasPerson2={hasPerson2} errors={errors} />;
    case 'investment':
      return <InvestmentRow account={account} clientId={clientId} errors={errors} />;
    default:
      return <OtherNonRetirementRow account={account} clientId={clientId} errors={errors} />;
  }
};

const baseFieldName = (id: string, field: string) => `acc-${id}-${field}`;

const HiddenClass: FC<{ id: string; cls: string }> = ({ id, cls }) => (
  <input type="hidden" name={baseFieldName(id, 'class')} value={cls} />
);

const Last4Field: FC<{ id: string; value: string | null; errors: FieldErrors }> = ({
  id,
  value,
  errors,
}) => {
  const key = baseFieldName(id, 'last4');
  return (
    <input
      type="text"
      inputmode="numeric"
      pattern="[0-9]{4}"
      maxlength={4}
      class="field-input field-input-tight"
      name={key}
      value={value ?? ''}
      placeholder="••••"
      aria-label="Last 4 digits"
      data-validate="last4"
      aria-invalid={errors[key] ? 'true' : undefined}
    />
  );
};

const InstitutionField: FC<{ id: string; value: string; errors: FieldErrors }> = ({
  id,
  value,
  errors,
}) => {
  const key = baseFieldName(id, 'institution');
  return (
    <input
      type="text"
      class="field-input"
      name={key}
      value={value}
      placeholder="Institution"
      aria-label="Institution"
      data-validate="required"
      aria-invalid={errors[key] ? 'true' : undefined}
    />
  );
};

const DeleteRowLink: FC<{ clientId: string; accountId: string }> = ({ clientId, accountId }) => (
  <button
    type="button"
    class="row-delete"
    aria-label="Remove row"
    hx-delete={`/clients/${clientId}/accounts/${accountId}`}
    hx-target="closest .acc-row-wrap"
    hx-swap="outerHTML"
    hx-confirm="Remove this account row?"
  >
    <Icon name="alert-circle" size={14} />
  </button>
);

const RowError: FC<{ id: string; errors: FieldErrors }> = ({ id, errors }) => {
  const prefix = `acc-${id}-`;
  const messages = new Set<string>();
  for (const [key, msg] of Object.entries(errors)) {
    if (key.startsWith(prefix) && msg) messages.add(msg);
  }
  if (messages.size === 0) return null;
  return <p class="acc-row-error">{[...messages].join(' · ')}</p>;
};

const SacsRequiredRow: FC<{ account: AccountRow; errors: FieldErrors }> = ({ account, errors }) => (
  <div class="acc-row-wrap">
    <div class="acc-row acc-row-fixed" data-account-id={account.id}>
      <HiddenClass id={account.id} cls={account.accountClass} />
      <div class="acc-row-label">{account.accountType}</div>
      <InstitutionField id={account.id} value={account.institution} errors={errors} />
      <Last4Field id={account.id} value={account.accountNumberLastFour} errors={errors} />
      <span class="acc-row-fixed-tag" aria-label="required for SACS">
        required
      </span>
    </div>
    <RowError id={account.id} errors={errors} />
  </div>
);

const RetirementRow: FC<{
  account: AccountRow;
  clientId: string;
  hasPerson2: boolean;
  errors: FieldErrors;
}> = ({ account, clientId, hasPerson2, errors }) => {
  const personKey = baseFieldName(account.id, 'personIndex');
  return (
    <div class="acc-row-wrap">
      <div class="acc-row acc-row-retirement" data-account-id={account.id}>
        <HiddenClass id={account.id} cls="retirement" />
        <select
          class="field-input field-input-tight"
          name={personKey}
          aria-label="Person"
          data-validate="required"
          aria-invalid={errors[personKey] ? 'true' : undefined}
        >
          <option value="1" selected={account.personIndex === 1}>
            Person 1
          </option>
          <option value="2" selected={account.personIndex === 2} disabled={!hasPerson2}>
            Person 2{hasPerson2 ? '' : ' (add spouse)'}
          </option>
        </select>
        <select
          class="field-input"
          name={baseFieldName(account.id, 'type')}
          aria-label="Account type"
        >
          {RETIREMENT_TYPES.map((t) => (
            <option value={t} selected={account.accountType === t}>
              {t}
            </option>
          ))}
        </select>
        <InstitutionField id={account.id} value={account.institution} errors={errors} />
        <Last4Field id={account.id} value={account.accountNumberLastFour} errors={errors} />
        <DeleteRowLink clientId={clientId} accountId={account.id} />
      </div>
      <RowError id={account.id} errors={errors} />
    </div>
  );
};

const InvestmentRow: FC<{ account: AccountRow; clientId: string; errors: FieldErrors }> = ({
  account,
  clientId,
  errors,
}) => (
  <div class="acc-row-wrap">
    <div class="acc-row acc-row-investment" data-account-id={account.id}>
      <HiddenClass id={account.id} cls="investment" />
      <select
        class="field-input"
        name={baseFieldName(account.id, 'type')}
        aria-label="Account type"
      >
        {INVESTMENT_TYPES.map((t) => (
          <option value={t} selected={account.accountType === t}>
            {t}
          </option>
        ))}
      </select>
      <InstitutionField id={account.id} value={account.institution} errors={errors} />
      <Last4Field id={account.id} value={account.accountNumberLastFour} errors={errors} />
      <DeleteRowLink clientId={clientId} accountId={account.id} />
    </div>
    <RowError id={account.id} errors={errors} />
  </div>
);

const OtherNonRetirementRow: FC<{
  account: AccountRow;
  clientId: string;
  errors: FieldErrors;
}> = ({ account, clientId, errors }) => {
  const knownType = OTHER_NR_TYPES.find((t) => t === account.accountType) ?? 'Other';
  return (
    <div class="acc-row-wrap">
      <div class="acc-row acc-row-other" data-account-id={account.id}>
        <HiddenClass
          id={account.id}
          cls={account.accountClass === 'trust' ? 'trust' : 'non_retirement'}
        />
        <select
          class="field-input"
          name={baseFieldName(account.id, 'type')}
          aria-label="Account type"
        >
          {OTHER_NR_TYPES.map((t) => (
            <option value={t} selected={knownType === t}>
              {t}
            </option>
          ))}
        </select>
        <InstitutionField id={account.id} value={account.institution} errors={errors} />
        <Last4Field id={account.id} value={account.accountNumberLastFour} errors={errors} />
        <label class="acc-joint">
          <input
            type="checkbox"
            name={baseFieldName(account.id, 'isJoint')}
            checked={account.isJoint}
          />
          <span>Joint</span>
        </label>
        <DeleteRowLink clientId={clientId} accountId={account.id} />
      </div>
      <RowError id={account.id} errors={errors} />
    </div>
  );
};
