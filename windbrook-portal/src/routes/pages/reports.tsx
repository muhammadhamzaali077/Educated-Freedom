import { Hono, type Context } from 'hono';
import { format } from 'date-fns';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { reports as reportsTable, user as userTable } from '../../db/schema.js';
import { loadClient, type AccountRow } from '../../lib/clients.js';
import { isConfigured as isCanvaConfigured, loadTokens } from '../../lib/canva.js';
import {
  pdfFilename,
  renderAndSavePdf,
} from '../../reports/pdf.js';
import { renderSacsPptx } from '../../reports/sacs/render-pptx.js';
import { renderTccPptx } from '../../reports/tcc/render-pptx.js';
import { pptxBufferToPdfBuffer } from '../../reports/pptx-to-pdf.js';
import { readFileSync } from 'node:fs';
import {
  defaultSacsAssignments,
  defaultTccAssignments,
  deleteLayout,
  loadLayout,
  mergeAssignments,
  saveLayout,
  type LayoutPayload,
} from '../../lib/layouts.js';
import {
  buildReportInputs,
  buildSacsRenderInput,
  buildTccRenderInput,
  hasAllSacsRequired,
  loadAccountsWithLatestSnapshots,
  loadLiabilitiesWithLatest,
  loadReportPrefill,
  parseSnapshot,
  renderReportPages,
  resolveLayout,
  saveReport,
} from '../../lib/reports.js';
import { ReportCanvas, ReportDetailPage } from '../../views/pages/report-detail.js';
import type { AuthVars } from '../../middleware/auth.js';
import { CalculationsPanel } from '../../views/components/calculations-panel.js';
import { ReportNewPage } from '../../views/pages/report-new.js';

const app = new Hono<{ Variables: AuthVars }>();

const reportTypeSchema = z.enum(['SACS', 'TCC']);

// =============================================================================
// GET — render the form (with SACS-required guard)
// =============================================================================
app.get('/clients/:id/reports/new', async (c) => {
  const user = c.get('user');
  const role = (user as { role?: string | null }).role ?? null;
  const id = c.req.param('id');

  const typeParsed = reportTypeSchema.safeParse(c.req.query('type'));
  if (!typeParsed.success) return c.redirect(`/clients/${id}/reports/new?type=SACS`);
  const reportType = typeParsed.data;

  const client = await loadClient(id);
  if (!client) return c.notFound();

  if (reportType === 'SACS' && !hasAllSacsRequired(client.accounts)) {
    const flash = encodeURIComponent(
      'SACS requires Inflow, Outflow, and Private Reserve accounts. Add them before generating.',
    );
    return c.redirect(`/clients/${id}/edit?flash=${flash}`);
  }

  const accountSnapshots = await loadAccountsWithLatestSnapshots(id);
  const liabilities = await loadLiabilitiesWithLatest(id);

  const defaultMeetingDate = format(new Date(Date.now() + 14 * 86_400_000), 'yyyy-MM-dd');

  // Duplicate-as-new: prefill from a source report's snapshot.
  const fromId = c.req.query('from');
  const balances = new Map<string, number>();
  const liabBalances = new Map<string, number>();
  let prefillBalances:
    | Map<string, { balanceCents: number; cashBalanceCents: number | null; isStale: boolean }>
    | undefined;
  let prefillLiabilities: Map<string, number> | undefined;
  let fieldsReady = 0;
  if (fromId) {
    const prefill = await loadReportPrefill(fromId);
    if (prefill && prefill.reportType === reportType) {
      prefillBalances = prefill.balanceByAccountId;
      prefillLiabilities = prefill.liabilityBalanceById;
      for (const [accId, b] of prefill.balanceByAccountId) {
        balances.set(accId, b.balanceCents);
      }
      for (const [lId, c] of prefill.liabilityBalanceById) {
        liabBalances.set(lId, c);
      }
      fieldsReady = balances.size + liabBalances.size;
    }
  }

  const { totals } = await buildReportInputs(id, balances, liabBalances);
  const fieldsTotal = countRequiredFields(reportType, accountSnapshots, liabilities);

  const person1 = client.persons.find((p) => p.personIndex === 1) ?? null;
  const person2 = client.persons.find((p) => p.personIndex === 2) ?? null;

  return c.html(
    <ReportNewPage
      userName={user.name}
      userRole={role}
      clientId={id}
      householdName={client.client.householdName}
      reportType={reportType}
      defaultMeetingDate={defaultMeetingDate}
      person1Name={person1 ? person1.firstName : null}
      person2Name={person2 ? person2.firstName : null}
      accountSnapshots={accountSnapshots}
      liabilities={liabilities}
      totals={totals}
      fieldsTotal={fieldsTotal}
      fieldsReady={fieldsReady}
      prefillBalances={prefillBalances}
      prefillLiabilities={prefillLiabilities}
    />,
  );
});

