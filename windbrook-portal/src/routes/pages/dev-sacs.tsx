import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { renderSacsSvg, type SacsSnapshot } from '../../reports/sacs/render.js';
import type { AuthVars } from '../../middleware/auth.js';
import { DevSacsDiffPage } from '../../views/pages/dev-sacs-diff.js';

const app = new Hono<{ Variables: AuthVars }>();

const REFERENCE_PDF_PATH = join(process.cwd(), 'docs', 'references', 'SACS-Example.pdf');

app.get('/dev/refs/sacs.pdf', (c) => {
  const bytes = readFileSync(REFERENCE_PDF_PATH);
  c.header('Content-Type', 'application/pdf');
  c.header('Cache-Control', 'private, max-age=3600');
  return c.body(new Uint8Array(bytes));
});

app.get('/dev/sacs-diff', (c) => {
  const user = c.get('user');
  const role = (user as { role?: string | null }).role ?? null;

  const snapshot = makeFixtureSnapshot();
  const { page1, page2 } = renderSacsSvg(snapshot);

  return c.html(
    <DevSacsDiffPage
      userName={user.name}
      userRole={role}
      page1Svg={page1}
      page2Svg={page2}
    />,
  );
});

function makeFixtureSnapshot(): SacsSnapshot {
  const $ = (d: number) => Math.round(d * 100);
  return {
    householdName: 'Lipski Family',
    meetingDate: '2026-04-21',
    inflowSources: [{ personFirstName: 'Jonathan', monthlyAmountCents: $(15000) }],
    monthlyInflowCents: $(15000),
    monthlyOutflowCents: $(12000),
    automatedTransferDay: 20,
    privateReserveBalanceCents: $(42000),
    privateReserveMonthlyContributionCents: $(3000),
    pinnacleTargetCents: $(79500),
    pinnacleTargetBreakdown: {
      sixXExpensesCents: $(72000),
      homeownerDeductibleCents: $(2500),
      autoDeductibleCents: $(1000),
      medicalDeductibleCents: $(3000),
    },
    schwabBalanceCents: $(145000),
    remainderCents: $(0),
    inflowFloorCents: $(1000),
    outflowFloorCents: $(1000),
    privateReserveFloorCents: $(1000),
    staleFields: new Set<string>(),
  };
}

export default app;
