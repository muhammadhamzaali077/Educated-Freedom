/**
 * Phase-30 TCC PPTX renderer. Builds a single-slide PowerPoint deck from
 * a TccSnapshot. Simplified layout vs the SVG renderer — the goal is a
 * functional first-cut PPTX export Andrew's team can edit in
 * PowerPoint, not pixel parity with the in-portal TCC SVG. Slot grids,
 * client oval, and bubble positioning are approximated; account balances
 * and totals are exact.
 */
import PptxGenJSDefault from 'pptxgenjs';
import type { TccBubble, TccSnapshot } from './render.js';

// CJS/ESM interop — see comment in src/reports/sacs/render-pptx.ts.
const PptxGenJS: typeof PptxGenJSDefault =
  (PptxGenJSDefault as unknown as { default?: typeof PptxGenJSDefault }).default ??
  PptxGenJSDefault;

// Color tokens.
const C_NAVY = '1B3A6B';
const C_NAVY_DEEP = '142850';
const C_INK = '0A1F3A';
const C_INK_MUTED = '4A5568';
const C_INK_SOFT = '8B9099';
const C_RULE = 'E2DDD3';
const C_BG_SUNKEN = 'F2EFE8';
const C_WHITE = 'FFFFFF';

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

interface BubbleSlot {
  side: 'left' | 'right';
  index: number;
}

// Map slot IDs (e.g. "p1-3", "p2-1", "nr-l-2", "nr-r-4") to a side +
// index 1..6 within that side. The PPTX uses simpler 2-column grids
// rather than the SVG's 4-column outer/inner layout.
function parseRetirementSlot(slotId: string): BubbleSlot | null {
  const m = slotId.match(/^p([12])-([1-6])$/);
  if (!m) return null;
  const idx = m[2];
  if (!idx) return null;
  return {
    side: m[1] === '1' ? 'left' : 'right',
    index: Number.parseInt(idx, 10),
  };
}
function parseNonRetSlot(slotId: string): BubbleSlot | null {
  const m = slotId.match(/^nr-(l|r)-([1-4])$/);
  if (!m) return null;
  const idx = m[2];
  if (!idx) return null;
  return {
    side: m[1] === 'l' ? 'left' : 'right',
    index: Number.parseInt(idx, 10),
  };
}

