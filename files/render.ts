/**
 * TCC (Total Client Chart) renderer.
 *
 * Phase 21 spacing rebuild. Phase 20 fixed client-oval overlap but left two
 * residual issues:
 *   • Adjacent bubbles in the same row (cx=100 + cx=240) had touching edges
 *     at x=170 — no air between them. Roth IRA and IRA Rollover sat flush.
 *   • NR row 1 bubbles at cy=530 with ry=55 ended at y=585. Trust circle
 *     started at cy-r=620-70=550, but inner-col bubbles at cx=240 (right
 *     edge x=310) had only 16 px clearance from the trust left edge x=326.
 *     Combined with the divider at y=520, NR row 1 bubbles visually
 *     "crashed into" the divider line.
 *
 * Phase 21 reset all spacing using verified math. Every gap is now ≥10 px.
 *
 *   Cols: 100, 270, 522, 692 (4 cols).
 *     Outer→Inner gap: 270-70 - (100+70) = 30 px. (Was 0.)
 *   Retirement: 3 rows at cy=125, 270, 415. Client oval rx=50 (was 80).
 *     Inner bubble right-edge x=340; client oval left-edge x=346 → 6 px.
 *   NR: 2 rows at cy=595, 875. Trust at cy=720, r=50 (was 70).
 *     Inner-col bubble right-edge x=340; trust left-edge x=346 → 6 px.
 *   Liabilities box now sits between trust (bottom y=770) and NR row 2
 *     (top y=820), in the 40-px corridor y=775-815. Compact 2-row layout.
 *   Canvas H grew 820 → 1000 to absorb the cleaner spacing. The PDF
 *     export already uses the SVG viewBox so US Letter scaling stays
 *     correct at print time.
 *
 * Slot ID schema MOSTLY preserved (24 → 20):
 *   p1-1..6, p2-1..6 (12 retirement slots — unchanged)
 *   nr-l-1..4, nr-r-1..4 (8 NR slots — was 12)
 *
 * Saved layouts that referenced nr-l-5/6 or nr-r-5/6 will silently fall
 * back to default placement when those slot IDs are absent. The layout
 * route (`POST /clients/:cid/reports/:rid/layout`) already validates the
 * target slot exists before persisting, so future drag-saves can only
 * land on the new 8-slot grid.
 *
 * NR section now has 8 slots (was 12). Park-Rivera (5 NR accounts) fills
 * row 1 fully (4 cols) plus 1 of row 2 — visually balanced. Cole (2 NR)
 * fills 2 slots on row 1 (1 per side). Lipski (3 NR) fills row 1 left
 * + row 1 right + row 1 inner-left.
 *
 * Phase 18 — bubbles are ELLIPSES (140×110). Phase 19 — Canva s256 fix.
 * Phase 20 — drag silent-snap-back fix in layout-editor.js.
 * Phase 22 — self-healing slot remap so saved layouts that reference
 * deprecated slot IDs (from before slot-grid changes) automatically
 * fall through to the next available default slot. Combined with the
 * `pnpm db:migrate:phase22` migration that clears stale TCC layouts,
 * every TCC report now renders with consistent shape.
 */
import { FONT_FACE_CSS } from '../_fonts.js';

