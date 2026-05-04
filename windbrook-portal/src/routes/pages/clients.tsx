import { Hono } from 'hono';
import { z } from 'zod';
import {
  countAccountsByClass,
  countRetirementForPerson,
  createAccount,
  createDraftClient,
  createLiability,
  deleteAccount,
  deleteLiability,
  deletePerson,
  listClients,
  loadClient,
  saveClientHousehold,
  updateAccount,
  updateLiability,
  upsertBudget,
  upsertPerson,
} from '../../lib/clients.js';
import { loadReportsForClient } from '../../lib/reports.js';
import {
  ACCOUNT_CLASSES,
  accountSchema,
  budgetSchema,
  householdSchema,
  liabilitySchema,
  personSchema,
} from '../../lib/validation.js';
import type { AuthVars } from '../../middleware/auth.js';
import { AccountRowView } from '../../views/components/account-row.js';
import { LiabilityRowView } from '../../views/components/liability-row.js';
import { ClientDetailPage } from '../../views/pages/client-detail.js';
import { ClientEditPage } from '../../views/pages/client-edit.js';
import { ClientsListPage } from '../../views/pages/clients-list.js';

const app = new Hono<{ Variables: AuthVars }>();

// =============================================================================
// LIST
// =============================================================================
app.get('/clients', async (c) => {
  const user = c.get('user');
  const role = (user as { role?: string | null }).role ?? null;
  const rows = await listClients();
  return c.html(<ClientsListPage userName={user.name} userRole={role} rows={rows} />);
});

// =============================================================================
// CREATE DRAFT — redirects to /:id/edit so user fills incrementally
// =============================================================================
app.get('/clients/new', async (c) => {
  const id = await createDraftClient();
  return c.redirect(`/clients/${id}/edit`);
});

// =============================================================================
// DETAIL
// =============================================================================
app.get('/clients/:id', async (c) => {
  const user = c.get('user');
  const role = (user as { role?: string | null }).role ?? null;
  const data = await loadClient(c.req.param('id'));
  if (!data) return c.notFound();

  const rawType = c.req.query('type');
  const filterType: 'All' | 'SACS' | 'TCC' =
    rawType === 'SACS' || rawType === 'TCC' ? rawType : 'All';
  const sortDir: 'asc' | 'desc' = c.req.query('sort') === 'asc' ? 'asc' : 'desc';

  const reports = await loadReportsForClient(c.req.param('id'), {
    type: filterType,
    sort: sortDir,
  });

  return c.html(
    <ClientDetailPage
      userName={user.name}
      userRole={role}
      data={data}
      reports={reports}
      filterType={filterType}
      sortDir={sortDir}
    />,
  );
});

// =============================================================================
// EDIT FORM
// =============================================================================
app.get('/clients/:id/edit', async (c) => {
  const user = c.get('user');
  const role = (user as { role?: string | null }).role ?? null;
  const data = await loadClient(c.req.param('id'));
  if (!data) return c.notFound();
  const flash = c.req.query('flash') ?? undefined;
  return c.html(
    <ClientEditPage userName={user.name} userRole={role} data={data} flash={flash} />,
  );
});

