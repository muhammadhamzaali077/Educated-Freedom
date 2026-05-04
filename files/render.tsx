// src/reports/tcc/render.tsx
//
// Total Client Capital (TCC) report renderer.
//
// Output: SVG string for a single-page report at 1100×850 viewport.
// Bubbles are ELLIPSES (not circles) per the reference template.

import type { Snapshot, AccountBubble, BubbleLayout } from './types';

// =============================================================================
// CANVAS DIMENSIONS
// =============================================================================
// Larger than US Letter to give breathing room. CSS scales it for display;
// PDF export prints at this size at high DPI.

const CANVAS_W = 1100;
const CANVAS_H = 850;

// =============================================================================
// BUBBLE GEOMETRY — DO NOT MODIFY THESE VALUES
// =============================================================================

const BUBBLE_RX = 78;      // 156px wide ellipse
const BUBBLE_RY = 60;      // 120px tall ellipse (1.3:1 ratio)

// Y-offsets for text lines, relative to bubble center
const Y_ACCT_LINE = -34;   // Acct # ••XXXX
const Y_TYPE_LINE = -10;   // Account type
const Y_BALANCE = +14;     // Balance
const Y_DATE = +38;        // a/o date

// Underline below Acct # line
const ACCT_UNDERLINE_Y_OFFSET = -25; // y = cy + this
const ACCT_UNDERLINE_HALF_WIDTH = 42;

// Font sizes
const FONT_ACCT = 10;
const FONT_TYPE = 13;
const FONT_BALANCE = 17;
const FONT_DATE = 10;

// Trust circle (bottom section center)
const TRUST_R = 110;

// Client info oval (top section center)
const CLIENT_OVAL_RX = 130;
const CLIENT_OVAL_RY = 60;

// =============================================================================
// LAYOUT POSITIONS
// =============================================================================

// Top section (retirement). Y range: ~120–360. Client oval at center.
const RETIREMENT_CENTER_X = CANVAS_W / 2;
const RETIREMENT_CENTER_Y = 240;

// Person 1 = LEFT side (slot data-section = "retirement-left")
// Slot fill order: mid → top → bottom (mirror order for symmetry)
const RETIREMENT_LEFT_SLOTS = [
  { id: 'ret-l-mid-inner', cx: 280, cy: 240 },
  { id: 'ret-l-top-inner', cx: 280, cy: 130 },
  { id: 'ret-l-bot-inner', cx: 280, cy: 350 },
  { id: 'ret-l-mid-outer', cx: 110, cy: 240 },
  { id: 'ret-l-top-outer', cx: 110, cy: 130 },
  { id: 'ret-l-bot-outer', cx: 110, cy: 350 },
];

const RETIREMENT_RIGHT_SLOTS = [
  { id: 'ret-r-mid-inner', cx: 820, cy: 240 },
  { id: 'ret-r-top-inner', cx: 820, cy: 130 },
  { id: 'ret-r-bot-inner', cx: 820, cy: 350 },
  { id: 'ret-r-mid-outer', cx: 990, cy: 240 },
  { id: 'ret-r-top-outer', cx: 990, cy: 130 },
  { id: 'ret-r-bot-outer', cx: 990, cy: 350 },
];

// Bottom section (non-retirement). Trust circle at center.
const NONRET_CENTER_X = CANVAS_W / 2;
const NONRET_CENTER_Y = 600;

const NONRET_LEFT_SLOTS = [
  { id: 'nr-l-mid-inner', cx: 280, cy: 580 },
  { id: 'nr-l-top-inner', cx: 280, cy: 470 },
  { id: 'nr-l-bot-inner', cx: 280, cy: 690 },
  { id: 'nr-l-mid-outer', cx: 110, cy: 580 },
  { id: 'nr-l-top-outer', cx: 110, cy: 470 },
  { id: 'nr-l-bot-outer', cx: 110, cy: 690 },
];

const NONRET_RIGHT_SLOTS = [
  { id: 'nr-r-mid-inner', cx: 820, cy: 580 },
  { id: 'nr-r-top-inner', cx: 820, cy: 470 },
  { id: 'nr-r-bot-inner', cx: 820, cy: 690 },
  { id: 'nr-r-mid-outer', cx: 990, cy: 580 },
  { id: 'nr-r-top-outer', cx: 990, cy: 470 },
  { id: 'nr-r-bot-outer', cx: 990, cy: 690 },
];

