/**
 * Phase-30 SACS PPTX renderer. Builds a 2-slide PowerPoint deck from the
 * existing SacsSnapshot. The PPTX is the source-of-truth export; the
 * "Download PDF" button (after migration) will run this through
 * LibreOffice headless to produce a PDF.
 *
 * Coordinates here are independent of the SVG renderer's 768×576 user
 * space — pptxgenjs uses inches on a 10×7.5 in 16:9 slide. Layout
 * proportions follow the same triangular Inflow / Outflow / PR flow.
 *
 * Field accesses adapted to our actual flat SacsSnapshot shape (see
 * render.ts) — the brief's nested s.persons / s.inflow.monthlyTotalCents
 * shape doesn't match what lib/reports.ts buildSacsRenderInput produces.
 */
import { resolve } from 'node:path';
import PptxGenJSDefault from 'pptxgenjs';
import type { SacsSnapshot } from './render.js';

// pptxgenjs ships CommonJS; under tsx + ESM the default import is
// sometimes wrapped in a `{ default: <Class> }` envelope. Unwrap once
// at module load. Keep the original `typeof` so `pptx.ShapeType.*`
// static access still typechecks.
const PptxGenJS: typeof PptxGenJSDefault =
  (PptxGenJSDefault as unknown as { default?: typeof PptxGenJSDefault }).default ??
  PptxGenJSDefault;

// Color tokens (hex without leading #, per pptxgenjs convention).
const C_INFLOW_GREEN = '00C258';
const C_OUTFLOW_RED = 'F22F2E';
const C_RESERVE_BLUE = '428BCE';
const C_PINNACLE_BLUE = '9BCBEB';
const C_SCHWAB_NAVY = '1B365D';
const C_INK = '000000';
const C_WHITE = 'FFFFFF';

// Asset paths resolved at module load. Both PNGs are committed to
// public/assets/ — regenerate via scripts/generate-pptx-assets.ts.
const PIGGY_PNG = resolve(process.cwd(), 'public', 'assets', 'piggy-bank.png');
const PAPERS_PNG = resolve(process.cwd(), 'public', 'assets', 'papers-icon.png');

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const fmt = (cents: number): string => usd.format(cents / 100);

const longDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
function fmtLongDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return longDate.format(d);
}

function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  const suffix =
    j === 1 && k !== 11
      ? 'st'
      : j === 2 && k !== 12
        ? 'nd'
        : j === 3 && k !== 13
          ? 'rd'
          : 'th';
  return `${n}${suffix}`;
}