// =============================================================================
// SAVE — full upsert from edit form
// =============================================================================
app.post('/clients/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const role = (user as { role?: string | null }).role ?? null;
  const existing = await loadClient(id);
  if (!existing) return c.notFound();

  const form = await c.req.parseBody();
  const flat = stringMap(form);

  const errors: Record<string, string> = {};

  const setIssues = (
    issues: Array<{ path: (string | number)[]; message: string }>,
    prefix: string,
    keyMap: Record<string, string>,
  ) => {
    for (const issue of issues) {
      const head = String(issue.path[0] ?? 'row');
      const formField = keyMap[head] ?? head;
      const key = prefix ? `${prefix}-${formField}` : formField;
      errors[key] = issue.message;
    }
  };

  const HOUSEHOLD_KEYS = {
    householdName: 'householdName',
    meetingCadence: 'meetingCadence',
    trustPropertyAddress: 'trustPropertyAddress',
  };
  const PERSON_KEYS = {
    firstName: 'firstName',
    lastName: 'lastName',
    dateOfBirth: 'dob',
    ssnLastFour: 'ssn',
    monthlyInflowCents: 'monthlyInflow',
  };
  const ACCOUNT_KEYS = {
    accountClass: 'class',
    accountType: 'type',
    institution: 'institution',
    accountNumberLastFour: 'last4',
    personIndex: 'personIndex',
    isJoint: 'isJoint',
    displayOrder: 'displayOrder',
  };
  const LIAB_KEYS = {
    creditorName: 'creditor',
    liabilityType: 'type',
    balanceCents: 'balance',
    interestRateBps: 'rate',
    payoffDate: 'payoff',
    displayOrder: 'displayOrder',
  };
  const BUDGET_KEYS = {
    monthlyOutflowCents: 'monthlyOutflow',
    automatedTransferDay: 'transferDay',
    homeownerDeductibleCents: 'homeownerDeductible',
    autoDeductibleCents: 'autoDeductible',
    medicalDeductibleCents: 'medicalDeductible',
  };

  // ---- Household ----
  const householdParsed = householdSchema.safeParse({
    householdName: flat.get('householdName'),
    meetingCadence: flat.get('meetingCadence') ?? 'quarterly',
    trustPropertyAddress: flat.get('trustPropertyAddress') ?? null,
  });
  if (!householdParsed.success) {
    setIssues(householdParsed.error.issues, '', HOUSEHOLD_KEYS);
  } else {
    await saveClientHousehold(id, householdParsed.data);
  }

  // ---- Persons ----
  const wantsPerson2 = flat.get('hasPerson2') != null;
  for (const idx of [1, 2] as const) {
    if (idx === 2 && !wantsPerson2) {
      await deletePerson(id, 2);
      continue;
    }
    const personParsed = personSchema.safeParse({
      personIndex: idx,
      firstName: flat.get(`person${idx}-firstName`),
      lastName: flat.get(`person${idx}-lastName`),
      dateOfBirth: flat.get(`person${idx}-dob`),
      ssnLastFour: flat.get(`person${idx}-ssn`),
      monthlyInflowCents: flat.get(`person${idx}-monthlyInflow`) ?? '0',
    });
    if (!personParsed.success) {
      setIssues(personParsed.error.issues, `person${idx}`, PERSON_KEYS);
    } else {
      await upsertPerson(id, personParsed.data);
    }
  }

  // ---- Accounts ----
  const accountIds = collectIds(flat, /^acc-([0-9a-f-]+)-/);
  for (const accId of accountIds) {
    const get = (f: string) => flat.get(`acc-${accId}-${f}`);
    const parsed = accountSchema.safeParse({
      accountClass: get('class'),
      accountType: get('type') ?? '',
      institution: get('institution') ?? '',
      accountNumberLastFour: get('last4') ?? '',
      personIndex: get('personIndex') ?? null,
      isJoint: get('isJoint'),
      displayOrder: 0,
    });
    if (!parsed.success) {
      setIssues(parsed.error.issues, `acc-${accId}`, ACCOUNT_KEYS);
      continue;
    }
    if (parsed.data.accountClass === 'retirement') {
      if (parsed.data.personIndex == null || parsed.data.isJoint) {
        errors[`acc-${accId}-row`] =
          'Retirement accounts must be person-owned and not joint';
        continue;
      }
    }
    await updateAccount(accId, parsed.data);
  }

  // ---- Liabilities ----
  const liabilityIds = collectIds(flat, /^liab-([0-9a-f-]+)-/);
  for (const lId of liabilityIds) {
    const get = (f: string) => flat.get(`liab-${lId}-${f}`);
    const parsed = liabilitySchema.safeParse({
      creditorName: get('creditor') ?? '',
      liabilityType: get('type') ?? '',
      balanceCents: get('balance') ?? '0',
      interestRateBps: get('rate') ?? '',
      payoffDate: get('payoff') ?? null,
      displayOrder: 0,
    });
    if (!parsed.success) {
      setIssues(parsed.error.issues, `liab-${lId}`, LIAB_KEYS);
      continue;
    }
    await updateLiability(lId, parsed.data);
  }

  // ---- Budget ----
  const budgetParsed = budgetSchema.safeParse({
    monthlyOutflowCents: flat.get('budget-monthlyOutflow') ?? '0',
    automatedTransferDay: flat.get('budget-transferDay') ?? '28',
    homeownerDeductibleCents: flat.get('budget-homeownerDeductible') ?? '0',
    autoDeductibleCents: flat.get('budget-autoDeductible') ?? '0',
    medicalDeductibleCents: flat.get('budget-medicalDeductible') ?? '0',
  });
  if (!budgetParsed.success) {
    setIssues(budgetParsed.error.issues, 'budget', BUDGET_KEYS);
  } else {
    await upsertBudget(id, budgetParsed.data);
  }

  const fresh = await loadClient(id);
  if (!fresh) return c.notFound();

  if (Object.keys(errors).length > 0) {
    return c.html(
      <ClientEditPage userName={user.name} userRole={role} data={fresh} errors={errors} />,
    );
  }

  return c.redirect(`/clients/${id}`);
});

