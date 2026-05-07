/**
 * Rasterize SACS pages 1 & 2 to PNG using Playwright. Used to capture
 * after-shots for the Phase pixel-fidelity walkthrough. Mirrors the
 * snapshot shape that buildSacsRenderInput produces for Cole Household.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { renderSacsSvg, type SacsSnapshot } from '../src/reports/sacs/render.js';

const OUT_DIR = resolve(process.cwd(), '..', 'docs');
mkdirSync(OUT_DIR, { recursive: true });

const $ = (d: number) => Math.round(d * 100);

const cole: SacsSnapshot = {
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
  remainderCents: $(0),
  inflowFloorCents: $(1000),
  outflowFloorCents: $(1000),
  privateReserveFloorCents: $(1000),
  staleFields: new Set<string>(),
};

const pages = renderSacsSvg(cole);

async function shoot(svg: string, outFile: string) {
  const browser = await chromium.launch();
  // Phase-28 canvas is 768×576 (PowerPoint 16:9, was 792×612).
  const page = await browser.newPage({ viewport: { width: 768, height: 576 } });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}</style></head><body>${svg}</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  await page.screenshot({ path: outFile, fullPage: false, clip: { x: 0, y: 0, width: 768, height: 576 } });
  await browser.close();
  console.log('  → wrote', outFile);
}

const p1 = join(OUT_DIR, 'sacs-after-cole-page1.png');
const p2 = join(OUT_DIR, 'sacs-after-cole-page2.png');
await shoot(pages.page1, p1);
await shoot(pages.page2, p2);
console.log('done');
