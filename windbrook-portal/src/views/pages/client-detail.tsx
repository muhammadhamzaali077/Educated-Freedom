import type { FC } from 'hono/jsx';
import type { FullClient } from '../../lib/clients.js';
import { formatCents } from '../../lib/format.js';
import type { ReportHistoryRow } from '../../lib/reports.js';
import { AppLayout } from '../layouts/app-layout.js';

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const yearFmt = new Intl.DateTimeFormat('en-US', { year: 'numeric' });

const tsFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export const ClientDetailPage: FC<{
  userName: string;
  userRole: string | null;
  data: FullClient;
  reports: ReportHistoryRow[];
  filterType: 'All' | 'SACS' | 'TCC';
  sortDir: 'asc' | 'desc';
}> = ({ userName, userRole, data, reports, filterType, sortDir }) => {
  const { client, persons, accounts, liabilities, budget } = data;

  return (
    <AppLayout
      title={client.householdName}
      active="clients"
      crumbs={[{ label: 'Clients', href: '/clients' }, { label: client.householdName }]}
      userName={userName}
      userRole={userRole}
    >
      <header class="form-header">
        <h1 class="form-title">{client.householdName}</h1>
        <p class="label">{persons.length === 0 ? 'No persons yet' : persons.map((p) => `${p.firstName} ${p.lastName}`).join(' & ')}</p>
        <div class="form-header-actions">
          <a href={`/clients/${client.id}/edit`} class="text-link-accent">
            Edit profile &rarr;
          </a>
          <span aria-hidden="true" class="report-detail-divider"> · </span>
          <a href={`/clients/${client.id}/reports/new?type=SACS`} class="text-link-accent">
            New SACS &rarr;
          </a>
          <span aria-hidden="true" class="report-detail-divider"> · </span>
          <a href={`/clients/${client.id}/reports/new?type=TCC`} class="text-link-accent">
            New TCC &rarr;
          </a>
        </div>
      </header>

      <ReportHistorySection
        clientId={client.id}
        rows={reports}
        filterType={filterType}
        sortDir={sortDir}
      />

      <section class="detail-section">
        <p class="form-section-label">Persons</p>
        {persons.length === 0 ? (
          <p class="compass-empty">Not yet entered.</p>
        ) : (
          <dl class="detail-grid">
            {persons.map((p) => (
              <>
                <dt>{`${p.firstName} ${p.lastName}`.trim()}</dt>
                <dd>
                  <span class="num">{dateFmt.format(new Date(p.dateOfBirth))}</span> · SSN ••{p.ssnLastFour} ·{' '}
                  Inflow <span class="num">{formatCents(p.monthlyInflowCents)}</span>/mo
                </dd>
              </>
            ))}
          </dl>
        )}
      </section>

      <section class="detail-section">
        <p class="form-section-label">Accounts</p>
        {accounts.length === 0 ? (
          <p class="compass-empty">No accounts.</p>
        ) : (
          <ul class="detail-list">
            {accounts.map((a) => (
              <li>
                <span class="detail-row-type">{a.accountType}</span>
                <span class="detail-row-meta">
                  {a.institution}
                  {a.accountNumberLastFour ? ` ••${a.accountNumberLastFour}` : ''}
                  {a.personIndex ? ` · Person ${a.personIndex}` : a.isJoint ? ' · Joint' : ''}
                </span>
                <span class="label detail-row-class">{a.accountClass.replace('_', ' ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="detail-section">
        <p class="form-section-label">Liabilities</p>
        {liabilities.length === 0 ? (
          <p class="compass-empty">No liabilities recorded.</p>
        ) : (
          <ul class="detail-list">
            {liabilities.map((l) => (
              <li>
                <span class="detail-row-type">{l.creditorName}</span>
                <span class="detail-row-meta">
                  {l.liabilityType} · <span class="num">{formatCents(l.balanceCents)}</span>
                  {l.interestRateBps != null ? (
                    <>
                      {' · '}
                      <span class="num">{(l.interestRateBps / 100).toFixed(2)}%</span>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="detail-section">
        <p class="form-section-label">Expense Budget</p>
        {budget ? (
          <dl class="detail-grid">
            <dt>Outflow / month</dt>
            <dd class="num">{formatCents(budget.monthlyOutflowCents)}</dd>
            <dt>Auto-transfer day</dt>
            <dd class="num">{budget.automatedTransferDay}</dd>
            <dt>Deductibles</dt>
            <dd>
              Home <span class="num">{formatCents(budget.homeownerDeductibleCents)}</span> · Auto{' '}
              <span class="num">{formatCents(budget.autoDeductibleCents)}</span> · Medical{' '}
              <span class="num">{formatCents(budget.medicalDeductibleCents)}</span>
            </dd>
          </dl>
        ) : (
          <p class="compass-empty">Not yet entered.</p>
        )}
      </section>
    </AppLayout>
  );
};

const ReportHistorySection: FC<{
  clientId: string;
  rows: ReportHistoryRow[];
  filterType: 'All' | 'SACS' | 'TCC';
  sortDir: 'asc' | 'desc';
}> = ({ clientId, rows, filterType, sortDir }) => {
  const sortToggleHref = (next: 'asc' | 'desc') =>
    `/clients/${clientId}?type=${filterType}&sort=${next}`;
  const filterHref = (next: 'All' | 'SACS' | 'TCC') =>
    `/clients/${clientId}?type=${next}&sort=${sortDir}`;

  return (
    <section class="detail-section history-section">
      <h2 class="history-title">
        <em>Report history</em>
      </h2>

      <div class="history-controls">
        <div class="history-filters">
          <a class={`history-filter${filterType === 'All' ? ' is-active' : ''}`} href={filterHref('All')}>
            All
          </a>
          <a class={`history-filter${filterType === 'SACS' ? ' is-active' : ''}`} href={filterHref('SACS')}>
            SACS
          </a>
          <a class={`history-filter${filterType === 'TCC' ? ' is-active' : ''}`} href={filterHref('TCC')}>
            TCC
          </a>
        </div>
        <div class="history-sort">
          <a
            class={`history-sort-link${sortDir === 'desc' ? ' is-active' : ''}`}
            href={sortToggleHref('desc')}
          >
            Most recent first
          </a>
          <span aria-hidden="true" class="history-sep">·</span>
          <a
            class={`history-sort-link${sortDir === 'asc' ? ' is-active' : ''}`}
            href={sortToggleHref('asc')}
          >
            Oldest first
          </a>
        </div>
      </div>

      {rows.length === 0 ? (
        <p class="compass-empty">No reports generated yet.</p>
      ) : (
        <ol class="history-list">
          {rows.map((row) => (
            <HistoryRow clientId={clientId} row={row} />
          ))}
        </ol>
      )}
    </section>
  );
};

const HistoryRow: FC<{ clientId: string; row: ReportHistoryRow }> = ({ clientId, row }) => {
  const meeting = new Date(`${row.report.meetingDate}T00:00:00`);
  return (
    <li class="history-row">
      <a class="history-row-link" href={`/clients/${clientId}/reports/${row.report.id}`} aria-label={`Open ${row.report.reportType} from ${row.report.meetingDate}`}>
        <div class="history-row-date">
          <span class="history-row-day">{dayFmt.format(meeting)}</span>
          <span class="history-row-year">{yearFmt.format(meeting)}</span>
        </div>
        <span class={`type-pill type-pill-${row.report.reportType.toLowerCase()}`}>
          {row.report.reportType}
        </span>
        <span class="history-row-meta">
          <span class="history-row-by">{row.generatedByName}</span>
          <span class="history-row-ts">{tsFmt.format(row.report.generatedAt)}</span>
        </span>
        {row.staleCount > 0 ? (
          <span class="history-row-stale" aria-label={`${row.staleCount} stale balances`}>
            <span class="history-row-stale-asterisk">*</span> {row.staleCount}
          </span>
        ) : (
          <span class="history-row-stale-empty" aria-hidden="true" />
        )}
      </a>
      <div class="history-row-actions">
        <a class="action-button-sm" href={`/clients/${clientId}/reports/${row.report.id}`}>
          View
        </a>
        <form method="post" action={`/clients/${clientId}/reports/${row.report.id}/export/pdf`} class="history-inline-form">
          <button type="submit" class="action-button-sm">PDF</button>
        </form>
        <a
          class="action-button-sm"
          href={`/clients/${clientId}/reports/new?type=${row.report.reportType}&from=${row.report.id}`}
        >
          Duplicate as new
        </a>
      </div>
    </li>
  );
};