// =============================================================================
// HTMX FRAGMENTS — accounts
// =============================================================================
const addAccountSchema = z.object({
  class: z.enum(ACCOUNT_CLASSES),
  personIndex: z.coerce.number().int().refine((n) => n === 1 || n === 2).optional(),
});

app.post('/clients/:id/accounts', async (c) => {
  const id = c.req.param('id');
  const data = await loadClient(id);
  if (!data) return c.notFound();

  const body = await c.req.parseBody();
  const parsed = addAccountSchema.safeParse(body);
  if (!parsed.success) return c.text('invalid', 400);

  const cls = parsed.data.class;
  if (cls === 'inflow' || cls === 'outflow' || cls === 'private_reserve') {
    return c.text('SACS-required accounts are auto-created and singletons', 400);
  }

  if (cls === 'retirement') {
    const person = parsed.data.personIndex ?? 1;
    const cap = await countRetirementForPerson(id, person);
    if (cap >= 6) return c.text('Maximum 6 retirement accounts per person', 409);
  }
  if (cls === 'investment') {
    const cap = await countAccountsByClass(id, 'investment');
    if (cap >= 4) return c.text('Maximum 4 investment accounts', 409);
  }
  if (cls === 'non_retirement' || cls === 'trust') {
    const nr = await countAccountsByClass(id, 'non_retirement');
    const tr = await countAccountsByClass(id, 'trust');
    if (nr + tr >= 6) return c.text('Maximum 6 non-retirement / trust accounts', 409);
  }

  const created = await createAccount(id, {
    accountClass: cls,
    personIndex: parsed.data.personIndex ?? null,
  });
  const hasPerson2 = data.persons.some((p) => p.personIndex === 2);
  return c.html(<AccountRowView account={created} clientId={id} hasPerson2={hasPerson2} />);
});

app.delete('/clients/:id/accounts/:accountId', async (c) => {
  const accountId = c.req.param('accountId');
  const data = await loadClient(c.req.param('id'));
  if (!data) return c.notFound();
  const target = data.accounts.find((a) => a.id === accountId);
  if (!target) return c.body(null, 200);
  if (target.accountClass === 'inflow' || target.accountClass === 'outflow' || target.accountClass === 'private_reserve') {
    return c.text('SACS-required accounts cannot be deleted', 409);
  }
  await deleteAccount(accountId);
  return c.body(null, 200);
});

// =============================================================================
// HTMX FRAGMENTS — liabilities
// =============================================================================
app.post('/clients/:id/liabilities', async (c) => {
  const id = c.req.param('id');
  const exists = await loadClient(id);
  if (!exists) return c.notFound();
  const created = await createLiability(id);
  return c.html(<LiabilityRowView liability={created} clientId={id} />);
});

app.delete('/clients/:id/liabilities/:liabilityId', async (c) => {
  await deleteLiability(c.req.param('liabilityId'));
  return c.body(null, 200);
});

// =============================================================================
// helpers
// =============================================================================
function stringMap(body: Record<string, string | File | (string | File)[]>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === 'string') m.set(k, v);
    else if (Array.isArray(v)) {
      const first = v[0];
      if (typeof first === 'string') m.set(k, first);
    }
  }
  return m;
}

function collectIds(flat: Map<string, string>, re: RegExp): Set<string> {
  const ids = new Set<string>();
  for (const key of flat.keys()) {
    const m = key.match(re);
    if (m?.[1]) ids.add(m[1]);
  }
  return ids;
}

export default app;