export function renderTccPptx(s: TccSnapshot): InstanceType<typeof PptxGenJS> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 10 × 7.5 in
  pptx.theme = { headFontFace: 'Geist', bodyFontFace: 'Geist' };

  const slide = pptx.addSlide();

  // ===== Header band =====
  slide.addText(s.householdName, {
    x: 0.4,
    y: 0.25,
    w: 6,
    h: 0.5,
    fontFace: 'Geist',
    fontSize: 20,
    bold: true,
    color: C_INK,
  });
  slide.addText(`as of ${fmtLongDate(s.meetingDate)}`, {
    x: 0.4,
    y: 0.7,
    w: 6,
    h: 0.3,
    fontFace: 'Geist',
    fontSize: 12,
    italic: true,
    color: C_INK_MUTED,
  });

  // Grand total chip top-right
  slide.addShape(pptx.ShapeType.rect, {
    x: 6.8,
    y: 0.25,
    w: 2.9,
    h: 0.7,
    fill: { color: C_NAVY_DEEP },
    line: { color: C_NAVY_DEEP },
  });
  slide.addText('GRAND TOTAL', {
    x: 6.8,
    y: 0.27,
    w: 2.9,
    h: 0.25,
    fontFace: 'Geist',
    fontSize: 10,
    bold: true,
    color: C_WHITE,
    align: 'center',
  });
  slide.addText(fmt(s.totals.grandTotalCents), {
    x: 6.8,
    y: 0.5,
    w: 2.9,
    h: 0.42,
    fontFace: 'Geist',
    fontSize: 22,
    bold: true,
    color: C_WHITE,
    align: 'center',
    valign: 'middle',
  });

  // ===== Retirement section =====
  slide.addText('RETIREMENT (QUALIFIED)', {
    x: 0.4,
    y: 1.15,
    w: 9.2,
    h: 0.25,
    fontFace: 'Geist',
    fontSize: 10,
    bold: true,
    color: C_INK_SOFT,
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 0.4,
    y: 1.4,
    w: 9.2,
    h: 0,
    line: { color: C_RULE, width: 1 },
  });

  // Client 1 / Client 2 column headers
  const p1 = s.persons[0];
  const p2 = s.persons[1];
  if (p1) {
    slide.addText(`${p1.firstName} ${p1.lastName}`, {
      x: 0.4,
      y: 1.5,
      w: 4.4,
      h: 0.3,
      fontFace: 'Geist',
      fontSize: 11,
      bold: true,
      color: C_INK,
    });
  }
  if (p2) {
    slide.addText(`${p2.firstName} ${p2.lastName}`, {
      x: 5.2,
      y: 1.5,
      w: 4.4,
      h: 0.3,
      fontFace: 'Geist',
      fontSize: 11,
      bold: true,
      color: C_INK,
    });
  }

  // Lay retirement bubbles into 2-column grid:
  // left column (Client 1): up to 6 bubbles in 3 rows × 2 cols
  // right column (Client 2): same
  const RET_BUBBLE_W = 2.0;
  const RET_BUBBLE_H = 1.0;
  const RET_LEFT_X0 = 0.4;
  const RET_RIGHT_X0 = 5.2;
  const RET_GAP_X = 0.2;
  const RET_Y0 = 1.85;
  const RET_GAP_Y = 0.15;

  for (const b of s.retirementBubbles) {
    const slot = parseRetirementSlot(b.slotId);
    if (!slot) continue;
    const localIndex = slot.index - 1; // 0..5
    const row = Math.floor(localIndex / 2);
    const col = localIndex % 2;
    const baseX = slot.side === 'left' ? RET_LEFT_X0 : RET_RIGHT_X0;
    const x = baseX + col * (RET_BUBBLE_W + RET_GAP_X);
    const y = RET_Y0 + row * (RET_BUBBLE_H + RET_GAP_Y);
    addBubble(slide, pptx, b, x, y, RET_BUBBLE_W, RET_BUBBLE_H);
  }

  // Per-spouse retirement subtotal under each side
  slide.addText(`Subtotal: ${fmt(s.totals.p1RetirementCents)}`, {
    x: 0.4,
    y: 5.55,
    w: 4.4,
    h: 0.25,
    fontFace: 'Geist',
    fontSize: 11,
    bold: true,
    color: C_NAVY,
  });
  slide.addText(`Subtotal: ${fmt(s.totals.p2RetirementCents)}`, {
    x: 5.2,
    y: 5.55,
    w: 4.4,
    h: 0.25,
    fontFace: 'Geist',
    fontSize: 11,
    bold: true,
    color: C_NAVY,
    align: 'right',
  });

  // ===== Non-retirement section =====
  slide.addText('NON-RETIREMENT', {
    x: 0.4,
    y: 5.95,
    w: 9.2,
    h: 0.25,
    fontFace: 'Geist',
    fontSize: 10,
    bold: true,
    color: C_INK_SOFT,
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 0.4,
    y: 6.2,
    w: 9.2,
    h: 0,
    line: { color: C_RULE, width: 1 },
  });

  // Compact NR list — limit to 4 per side, single row each side.
  const NR_BUBBLE_W = 2.0;
  const NR_BUBBLE_H = 0.7;
  const NR_LEFT_X0 = 0.4;
  const NR_RIGHT_X0 = 5.2;
  const NR_Y0 = 6.3;

  for (const b of s.nonRetirementBubbles) {
    const slot = parseNonRetSlot(b.slotId);
    if (!slot) continue;
    const localIndex = slot.index - 1;
    const col = localIndex % 2;
    const baseX = slot.side === 'left' ? NR_LEFT_X0 : NR_RIGHT_X0;
    const x = baseX + col * (NR_BUBBLE_W + 0.2);
    const y = NR_Y0;
    addBubble(slide, pptx, b, x, y, NR_BUBBLE_W, NR_BUBBLE_H);
  }

  // Trust + Liabilities footer band
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.4,
    y: 7.05,
    w: 4.4,
    h: 0.4,
    fill: { color: C_BG_SUNKEN },
    line: { color: C_RULE, width: 0.75 },
  });
  slide.addText(`TRUST: ${fmt(s.trust.valueCents)}`, {
    x: 0.4,
    y: 7.05,
    w: 4.4,
    h: 0.4,
    fontFace: 'Geist',
    fontSize: 11,
    bold: true,
    color: C_NAVY_DEEP,
    align: 'center',
    valign: 'middle',
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 5.2,
    y: 7.05,
    w: 4.4,
    h: 0.4,
    fill: { color: C_BG_SUNKEN },
    line: { color: C_RULE, width: 0.75 },
  });
  slide.addText(`LIABILITIES: ${fmt(s.totals.liabilitiesTotalCents)}`, {
    x: 5.2,
    y: 7.05,
    w: 4.4,
    h: 0.4,
    fontFace: 'Geist',
    fontSize: 11,
    bold: true,
    color: C_NAVY_DEEP,
    align: 'center',
    valign: 'middle',
  });

  return pptx;
}

function addBubble(
  slide: ReturnType<InstanceType<typeof PptxGenJS>['addSlide']>,
  pptx: InstanceType<typeof PptxGenJS>,
  b: TccBubble,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  slide.addShape(pptx.ShapeType.ellipse, {
    x,
    y,
    w,
    h,
    fill: { color: C_WHITE },
    line: { color: C_INK, width: 1 },
  });
  // Account # label
  if (b.accountNumberLastFour) {
    slide.addText(`Acct # ··${b.accountNumberLastFour}`, {
      x,
      y: y + 0.05,
      w,
      h: 0.18,
      fontFace: 'Geist',
      fontSize: 8,
      color: C_INK_MUTED,
      align: 'center',
    });
  }
  // Account type
  slide.addText(b.accountType, {
    x: x + 0.1,
    y: y + 0.22,
    w: w - 0.2,
    h: 0.22,
    fontFace: 'Geist',
    fontSize: 10,
    bold: true,
    color: C_INK,
    align: 'center',
  });
  // Balance
  slide.addText(fmt(b.balanceCents), {
    x: x + 0.1,
    y: y + 0.45,
    w: w - 0.2,
    h: 0.25,
    fontFace: 'Geist',
    fontSize: 13,
    bold: true,
    color: C_NAVY_DEEP,
    align: 'center',
  });
  // As-of date
  slide.addText(`a/o ${shortDate(b.asOfDate)}`, {
    x,
    y: y + h - 0.2,
    w,
    h: 0.16,
    fontFace: 'Geist',
    fontSize: 8,
    italic: true,
    color: C_INK_SOFT,
    align: 'center',
  });
}

const shortDateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
function shortDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return shortDateFmt.format(d);
}
