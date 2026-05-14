/**
 * TCC (Total Client Chart) renderer — Phase 33 structural rebuild.
 *
 * New container hierarchy matches the reference Word template:
 *
 *  1. Header — NAME/DATE eyebrow pair top-left, no big serif title
 *  2. Grand Total — centered navy box at top with Liabilities total + a/o
 *     date as a small line BELOW the box
 *  3. Qualified section — paired horizontal "QUALIFIED" corner badges,
 *     large light-blue central Client bubble, retirement bubbles
 *     symmetrically left/right of it
 *  4. "Retirement Only" centered divider badge (small, NOT full-width)
 *  5. Non-Qualified section — paired "NON-QUALIFIED" corner badges,
 *     large white central Trust bubble, non-retirement bubbles
 *     symmetrically left/right of it
 *  6. Liabilities table — grey rounded table at bottom-center, one row
 *     per liability (lender / balance / rate / payoff)
 *  7. Footer — "NON RETIREMENT TOTAL" centered small badge, permanent
 *     red disclaimer pinned bottom-right (always rendered, not gated on
 *     stale state)
 *
 * Slot grid replaced. New slot IDs:
 *   qualified-left-1..3   (Client 1 retirement, default 2 slots)
 *   qualified-right-1..3  (Client 2 retirement, default 2 slots)
 *   non-qualified-left-1..3  (non-retirement left column)
 *   non-qualified-right-1..3 (non-retirement right column)
 *
 * data-section values on bubbles + slots remain consistent with the
 * keys the drag JS (public/js/layout-editor.js) checks against:
 *   qualified-left / qualified-right / non-qualified-left / non-qualified-right.
 *
 * Phase-22 self-healing slot remap preserved — bubbles whose saved
 * slotId is missing from the current grid fall through to the next
 * available default slot for their side, so old `p1-*`/`p2-*`/`nr-*`
 * layouts in `bubble_layouts` render symmetrically until the
 * phase33-clear-tcc-layouts migration purges them.
 *
 * The bubble internals (account #, type, balance, a/o date) are
 * unchanged from Phase 18+. Only the surrounding skeleton changes.
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
  trustCircle: OvalAnchor;
  retirementSlots: Record<string, CircleAnchor>;
  nonRetirementSlots: Record<string, CircleAnchor>;
}

export interface RenderOptions {
  debug?: boolean;
}

// =============================================================================
// Canvas + section geometry
// =============================================================================
const CANVAS_W = 792;
const CANVAS_H = 1020;
const PAGE_CENTER_X = CANVAS_W / 2;

// Account bubbles: 170 × 110 (rx=85, ry=55). Smaller than central bubbles.
const BUBBLE_RX = 85;
const BUBBLE_RY = 55;

// Bubble internal text positions (relative to bubble cy).
const Y_ACCT_NUM = -30;
const Y_ACCT_TYPE = -5;
const Y_BALANCE = +14;
const Y_DATE = +32;

const FONT_ACCT = 8;
const FONT_TYPE = 11;
const FONT_BALANCE = 14;
const FONT_DATE = 8;

// Central client oval (Qualified section) — light blue.
const CLIENT_OVAL_RX = 90;
const CLIENT_OVAL_RY = 50;
const CLIENT_OVAL_CY = 305;

// Central trust oval (Non-Qualified section) — white.
const TRUST_OVAL_RX = 90;
const TRUST_OVAL_RY = 55;
const TRUST_OVAL_CY = 700;

// Side columns for account bubbles.
const COL_LEFT = 140;
const COL_RIGHT = 652;

// Qualified rows. Default two per side (top + bottom). Optional 3rd
// slot at the row-mid y sits beside the client oval — used only when
// a household has 5–6 retirement accounts on one side.
const QUAL_ROW_TOP = 250;
const QUAL_ROW_MID = 305;
const QUAL_ROW_BOT = 410;

// Non-Qualified rows — three per side stacked. The middle row sits at
// the trust's vertical center but in the side columns clear of it.
const NQ_ROW_TOP = 630;
const NQ_ROW_MID = 700;
const NQ_ROW_BOT = 820;

// Section corner badges (paired). Y values placed in clear bands above
// each section's bubble row 1 so the badges aren't hidden under the
// bubble ellipses (bubbles are painted after badges in document order).
const QUAL_BADGE_Y = 140;
const NQ_BADGE_Y = 520;

// Retirement Only centered divider band.
const RET_DIVIDER_Y = 470;

// Liabilities table position — below NQ row 3 with breathing room.
const LIAB_TABLE_W = 440;
const LIAB_TABLE_X = (CANVAS_W - LIAB_TABLE_W) / 2;
const LIAB_TABLE_Y = 880;

// NON RETIREMENT TOTAL centered badge.
const NQ_TOTAL_BADGE_Y = 960;

// =============================================================================
// Slot grids
// =============================================================================
function makeQualifiedSlots(): Record<string, CircleAnchor> {
  return {
    'qualified-left-1': { cx: COL_LEFT, cy: QUAL_ROW_TOP, r: BUBBLE_RX },
    'qualified-left-2': { cx: COL_LEFT, cy: QUAL_ROW_BOT, r: BUBBLE_RX },
    'qualified-left-3': { cx: COL_LEFT, cy: QUAL_ROW_MID, r: BUBBLE_RX },
    'qualified-right-1': { cx: COL_RIGHT, cy: QUAL_ROW_TOP, r: BUBBLE_RX },
    'qualified-right-2': { cx: COL_RIGHT, cy: QUAL_ROW_BOT, r: BUBBLE_RX },
    'qualified-right-3': { cx: COL_RIGHT, cy: QUAL_ROW_MID, r: BUBBLE_RX },
  };
}

function makeNonQualifiedSlots(): Record<string, CircleAnchor> {
  return {
    'non-qualified-left-1': { cx: COL_LEFT, cy: NQ_ROW_TOP, r: BUBBLE_RX },
    'non-qualified-left-2': { cx: COL_LEFT, cy: NQ_ROW_MID, r: BUBBLE_RX },
    'non-qualified-left-3': { cx: COL_LEFT, cy: NQ_ROW_BOT, r: BUBBLE_RX },
    'non-qualified-right-1': { cx: COL_RIGHT, cy: NQ_ROW_TOP, r: BUBBLE_RX },
    'non-qualified-right-2': { cx: COL_RIGHT, cy: NQ_ROW_MID, r: BUBBLE_RX },
    'non-qualified-right-3': { cx: COL_RIGHT, cy: NQ_ROW_BOT, r: BUBBLE_RX },
  };
}

export const DEFAULT_TCC_LAYOUT: TccBubbleLayout = {
  clientOval: { cx: PAGE_CENTER_X, cy: CLIENT_OVAL_CY, rx: CLIENT_OVAL_RX, ry: CLIENT_OVAL_RY },
  trustCircle: { cx: PAGE_CENTER_X, cy: TRUST_OVAL_CY, rx: TRUST_OVAL_RX, ry: TRUST_OVAL_RY },
  retirementSlots: makeQualifiedSlots(),
  nonRetirementSlots: makeNonQualifiedSlots(),
};

// =============================================================================
// Palette
// =============================================================================
const C_NAVY = '#1B3A6B';
const C_NAVY_DEEP = '#142850';
const C_BADGE_BLUE = '#3A6FA5';
const C_BLUE_LIGHT = '#9BCBEB';
const C_INK = '#0A1F3A';
const C_INK_MUTED = '#4A5568';
const C_INK_SOFT = '#8B9099';
const C_RULE = '#E2DDD3';
const C_BG_SUNKEN = '#F2EFE8';
const C_DANGER = '#D62728';

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
// Section helpers
// =============================================================================
export function slotIdToSection(slotId: string): string {
  if (slotId.startsWith('qualified-left-')) return 'qualified-left';
  if (slotId.startsWith('qualified-right-')) return 'qualified-right';
  if (slotId.startsWith('non-qualified-left-')) return 'non-qualified-left';
  if (slotId.startsWith('non-qualified-right-')) return 'non-qualified-right';
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
// Account bubble (ellipse with internal text)
// =============================================================================
function bubbleContent(b: TccBubble, anchor: CircleAnchor): string {
  const { cx, cy } = anchor;
  const acctNumLine = b.accountNumberLastFour
    ? `Acct # &#8226;&#8226;${escapeXml(b.accountNumberLastFour)}`
    : 'Acct #';
  const typeLines = splitAccountName(b.accountType);
  const wrapShift = (typeLines.length - 1) * 11;

  const section = slotIdToSection(b.slotId);
  const lines: string[] = [];

  lines.push(
    `<text x="${cx}" y="${cy + Y_ACCT_NUM}" text-anchor="middle" dominant-baseline="middle" font-size="${FONT_ACCT}" fill="${C_INK_MUTED}" letter-spacing="0.4">${acctNumLine}</text>`,
  );
  lines.push(
    `<line x1="${cx - 36}" y1="${cy + Y_ACCT_NUM + 12}" x2="${cx + 36}" y2="${cy + Y_ACCT_NUM + 12}" stroke="${C_INK}" stroke-width="0.5"/>`,
  );
  typeLines.forEach((line, i) => {
    lines.push(
      `<text x="${cx}" y="${cy + Y_ACCT_TYPE + i * 11}" text-anchor="middle" dominant-baseline="middle" font-size="${FONT_TYPE}" font-weight="500" fill="${C_INK}">${escapeXml(line)}</text>`,
    );
  });
  lines.push(
    `<text x="${cx}" y="${cy + Y_BALANCE + wrapShift}" text-anchor="middle" dominant-baseline="middle" class="title num" font-size="${FONT_BALANCE}" font-weight="500" fill="${C_NAVY_DEEP}">${moneyTspan(b.balanceCents, b.isStale)}</text>`,
  );
  lines.push(
    `<text x="${cx}" y="${cy + Y_DATE + wrapShift}" text-anchor="middle" dominant-baseline="middle" font-size="${FONT_DATE}" font-style="italic" fill="${C_INK_SOFT}">a/o ${escapeXml(fmtShortDate(b.asOfDate))}</text>`,
  );

  return `<g class="bubble" data-account-id="${escapeXml(b.accountId)}" data-slot-id="${escapeXml(b.slotId)}" data-section="${section}" data-cx="${cx}" data-cy="${cy}" data-rx="${BUBBLE_RX}" data-ry="${BUBBLE_RY}" data-account-type="${escapeXml(b.accountType)}" data-institution="${escapeXml(b.institution ?? '')}" data-acct-last4="${escapeXml(b.accountNumberLastFour ?? '')}" data-asof="${escapeXml(fmtShortDate(b.asOfDate))}">
  <ellipse class="bubble-ring" cx="${cx}" cy="${cy}" rx="${BUBBLE_RX}" ry="${BUBBLE_RY}" fill="#FFFFFF" stroke="${C_INK}" stroke-width="1.4"/>
  ${lines.join('\n  ')}
</g>`;
}

// =============================================================================
// Central client oval (Qualified) and central trust oval (Non-Qualified)
// =============================================================================
function clientOval(o: OvalAnchor, persons: TccPerson[]): string {
  const head = `<ellipse cx="${o.cx}" cy="${o.cy}" rx="${o.rx}" ry="${o.ry}" fill="${C_BLUE_LIGHT}" stroke="${C_NAVY}" stroke-width="1"/>`;
  if (persons.length === 0) {
    return `${head}
    <text x="${o.cx}" y="${o.cy + 4}" text-anchor="middle" font-size="11" fill="#FFFFFF" font-style="italic">No clients</text>`;
  }
  if (persons.length === 1) {
    const p = persons[0]!;
    const age = ageFromDob(p.dateOfBirth);
    return `${head}
    <text x="${o.cx}" y="${o.cy - 18}" text-anchor="middle" class="title" font-size="13" font-weight="500" fill="#FFFFFF">${escapeXml(p.firstName)} ${escapeXml(p.lastName)}</text>
    <text x="${o.cx}" y="${o.cy - 2}" text-anchor="middle" font-size="9" fill="#FFFFFF">AGE ${age}</text>
    <text x="${o.cx}" y="${o.cy + 12}" text-anchor="middle" font-size="9" fill="#FFFFFF" class="num">DOB ${escapeXml(fmtSlashDate(p.dateOfBirth))}</text>
    <text x="${o.cx}" y="${o.cy + 26}" text-anchor="middle" font-size="9" fill="#FFFFFF" class="num">SSN &#8226;&#8226;${escapeXml(p.ssnLastFour)}</text>`;
  }
  const [a, b] = persons;
  if (!a || !b) return head;
  return `${head}
  <text x="${o.cx}" y="${o.cy - 24}" text-anchor="middle" class="title" font-size="11" font-weight="500" fill="#FFFFFF">${escapeXml(a.firstName)} ${escapeXml(a.lastName)}</text>
  <text x="${o.cx}" y="${o.cy - 12}" text-anchor="middle" font-size="8" fill="#FFFFFF" class="num">AGE ${ageFromDob(a.dateOfBirth)} &#183; SSN &#8226;&#8226;${escapeXml(a.ssnLastFour)}</text>
  <text x="${o.cx}" y="${o.cy + 4}" text-anchor="middle" class="title" font-size="11" font-weight="500" fill="#FFFFFF">${escapeXml(b.firstName)} ${escapeXml(b.lastName)}</text>
  <text x="${o.cx}" y="${o.cy + 16}" text-anchor="middle" font-size="8" fill="#FFFFFF" class="num">AGE ${ageFromDob(b.dateOfBirth)} &#183; SSN &#8226;&#8226;${escapeXml(b.ssnLastFour)}</text>`;
}

function trustOval(o: OvalAnchor, valueCents: number, asOf: string, isStale: boolean, persons: TccPerson[]): string {
  const labelTop = persons.length >= 2
    ? `${persons[0]?.firstName ?? 'Client 1'} & ${persons[1]?.firstName ?? 'Client 2'}`
    : persons[0]?.firstName ?? 'Client 1';
  // White fill (distinguishes Non-Qualified from Qualified's light-blue
  // client oval). For households without a trust, the central bubble
  // still renders but with the household identifier and no $ value.
  const hasTrustValue = valueCents > 0;
  return `
  <ellipse cx="${o.cx}" cy="${o.cy}" rx="${o.rx}" ry="${o.ry}" fill="#FFFFFF" stroke="${C_NAVY}" stroke-width="1.4"/>
  <text x="${o.cx}" y="${o.cy - 22}" text-anchor="middle" font-size="11" font-weight="500" fill="${C_INK}">${escapeXml(labelTop)}</text>
  <text x="${o.cx}" y="${o.cy - 8}" text-anchor="middle" font-size="11" font-weight="500" fill="${C_INK}">Family Trust</text>
  ${
    hasTrustValue
      ? `<text x="${o.cx}" y="${o.cy + 12}" text-anchor="middle" class="title num" font-size="15" font-weight="500" fill="${C_NAVY_DEEP}">${moneyTspan(valueCents, isStale)}</text>
  <text x="${o.cx}" y="${o.cy + 28}" text-anchor="middle" font-size="8" font-style="italic" fill="${C_INK_SOFT}">a/o ${escapeXml(fmtShortDate(asOf))}</text>`
      : `<text x="${o.cx}" y="${o.cy + 14}" text-anchor="middle" font-size="8" font-style="italic" fill="${C_INK_SOFT}">no trust on file</text>`
  }`;
}

// =============================================================================
// Header (NAME / DATE eyebrow pair)
// =============================================================================
function headerEyebrows(s: TccSnapshot): string {
  return `
  <text x="20" y="24" font-size="10" font-weight="600" letter-spacing="0.12em" fill="${C_INK_MUTED}">NAME</text>
  <text x="68" y="24" font-size="12" fill="${C_INK}">${escapeXml(s.householdName)}</text>
  <text x="20" y="46" font-size="10" font-weight="600" letter-spacing="0.12em" fill="${C_INK_MUTED}">DATE</text>
  <text x="68" y="46" class="num" font-size="12" fill="${C_INK}">${escapeXml(fmtLongDate(s.meetingDate))}</text>`;
}

// =============================================================================
// Grand Total navy box + small Liabilities line below it
// =============================================================================
function grandTotalBox(s: TccSnapshot): string {
  const w = 280;
  const h = 70;
  const x = (CANVAS_W - w) / 2;
  const y = 12;
  const grandTotalBottom = y + h;
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${C_INK}"/>
  <text x="${PAGE_CENTER_X}" y="${y + 26}" text-anchor="middle" font-size="11" font-weight="500" letter-spacing="0.08em" fill="#FFFFFF">GRAND TOTAL</text>
  <text x="${PAGE_CENTER_X}" y="${y + 56}" text-anchor="middle" class="title num" font-size="22" font-weight="700" fill="#FFFFFF">${escapeXml(fmt(s.totals.grandTotalCents))}</text>

  <!-- Liabilities pill — light-ivory rounded chip sitting below the Grand Total box -->
  <g class="liabilities-pill">
    <rect x="${PAGE_CENTER_X - 75}" y="${grandTotalBottom + 8}" width="150" height="38" rx="3" fill="#F0EAE0" stroke="${C_RULE}" stroke-width="0.5"/>
    <text x="${PAGE_CENTER_X}" y="${grandTotalBottom + 24}" text-anchor="middle" font-size="12" font-weight="600" fill="${C_INK}">Liabilities: <tspan class="num">${escapeXml(fmt(s.totals.liabilitiesTotalCents))}</tspan></text>
    <text x="${PAGE_CENTER_X}" y="${grandTotalBottom + 39}" text-anchor="middle" font-size="10" font-style="italic" fill="${C_INK_MUTED}">a/o ${escapeXml(fmtLongDate(s.asOfDate))}</text>
  </g>`;
}

// =============================================================================
// Section corner badges (paired QUALIFIED / NON-QUALIFIED)
// =============================================================================
function cornerBadgePair(label: string, y: number): string {
  const w = label.length > 9 ? 132 : 100;
  const h = 26;
  const leftX = 40;
  const rightX = CANVAS_W - 40 - w;
  return `
  <rect x="${leftX}" y="${y}" width="${w}" height="${h}" rx="4" fill="#FFFFFF" stroke="${C_BADGE_BLUE}" stroke-width="1"/>
  <text x="${leftX + w / 2}" y="${y + 17}" text-anchor="middle" font-size="11" font-weight="600" letter-spacing="0.08em" fill="${C_BADGE_BLUE}">${escapeXml(label)}</text>
  <rect x="${rightX}" y="${y}" width="${w}" height="${h}" rx="4" fill="#FFFFFF" stroke="${C_BADGE_BLUE}" stroke-width="1"/>
  <text x="${rightX + w / 2}" y="${y + 17}" text-anchor="middle" font-size="11" font-weight="600" letter-spacing="0.08em" fill="${C_BADGE_BLUE}">${escapeXml(label)}</text>`;
}

// =============================================================================
// Centered divider badge with optional subtotal — "Retirement Only" and
// "NON RETIREMENT TOTAL" both use this. NOT a full-width banner.
// =============================================================================
function centeredNavyBadge(label: string, subtotalCents: number | null, y: number): string {
  const hasSubtotal = subtotalCents != null;
  const w = hasSubtotal ? 220 : 160;
  const h = 36;
  const x = (CANVAS_W - w) / 2;
  // Optional hairline rules to the left + right of the badge, with the
  // badge "bridging" the gap.
  const ruleY = y + h / 2;
  const ruleGap = 24;
  return `
  <line x1="60" y1="${ruleY}" x2="${x - ruleGap}" y2="${ruleY}" stroke="${C_RULE}" stroke-width="1"/>
  <line x1="${x + w + ruleGap}" y1="${ruleY}" x2="${CANVAS_W - 60}" y2="${ruleY}" stroke="${C_RULE}" stroke-width="1"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${C_INK}"/>
  ${
    hasSubtotal
      ? `<text x="${PAGE_CENTER_X}" y="${y + 16}" text-anchor="middle" font-size="10" font-weight="600" letter-spacing="0.08em" fill="#FFFFFF">${escapeXml(label)}</text>
  <text x="${PAGE_CENTER_X}" y="${y + 30}" text-anchor="middle" class="num" font-size="13" font-weight="700" fill="#FFFFFF">${escapeXml(fmt(subtotalCents))}</text>`
      : `<text x="${PAGE_CENTER_X}" y="${y + h / 2 + 4}" text-anchor="middle" font-size="11" font-weight="600" letter-spacing="0.08em" fill="#FFFFFF">${escapeXml(label)}</text>`
  }`;
}

// =============================================================================
// Liabilities table (grey, plain rows, no bullets)
// =============================================================================
function liabilitiesTable(liabs: TccLiability[], x: number, y: number, w: number): string {
  const PAD_X = 16;
  const PAD_Y = 10;
  const HEADER_H = 16;
  const ROW_H = 16;
  const rows = liabs.slice(0, 4);
  const h = HEADER_H + Math.max(rows.length, 1) * ROW_H + PAD_Y * 2;

  const lines = rows
    .map((l, i) => {
      const yRow = y + PAD_Y + HEADER_H + i * ROW_H + 11;
      const ratePart = l.interestRateBps != null ? ` @ ${(l.interestRateBps / 100).toFixed(2)}%` : '';
      const payoffPart = l.payoffDate ? `, pay off ${fmtShortDate(l.payoffDate)}` : '';
      return `<text x="${x + PAD_X}" y="${yRow}" font-size="10" fill="${C_INK_MUTED}" class="num">
        <tspan font-weight="600" fill="${C_INK}">${escapeXml(l.creditorName)}</tspan>${l.liabilityType ? ` <tspan>(${escapeXml(l.liabilityType)})</tspan>` : ''} <tspan font-weight="500">${escapeXml(fmt(l.balanceCents))}</tspan><tspan>${escapeXml(ratePart + payoffPart)}</tspan>${l.isStale ? STALE_TSPAN : ''}
      </text>`;
    })
    .join('');

  const empty = rows.length === 0
    ? `<text x="${x + w / 2}" y="${y + PAD_Y + HEADER_H + 11}" text-anchor="middle" font-size="10" font-style="italic" fill="${C_INK_SOFT}">No liabilities</text>`
    : '';

  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${C_BG_SUNKEN}" stroke="${C_RULE}" stroke-width="1"/>
  <text x="${x + PAD_X}" y="${y + PAD_Y + 10}" font-size="10" font-weight="600" letter-spacing="0.08em" fill="${C_INK_MUTED}">LIABILITIES</text>
  ${lines}
  ${empty}`;
}

// =============================================================================
// Permanent disclaimer (Phase 33: always rendered)
// =============================================================================
function disclaimerFooter(): string {
  const badgeX = 286;
  const badgeW = 220;
  const badgeY = NQ_TOTAL_BADGE_Y;
  return `<g class="disclaimer-legend">
    <rect x="${badgeX + badgeW + 40}" y="${badgeY + 4}" width="240" height="22" rx="2" fill="#FFFFFF" stroke="${C_DANGER}" stroke-width="0.8"/>
    <text x="${badgeX + badgeW + 160}" y="${badgeY + 18}" text-anchor="middle" font-size="9" font-weight="500" fill="${C_DANGER}">* Indicates we do not have up to date information</text>
  </g>`;
}

// =============================================================================
// SVG wrapper + slot indicators (for drag-and-drop overlay)
// =============================================================================
function svgWrap(content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="${CANVAS_W}" height="${CANVAS_H}" fill="${C_INK}">
<defs>
<style><![CDATA[${FONT_FACE_CSS}]]></style>
</defs>
${content}
</svg>`;
}

function slotIndicators(layout: TccBubbleLayout): string {
  const both = { ...layout.retirementSlots, ...layout.nonRetirementSlots };
  return Object.entries(both)
    .map(([slotId, a]) => {
      const section = slotIdToSection(slotId);
      return `<ellipse class="slot" data-slot-id="${escapeXml(slotId)}" data-section="${section}" data-cx="${a.cx}" data-cy="${a.cy}" cx="${a.cx}" cy="${a.cy}" rx="${BUBBLE_RX}" ry="${BUBBLE_RY}" fill="none" stroke="#B8956A" stroke-width="1" stroke-dasharray="4 3" opacity="0"></ellipse>`;
    })
    .join('');
}

// =============================================================================
// Main render
// =============================================================================
export function renderTccSvg(
  s: TccSnapshot,
  layout: TccBubbleLayout = DEFAULT_TCC_LAYOUT,
  _options: RenderOptions = {},
): { page1: string } {
  // Self-healing slot remap. If a saved layout pins a bubble to a slot
  // that's missing from the current grid (e.g. old `p1-*` / `nr-*` IDs
  // from before Phase 33), find the next free default slot for the
  // bubble's side. Side hint comes from the saved slotId prefix.
  const QUAL_LEFT_FILL = ['qualified-left-1', 'qualified-left-2', 'qualified-left-3'];
  const QUAL_RIGHT_FILL = ['qualified-right-1', 'qualified-right-2', 'qualified-right-3'];
  const QUAL_DEFAULT_FILL = [...QUAL_LEFT_FILL, ...QUAL_RIGHT_FILL];

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
      // Side hint: old `p1-` → left, `p2-` → right, new `qualified-left-` → left, etc.
      const side =
        item.bubble.slotId.startsWith('p2-') || item.bubble.slotId.startsWith('qualified-right-')
          ? 'right'
          : item.bubble.slotId.startsWith('p1-') || item.bubble.slotId.startsWith('qualified-left-')
            ? 'left'
            : 'either';
      const order =
        side === 'left'
          ? [...QUAL_LEFT_FILL, ...QUAL_RIGHT_FILL]
          : side === 'right'
            ? [...QUAL_RIGHT_FILL, ...QUAL_LEFT_FILL]
            : QUAL_DEFAULT_FILL;
      const free = order.find((slot) => !used.has(slot) && layout.retirementSlots[slot]);
      if (free) {
        item.anchor = layout.retirementSlots[free]!;
        used.add(free);
      }
    }
    return items;
  })();

  const NQ_DEFAULT_FILL = [
    'non-qualified-left-1',
    'non-qualified-right-1',
    'non-qualified-left-2',
    'non-qualified-right-2',
    'non-qualified-left-3',
    'non-qualified-right-3',
  ];

  const nqPlaced = (() => {
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
      const free = NQ_DEFAULT_FILL.find(
        (slot) => !used.has(slot) && layout.nonRetirementSlots[slot],
      );
      if (free) {
        item.anchor = layout.nonRetirementSlots[free]!;
        used.add(free);
      }
    }
    return items;
  })();

  const retBubbles = retPlaced
    .filter((item) => item.anchor !== null)
    .map((item) => bubbleContent(item.bubble, item.anchor!))
    .join('');
  const nqBubbles = nqPlaced
    .filter((item) => item.anchor !== null)
    .map((item) => bubbleContent(item.bubble, item.anchor!))
    .join('');

  const retirementSubtotal = s.totals.p1RetirementCents + s.totals.p2RetirementCents;
  const nonRetirementSubtotal = s.totals.nonRetirementCents + s.totals.trustCents;

  const content = `
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#FFFFFF"/>

  <!-- Header -->
  ${headerEyebrows(s)}
  ${grandTotalBox(s)}

  <!-- Qualified section. Corner badges go FIRST (background-most) so
       the central client oval + account bubbles paint cleanly over the
       horizontal hairline rules; the badges themselves are in clear
       bands above the bubble rows so they aren't hidden by ellipses. -->
  ${cornerBadgePair('QUALIFIED', QUAL_BADGE_Y)}
  ${clientOval(layout.clientOval, s.persons)}
  ${slotIndicators(layout)}
  ${retBubbles}

  <!-- Retirement Only divider -->
  ${centeredNavyBadge('RETIREMENT ONLY', retirementSubtotal, RET_DIVIDER_Y)}

  <!-- Non-Qualified section -->
  ${cornerBadgePair('NON-QUALIFIED', NQ_BADGE_Y)}
  ${trustOval(layout.trustCircle, s.trust.valueCents, s.trust.asOfDate, s.trust.isStale, s.persons)}
  ${nqBubbles}

  <!-- Liabilities table -->
  ${liabilitiesTable(s.liabilities, LIAB_TABLE_X, LIAB_TABLE_Y, LIAB_TABLE_W)}

  <!-- Non Retirement Total badge -->
  ${centeredNavyBadge('NON RETIREMENT TOTAL', nonRetirementSubtotal, NQ_TOTAL_BADGE_Y)}

  <!-- Permanent disclaimer (always shown) -->
  ${disclaimerFooter()}`;

  return { page1: svgWrap(content) };
}