// /reports/:id alias → canonical /clients/:id/reports/:reportId
app.get('/reports/:reportId', async (c) => {
  const reportId = c.req.param('reportId');
  const [report] = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.id, reportId))
    .limit(1);
  if (!report) return c.notFound();
  return c.redirect(`/clients/${report.clientId}/reports/${report.id}`);
});

// =============================================================================
// POST /preview — htmx live calc panel
// =============================================================================
app.post('/clients/:id/reports/preview', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.parseBody();

  const reportType = reportTypeSchema.parse(body['reportType']);
  const meetingDate = typeof body['meetingDate'] === 'string' ? body['meetingDate'] : '';

  const accountSnapshots = await loadAccountsWithLatestSnapshots(id);
  const liabilities = await loadLiabilitiesWithLatest(id);

  const { balances, liabBalances, fieldsReady } = parseSubmittedBalances(
    body,
    accountSnapshots,
    liabilities,
    reportType,
  );

  const { totals } = await buildReportInputs(id, balances, liabBalances);

  const fieldsTotal = countRequiredFields(reportType, accountSnapshots, liabilities);

  return c.html(
    <CalculationsPanel
      clientId={id}
      reportType={reportType}
      totals={totals}
      fieldsReady={fieldsReady}
      fieldsTotal={fieldsTotal}
      hasMeetingDate={Boolean(meetingDate)}
    />,
  );
});

// =============================================================================
// POST — finalize and save the report
// =============================================================================
app.post('/clients/:id/reports', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const body = await c.req.parseBody();

  const reportType = reportTypeSchema.parse(body['reportType']);
  const meetingDate = typeof body['meetingDate'] === 'string' ? body['meetingDate'] : '';
  if (!meetingDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return c.text('Meeting date is required', 400);
  }

  const client = await loadClient(id);
  if (!client) return c.notFound();
  if (reportType === 'SACS' && !hasAllSacsRequired(client.accounts)) {
    return c.text('SACS-required accounts missing', 400);
  }

  const accountSnapshots = await loadAccountsWithLatestSnapshots(id);
  const liabilities = await loadLiabilitiesWithLatest(id);

  const { balances, liabBalances, balanceRows, liabRows, fieldsReady } = parseSubmittedBalances(
    body,
    accountSnapshots,
    liabilities,
    reportType,
  );

  const fieldsTotal = countRequiredFields(reportType, accountSnapshots, liabilities);
  if (fieldsReady < fieldsTotal) {
    return c.text(`Missing ${fieldsTotal - fieldsReady} required fields`, 400);
  }

  const { inputs, totals } = await buildReportInputs(id, balances, liabBalances);

  // Lock the layout in use at generation time — re-downloads stay pixel-stable.
  const savedLayout = await loadLayout(id, reportType);
  const knownIds = new Set(client.accounts.map((a) => a.id));
  const defaults =
    reportType === 'TCC' ? defaultTccAssignments(client.accounts) : defaultSacsAssignments();
  const assignments = mergeAssignments(defaults, savedLayout?.assignments ?? null, knownIds);

  const reportId = await saveReport({
    clientId: id,
    reportType,
    meetingDate,
    generatedByUserId: user.id,
    balances: balanceRows,
    liabilityBalances: liabRows,
    inputs,
    totals,
    layoutUsed: { type: reportType, assignments },
  });

  return c.redirect(`/clients/${id}/reports/${reportId}`);
});

