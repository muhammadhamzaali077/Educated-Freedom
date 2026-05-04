import type { FC } from 'hono/jsx';

export type ActivityItem = {
  id: string;
  date: Date;
  text: string;
  href: string;
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatRow(d: Date): string {
  // "Apr 21, 2026" → "APR 21, 2026"
  return dateFormatter.format(d).toUpperCase();
}

export const ActivityTimeline: FC<{ items: ActivityItem[] }> = ({ items }) => {
  if (items.length === 0) {
    return <ActivityEmpty />;
  }
  return (
    <ol class="timeline">
      {items.map((item) => (
        <li>
          <a class="timeline-row" href={item.href}>
            <span class="timeline-date">{formatRow(item.date)}</span>
            <span class="timeline-text">{item.text}</span>
          </a>
        </li>
      ))}
    </ol>
  );
};

export const ActivityEmpty: FC = () => (
  <div class="timeline-empty">
    <hr />
    <p class="timeline-empty-phrase">Begin with a household.</p>
    <hr />
    <a class="timeline-empty-link" href="/clients/new">
      Create your first client &rarr;
    </a>
  </div>
);