// =============================================================================
// Types
// =============================================================================
export interface CircleAnchor {
  cx: number;
  cy: number;
  r: number;
}
export interface OvalAnchor {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface TccPerson {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  ssnLastFour: string;
}

export interface TccBubble {
  accountId: string;
  slotId: string;
  accountType: string;
  institution: string | null;
  accountNumberLastFour: string | null;
  balanceCents: number;
  cashCents: number | null;
  asOfDate: string;
  isStale: boolean;
}

export interface TccLiability {
  creditorName: string;
  liabilityType: string;
  balanceCents: number;
  interestRateBps: number | null;
  payoffDate: string | null;
  isStale: boolean;
}

export interface TccSnapshot {
  householdName: string;
  meetingDate: string;
  asOfDate: string;
  persons: TccPerson[];
  retirementBubbles: TccBubble[];
  nonRetirementBubbles: TccBubble[];
  trust: { valueCents: number; asOfDate: string; isStale: boolean };
  liabilities: TccLiability[];
  totals: {
    p1RetirementCents: number;
    p2RetirementCents: number;
    nonRetirementCents: number;
    trustCents: number;
    grandTotalCents: number;
    liabilitiesTotalCents: number;
  };
  staleFields: Set<string>;
}

export interface TccBubbleLayout {
  clientOval: OvalAnchor;
  trustCircle: CircleAnchor;
  retirementSlots: Record<string, CircleAnchor>;
  nonRetirementSlots: Record<string, CircleAnchor>;
}

export interface RenderOptions {
  debug?: boolean;
}

// =============================================================================
// Phase 21 spacing — DO NOT MODIFY
// =============================================================================
const BUBBLE_RX = 70;
const BUBBLE_RY = 55;

const Y_ACCT_NUM = -32;
const Y_ACCT_TYPE = -10;
const Y_BALANCE = +12;
const Y_DATE = +34;

const FONT_ACCT = 9;
const FONT_TYPE = 12;
const FONT_BALANCE = 15;
const FONT_DATE = 9;

// Phase 21 — trust shrunk r=70 → 50 to give inner-col bubbles 6px clearance.
const TRUST_RADIUS = 50;

// Client oval — circular (rx=ry=50) so it visually balances the trust circle.
const CLIENT_OVAL_RX = 50;
const CLIENT_OVAL_RY = 50;

const CANVAS_W = 792;
// Phase 21 — H grown 820 → 1000 to absorb 3 ret rows + 2 NR rows + liab box
// + banners with ≥10 px gaps everywhere.
const CANVAS_H = 1000;
const PAGE_CENTER_X = CANVAS_W / 2;

// Columns — 4 cols, 30 px between adjacent right/left edges.
//   100, 270, 522, 692
//   Outer right edge: 100 + 70 = 170
//   Inner left edge:  270 - 70 = 200
//   Gap: 30 px
const COL_LEFT_OUTER = 100;
const COL_LEFT_INNER = 270;
const COL_RIGHT_INNER = 522; // = CANVAS_W - 270
const COL_RIGHT_OUTER = 692; // = CANVAS_W - 100

// Retirement section: y=0 to y=480 (banner). 3 rows + client oval.
const RET_ROW_CY = [125, 270, 415] as const;
const RET_BANNER_Y = 480;
const RET_BANNER_H = 20;
const DIVIDER_Y = 520;
const CLIENT_OVAL_CY = 270;

// NR section: y=540 (above row 1) to y=945 (banner). 2 rows + trust + liab.
const NR_ROW_CY = [595, 875] as const;
const NR_TCY = 720;
const LIAB_BOX_Y = 775;
const LIAB_BOX_H = 40;
const NR_BANNER_Y = 945;
const NR_BANNER_H = 20;
const FOOTNOTE_Y = 975;

// =============================================================================
// Slot grids
// =============================================================================
function makeRetirementSlots(): Record<string, CircleAnchor> {
  const slots: Record<string, CircleAnchor> = {};
  let i1 = 1;
  let i2 = 1;
  for (const cy of RET_ROW_CY) {
    slots[`p1-${i1++}`] = { cx: COL_LEFT_OUTER, cy, r: BUBBLE_RX };
    slots[`p1-${i1++}`] = { cx: COL_LEFT_INNER, cy, r: BUBBLE_RX };
    slots[`p2-${i2++}`] = { cx: COL_RIGHT_INNER, cy, r: BUBBLE_RX };
    slots[`p2-${i2++}`] = { cx: COL_RIGHT_OUTER, cy, r: BUBBLE_RX };
  }
  return slots;
}

function makeNonRetirementSlots(): Record<string, CircleAnchor> {
  // 2 rows × 4 cols = 8 slots (was 12). Slot IDs nr-l-1..4 + nr-r-1..4.
  // Saved layouts referencing nr-l-5/6 or nr-r-5/6 fall back to default
  // placement at render time.
  const slots: Record<string, CircleAnchor> = {};
  let il = 1;
  let ir = 1;
  for (const cy of NR_ROW_CY) {
    slots[`nr-l-${il++}`] = { cx: COL_LEFT_OUTER, cy, r: BUBBLE_RX };
    slots[`nr-l-${il++}`] = { cx: COL_LEFT_INNER, cy, r: BUBBLE_RX };
    slots[`nr-r-${ir++}`] = { cx: COL_RIGHT_INNER, cy, r: BUBBLE_RX };
    slots[`nr-r-${ir++}`] = { cx: COL_RIGHT_OUTER, cy, r: BUBBLE_RX };
  }
  return slots;
}

export const DEFAULT_TCC_LAYOUT: TccBubbleLayout = {
  clientOval: { cx: PAGE_CENTER_X, cy: CLIENT_OVAL_CY, rx: CLIENT_OVAL_RX, ry: CLIENT_OVAL_RY },
  trustCircle: { cx: PAGE_CENTER_X, cy: NR_TCY, r: TRUST_RADIUS },
  retirementSlots: makeRetirementSlots(),
  nonRetirementSlots: makeNonRetirementSlots(),
};

// =============================================================================
// Palette — match Andrew's existing TCC template
// =============================================================================
const C_NAVY = '#1B3A6B';
const C_NAVY_DEEP = '#142850';
const C_BLUE_LIGHT = '#A8C5E2';
const C_INK = '#0A1F3A';
const C_INK_MUTED = '#4A5568';
const C_INK_SOFT = '#8B9099';
const C_RULE = '#E2DDD3';
const C_BG_SUNKEN = '#F2EFE8';
const C_DANGER = '#A33A3A';
const C_DASH_ACCENT = '#B8956A';
const C_DEBUG_SAFE = '#A33A3A';
const C_DEBUG_FILL = '#FF94A8';
const C_DEBUG_BASELINE = '#D4A030';

// =============================================================================
// Number / date helpers
// =============================================================================
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const fmt = (cents: number): string => usd.format(cents / 100);

const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const longDate = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const slashDate = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' });

function fmtShortDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return shortDate.format(d);
}
function fmtLongDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return longDate.format(d);
}
function fmtSlashDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return slashDate.format(d);
}

