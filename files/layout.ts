// src/routes/layout.ts
//
// Layout persistence route. Receives drag-drop assignments from the layout-editor.
// Mount with: app.route('/reports', layoutRoutes)

import { Hono } from 'hono';
// import { db } from '../db/client';
// import { reports, bubbleLayouts } from '../db/schema';
// import { eq, and } from 'drizzle-orm';

export const layoutRoutes = new Hono();

layoutRoutes.post('/:reportId/layout', async (c) => {
  const reportId = c.req.param('reportId');
  const body = await c.req.json() as { accountId?: string; slotId?: string };
  const { accountId, slotId } = body;

  console.log(`[layout] POST /reports/${reportId}/layout`, { accountId, slotId });

  if (!accountId || !slotId) {
    return c.json({ error: 'accountId and slotId required' }, 400);
  }

  /* Wire to your DB:

  const report = await db.query.reports.findFirst({
    where: eq(reports.id, reportId),
  });
  if (!report) return c.json({ error: 'report not found' }, 404);

  // Read existing layout for this client + report-type
  const existing = await db.query.bubbleLayouts.findFirst({
    where: and(
      eq(bubbleLayouts.clientId, report.clientId),
      eq(bubbleLayouts.reportType, report.reportType),
    ),
  });

  let entries: Array<{ accountId: string; slotId: string }> = [];
  if (existing) {
    entries = JSON.parse(existing.layoutJson || '{"entries":[]}').entries || [];
  }

  // Update or insert this account's slot assignment
  entries = entries.filter(e => e.accountId !== accountId);
  entries.push({ accountId, slotId });

  if (existing) {
    await db.update(bubbleLayouts)
      .set({
        layoutJson: JSON.stringify({ entries }),
        updatedAt: new Date(),
      })
      .where(eq(bubbleLayouts.id, existing.id));
  } else {
    await db.insert(bubbleLayouts).values({
      id: crypto.randomUUID(),
      clientId: report.clientId,
      reportType: report.reportType,
      layoutJson: JSON.stringify({ entries }),
      updatedAt: new Date(),
    });
  }

  */

  return c.json({ ok: true });
});
