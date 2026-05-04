import type { FC } from 'hono/jsx';
import { greetingFor } from '../../lib/greeting.js';
import type { DashboardData } from '../../lib/reports.js';
import { formatCents } from '../../lib/format.js';
import { Sparkline } from '../components/sparkline.js';
import { AppLayout } from '../layouts/app-layout.js';

const longDateFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

function ordinalDay(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function formatGreetingDate(d: Date): string {
  // "Friday, April 21st."
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(d);
  const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(d);
  return `${weekday}, ${month} ${ordinalDay(d.getDate())}.`;
}

const tsFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const STATUS_LABEL: Record<DashboardData['households'][number]['status'], string> = {
  ready: 'Ready',
  stale: 'Balances stale',
  needs_setup: 'Needs setup',
};

type Props = {
  userName: string;
  userRole: string | null;
  data: DashboardData;
};

export const DashboardHome: FC<Props> = ({ userName, userRole, data }) => {
  const now = new Date();
  return (
    <AppLayout
      title="Dashboard"
      active="dashboard"
      crumbs={[{ label: 'Dashboard' }]}
      userName={userName}
      userRole={userRole}
    >
      <Hero greetingFor={greetingFor(userName, now)} dateLine={formatGreetingDate(now)} hero={data.hero} />
      <SecondaryStats secondary={data.secondary} />
      <hr class="dash-section-rule" />
      <div class="dash-grid">
        <HouseholdGrid households={data.households} />
        <ActivityLedger activity={data.activity} />
      </div>
    </AppLayout>
  );
};

const Hero: FC<{
  greetingFor: string;
  dateLine: string;
  hero: DashboardData['hero'];
}> = ({ greetingFor, dateLine, hero }) => (
  <section class="dash-hero">
    <h1 class="dash-greeting dash-stagger dash-stagger-1">
      {greetingFor.replace(/\.$/, '')}
      <span class="dash-greeting-suffix">
        <span class="dash-greeting-dash"> — </span>
        <em>{dateLine}</em>
      </span>
    </h1>

    <div class="dash-hero-row dash-stagger dash-stagger-2">
      <HeroPrimary hero={hero} />
      <HeroSparkline hero={hero} />
    </div>
  </section>
);

const HeroPrimary: FC<{ hero: DashboardData['hero'] }> = ({ hero }) => (
  <div class="dash-hero-primary">
    <p class="dash-eyebrow">Quarterly Meetings Prepared</p>
    <p class="dash-hero-number num">
      {hero.quarterlyPrepared}
      <span class="dash-hero-of"> of {hero.quarterlyTotalClients}</span>
    </p>
    <p class="dash-hero-context">
      <em>{hero.contextPhrase}</em>
    </p>
  </div>
);

const HeroSparkline: FC<{ hero: DashboardData['hero'] }> = ({ hero }) => (
  <div class="dash-hero-sparkline">
    <p class="dash-eyebrow">Reports Generated, Last 12 Months</p>
    <Sparkline data={hero.sparkline} width={320} height={80} />
    <p class="dash-sparkline-caption num">
      Peak: {hero.sparklinePeak.count} in {hero.sparklinePeak.monthLabel}
      <span class="dash-sparkline-sep" aria-hidden="true"> · </span>
      This month: {hero.sparklineCurrent}
    </p>
  </div>
);

const SecondaryStats: FC<{ secondary: DashboardData['secondary'] }> = ({ secondary }) => (
  <section class="dash-secondary dash-stagger dash-stagger-3">
    <Stat
      label="Average Portfolio"
      value={
        secondary.averagePortfolioCents != null
          ? formatCents(secondary.averagePortfolioCents)
          : '—'
      }
      footnote={
        secondary.portfolioCount > 0
          ? `across ${secondary.portfolioCount} household${secondary.portfolioCount === 1 ? '' : 's'} on retainer`
          : 'no households reporting yet'
      }
    />

    <Stat
      label="Stale Balances"
      value={String(secondary.staleAccountCount)}
      footnote={
        secondary.mostStale ? (
          <a class="text-link-muted" href={`/clients/${secondary.mostStale.clientId}/edit`}>
            <em>{secondary.mostStale.householdName}, {secondary.mostStale.daysSince} days</em>
          </a>
        ) : (
          <em>nothing stale right now</em>
        )
      }
    />

    <Stat
      label="Next Meeting"
      value={
        secondary.nextMeeting
          ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(secondary.nextMeeting.date)
          : '—'
      }
      footnote={
        secondary.nextMeeting ? (
          <a class="text-link-muted" href={`/clients/${secondary.nextMeeting.clientId}`}>
            <em>{secondary.nextMeeting.householdName}, in {secondary.nextMeeting.daysFromNow} days</em>
          </a>
        ) : (
          <em>none scheduled</em>
        )
      }
    />
  </section>
);

const Stat: FC<{ label: string; value: string; footnote: unknown }> = ({ label, value, footnote }) => (
  <div class="dash-stat">
    <p class="dash-eyebrow">{label}</p>
    <p class="dash-stat-value num">{value}</p>
    <p class="dash-stat-footnote">{footnote}</p>
  </div>
);

const HouseholdGrid: FC<{ households: DashboardData['households'] }> = ({ households }) => {
  if (households.length === 0) {
    return (
      <section class="dash-grid-households" aria-label="Households">
        <div class="dash-empty">
          <hr />
          <p class="dash-empty-phrase">Begin with a household.</p>
          <hr />
          <a class="text-link-accent" href="/clients/new">Create your first client &rarr;</a>
        </div>
      </section>
    );
  }
  return (
    <section class="dash-grid-households" aria-label="Households">
      <p class="dash-eyebrow dash-grid-heading">Households</p>
      <div class="dash-cards">
        {households.map((h, i) => (
          <HouseholdCard household={h} index={i} />
        ))}
        <AddHouseholdCell index={households.length} />
      </div>
    </section>
  );
};

const HouseholdCard: FC<{
  household: DashboardData['households'][number];
  index: number;
}> = ({ household, index }) => {
  const staggerClass = `dash-stagger dash-stagger-card-${Math.min(index, 7)}`;
  const deltaClass =
    household.deltaCents == null
      ? ''
      : household.deltaCents > 0
        ? ' card-delta-up'
        : household.deltaCents < 0
          ? ' card-delta-down'
          : '';
  return (
    <article class={`dash-card ${staggerClass}`}>
      {/* Stretched-link cover — the whole card is a click target into the
          household detail page. The Generate-report anchor below sits at a
          higher z-index so it captures its own clicks and routes to the
          new-report flow instead. */}
      <a
        class="dash-card-cover"
        href={`/clients/${household.id}`}
        aria-label={`View ${household.householdName}`}
      ></a>
      <h3 class="dash-card-name">{household.householdName}</h3>
      <p class="dash-card-persons">{household.personsLabel}</p>

      <div class="dash-card-body">
        <p class="dash-eyebrow dash-card-eyebrow">Net worth</p>
        <p class="dash-card-net num">
          {household.netWorthCents != null ? formatCents(household.netWorthCents) : '—'}
        </p>
        {household.deltaCents != null ? (
          <p class={`dash-card-delta num${deltaClass}`}>
            {household.deltaCents >= 0 ? '+' : '−'}
            {formatCents(Math.abs(household.deltaCents))}
            <span class="dash-card-delta-suffix"> vs last quarter</span>
          </p>
        ) : (
          <p class="dash-card-delta dash-card-delta-empty">
            <em>no prior quarter on file</em>
          </p>
        )}
      </div>

      <footer class="dash-card-footer">
        <span class={`status-pill status-pill-${household.status}`}>
          {STATUS_LABEL[household.status]}
        </span>
        <a
          class="text-link-accent dash-card-generate"
          href={`/clients/${household.id}/reports/new?type=TCC`}
          aria-label={`Generate report for ${household.householdName}`}
        >
          Generate report &rarr;
        </a>
      </footer>
    </article>
  );
};

const AddHouseholdCell: FC<{ index: number }> = ({ index }) => (
  <a
    class={`dash-card-add dash-stagger dash-stagger-card-${Math.min(index, 7)}`}
    href="/clients/new"
  >
    + Add household
  </a>
);

const ActivityLedger: FC<{ activity: DashboardData['activity'] }> = ({ activity }) => (
  <aside class="dash-ledger dash-stagger dash-stagger-ledger" aria-label="Recent activity">
    <header class="dash-ledger-header">
      <p class="dash-eyebrow">Recent Activity</p>
      <span class="dash-ledger-count num">{activity.length}</span>
    </header>
    {activity.length === 0 ? (
      <p class="dash-ledger-empty">
        <em>Nothing yet. Generate a report to start the ledger.</em>
      </p>
    ) : (
      <ol class="dash-ledger-list">
        {activity.map((item) => {
          const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(item.date);
          const year = new Intl.DateTimeFormat('en-US', { year: 'numeric' }).format(item.date);
          return (
            <li class="dash-ledger-row">
              <a class="dash-ledger-link" href={item.href}>
                <span class="dash-ledger-date num">
                  <span class="dash-ledger-day">{day}</span>
                  <span class="dash-ledger-year">{year}</span>
                </span>
                <span class="dash-ledger-divider" aria-hidden="true" />
                <span class="dash-ledger-body">
                  <em class="dash-ledger-desc">{item.description}</em>
                  <span class="dash-ledger-meta">
                    {item.actor}
                    <span aria-hidden="true"> · </span>
                    {item.actionLabel}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    )}
    {activity.length > 0 ? (
      <a class="text-link-accent dash-ledger-all" href="/clients">
        View all activity &rarr;
      </a>
    ) : null}
  </aside>
);