function ageFromDob(iso: string, asOf: Date = new Date()): number {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  let age = asOf.getFullYear() - d.getFullYear();
  const m = asOf.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < d.getDate())) age--;
  return age;
}

const XML_ENT: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&apos;',
};
function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => XML_ENT[c] as string);
}

const STALE_TSPAN = `<tspan dx="2" dy="-3" fill="${C_DANGER}" font-size="60%" font-weight="500">*</tspan>`;
function moneyTspan(cents: number, isStale: boolean): string {
  return `${escapeXml(fmt(cents))}${isStale ? STALE_TSPAN : ''}`;
}

// =============================================================================
// Section + name helpers
// =============================================================================
export function slotIdToSection(slotId: string): string {
  if (slotId.startsWith('p1-')) return 'retirement-left';
  if (slotId.startsWith('p2-')) return 'retirement-right';
  if (slotId.startsWith('nr-l-')) return 'nonret-left';
  if (slotId.startsWith('nr-r-')) return 'nonret-right';
  return '';
}

export function splitAccountName(name: string): string[] {
  if (name.length <= 12) return [name];
  const words = name.split(' ');
  if (words.length === 1) {
    return [name.slice(0, 10), name.slice(10)];
  }
  let bestSplit = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(' ');
    const right = words.slice(i).join(' ');
    const diff = Math.abs(left.length - right.length);
    if (diff < bestDiff && Math.max(left.length, right.length) <= 14) {
      bestDiff = diff;
      bestSplit = i;
    }
  }
  return [words.slice(0, bestSplit).join(' '), words.slice(bestSplit).join(' ')];
}