// =============================================================================
// helpers
// =============================================================================
function countRequiredFields(
  reportType: 'SACS' | 'TCC',
  accountSnapshots: Awaited<ReturnType<typeof loadAccountsWithLatestSnapshots>>,
  liabilities: Awaited<ReturnType<typeof loadLiabilitiesWithLatest>>,
): number {
  if (reportType === 'SACS') {
    return accountSnapshots.filter(
      (s) =>
        s.account.accountClass === 'inflow' ||
        s.account.accountClass === 'outflow' ||
        s.account.accountClass === 'private_reserve',
    ).length;
  }
  // TCC: every retirement, non-retirement, investment, trust, plus liabilities
  const accReq = accountSnapshots.filter(
    (s) =>
      s.account.accountClass === 'retirement' ||
      s.account.accountClass === 'non_retirement' ||
      s.account.accountClass === 'investment' ||
      s.account.accountClass === 'trust',
  ).length;
  return accReq + liabilities.length;
}

function parseDollars(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const cleaned = s.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function parseSubmittedBalances(
  body: Record<string, unknown>,
  accountSnapshots: Awaited<ReturnType<typeof loadAccountsWithLatestSnapshots>>,
  liabilities: Awaited<ReturnType<typeof loadLiabilitiesWithLatest>>,
  reportType: 'SACS' | 'TCC',
) {
  const balances = new Map<string, number>();
  const liabBalances = new Map<string, number>();
  const balanceRows: Array<{
    accountId: string;
    balanceCents: number;
    cashBalanceCents: number | null;
    isStale: boolean;
  }> = [];
  const liabRows: Array<{ liabilityId: string; balanceCents: number }> = [];

  let fieldsReady = 0;
  for (const s of accountSnapshots) {
    const required = isAccountRequired(reportType, s.account.accountClass);
    if (!required) continue;
    const raw = body[`bal-${s.account.id}`];
    const stale = body[`stale-${s.account.id}`] === '1';
    const cents = parseDollars(raw);
    if (cents != null) {
      balances.set(s.account.id, cents);
      const cash = parseDollars(body[`cash-${s.account.id}`]);
      balanceRows.push({
        accountId: s.account.id,
        balanceCents: cents,
        cashBalanceCents: cash,
        isStale: stale,
      });
      fieldsReady++;
    } else if (stale && s.latest) {
      balances.set(s.account.id, s.latest.balanceCents);
      balanceRows.push({
        accountId: s.account.id,
        balanceCents: s.latest.balanceCents,
        cashBalanceCents: s.latest.cashBalanceCents,
        isStale: true,
      });
      fieldsReady++;
    }
  }

  if (reportType === 'TCC') {
    for (const l of liabilities) {
      const raw = body[`liabbal-${l.liability.id}`];
      const stale = body[`liabstale-${l.liability.id}`] === '1';
      const cents = parseDollars(raw);
      if (cents != null) {
        liabBalances.set(l.liability.id, cents);
        liabRows.push({ liabilityId: l.liability.id, balanceCents: cents });
        fieldsReady++;
      } else if (stale) {
        liabBalances.set(l.liability.id, l.latestBalanceCents);
        liabRows.push({ liabilityId: l.liability.id, balanceCents: l.latestBalanceCents });
        fieldsReady++;
      }
    }
  }

  return { balances, liabBalances, balanceRows, liabRows, fieldsReady };
}

function isAccountRequired(reportType: 'SACS' | 'TCC', cls: string): boolean {
  if (reportType === 'SACS') return cls === 'inflow' || cls === 'outflow' || cls === 'private_reserve';
  return cls === 'retirement' || cls === 'non_retirement' || cls === 'investment' || cls === 'trust';
}

// =============================================================================
// Report detail page + layout editor endpoints
// =============================================================================
app.get('/clients/:id/reports/:reportId', async (c) => {
  const user = c.get('user');
  const role = (user as { role?: string | null }).role ?? null;
  const clientId = c.req.param('id');
  const reportId = c.req.param('reportId');

  const client = await loadClient(clientId);
  if (!client) return c.notFound();
  const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, reportId)).limit(1);
  if (!report || report.clientId !== clientId) return c.notFound();

  const savedLayout = await loadLayout(clientId, report.reportType);
  const debug = c.req.query('debug') === '1';
  const { pages, layout } = renderReportPages(client, report, savedLayout, { debug });
  const labels = buildBubbleLabels(client.accounts);
  const canvaTokens = await loadTokens(user.id);
  const [generatedByUser] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, report.generatedByUserId))
    .limit(1);

  return c.html(
    <ReportDetailPage
      userName={user.name}
      userRole={role}
      clientId={clientId}
      householdName={client.client.householdName}
      reportId={report.id}
      reportType={report.reportType}
      meetingDate={report.meetingDate}
      status={report.status}
      generatedAt={report.generatedAt.toISOString()}
      generatedByName={generatedByUser?.name ?? null}
      pages={pages}
      layout={layout}
      bubbleLabels={labels}
      canvaConnected={canvaTokens != null}
      canvaDesignId={report.canvaDesignId ?? null}
      canvaEditUrl={report.canvaEditUrl ?? null}
      canvaEnvConfigured={isCanvaConfigured()}
    />,
  );
});

