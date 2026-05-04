import type { FC } from 'hono/jsx';
import type { ClientStatus, ListedClient } from '../../lib/clients.js';
import { AppLayout } from '../layouts/app-layout.js';

const STATUS_LABEL: Record<ClientStatus, string> = {
  ready: 'Ready',
  stale: 'Balances stale',
  needs_setup: 'Needs setup',
};

const meetingDateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatPersons(persons: ListedClient['persons']): string {
  if (persons.length === 0) return 'No persons added yet';
  if (persons.length === 1) {
    const p = persons[0];
    return p ? `${p.firstName} ${p.lastName}`.trim() : '';
  }
  const [a, b] = [persons[0], persons[1]];
  if (!a || !b) return '';
  return `${a.firstName} & ${b.firstName} ${b.lastName}`.trim();
}

export const ClientsListPage: FC<{
  userName: string;
  userRole: string | null;
  rows: ListedClient[];
}> = ({ userName, userRole, rows }) => (
  <AppLayout
    title="Households"
    active="clients"
    crumbs={[{ label: 'Clients' }]}
    userName={userName}
    userRole={userRole}
  >
    <header class="clients-header">
      <div>
        <h1 class="clients-title">Households</h1>
        <p class="clients-count">
          {rows.length} {rows.length === 1 ? 'on retainer' : 'on retainer'}
        </p>
      </div>
      <a class="text-link-accent" href="/clients/new">
        + New household
      </a>
    </header>

    {rows.length === 0 ? (
      <ClientsEmpty />
    ) : (
      <ol class="clients-list">
        {rows.map((row) => (
          <li>
            <a class="clients-row" href={`/clients/${row.client.id}`}>
              <div class="clients-row-main">
                <h2 class="clients-row-name">{row.client.householdName}</h2>
                <p class="clients-row-persons">{formatPersons(row.persons)}</p>
              </div>
              <div class="clients-row-meeting">
                <p class="label">Last meeting</p>
                <p class="num clients-row-meeting-date">
                  {row.lastMeetingDate
                    ? meetingDateFormat.format(new Date(row.lastMeetingDate)).toUpperCase()
                    : '—'}
                </p>
              </div>
              <div class="clients-row-status">
                <StatusPill status={row.status} />
              </div>
            </a>
          </li>
        ))}
      </ol>
    )}
  </AppLayout>
);

const StatusPill: FC<{ status: ClientStatus }> = ({ status }) => (
  <span class={`status-pill status-pill-${status}`}>{STATUS_LABEL[status]}</span>
);

const ClientsEmpty: FC = () => (
  <div class="clients-empty">
    <hr />
    <p class="clients-empty-phrase">No households on file.</p>
    <hr />
    <a class="timeline-empty-link" href="/clients/new">
      Add your first &rarr;
    </a>
  </div>
);