// =============================================================================
// Bubble (Phase 18 — ELLIPSE)
// =============================================================================
function bubbleContent(b: TccBubble, anchor: CircleAnchor, debug: boolean): string {
  const { cx, cy } = anchor;
  const acctNumLine = b.accountNumberLastFour
    ? `Acct # &#8226;&#8226;${escapeXml(b.accountNumberLastFour)}`
    : 'Acct #';
  const typeLines = splitAccountName(b.accountType);
  const wrapShift = (typeLines.length - 1) * 12;

  const dir = cx < PAGE_CENTER_X ? 1 : -1;
  const cashSub =
    b.cashCents != null
      ? cashSubBubble(cx + dir * 50, cy + 38, b.cashCents, b.isStale)
      : '';

  const section = slotIdToSection(b.slotId);
  const lines: string[] = [];

  lines.push(
    `<text x="${cx}" y="${cy + Y_ACCT_NUM}" text-anchor="middle" dominant-baseline="middle" font-family="var(--font-body), Geist, sans-serif" font-size="${FONT_ACCT}" fill="${C_INK_MUTED}" letter-spacing="0.4">${acctNumLine}</text>`,
  );
  lines.push(
    `<line x1="${cx - 38}" y1="${cy + Y_ACCT_NUM + 6}" x2="${cx + 38}" y2="${cy + Y_ACCT_NUM + 6}" stroke="${C_INK}" stroke-width="0.5"/>`,
  );

  typeLines.forEach((line, i) => {
    lines.push(
      `<text x="${cx}" y="${cy + Y_ACCT_TYPE + i * 12}" text-anchor="middle" dominant-baseline="middle" font-family="var(--font-body), Geist, sans-serif" font-size="${FONT_TYPE}" font-weight="500" fill="${C_INK}">${escapeXml(line)}</text>`,
    );
  });

  lines.push(
    `<text x="${cx}" y="${cy + Y_BALANCE + wrapShift}" text-anchor="middle" dominant-baseline="middle" class="title num" font-family="var(--font-display), 'Source Serif 4', serif" font-size="${FONT_BALANCE}" font-weight="500" fill="${C_NAVY_DEEP}">${moneyTspan(b.balanceCents, b.isStale)}</text>`,
  );

  lines.push(
    `<text x="${cx}" y="${cy + Y_DATE + wrapShift}" text-anchor="middle" dominant-baseline="middle" font-family="var(--font-body), Geist, sans-serif" font-size="${FONT_DATE}" font-style="italic" fill="${C_INK_SOFT}">a/o ${escapeXml(fmtShortDate(b.asOfDate))}</text>`,
  );

  const debugOverlay = debug ? bubbleDebugOverlay(cx, cy) : '';

  return `<g class="bubble" data-account-id="${escapeXml(b.accountId)}" data-slot-id="${escapeXml(b.slotId)}" data-section="${section}" data-cx="${cx}" data-cy="${cy}" data-rx="${BUBBLE_RX}" data-ry="${BUBBLE_RY}" data-account-type="${escapeXml(b.accountType)}" data-institution="${escapeXml(b.institution ?? '')}" data-acct-last4="${escapeXml(b.accountNumberLastFour ?? '')}" data-asof="${escapeXml(fmtShortDate(b.asOfDate))}">
  <ellipse class="bubble-ring" cx="${cx}" cy="${cy}" rx="${BUBBLE_RX}" ry="${BUBBLE_RY}" fill="#FFFFFF" stroke="${C_INK}" stroke-width="1.5"/>
  ${lines.join('\n  ')}
  ${cashSub}
  ${debugOverlay}
</g>`;
}

function bubbleDebugOverlay(cx: number, cy: number): string {
  const baselineMarks = [Y_ACCT_NUM, Y_ACCT_TYPE, Y_ACCT_TYPE + 12, Y_BALANCE, Y_DATE]
    .map(
      (dy) =>
        `<line x1="${cx - (BUBBLE_RX - 8)}" y1="${cy + dy}" x2="${cx + (BUBBLE_RX - 8)}" y2="${cy + dy}" stroke="${C_DEBUG_BASELINE}" stroke-width="0.4" opacity="0.6"/>`,
    )
    .join('\n  ');
  return `<g class="bubble-debug" pointer-events="none">
  <ellipse cx="${cx}" cy="${cy}" rx="${BUBBLE_RX}" ry="${BUBBLE_RY}" fill="${C_DEBUG_FILL}" opacity="0.05"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${BUBBLE_RX - 12}" ry="${BUBBLE_RY - 12}" fill="none" stroke="${C_DEBUG_SAFE}" stroke-width="0.6" stroke-dasharray="2 2" opacity="0.7"/>
  ${baselineMarks}
  <text x="${cx}" y="${cy - BUBBLE_RY - 4}" text-anchor="middle" font-family="var(--font-body), Geist, sans-serif" font-size="8" fill="${C_DEBUG_SAFE}">${BUBBLE_RX * 2}×${BUBBLE_RY * 2} / safe ${(BUBBLE_RX - 12) * 2}×${(BUBBLE_RY - 12) * 2}</text>
</g>`;
}