/**
 * Phase 16 — single-bubble POST. Called by the SVG-native pointer-event
 * editor (public/js/layout-editor.js) when a bubble lands on a new slot.
 * Body shape: `{ accountId, slotId }`. The server merges this single
 * assignment into whatever was already saved (preserving every other
 * bubble's position) and stores the result. Returns 204 — the JS reloads
 * the page to redraw the SVG.
 *
 * Section integrity is enforced server-side too: if the new slotId's
 * section (p1 / p2 / nr-l / nr-r) doesn't match the bubble's origin
 * section, the request is rejected. This is the safety net for any
 * client-side bypass.
 */
app.post('/clients/:id/reports/:reportId/layout', async (c) => {
  const clientId = c.req.param('id');
  const reportId = c.req.param('reportId');

  const [report] = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.id, reportId))
    .limit(1);
  if (!report || report.clientId !== clientId) return c.text('report not found', 404);
  if (report.reportType !== 'TCC') return c.text('layout edits only supported for TCC', 400);

  let body: { accountId?: unknown; slotId?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.text('invalid json', 400);
  }
  const accountId = typeof body.accountId === 'string' ? body.accountId : null;
  const slotId = typeof body.slotId === 'string' ? body.slotId : null;
  if (!accountId || !slotId) return c.text('missing accountId or slotId', 400);

  const client = await loadClient(clientId);
  if (!client) return c.text('client not found', 404);
  const account = client.accounts.find((a) => a.id === accountId);
  if (!account) return c.text('account not found', 404);

  // Section guard — bubble's origin section (derived from current slot) must
  // match the destination slot's section.
  const saved = await loadLayout(clientId, 'TCC');
  const defaults = defaultTccAssignments(client.accounts);
  const current = { ...defaults, ...(saved?.assignments ?? {}) };
  const originSlot = current[accountId] ?? defaults[accountId] ?? null;
  if (originSlot) {
    if (sectionOf(originSlot) !== sectionOf(slotId)) {
      return c.text('cross-section drop refused', 400);
    }
  }

  // Merge the single change. If another account already occupies the
  // destination slot, swap them so we don't lose the other assignment.
  const updated = { ...current };
  const occupant = Object.entries(updated).find(([accId, sId]) => sId === slotId && accId !== accountId);
  if (occupant && originSlot) {
    updated[occupant[0]] = originSlot;
  }
  updated[accountId] = slotId;

  await saveLayout(clientId, 'TCC', { type: 'TCC', assignments: updated });
  return c.body(null, 204);
});

function sectionOf(slotId: string): string {
  // Phase 33 slot prefixes. Each prefix maps to its data-section value
  // (qualified-left / qualified-right / non-qualified-left / non-qualified-right)
  // matching what the renderer puts on each bubble + slot indicator and
  // what public/js/layout-editor.js validates against on drag.
  if (slotId.startsWith('qualified-left-')) return 'qualified-left';
  if (slotId.startsWith('qualified-right-')) return 'qualified-right';
  if (slotId.startsWith('non-qualified-left-')) return 'non-qualified-left';
  if (slotId.startsWith('non-qualified-right-')) return 'non-qualified-right';
  return '';
}