// =============================================================================
// HELPERS
// =============================================================================

function formatCurrency(cents: number): string {
  const dollars = Math.round(cents / 100);
  return '$' + dollars.toLocaleString('en-US');
}

function formatShortDate(iso: string): string {
  // "2026-01-21" -> "Jan 21, 2026"
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function splitAccountName(name: string): string[] {
  if (name.length <= 13) return [name];
  const words = name.split(' ');
  if (words.length === 1) {
    const mid = Math.floor(name.length / 2);
    return [name.slice(0, mid), name.slice(mid)];
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
  return [
    words.slice(0, bestSplit).join(' '),
    words.slice(bestSplit).join(' '),
  ];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// =============================================================================
// BUBBLE RENDER
// =============================================================================

function renderBubble(
  bubble: AccountBubble,
  cx: number,
  cy: number,
  slotId: string,
  section: string
): string {
  const typeLines = splitAccountName(bubble.accountType);
  const isWrapped = typeLines.length === 2;
  const wrapShift = isWrapped ? 12 : 0; // shift balance + date down when type wraps

  const balance = formatCurrency(bubble.balanceCents) + (bubble.isStale ? '*' : '');
  const date = formatShortDate(bubble.asOfDate);

  return `
    <g class="bubble"
       data-account-id="${escapeXml(bubble.accountId)}"
       data-slot-id="${escapeXml(slotId)}"
       data-section="${section}"
       data-cx="${cx}" data-cy="${cy}">

      <ellipse cx="${cx}" cy="${cy}" rx="${BUBBLE_RX}" ry="${BUBBLE_RY}"
               fill="white" stroke="#0A1F3A" stroke-width="1.5"/>

      <text x="${cx}" y="${cy + Y_ACCT_LINE}"
            text-anchor="middle" dominant-baseline="middle"
            font-family="Geist, sans-serif" font-size="${FONT_ACCT}"
            fill="#4A5568" letter-spacing="0.04em">Acct # ••${escapeXml(bubble.lastFour)}</text>

      <line x1="${cx - ACCT_UNDERLINE_HALF_WIDTH}" y1="${cy + ACCT_UNDERLINE_Y_OFFSET}"
            x2="${cx + ACCT_UNDERLINE_HALF_WIDTH}" y2="${cy + ACCT_UNDERLINE_Y_OFFSET}"
            stroke="#0A1F3A" stroke-width="0.5"/>

      ${typeLines.map((line, i) => `
        <text x="${cx}" y="${cy + Y_TYPE_LINE + i * 13}"
              text-anchor="middle" dominant-baseline="middle"
              font-family="Geist, sans-serif" font-size="${FONT_TYPE}"
              font-weight="500" fill="#0A1F3A">${escapeXml(line)}</text>
      `).join('')}

      <text x="${cx}" y="${cy + Y_BALANCE + wrapShift}"
            text-anchor="middle" dominant-baseline="middle"
            font-family="'Source Serif 4', serif" font-size="${FONT_BALANCE}"
            font-weight="500" fill="#0A1F3A"
            style="font-feature-settings: 'tnum' 1, 'lnum' 1;">${escapeXml(balance)}</text>

      <text x="${cx}" y="${cy + Y_DATE + wrapShift}"
            text-anchor="middle" dominant-baseline="middle"
            font-family="Geist, sans-serif" font-size="${FONT_DATE}"
            font-style="italic" fill="#8B9099">a/o ${escapeXml(date)}</text>
    </g>
  `;
}

function renderEmptySlot(slot: { id: string; cx: number; cy: number }, section: string): string {
  return `
    <ellipse class="slot"
             data-slot-id="${escapeXml(slot.id)}"
             data-section="${section}"
             data-cx="${slot.cx}" data-cy="${slot.cy}"
             cx="${slot.cx}" cy="${slot.cy}"
             rx="${BUBBLE_RX}" ry="${BUBBLE_RY}"
             fill="none" stroke="#B8956A" stroke-width="1"
             stroke-dasharray="4 3" opacity="0"/>
  `;
}

// =============================================================================
// DEBUG OVERLAY
// =============================================================================

function renderDebugOverlay(cx: number, cy: number): string {
  return `
    <ellipse cx="${cx}" cy="${cy}" rx="${BUBBLE_RX - 8}" ry="${BUBBLE_RY - 8}"
             fill="none" stroke="red" stroke-width="0.5" stroke-dasharray="2 2"/>
  `;
}

// =============================================================================
// MAIN RENDERER
// =============================================================================

export interface TccRenderInput {
  reportId: string;
  snapshot: Snapshot;
  layout: BubbleLayout | null;
  debug: boolean;
}

export function renderTccSvg(input: TccRenderInput): string {
  const { reportId, snapshot, layout, debug } = input;

  // Distribute bubbles across slots
  // Person 1 retirement → RETIREMENT_LEFT_SLOTS in order
  // Person 2 retirement → RETIREMENT_RIGHT_SLOTS in order
  // Non-retirement → alternates between NONRET_LEFT_SLOTS and NONRET_RIGHT_SLOTS

  const p1Bubbles = (snapshot.retirementP1 || []).slice(0, 6);
  const p2Bubbles = (snapshot.retirementP2 || []).slice(0, 6);
  const nonRetBubbles = (snapshot.nonRetirement || []).slice(0, 12);

  // Build assignments: bubble -> slot
  const assignments: Array<{
    bubble: AccountBubble;
    cx: number;
    cy: number;
    slotId: string;
    section: string;
  }> = [];

  // Apply saved layout if provided, otherwise use default fill order
  const customMap = new Map<string, string>(); // accountId -> slotId
  if (layout && layout.entries) {
    for (const e of layout.entries) {
      customMap.set(e.accountId, e.slotId);
    }
  }

  function assignBubbleToSlot(
    bubble: AccountBubble,
    defaultSlotIdx: number,
    slotArray: typeof RETIREMENT_LEFT_SLOTS,
    section: string
  ) {
    const overrideSlotId = customMap.get(bubble.accountId);
    let slot = overrideSlotId
      ? slotArray.find(s => s.id === overrideSlotId)
      : slotArray[defaultSlotIdx];
    if (!slot) slot = slotArray[defaultSlotIdx]; // fallback if override invalid
    assignments.push({
      bubble,
      cx: slot.cx,
      cy: slot.cy,
      slotId: slot.id,
      section,
    });
  }

  // P1 retirement
  p1Bubbles.forEach((b, i) => assignBubbleToSlot(b, i, RETIREMENT_LEFT_SLOTS, 'retirement-left'));

  // P2 retirement
  p2Bubbles.forEach((b, i) => assignBubbleToSlot(b, i, RETIREMENT_RIGHT_SLOTS, 'retirement-right'));

  // Non-retirement: alternate left/right for symmetry
  const nrLeftCount = Math.ceil(nonRetBubbles.length / 2);
  const nrRightCount = Math.floor(nonRetBubbles.length / 2);
  for (let i = 0; i < nrLeftCount; i++) {
    if (nonRetBubbles[i * 2]) {
      assignBubbleToSlot(nonRetBubbles[i * 2], i, NONRET_LEFT_SLOTS, 'nonret-left');
    }
  }
  for (let i = 0; i < nrRightCount; i++) {
    if (nonRetBubbles[i * 2 + 1]) {
      assignBubbleToSlot(nonRetBubbles[i * 2 + 1], i, NONRET_RIGHT_SLOTS, 'nonret-right');
    }
  }

  // Track which slots are filled so we can render empties
  const filledSlotIds = new Set(assignments.map(a => a.slotId));

  // ==========================================================================
  // BUILD SVG
  // ==========================================================================

  const stale = assignments.some(a => a.bubble.isStale);

  return `<svg class="report-svg"
              data-report-id="${escapeXml(reportId)}"
              data-report-type="TCC"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 ${CANVAS_W} ${CANVAS_H}"
              width="100%"
              style="background:white">

    <!-- Header row -->
    <g>
      <text x="60" y="55" font-family="Geist, sans-serif" font-size="11"
            font-weight="500" letter-spacing="0.08em" fill="#8B9099">NAME</text>
      <text x="115" y="55" font-family="Geist, sans-serif" font-size="14"
            fill="#0A1F3A">${escapeXml(snapshot.householdName)}</text>

      <text x="60" y="80" font-family="Geist, sans-serif" font-size="11"
            font-weight="500" letter-spacing="0.08em" fill="#8B9099">DATE</text>
      <text x="115" y="80" font-family="Geist, sans-serif" font-size="14"
            fill="#0A1F3A">${escapeXml(formatShortDate(snapshot.meetingDate))}</text>

      <!-- Grand Total banner -->
      <rect x="${CANVAS_W / 2 - 130}" y="35" width="260" height="60"
            fill="#0A1F3A" rx="2"/>
      <text x="${CANVAS_W / 2}" y="55" text-anchor="middle"
            font-family="Geist, sans-serif" font-size="11"
            font-weight="500" letter-spacing="0.12em" fill="white">GRAND TOTAL</text>
      <text x="${CANVAS_W / 2}" y="82" text-anchor="middle"
            font-family="'Source Serif 4', serif" font-size="22"
            font-weight="500" fill="white"
            style="font-feature-settings: 'tnum' 1;">${escapeXml(formatCurrency(snapshot.grandTotalCents))}</text>

      <!-- Liabilities pill -->
      ${snapshot.liabilitiesTotalCents > 0 ? `
        <rect x="${CANVAS_W - 380}" y="48" width="320" height="34" rx="17"
              fill="#F2EFE8" stroke="#E2DDD3" stroke-width="1"/>
        <text x="${CANVAS_W - 360}" y="69" font-family="Geist, sans-serif" font-size="11"
              font-weight="500" letter-spacing="0.08em" fill="#8B9099">LIABILITIES</text>
        <text x="${CANVAS_W - 260}" y="69" font-family="Geist, sans-serif" font-size="13"
              font-weight="500" fill="#0A1F3A"
              style="font-feature-settings: 'tnum' 1;">${escapeXml(formatCurrency(snapshot.liabilitiesTotalCents))} · ${escapeXml(formatShortDate(snapshot.meetingDate))}</text>
      ` : ''}
    </g>

    <!-- QUALIFIED labels (top section) -->
    <text x="40" y="${RETIREMENT_CENTER_Y}" text-anchor="middle"
          font-family="Geist, sans-serif" font-size="11"
          font-weight="500" letter-spacing="0.18em" fill="#9DC8E5"
          transform="rotate(-90 40 ${RETIREMENT_CENTER_Y})">QUALIFIED</text>
    <text x="${CANVAS_W - 40}" y="${RETIREMENT_CENTER_Y}" text-anchor="middle"
          font-family="Geist, sans-serif" font-size="11"
          font-weight="500" letter-spacing="0.18em" fill="#9DC8E5"
          transform="rotate(90 ${CANVAS_W - 40} ${RETIREMENT_CENTER_Y})">QUALIFIED</text>

    <!-- Client info oval (center top) -->
    <ellipse cx="${RETIREMENT_CENTER_X}" cy="${RETIREMENT_CENTER_Y}"
             rx="${CLIENT_OVAL_RX}" ry="${CLIENT_OVAL_RY}"
             fill="#9DC8E5" stroke="#0A1F3A" stroke-width="1.5"/>
    ${renderClientInfo(snapshot)}

    <!-- Retirement bubbles -->
    ${assignments
      .filter(a => a.section === 'retirement-left' || a.section === 'retirement-right')
      .map(a => renderBubble(a.bubble, a.cx, a.cy, a.slotId, a.section))
      .join('')}

    <!-- Retirement empty slots -->
    ${RETIREMENT_LEFT_SLOTS.filter(s => !filledSlotIds.has(s.id))
      .map(s => renderEmptySlot(s, 'retirement-left'))
      .join('')}
    ${RETIREMENT_RIGHT_SLOTS.filter(s => !filledSlotIds.has(s.id))
      .map(s => renderEmptySlot(s, 'retirement-right'))
      .join('')}

    <!-- Retirement Only banner -->
    <rect x="40" y="395" width="${CANVAS_W - 80}" height="38" fill="#0A1F3A"/>
    <text x="60" y="420" font-family="Geist, sans-serif" font-size="12"
          font-weight="500" letter-spacing="0.12em" fill="white">RETIREMENT ONLY</text>
    <text x="${CANVAS_W - 60}" y="420" text-anchor="end"
          font-family="'Source Serif 4', serif" font-size="18"
          font-weight="500" fill="white"
          style="font-feature-settings: 'tnum' 1;">${escapeXml(formatCurrency(snapshot.retirementTotalCents))}</text>

    <!-- NON QUALIFIED labels (bottom section) -->
    <text x="40" y="${NONRET_CENTER_Y}" text-anchor="middle"
          font-family="Geist, sans-serif" font-size="11"
          font-weight="500" letter-spacing="0.18em" fill="#9DC8E5"
          transform="rotate(-90 40 ${NONRET_CENTER_Y})">NON QUALIFIED</text>
    <text x="${CANVAS_W - 40}" y="${NONRET_CENTER_Y}" text-anchor="middle"
          font-family="Geist, sans-serif" font-size="11"
          font-weight="500" letter-spacing="0.18em" fill="#9DC8E5"
          transform="rotate(90 ${CANVAS_W - 40} ${NONRET_CENTER_Y})">NON QUALIFIED</text>

    <!-- Trust circle (center bottom) -->
    <circle cx="${NONRET_CENTER_X}" cy="${NONRET_CENTER_Y}" r="${TRUST_R}"
            fill="white" stroke="#0A1F3A" stroke-width="1.5"/>
    ${renderTrustCircle(snapshot)}

    <!-- Non-retirement bubbles -->
    ${assignments
      .filter(a => a.section === 'nonret-left' || a.section === 'nonret-right')
      .map(a => renderBubble(a.bubble, a.cx, a.cy, a.slotId, a.section))
      .join('')}

    <!-- Non-retirement empty slots -->
    ${NONRET_LEFT_SLOTS.filter(s => !filledSlotIds.has(s.id))
      .map(s => renderEmptySlot(s, 'nonret-left'))
      .join('')}
    ${NONRET_RIGHT_SLOTS.filter(s => !filledSlotIds.has(s.id))
      .map(s => renderEmptySlot(s, 'nonret-right'))
      .join('')}

    <!-- Liabilities box (below trust circle) -->
    ${snapshot.liabilities && snapshot.liabilities.length > 0
      ? renderLiabilitiesBox(snapshot, NONRET_CENTER_X, NONRET_CENTER_Y + TRUST_R + 30)
      : ''}

    <!-- Non Retirement Total banner -->
    <rect x="40" y="${CANVAS_H - 60}" width="${CANVAS_W - 80}" height="38" fill="#0A1F3A"/>
    <text x="60" y="${CANVAS_H - 35}"
          font-family="Geist, sans-serif" font-size="12"
          font-weight="500" letter-spacing="0.12em" fill="white">NON RETIREMENT TOTAL</text>
    <text x="${CANVAS_W - 60}" y="${CANVAS_H - 35}" text-anchor="end"
          font-family="'Source Serif 4', serif" font-size="18"
          font-weight="500" fill="white"
          style="font-feature-settings: 'tnum' 1;">${escapeXml(formatCurrency(snapshot.nonRetirementTotalCents))}</text>

    <!-- Stale footnote -->
    ${stale ? `
      <text x="${CANVAS_W - 60}" y="${CANVAS_H - 8}" text-anchor="end"
            font-family="Geist, sans-serif" font-size="10"
            font-style="italic" fill="#A33A3A">* Indicates we do not have up to date information</text>
    ` : ''}

    <!-- Debug overlay -->
    ${debug ? assignments.map(a => renderDebugOverlay(a.cx, a.cy)).join('') : ''}
  </svg>`;
}

function renderClientInfo(snapshot: Snapshot): string {
  const persons = snapshot.persons || [];
  if (persons.length === 0) return '';

  if (persons.length === 1) {
    const p = persons[0];
    const cx = RETIREMENT_CENTER_X;
    const cy = RETIREMENT_CENTER_Y;
    return `
      <text x="${cx}" y="${cy - 18}" text-anchor="middle"
            font-family="'Source Serif 4', serif" font-size="16" font-weight="500" fill="white">${escapeXml(p.firstName)} ${escapeXml(p.lastName)}</text>
      <text x="${cx}" y="${cy + 4}" text-anchor="middle"
            font-family="Geist, sans-serif" font-size="11" fill="white">AGE ${p.age}</text>
      <text x="${cx}" y="${cy + 20}" text-anchor="middle"
            font-family="Geist, sans-serif" font-size="11" fill="white">DOB ${escapeXml(p.dob)}</text>
      <text x="${cx}" y="${cy + 36}" text-anchor="middle"
            font-family="Geist, sans-serif" font-size="11" fill="white">SSN ●●●-●●-${escapeXml(p.ssnLastFour)}</text>
    `;
  }

  // Two-person household
  const [p1, p2] = persons;
  const cx = RETIREMENT_CENTER_X;
  const cy = RETIREMENT_CENTER_Y;
  return `
    <text x="${cx}" y="${cy - 30}" text-anchor="middle"
          font-family="'Source Serif 4', serif" font-size="14" font-weight="500" fill="white">${escapeXml(p1.firstName)} ${escapeXml(p1.lastName)}</text>
    <text x="${cx}" y="${cy - 13}" text-anchor="middle"
          font-family="Geist, sans-serif" font-size="9" fill="white">AGE ${p1.age} · DOB ${escapeXml(p1.dob)} · SSN ●●${escapeXml(p1.ssnLastFour)}</text>
    <text x="${cx}" y="${cy + 10}" text-anchor="middle"
          font-family="'Source Serif 4', serif" font-size="14" font-weight="500" fill="white">${escapeXml(p2.firstName)} ${escapeXml(p2.lastName)}</text>
    <text x="${cx}" y="${cy + 27}" text-anchor="middle"
          font-family="Geist, sans-serif" font-size="9" fill="white">AGE ${p2.age} · DOB ${escapeXml(p2.dob)} · SSN ●●${escapeXml(p2.ssnLastFour)}</text>
  `;
}

function renderTrustCircle(snapshot: Snapshot): string {
  const cx = NONRET_CENTER_X;
  const cy = NONRET_CENTER_Y;
  const trustName = snapshot.trustName || `${snapshot.persons?.[0]?.firstName ?? ''} Family Trust`;
  return `
    <text x="${cx}" y="${cy - 25}" text-anchor="middle"
          font-family="Geist, sans-serif" font-size="13" font-weight="500" fill="#0A1F3A">${escapeXml(trustName.split(' ')[0])}</text>
    <text x="${cx}" y="${cy - 8}" text-anchor="middle"
          font-family="Geist, sans-serif" font-size="13" font-weight="500" fill="#0A1F3A">Family Trust</text>
    <text x="${cx}" y="${cy + 18}" text-anchor="middle"
          font-family="'Source Serif 4', serif" font-size="22" font-weight="500" fill="#0A1F3A"
          style="font-feature-settings: 'tnum' 1;">${escapeXml(formatCurrency(snapshot.trustValueCents))}</text>
    <text x="${cx}" y="${cy + 40}" text-anchor="middle"
          font-family="Geist, sans-serif" font-size="10" font-style="italic" fill="#8B9099">a/o ${escapeXml(formatShortDate(snapshot.meetingDate))}</text>
  `;
}

function renderLiabilitiesBox(snapshot: Snapshot, cx: number, topY: number): string {
  const w = 460;
  const x = cx - w / 2;
  const liabilities = snapshot.liabilities || [];
  const lineHeight = 18;
  const padding = 18;
  const headerH = 22;
  const h = padding + headerH + liabilities.length * lineHeight + padding;

  return `
    <rect x="${x}" y="${topY}" width="${w}" height="${h}"
          fill="#F2EFE8" stroke="#E2DDD3" stroke-width="1"/>
    <text x="${x + padding}" y="${topY + padding + 12}"
          font-family="Geist, sans-serif" font-size="11"
          font-weight="500" letter-spacing="0.08em" fill="#8B9099">LIABILITIES</text>
    ${liabilities.map((l, i) => `
      <text x="${x + padding}" y="${topY + padding + headerH + (i + 1) * lineHeight - 4}"
            font-family="Geist, sans-serif" font-size="12">
        <tspan font-weight="500" fill="#0A1F3A">${escapeXml(l.creditor)}</tspan>
        <tspan fill="#4A5568"> (${escapeXml(l.type)}) ${escapeXml(formatCurrency(l.balanceCents))} @ ${(l.rateBps / 100).toFixed(2)}%${l.payoffDate ? ', pay off ' + escapeXml(formatShortDate(l.payoffDate)) : ''}</tspan>
      </text>
    `).join('')}
  `;
}