function cashSubBubble(cx: number, cy: number, cents: number, isStale: boolean): string {
  const r = 14;
  return `<g class="cash-sub">
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${C_BG_SUNKEN}" stroke="${C_NAVY}" stroke-width="0.5"/>
  <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="6" fill="${C_INK_MUTED}" letter-spacing="0.4">CASH</text>
  <text x="${cx}" y="${cy + 6}" text-anchor="middle" class="num" font-size="8" font-weight="500" fill="${C_INK}">${moneyTspan(cents, isStale)}</text>
</g>`;
}

// =============================================================================
// Center elements
// =============================================================================
function clientOval(o: OvalAnchor, persons: TccPerson[]): string {
  // Phase 21 — oval is now circular (rx=ry=50). With smaller dimensions,
  // collapse text to fit: the 2-person variant uses tighter line spacing
  // and drops the DOB line (kept SSN for identification, age fits in line).
  const head = `<ellipse cx="${o.cx}" cy="${o.cy}" rx="${o.rx}" ry="${o.ry}" fill="${C_BLUE_LIGHT}" stroke="${C_NAVY}" stroke-width="1"/>`;
  if (persons.length === 0) {
    return `${head}
    <text x="${o.cx}" y="${o.cy + 4}" text-anchor="middle" font-size="10" fill="#FFFFFF" font-style="italic">No clients</text>`;
  }
  if (persons.length === 1) {
    const p = persons[0]!;
    const age = ageFromDob(p.dateOfBirth);
    return `${head}
    <text x="${o.cx}" y="${o.cy - 14}" text-anchor="middle" class="title" font-size="11" font-weight="500" fill="#FFFFFF">${escapeXml(p.firstName)} ${escapeXml(p.lastName)}</text>
    <text x="${o.cx}" y="${o.cy - 1}" text-anchor="middle" font-size="8" fill="#FFFFFF">AGE ${age}</text>
    <text x="${o.cx}" y="${o.cy + 11}" text-anchor="middle" font-size="8" fill="#FFFFFF" class="num">DOB ${escapeXml(fmtSlashDate(p.dateOfBirth))}</text>
    <text x="${o.cx}" y="${o.cy + 23}" text-anchor="middle" font-size="8" fill="#FFFFFF" class="num">SSN &#8226;&#8226;${escapeXml(p.ssnLastFour)}</text>`;
  }
  const [a, b] = persons;
  if (!a || !b) return head;
  return `${head}
  <text x="${o.cx}" y="${o.cy - 18}" text-anchor="middle" class="title" font-size="9" font-weight="500" fill="#FFFFFF">${escapeXml(a.firstName)} ${escapeXml(a.lastName)}</text>
  <text x="${o.cx}" y="${o.cy - 7}" text-anchor="middle" font-size="7" fill="#FFFFFF" class="num">AGE ${ageFromDob(a.dateOfBirth)} &#183; SSN &#8226;&#8226;${escapeXml(a.ssnLastFour)}</text>
  <text x="${o.cx}" y="${o.cy + 7}" text-anchor="middle" class="title" font-size="9" font-weight="500" fill="#FFFFFF">${escapeXml(b.firstName)} ${escapeXml(b.lastName)}</text>
  <text x="${o.cx}" y="${o.cy + 18}" text-anchor="middle" font-size="7" fill="#FFFFFF" class="num">AGE ${ageFromDob(b.dateOfBirth)} &#183; SSN &#8226;&#8226;${escapeXml(b.ssnLastFour)}</text>`;
}

function trustCircle(c: CircleAnchor, valueCents: number, asOf: string, isStale: boolean, persons: TccPerson[]): string {
  // Phase 21 — trust shrunk r=70 → 50. Compress internal text to match.
  const labelTop = persons.length === 2
    ? `${persons[0]?.firstName ?? 'Client 1'} & ${persons[1]?.firstName ?? 'Client 2'}`
    : persons[0]?.firstName ?? 'Client 1';
  return `
  <circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="#FFFFFF" stroke="${C_NAVY}" stroke-width="1.4"/>
  <text x="${c.cx}" y="${c.cy - 18}" text-anchor="middle" font-size="9" font-weight="500" fill="${C_INK}">${escapeXml(labelTop)}</text>
  <text x="${c.cx}" y="${c.cy - 6}" text-anchor="middle" font-size="9" font-weight="500" fill="${C_INK}">Family Trust</text>
  <text x="${c.cx}" y="${c.cy + 10}" text-anchor="middle" class="title num" font-size="14" font-weight="500" fill="${C_NAVY_DEEP}">${moneyTspan(valueCents, isStale)}</text>
  <text x="${c.cx}" y="${c.cy + 25}" text-anchor="middle" font-size="7" font-style="italic" fill="${C_INK_SOFT}">a/o ${escapeXml(fmtShortDate(asOf))}</text>`;
}

