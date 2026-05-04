import { Hono } from 'hono';
import { desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { clients, reports } from '../../db/schema.js';
import type { AuthVars } from '../../middleware/auth.js';
import {
  ActivityTimeline,
  type ActivityItem,
} from '../../views/partials/dashboard-activity.js';

const app = new Hono<{ Variables: AuthVars }>();

app.get('/partials/dashboard/activity', async (c) => {
  const rows = await db.select().from(reports).orderBy(desc(reports.generatedAt)).limit(20);

  if (rows.length === 0) {
    return c.html(<ActivityTimeline items={[]} />);
  }

  const clientRows = await db.select().from(clients);
  const byId = new Map(clientRows.map((row) => [row.id, row]));

  const items: ActivityItem[] = rows.map((r) => ({
    id: r.id,
    date: r.generatedAt,
    text: `Generated ${r.reportType} for ${byId.get(r.clientId)?.householdName ?? 'unknown household'}`,
    href: `/clients/${r.clientId}`,
  }));

  return c.html(<ActivityTimeline items={items} />);
});

export default app;