app.post('/clients/:id/layouts/:reportType', async (c) => {
  const clientId = c.req.param('id');
  const rt = c.req.param('reportType');
  if (rt !== 'SACS' && rt !== 'TCC') return c.text('invalid report type', 400);
  const reportType = rt;

  const body = await c.req.parseBody();
  const json = typeof body['assignments'] === 'string' ? body['assignments'] : '{}';
  let assignments: Record<string, string>;
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed == null) throw new Error('not an object');
    assignments = Object.fromEntries(
      Object.entries(parsed).filter(
        ([k, v]) => typeof k === 'string' && typeof v === 'string',
      ) as [string, string][],
    );
  } catch {
    return c.text('invalid assignments json', 400);
  }

  const payload: LayoutPayload = { type: reportType, assignments };
  await saveLayout(clientId, reportType, payload);

  // Re-render the canvas using the new layout so arrows + bubbles update.
  // (Deviates from the brief's "200 no body" — we return new SVG so the
  // client doesn't need to redo the SVG arrow geometry.)
  const reportIdHint = typeof body['reportId'] === 'string' ? body['reportId'] : null;
  if (reportIdHint) {
    return renderCanvasFragment(c, clientId, reportIdHint, payload);
  }
  return c.body(null, 204);
});

app.delete('/clients/:id/layouts/:reportType', async (c) => {
  const clientId = c.req.param('id');
  const rt = c.req.param('reportType');
  if (rt !== 'SACS' && rt !== 'TCC') return c.text('invalid report type', 400);
  await deleteLayout(clientId, rt);

  const reportIdHint = c.req.query('reportId') ?? null;
  if (reportIdHint) {
    return renderCanvasFragment(c, clientId, reportIdHint, null);
  }
  return c.body(null, 204);
});

async function renderCanvasFragment(
  c: Context<{ Variables: AuthVars }>,
  clientId: string,
  reportId: string,
  override: LayoutPayload | null,
) {
  const client = await loadClient(clientId);
  if (!client) return c.text('client not found', 404);
  const [report] = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.id, reportId))
    .limit(1);
  if (!report || report.clientId !== clientId) return c.text('report not found', 404);

  const { pages, layout } = renderReportPages(client, report, override);
  const labels = buildBubbleLabels(client.accounts);

  const user = c.get('user');
  const role = (user as { role?: string | null }).role ?? null;

  return c.html(
    <ReportCanvas
      userName={user.name}
      userRole={role}
      clientId={clientId}
      householdName={client.client.householdName}
      reportId={report.id}
      reportType={report.reportType}
      meetingDate={report.meetingDate}
      status={report.status}
      pages={pages}
      layout={layout}
      bubbleLabels={labels}
    />,
  );
}

// =============================================================================
// PDF export
// =============================================================================
app.post('/clients/:id/reports/:reportId/export/pdf', async (c) => {
  const clientId = c.req.param('id');
  const reportId = c.req.param('reportId');

  const client = await loadClient(clientId);
  if (!client) return c.notFound();
  const [report] = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.id, reportId))
    .limit(1);
  if (!report || report.clientId !== clientId) return c.notFound();

  // Re-render with the layout that was locked at generation time.
  const { pages } = renderReportPages(client, report, null);

  let path: string;
  try {
    path = await renderAndSavePdf(reportId, pages);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[pdf] render failed:', msg);
    return c.text(
      `PDF export failed: ${msg}. If chromium isn't installed, run: npx playwright install chromium`,
      503,
    );
  }

  await db.update(reportsTable).set({ pdfPath: path }).where(eq(reportsTable.id, reportId));

  const filename = pdfFilename({
    householdName: client.client.householdName,
    reportType: report.reportType,
    meetingDate: report.meetingDate,
  });

  const buf = readFileSync(path);
  c.header('Content-Type', 'application/pdf');
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  c.header('Content-Length', String(buf.length));
  return c.body(new Uint8Array(buf));
});