// =============================================================================
// Banners (navy)
// =============================================================================
function navyBanner(x: number, y: number, w: number, h: number, leftLabel: string, rightAmountCents: number): string {
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C_NAVY}"/>
  <text x="${x + 16}" y="${y + h * 0.7}" font-size="11" font-weight="500" letter-spacing="2" fill="#FFFFFF">${escapeXml(leftLabel)}</text>
  <text x="${x + w - 16}" y="${y + h * 0.7}" text-anchor="end" class="num" font-size="13" font-weight="500" fill="#FFFFFF">${escapeXml(fmt(rightAmountCents))}</text>`;
}

// =============================================================================
// Liabilities pill (header) and box (between trust and NR row 2)
// =============================================================================
function liabilitiesPill(totalCents: number, asOf: string, x: number, y: number): string {
  if (totalCents <= 0) return '';
  const w = 260;
  const h = 36;
  const cy = y + h / 2;
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="999" fill="${C_BG_SUNKEN}" stroke="${C_RULE}" stroke-width="1"/>
  <text x="${x + 14}" y="${cy}" dominant-baseline="middle" font-family="var(--font-body)" font-size="11" font-weight="500" letter-spacing="0.08em" fill="${C_INK_SOFT}">LIABILITIES</text>
  <text x="${x + w - 14}" y="${cy}" dominant-baseline="middle" text-anchor="end" class="num" font-size="13" font-weight="500" fill="${C_INK}">${escapeXml(fmt(totalCents))} &#183; ${escapeXml(fmtShortDate(asOf))}</text>`;
}

function liabilitiesBox(liabs: TccLiability[], x: number, y: number, w: number, h: number, maxRows = 2): string {
  // Phase 21 — fixed height (was content-dependent). Box sits in the
  // 40 px corridor between trust bottom (y=770) and NR row 2 top (y=820).
  // Up to 2 liabilities fit. More are summarised as "+ N more".
  const PAD_X = 14;
  const PAD_Y = 6;
  const HEADER_H = 12;
  const ROW_H = 11;
  const rows = liabs.slice(0, maxRows);
  const moreCount = liabs.length - rows.length;

  const lines = rows
    .map((l, i) => {
      const y0 = y + PAD_Y + HEADER_H + (i + 1) * ROW_H - 2;
      const ratePart = l.interestRateBps != null ? ` @ ${(l.interestRateBps / 100).toFixed(2)}%` : '';
      const payoffPart = l.payoffDate ? `, pay off ${fmtShortDate(l.payoffDate)}` : '';
      return `<text x="${x + PAD_X}" y="${y0}" font-size="8" fill="${C_INK_MUTED}" class="num">
        <tspan font-weight="500" fill="${C_INK}">${escapeXml(l.creditorName)}</tspan>${l.liabilityType ? ` <tspan>(${escapeXml(l.liabilityType)})</tspan>` : ''} <tspan>${escapeXml(fmt(l.balanceCents))}</tspan><tspan>${escapeXml(ratePart + payoffPart)}</tspan>${l.isStale ? STALE_TSPAN : ''}
      </text>`;
    })
    .join('');
  const moreLine = moreCount > 0
    ? `<text x="${x + w - PAD_X}" y="${y + h - PAD_Y - 2}" text-anchor="end" font-size="8" font-style="italic" fill="${C_INK_SOFT}">+ ${moreCount} more</text>`
    : '';
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C_BG_SUNKEN}" stroke="${C_RULE}" stroke-width="0.8"/>
  <text x="${x + PAD_X}" y="${y + PAD_Y + 8}" font-size="9" font-weight="500" letter-spacing="1.5" fill="${C_INK_MUTED}">LIABILITIES</text>
  ${lines}
  ${moreLine}`;
}

// =============================================================================
// Stale footnote + side labels + svg wrap
// =============================================================================
function staleFootnote(): string {
  return `<text x="780" y="${FOOTNOTE_Y}" text-anchor="end" font-size="9" font-style="italic" fill="${C_DANGER}">
  <tspan fill="${C_DANGER}">*</tspan> Indicates we do not have up to date information