export function renderSacsPptx(s: SacsSnapshot): InstanceType<typeof PptxGenJS> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 10 × 7.5 in (PowerPoint widescreen 16:9)
  pptx.theme = { headFontFace: 'Geist', bodyFontFace: 'Geist' };

  // ============================================================
  // Slide 1 — Monthly Cashflow
  // ============================================================
  const s1 = pptx.addSlide();

  // Title (centered top)
  s1.addText('Simple Automated Cashflow System (SACS)', {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontFace: 'Geist',
    fontSize: 22,
    bold: true,
    align: 'center',
    color: C_INK,
  });

  // Household name
  s1.addText(s.householdName.toUpperCase(), {
    x: 3,
    y: 0.95,
    w: 4,
    h: 0.4,
    fontFace: 'Geist',
    fontSize: 18,
    bold: true,
    align: 'center',
    color: C_INK,
  });

  // Meeting date
  s1.addText(fmtLongDate(s.meetingDate), {
    x: 3,
    y: 1.4,
    w: 4,
    h: 0.3,
    fontFace: 'Geist',
    fontSize: 16,
    bold: true,
    align: 'center',
    color: C_INK,
  });

  // Diamond $ icon (rotated square — pptxgenjs has a native diamond shape)
  s1.addShape(pptx.ShapeType.diamond, {
    x: 0.4,
    y: 1.7,
    w: 0.9,
    h: 0.9,
    fill: { color: C_INFLOW_GREEN },
    line: { color: C_INFLOW_GREEN, width: 1 },
  });
  s1.addText('$', {
    x: 0.4,
    y: 1.7,
    w: 0.9,
    h: 0.9,
    fontFace: 'Georgia',
    fontSize: 48,
    bold: true,
    color: C_WHITE,
    align: 'center',
    valign: 'middle',
  });

  // Contributor lines below the diamond
  const contributors = s.inflowSources.filter((p) => p.monthlyAmountCents > 0);
  contributors.forEach((p, i) => {
    s1.addText(`${fmt(p.monthlyAmountCents)}- ${p.personFirstName}`, {
      x: 0.15,
      y: 2.7 + i * 0.25,
      w: 2,
      h: 0.25,
      fontFace: 'Geist',
      fontSize: 13,
      bold: true,
      color: C_INFLOW_GREEN,
    });
  });

  // INFLOW circle
  s1.addShape(pptx.ShapeType.ellipse, {
    x: 0.75,
    y: 2.0,
    w: 2.6,
    h: 2.6,
    fill: { color: C_INFLOW_GREEN },
    line: { color: C_INK, width: 1 },
  });
  s1.addText('INFLOW', {
    x: 0.75,
    y: 2.3,
    w: 2.6,
    h: 0.4,
    fontFace: 'Geist',
    fontSize: 20,
    bold: true,
    color: C_WHITE,
    align: 'center',
  });
  s1.addShape(pptx.ShapeType.rect, {
    x: 1.0,
    y: 2.95,
    w: 2.1,
    h: 0.5,
    fill: { color: C_WHITE },
    line: { color: C_WHITE },
  });
  s1.addText(fmt(s.monthlyInflowCents), {
    x: 1.0,
    y: 2.95,
    w: 2.1,
    h: 0.5,
    fontFace: 'Geist',
    fontSize: 22,
    color: C_INFLOW_GREEN,
    align: 'center',
    valign: 'middle',
  });
  s1.addShape(pptx.ShapeType.line, {
    x: 0.95,
    y: 3.85,
    w: 2.2,
    h: 0,
    line: { color: C_INK, width: 2 },
  });
  s1.addText(`${fmt(s.inflowFloorCents)} Floor`, {
    x: 0.75,
    y: 3.95,
    w: 2.6,
    h: 0.3,
    fontFace: 'Geist',
    fontSize: 15,
    color: C_INK,
    align: 'center',
  });

  // OUTFLOW circle (mirror right)
  s1.addShape(pptx.ShapeType.ellipse, {
    x: 6.65,
    y: 2.0,
    w: 2.6,
    h: 2.6,
    fill: { color: C_OUTFLOW_RED },
    line: { color: C_INK, width: 1 },
  });
  s1.addText('OUTFLOW', {
    x: 6.65,
    y: 2.3,
    w: 2.6,
    h: 0.4,
    fontFace: 'Geist',
    fontSize: 20,
    bold: true,
    color: C_WHITE,
    align: 'center',
  });
  s1.addShape(pptx.ShapeType.rect, {
    x: 6.9,
    y: 2.95,
    w: 2.1,
    h: 0.5,
    fill: { color: C_WHITE },
    line: { color: C_WHITE },
  });
  s1.addText(fmt(s.monthlyOutflowCents), {
    x: 6.9,
    y: 2.95,
    w: 2.1,
    h: 0.5,
    fontFace: 'Geist',
    fontSize: 22,
    color: C_OUTFLOW_RED,
    align: 'center',
    valign: 'middle',
  });
  s1.addShape(pptx.ShapeType.line, {
    x: 6.85,
    y: 3.85,
    w: 2.2,
    h: 0,
    line: { color: C_INK, width: 2 },
  });
  s1.addText(`${fmt(s.outflowFloorCents)} Floor`, {
    x: 6.65,
    y: 3.95,
    w: 2.6,
    h: 0.3,
    fontFace: 'Geist',
    fontSize: 15,
    color: C_INK,
    align: 'center',
  });

  // INFLOW → OUTFLOW chunky right-arrow with text inside
  s1.addShape(pptx.ShapeType.rightArrow, {
    x: 3.55,
    y: 2.7,
    w: 2.95,
    h: 1.05,
    fill: { color: C_WHITE },
    line: { color: C_OUTFLOW_RED, width: 2.5 },
  });
  s1.addText(`X=${fmt(s.monthlyOutflowCents)}/month*`, {
    x: 3.55,
    y: 2.85,
    w: 2.95,
    h: 0.5,
    fontFace: 'Geist',
    fontSize: 15,
    bold: true,
    color: C_OUTFLOW_RED,
    align: 'center',
    valign: 'middle',
  });
  s1.addText(`Automated transfer on the ${ordinal(s.automatedTransferDay)}`, {
    x: 3.55,
    y: 3.85,
    w: 2.95,
    h: 0.3,
    fontFace: 'Geist',
    fontSize: 12,
    color: C_INK,
    align: 'center',
  });

  // PRIVATE RESERVE circle
  s1.addShape(pptx.ShapeType.ellipse, {
    x: 3.7,
    y: 4.45,
    w: 2.6,
    h: 2.6,
    fill: { color: C_RESERVE_BLUE },
    line: { color: C_INK, width: 1 },
  });
  s1.addText('PRIVATE\nRESERVE', {
    x: 3.7,
    y: 4.7,
    w: 2.6,
    h: 0.8,
    fontFace: 'Geist',
    fontSize: 20,
    bold: true,
    color: C_WHITE,
    align: 'center',
  });

  // Piggy bank PNG
  s1.addImage({
    path: PIGGY_PNG,
    x: 4.1,
    y: 5.55,
    w: 1.8,
    h: 1.0,
  });

  // L-arrow Inflow → Reserve. PowerPoint has no native chunky-hollow L,
  // so approximate with two line shapes in an L pattern: a vertical
  // descender (no arrowhead) + a horizontal segment with arrowhead.
  s1.addShape(pptx.ShapeType.line, {
    x: 2.05,
    y: 4.6,
    w: 0,
    h: 1.0,
    line: { color: C_RESERVE_BLUE, width: 3 },
  });
  s1.addShape(pptx.ShapeType.line, {
    x: 2.05,
    y: 5.6,
    w: 1.85,
    h: 0,
    line: { color: C_RESERVE_BLUE, width: 3, endArrowType: 'triangle' },
  });
  s1.addText(`${fmt(s.privateReserveMonthlyContributionCents)}/mo*`, {
    x: 1.55,
    y: 5.45,
    w: 1.5,
    h: 0.3,
    fontFace: 'Geist',
    fontSize: 13,
    bold: true,
    color: C_RESERVE_BLUE,
  });

  // Papers icon top-right + label to the right
  s1.addImage({
    path: PAPERS_PNG,
    x: 8.85,
    y: 0.4,
    w: 0.55,
    h: 0.7,
  });
  s1.addText('X= Monthly\nExpenses', {
    x: 8.5,
    y: 1.15,
    w: 1.4,
    h: 0.5,
    fontFace: 'Geist',
    fontSize: 13,
    color: C_INK,
    align: 'right',
  });
  // Connector line from papers icon down to outflow circle
  s1.addShape(pptx.ShapeType.line, {
    x: 9.15,
    y: 1.1,
    w: 0,
    h: 2.2,
    line: { color: C_INK, width: 2.5, endArrowType: 'triangle' },
  });

  // MONTHLY EXPENSES bottom label
  s1.addText('MONTHLY   EXPENSES', {
    x: 0,
    y: 7.0,
    w: 10,
    h: 0.4,
    fontFace: 'Geist',
    fontSize: 18,
    bold: true,
    color: C_INK,
    align: 'center',
  });

  // ============================================================
  // Slide 2 — Long-Term Cashflow
  // ============================================================
  const s2 = pptx.addSlide();

  s2.addText('Simple Automated Cashflow System (SACS)', {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontFace: 'Geist',
    fontSize: 22,
    bold: true,
    align: 'center',
    color: C_INK,
  });

  // PINNACLE PR circle
  s2.addShape(pptx.ShapeType.ellipse, {
    x: 0.75,
    y: 2.2,
    w: 2.6,
    h: 2.6,
    fill: { color: C_PINNACLE_BLUE },
    line: { color: C_INK, width: 1 },
  });
  s2.addText('PINNACLE\nPR', {
    x: 0.75,
    y: 2.5,
    w: 2.6,
    h: 0.9,
    fontFace: 'Geist',
    fontSize: 20,
    bold: true,
    color: C_WHITE,
    align: 'center',
  });
  s2.addShape(pptx.ShapeType.rect, {
    x: 1.0,
    y: 3.55,
    w: 2.1,
    h: 0.5,
    fill: { color: C_WHITE },
    line: { color: C_WHITE },
  });
  // White-chip value: current PR balance (NOT target — those are different
  // numbers; the brief's example showed both lines as `targetCents`, but
  // that's a bug we caught in Phase 28).
  s2.addText(fmt(s.privateReserveBalanceCents), {
    x: 1.0,
    y: 3.55,
    w: 2.1,
    h: 0.5,
    fontFace: 'Geist',
    fontSize: 22,
    color: C_PINNACLE_BLUE,
    align: 'center',
    valign: 'middle',
  });
  s2.addText(`${fmt(s.pinnacleTargetCents)} TARGET`, {
    x: 0.75,
    y: 4.2,
    w: 2.6,
    h: 0.3,
    fontFace: 'Geist',
    fontSize: 12,
    bold: true,
    color: C_INK,
    align: 'center',
  });

  // SCHWAB circle
  s2.addShape(pptx.ShapeType.ellipse, {
    x: 6.65,
    y: 2.2,
    w: 2.6,
    h: 2.6,
    fill: { color: C_SCHWAB_NAVY },
    line: { color: C_INK, width: 1 },
  });
  s2.addText('SCHWAB', {
    x: 6.65,
    y: 2.5,
    w: 2.6,
    h: 0.4,
    fontFace: 'Geist',
    fontSize: 20,
    bold: true,
    color: C_WHITE,
    align: 'center',
  });
  s2.addShape(pptx.ShapeType.rect, {
    x: 6.9,
    y: 3.0,
    w: 2.1,
    h: 0.5,
    fill: { color: C_WHITE },
    line: { color: C_WHITE },
  });
  s2.addText(fmt(s.schwabBalanceCents), {
    x: 6.9,
    y: 3.0,
    w: 2.1,
    h: 0.5,
    fontFace: 'Geist',
    fontSize: 22,
    color: C_SCHWAB_NAVY,
    align: 'center',
    valign: 'middle',
  });
  s2.addText('BROKERAGE', {
    x: 6.65,
    y: 4.0,
    w: 2.6,
    h: 0.4,
    fontFace: 'Geist',
    fontSize: 20,
    bold: true,
    color: C_WHITE,
    align: 'center',
  });
  s2.addText('Remainder', {
    x: 6.65,
    y: 5.0,
    w: 2.6,
    h: 0.3,
    fontFace: 'Geist',
    fontSize: 15,
    bold: true,
    color: C_INK,
    align: 'center',
  });

  // Bowtie — two block arrows pointing outward
  s2.addShape(pptx.ShapeType.leftArrow, {
    x: 3.6,
    y: 3.1,
    w: 1.3,
    h: 0.8,
    fill: { color: C_RESERVE_BLUE },
    line: { color: C_RESERVE_BLUE },
  });
  s2.addShape(pptx.ShapeType.rightArrow, {
    x: 5.1,
    y: 3.1,
    w: 1.3,
    h: 0.8,
    fill: { color: C_RESERVE_BLUE },
    line: { color: C_RESERVE_BLUE },
  });

  // Target breakdown — plain centered bold lines below Pinnacle PR
  const b = s.pinnacleTargetBreakdown;
  const subTotal =
    b.sixXExpensesCents +
    b.homeownerDeductibleCents +
    b.autoDeductibleCents * 2 +
    b.medicalDeductibleCents;
  const breakdownLines = [
    `6x Monthly Expenses + Deductible= ${fmt(subTotal)}`,
    `${fmt(b.homeownerDeductibleCents)}- Homeowner`,
    `${fmt(b.autoDeductibleCents)} x 2 = ${fmt(b.autoDeductibleCents * 2)}- Auto`,
    `${fmt(b.medicalDeductibleCents)}- Medical*`,
  ];
  breakdownLines.forEach((line, i) => {
    s2.addText(line, {
      x: 0.2,
      y: 4.95 + i * 0.22,
      w: 3.7,
      h: 0.22,
      fontFace: 'Geist',
      fontSize: 12,
      bold: true,
      color: C_INK,
      align: 'center',
    });
  });

  // Footer
  s2.addText('LONG TERM CASHFLOW', {
    x: 0,
    y: 6.7,
    w: 10,
    h: 0.4,
    fontFace: 'Geist',
    fontSize: 18,
    bold: true,
    color: C_INK,
    align: 'center',
  });
  s2.addText('( Magnified Private Reserve Cashflow)', {
    x: 0,
    y: 7.05,
    w: 10,
    h: 0.35,
    fontFace: 'Geist',
    fontSize: 17,
    bold: true,
    color: '428DCE',
    align: 'center',
  });

  return pptx;
}