function buildBubbleLabels(accountList: AccountRow[]): Record<string, string> {
  return Object.fromEntries(
    accountList.map((a) => [
      a.id,
      `${a.accountType}${a.accountNumberLastFour ? ` ••${a.accountNumberLastFour}` : ''}`,
    ]),
  );
}

// =============================================================================
// Phase-30 PPTX export. Additive — does NOT replace /export/pdf yet.
// Once LibreOffice is verified working in production via the diagnostic
// route below, the /export/pdf handler will be flipped to run the same
// PPTX → LibreOffice → PDF pipeline.
// =============================================================================
app.post('/clients/:id/reports/:reportId/export/pptx', async (c) => {
  const clientId = c.req.param('id');
  const reportId = c.req.param('reportId');

  const client = await loadClient(clientId);
  if (!client) return c.notFound();
  const [report] = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.id, reportId))
    .limit(1);
  if (!report || report.clientId !== clientId) return c.notFound();

  const snapshot = parseSnapshot(report.snapshotJson);
  const layout = resolveLayout(report.reportType, client, snapshot, null);

  let pptxBuffer: Buffer;
  try {
    if (report.reportType === 'SACS') {
      const sacsInput = buildSacsRenderInput(client, snapshot, report.meetingDate);
      // Phase-32: renderSacsPptx is async (rasterizes SVG → PNG before
      // embedding). Must await before writing the buffer.
      const pptx = await renderSacsPptx(sacsInput);
      pptxBuffer = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
    } else {
      const tccInput = buildTccRenderInput(client, snapshot, layout, report.meetingDate);
      const pptx = await renderTccPptx(tccInput);
      pptxBuffer = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[pptx] render failed:', msg);
    return c.text(`PPTX export failed: ${msg}`, 500);
  }

  const filename = pdfFilename({
    householdName: client.client.householdName,
    reportType: report.reportType,
    meetingDate: report.meetingDate,
  }).replace(/\.pdf$/, '.pptx');

  c.header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  );
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  c.header('Content-Length', String(pptxBuffer.length));
  return c.body(new Uint8Array(pptxBuffer));
});

// =============================================================================
// Phase-30 diagnostic. Mounted only when DEBUG_PPTX_PDF=1 in env.
// Used to smoke-test the LibreOffice pipeline in production before
// flipping the main /export/pdf route. Exercises the full PPTX → PDF
// path with a real Cole-shaped fixture, returns the PDF inline so the
// operator can open it directly in the browser.
// =============================================================================
if (process.env.DEBUG_PPTX_PDF === '1') {
  app.get('/internal/test-pptx-pdf', async (c) => {
    const $ = (d: number) => Math.round(d * 100);
    const fixture = {
      householdName: 'Cole Household',
      meetingDate: '2026-01-21',
      inflowSources: [{ personFirstName: 'Marcus', monthlyAmountCents: $(14500) }],
      monthlyInflowCents: $(14500),
      monthlyOutflowCents: $(8500),
      automatedTransferDay: 28,
      privateReserveBalanceCents: $(38000),
      privateReserveMonthlyContributionCents: $(6000),
      pinnacleTargetCents: $(76500),
      pinnacleTargetBreakdown: {
        sixXExpensesCents: $(51000),
        homeownerDeductibleCents: $(2500),
        autoDeductibleCents: $(1000),
        medicalDeductibleCents: $(3000),
      },
      schwabBalanceCents: $(84000),
      remainderCents: 0,
      inflowFloorCents: $(1000),
      outflowFloorCents: $(1000),
      privateReserveFloorCents: $(1000),
      staleFields: new Set<string>(),
    };
    try {
      const pptx = await renderSacsPptx(fixture);
      const pptxBuf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
      const pdfBuf = await pptxBufferToPdfBuffer(pptxBuf);
      c.header('Content-Type', 'application/pdf');
      c.header('Content-Disposition', 'inline; filename="diagnostic.pdf"');
      c.header('Content-Length', String(pdfBuf.length));
      return c.body(new Uint8Array(pdfBuf));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[diagnostic /internal/test-pptx-pdf]', msg);
      return c.text(`Diagnostic failed: ${msg}`, 500);
    }
  });
}

export default app;