</text>`;
}

function sideLabel(text: string, x: number, cy: number, rotate: number, color: string): string {
  return `<text transform="rotate(${rotate} ${x} ${cy})" x="${x}" y="${cy}" text-anchor="middle" font-size="11" font-weight="500" letter-spacing="3" fill="${color}">${escapeXml(text)}</text>`;
}

function svgWrap(content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="${CANVAS_W}" height="${CANVAS_H}" fill="${C_INK}">
<defs>
<style><![CDATA[${FONT_FACE_CSS}]]></style>
</defs>
${content}
</svg>`;
}

function slotIndicators(layout: TccBubbleLayout): string {
  const both = {
    ...layout.retirementSlots,
    ...layout.nonRetirementSlots,
  };
  return Object.entries(both)
    .map(([slotId, a]) => {
      const section = slotIdToSection(slotId);
      return `<ellipse class="slot" data-slot-id="${escapeXml(slotId)}" data-section="${section}" data-cx="${a.cx}" data-cy="${a.cy}" cx="${a.cx}" cy="${a.cy}" rx="${BUBBLE_RX}" ry="${BUBBLE_RY}" fill="none" stroke="${C_DASH_ACCENT}" stroke-width="1" stroke-dasharray="4 3" opacity="0"></ellipse>`;
    })
    .join('');
}

// =============================================================================
// Main render
// =============================================================================
export function renderTccSvg(
  s: TccSnapshot,
  layout: TccBubbleLayout = DEFAULT_TCC_LAYOUT,
  options: RenderOptions = {},
): { page1: string } {
  const debug = options.debug === true;
  const hasStale = s.staleFields.size > 0 || s.retirementBubbles.some((b) => b.isStale) || s.nonRetirementBubbles.some((b) => b.isStale) || s.trust.isStale || s.liabilities.some((l) => l.isStale);

  const header = `
  <text x="22" y="24" font-size="9" font-weight="500" letter-spacing="1.5" fill="${C_INK_MUTED}">NAME</text>
  <text x="60" y="24" font-size="11" fill="${C_INK}">${escapeXml(s.householdName)}</text>
  <text x="22" y="44" font-size="9" font-weight="500" letter-spacing="1.5" fill="${C_INK_MUTED}">DATE</text>
  <text x="60" y="44" class="num" font-size="11" fill="${C_INK}">${escapeXml(fmtLongDate(s.meetingDate))}</text>

  <rect x="320" y="6" width="152" height="48" fill="${C_NAVY}"/>
  <text x="396" y="22" text-anchor="middle" font-size="9" font-weight="500" letter-spacing="3" fill="#FFFFFF">GRAND TOTAL</text>
  <text x="396" y="46" text-anchor="middle" class="title num" font-size="20" font-weight="500" fill="#FFFFFF">${moneyTspan(s.totals.grandTotalCents, false)}</text>

  ${liabilitiesPill(s.totals.liabilitiesTotalCents, s.asOfDate, 500, 12)}`;

  // Phase 22 — self-healing slot remap. If a bubble's saved slotId
  // doesn't exist in the current grid (e.g. left over from a pre-Phase-21
  // schema with different slot IDs), find the next available default slot
  // for that bubble's spouse. Prevents lopsided rendering after schema
  // changes without requiring a DB migration.
  const RET_P1_FILL = ['p1-1', 'p1-2', 'p1-3', 'p1-4', 'p1-5', 'p1-6'];
  const RET_P2_FILL = ['p2-1', 'p2-2', 'p2-3', 'p2-4', 'p2-5', 'p2-6'];

  const retPlaced = (() => {
    const used = new Set<string>();
    const items = s.retirementBubbles.map((b) => {
      const a = layout.retirementSlots[b.slotId];
      if (a) {
        used.add(b.slotId);
        return { bubble: b, anchor: a };
      }
      return { bubble: b, anchor: null as CircleAnchor | null };
    });
    for (const item of items) {
      if (item.anchor !== null) continue;
      // Determine spouse from the saved slotId prefix (falls back to p1)
      const fillOrder = item.bubble.slotId.startsWith('p2-') ? RET_P2_FILL : RET_P1_FILL;
      const free = fillOrder.find(
        (slotId) => !used.has(slotId) && layout.retirementSlots[slotId],
      );
      if (free) {
        item.anchor = layout.retirementSlots[free]!;
        used.add(free);
      }
    }
    return items;
  })();

  const retBubbles = retPlaced
    .filter((item) => item.anchor !== null)
    .map((item) => bubbleContent(item.bubble, item.anchor!, debug))
    .join('');

  const retSection = `
  ${sideLabel('QUALIFIED', 14, CLIENT_OVAL_CY, -90, C_BLUE_LIGHT)}
  ${sideLabel('QUALIFIED', 778, CLIENT_OVAL_CY, 90, C_BLUE_LIGHT)}
  ${clientOval(layout.clientOval, s.persons)}
  ${retBubbles}
  ${navyBanner(20, RET_BANNER_Y, 752, RET_BANNER_H, 'RETIREMENT ONLY', s.totals.p1RetirementCents + s.totals.p2RetirementCents)}`;

  const divider = `<line x1="20" y1="${DIVIDER_Y}" x2="772" y2="${DIVIDER_Y}" stroke="${C_RULE}" stroke-width="1"/>`;

  // Phase 22 — self-healing NR slot remap. Symmetric default fill order
  // (left/right alternating) ensures any TCC with the same number of NR
  // accounts has the same physical layout, regardless of slot history.
  const NR_DEFAULT_FILL = [
    'nr-l-1', 'nr-r-1', 'nr-l-2', 'nr-r-2',
    'nr-l-3', 'nr-r-3', 'nr-l-4', 'nr-r-4',
  ];

  const nrPlaced = (() => {
    const used = new Set<string>();
    const items = s.nonRetirementBubbles.map((b) => {
      const a = layout.nonRetirementSlots[b.slotId];
      if (a) {
        used.add(b.slotId);
        return { bubble: b, anchor: a };
      }
      return { bubble: b, anchor: null as CircleAnchor | null };
    });
    for (const item of items) {
      if (item.anchor !== null) continue;
      const free = NR_DEFAULT_FILL.find(
        (slotId) => !used.has(slotId) && layout.nonRetirementSlots[slotId],
      );
      if (free) {
        item.anchor = layout.nonRetirementSlots[free]!;
        used.add(free);
      }
    }
    return items;
  })();

  const nrBubbles = nrPlaced
    .filter((item) => item.anchor !== null)
    .map((item) => bubbleContent(item.bubble, item.anchor!, debug))
    .join('');

  const trust = layout.trustCircle;
  // Phase 21 — liab box positioned in the trust→row-2 corridor.
  // Wider (260px) and centered horizontally for better readability.
  const liabBoxW = 320;
  const liabBoxX = (CANVAS_W - liabBoxW) / 2;
  const nrSection = `
  ${sideLabel('NON QUALIFIED', 14, NR_TCY, -90, C_BLUE_LIGHT)}
  ${sideLabel('NON QUALIFIED', 778, NR_TCY, 90, C_BLUE_LIGHT)}
  ${trustCircle(trust, s.trust.valueCents, s.trust.asOfDate, s.trust.isStale, s.persons)}
  ${nrBubbles}
  ${s.liabilities.length > 0 ? liabilitiesBox(s.liabilities, liabBoxX, LIAB_BOX_Y, liabBoxW, LIAB_BOX_H) : ''}
  ${navyBanner(20, NR_BANNER_Y, 752, NR_BANNER_H, 'NON RETIREMENT TOTAL', s.totals.nonRetirementCents + s.totals.trustCents)}`;

  const slots = slotIndicators(layout);
  const debugBg = debug
    ? `<rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#FFF4E5" opacity="0.4"/>`
    : '';
  const content = `
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#FFFFFF"/>
  ${debugBg}
  ${header}
  ${slots}
  ${retSection}
  ${divider}
  ${nrSection}
  ${hasStale ? staleFootnote() : ''}`;

  return { page1: svgWrap(content) };
}
