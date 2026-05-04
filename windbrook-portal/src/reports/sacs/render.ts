/**
 * SACS report renderer — pixel-faithful to docs/references/SACS-Example.pdf.
 *
 * Pure SVG strings. No external font loads at render time: Fraunces + General
 * Sans woff2 are read once at module load and inlined as base64 data URIs in
 * a <defs><style> block, so each SVG is fully self-contained for browser
 * preview and Playwright PDF export alike (CLAUDE.md §6 — pixel fidelity).
 *
 * Coordinates use the 792×612 user space (US Letter landscape at 72pt/in).
 * Default anchors live in DEFAULT_SACS_LAYOUT; Phase 7's drag-and-drop
 * persists overrides into the bubble_layouts table.
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

export interface SacsBubbleLayout {
  page1: {
    inflow: CircleAnchor;
    outflow: CircleAnchor;
    privateReserve: CircleAnchor;
  };
  page2: {
    pinnaclePR: CircleAnchor;
    schwab: CircleAnchor;
  };
}

export interface InflowSource {
  personFirstName: string;
  monthlyAmountCents: number;
}

export interface SacsSnapshot {
  householdName: string;
  meetingDate: string;
  inflowSources: InflowSource[];
  monthlyInflowCents: number;
  monthlyOutflowCents: number;
  automatedTransferDay: number;
  privateReserveBalanceCents: number;
  privateReserveMonthlyContributionCents: number;
  pinnacleTargetCents: number;
  pinnacleTargetBreakdown: {
    sixXExpensesCents: number;
    homeownerDeductibleCents: number;
    autoDeductibleCents: number;
    medicalDeductibleCents: number;
  };
  schwabBalanceCents: number;
  remainderCents: number;
  inflowFloorCents: number;
  outflowFloorCents: number;
  privateReserveFloorCents: number;
  /**
   * Set of field identifiers whose value was carried forward via "Use last".
   * Each id renders a small superscript red asterisk next to its number, and
   * the page footer adds the "* Indicates we do not have up-to-date
   * information" caveat (Sagan TCC convention applied to SACS for parity).
   */
  staleFields: Set<string>;
}

export const DEFAULT_SACS_LAYOUT: SacsBubbleLayout = {
  page1: {
    inflow: { cx: 240, cy: 290, r: 82 },
    outflow: { cx: 552, cy: 290, r: 82 },
    privateReserve: { cx: 240, cy: 478, r: 64 },
  },
  page2: {
    pinnaclePR: { cx: 240, cy: 268, r: 86 },
    schwab: { cx: 552, cy: 268, r: 86 },
  },
};

// =============================================================================
// Palette — match the Sagan PDF exactly. Sampled hex values supplied in brief.
// =============================================================================
const C_GREEN = '#1F9E4D';
const C_RED = '#D62728';
const C_BLUE_PR = '#5BA3D0';
const C_BLUE_PINNACLE = '#9DC8E5';
const C_NAVY = '#1B3A6B';
const C_INK = '#0A1F3A';
const C_INK_MUTED = '#4A5568';
const C_INK_SOFT = '#8B9099';
const C_DANGER = '#A33A3A';

// =============================================================================
// Number / date / ordinal helpers
// =============================================================================
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

function formatMeetingDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return longDate.format(d);
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => XML_ENT[c] as string);
}
const XML_ENT: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&apos;',
};

const STALE_TSPAN = `<tspan dx="2" dy="-4" fill="${C_DANGER}" font-size="60%" font-weight="500">*</tspan>`;

function moneyTspan(cents: number, isStale: boolean): string {
  return `${escapeXml(fmt(cents))}${isStale ? STALE_TSPAN : ''}`;
}

// =============================================================================
// Inline icons (paths from Lucide, ISC license)
// =============================================================================
function dollarSignIcon(x: number, y: number, color: string, size = 32): string {
  return `<g transform="translate(${x - size / 2},${y - size / 2})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="${size / 2}" y1="${size * 0.08}" x2="${size / 2}" y2="${size * 0.92}"/>
    <path d="M${size * 0.71},${size * 0.21} H${size * 0.4} a${size * 0.15},${size * 0.15} 0 0 0 0,${size * 0.29} h${size * 0.21} a${size * 0.15},${size * 0.15} 0 0 1 0,${size * 0.29} H${size * 0.25}"/>
  </g>`;
}

function envelopeIcon(x: number, y: number, color: string, size = 32): string {
  return `<g transform="translate(${x - size / 2},${y - size / 2})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="${size * 0.08}" y="${size * 0.17}" width="${size * 0.84}" height="${size * 0.66}" rx="2"/>
    <path d="M${size * 0.92},${size * 0.29} l-${size * 0.38},${size * 0.24} a${size * 0.08},${size * 0.08} 0 0 1 -${size * 0.085},0 l-${size * 0.38},-${size * 0.24}"/>
  </g>`;
}

/**
 * Piggy-bank illustration — inline path so the SVG is self-contained.
 * Lucide piggy-bank, scaled. Fill matches brief's "piggy-bank emoji-style"
 * (light pink against the blue circle). Adjust scale via `size`.
 */
function piggyBank(cx: number, cy: number, color = '#F4A6B8', size = 56): string {
  const s = size / 24;
  return `<g transform="translate(${cx - size / 2},${cy - size / 2}) scale(${s})">
    <path d="M19,5 c-1.5,0 -2.8,1.4 -3,2 c-3.5,-1.5 -11,-0.3 -11,5 c0,1.8 0,3 2,4.5 V20 h4 v-2 h3 v2 h4 v-4 c1,-0.5 1.7,-1 2,-2 h2 v-4 h-2 c0,-1 -0.5,-1.5 -1,-2 V5 z" fill="${color}" stroke="${C_INK}" stroke-width="0.8" stroke-linejoin="round"/>
    <path d="M2,9 v1 c0,1.1 0.9,2 2,2 h1" fill="none" stroke="${C_INK}" stroke-width="0.8" stroke-linecap="round"/>
    <circle cx="16" cy="11" r="0.8" fill="${C_INK}"/>
  </g>`;
}

// =============================================================================
// Block arrows — sharp ends, no rounded corners
// =============================================================================
function horizontalBlockArrow(
  x1: number,
  x2: number,
  y: number,
  bodyHeight: number,
  headLen: number,
  headHeight: number,
  color: string,
  filled = false,
): string {
  const dir = x2 > x1 ? 1 : -1;
  const tipX = x2;
  const baseX = x2 - dir * headLen;
  const bh = bodyHeight / 2;
  const hh = headHeight / 2;
  const path = `M${x1},${y - bh} L${baseX},${y - bh} L${baseX},${y - hh} L${tipX},${y} L${baseX},${y + hh} L${baseX},${y + bh} L${x1},${y + bh} Z`;
  return filled
    ? `<path d="${path}" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="miter"/>`
    : `<path d="${path}" fill="#FFFFFF" stroke="${color}" stroke-width="2" stroke-linejoin="miter"/>`;
}

function verticalBlockArrow(
  x: number,
  y1: number,
  y2: number,
  bodyWidth: number,
  headLen: number,
  headWidth: number,
  color: string,
  filled = false,
): string {
  const dir = y2 > y1 ? 1 : -1;
  const tipY = y2;
  const baseY = y2 - dir * headLen;
  const bw = bodyWidth / 2;
  const hw = headWidth / 2;
  const path = `M${x - bw},${y1} L${x - bw},${baseY} L${x - hw},${baseY} L${x},${tipY} L${x + hw},${baseY} L${x + bw},${baseY} L${x + bw},${y1} Z`;
  return filled
    ? `<path d="${path}" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="miter"/>`
    : `<path d="${path}" fill="#FFFFFF" stroke="${color}" stroke-width="2" stroke-linejoin="miter"/>`;
}

// =============================================================================
// Bubbles
// =============================================================================
function cashflowCircle(opts: {
  anchor: CircleAnchor;
  label: 'INFLOW' | 'OUTFLOW';
  amountCents: number;
  floorCents: number;
  fill: string;
  isStale: boolean;
}): string {
  const { anchor: a, label, amountCents, floorCents, fill, isStale } = opts;
  const boxW = 120;
  const boxH = 26;
  const boxY = a.cy - boxH / 2;
  return `
    <circle cx="${a.cx}" cy="${a.cy}" r="${a.r}" fill="${fill}"/>
    <text x="${a.cx}" y="${a.cy - 28}" text-anchor="middle" fill="#FFFFFF" font-size="13" font-weight="500" letter-spacing="2">${label}</text>
    <rect x="${a.cx - boxW / 2}" y="${boxY}" width="${boxW}" height="${boxH}" fill="#FFFFFF" stroke="${C_INK}" stroke-width="0.5"/>
    <text x="${a.cx}" y="${a.cy + 6}" text-anchor="middle" class="num" font-size="16" font-weight="500" fill="${C_INK}">${moneyTspan(amountCents, isStale)}</text>
    <line x1="${a.cx - 50}" y1="${a.cy + 30}" x2="${a.cx + 50}" y2="${a.cy + 30}" stroke="#FFFFFF" stroke-width="1"/>
    <text x="${a.cx}" y="${a.cy + 48}" text-anchor="middle" class="num" font-size="11" fill="#FFFFFF" font-style="italic">${escapeXml(fmt(floorCents))} Floor</text>
  `;
}

function privateReserveCircle(opts: {
  anchor: CircleAnchor;
  floorCents: number;
  fill: string;
}): string {
  const { anchor: a, floorCents, fill } = opts;
  // PRIVATE RESERVE is wider than the bubble at the available font size — wrap
  // to two lines (matches the Sagan reference). Two <tspan>s share the same x.
  return `
    <circle cx="${a.cx}" cy="${a.cy}" r="${a.r}" fill="${fill}"/>
    <text text-anchor="middle" x="${a.cx}" y="${a.cy - a.r * 0.65}" fill="#FFFFFF" font-size="11" font-weight="600" letter-spacing="0.08em">
      <tspan x="${a.cx}" dy="0">PRIVATE</tspan>
      <tspan x="${a.cx}" dy="13">RESERVE</tspan>
    </text>
    ${piggyBank(a.cx, a.cy + 8, '#F4A6B8', a.r * 0.7)}
    <line x1="${a.cx - a.r * 0.6}" y1="${a.cy + a.r * 0.62}" x2="${a.cx + a.r * 0.6}" y2="${a.cy + a.r * 0.62}" stroke="#FFFFFF" stroke-width="1"/>
    <text x="${a.cx}" y="${a.cy + a.r * 0.85}" text-anchor="middle" class="num" font-size="10" fill="#FFFFFF" font-style="italic">${escapeXml(fmt(floorCents))} Floor</text>
  `;
}

function pinnaclePrCircle(opts: {
  anchor: CircleAnchor;
  balanceCents: number;
  isStale: boolean;
  fill: string;
}): string {
  const { anchor: a, balanceCents, isStale, fill } = opts;
  return `
    <circle cx="${a.cx}" cy="${a.cy}" r="${a.r}" fill="${fill}"/>
    <text x="${a.cx}" y="${a.cy - 14}" text-anchor="middle" fill="#FFFFFF" font-size="13" font-weight="500" letter-spacing="2">PINNACLE PR</text>
    <text x="${a.cx}" y="${a.cy + 12}" text-anchor="middle" class="num" font-size="20" font-weight="500" fill="#FFFFFF">${moneyTspan(balanceCents, isStale)}</text>
  `;
}

function schwabCircle(opts: {
  anchor: CircleAnchor;
  balanceCents: number;
  isStale: boolean;
  fill: string;
}): string {
  const { anchor: a, balanceCents, isStale, fill } = opts;
  return `
    <circle cx="${a.cx}" cy="${a.cy}" r="${a.r}" fill="${fill}"/>
    <text x="${a.cx}" y="${a.cy - 14}" text-anchor="middle" fill="#FFFFFF" font-size="14" font-weight="500" letter-spacing="2">SCHWAB</text>
    <text x="${a.cx}" y="${a.cy + 10}" text-anchor="middle" class="num" font-size="18" font-weight="500" fill="#FFFFFF">${moneyTspan(balanceCents, isStale)}</text>
    <text x="${a.cx}" y="${a.cy + 32}" text-anchor="middle" fill="#FFFFFF" font-size="11" font-weight="500" letter-spacing="2">BROKERAGE</text>
  `;
}

// =============================================================================
// Inflow source list
// =============================================================================
function inflowSourcesList(
  x: number,
  y: number,
  sources: InflowSource[],
  staleFields: Set<string>,
): string {
  return sources
    .map((s, i) => {
      const isStale = staleFields.has(`inflow-source-${i}`);
      return `<text x="${x}" y="${y + i * 14}" font-size="10" fill="${C_INK_MUTED}">
        <tspan font-weight="500">${escapeXml(s.personFirstName)}:</tspan>
        <tspan dx="4" class="num">${moneyTspan(s.monthlyAmountCents, isStale)}</tspan>
      </text>`;
    })
    .join('');
}

// =============================================================================
// Stale footnote
// =============================================================================
function staleFootnote(): string {
  return `<text x="780" y="600" text-anchor="end" font-size="9" font-style="italic" fill="${C_INK_SOFT}">
    <tspan fill="${C_DANGER}">*</tspan> Indicates we do not have up-to-date information
  </text>`;
}

// =============================================================================
// SVG wrapper
// =============================================================================
function svgWrap(content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 792 612" width="792" height="612" fill="${C_INK}">
<defs><style><![CDATA[${FONT_FACE_CSS}]]></style></defs>
${content}
</svg>`;
}

// =============================================================================
// Page 1 — Monthly Cashflow
// =============================================================================
function renderPage1(s: SacsSnapshot, l: SacsBubbleLayout['page1']): string {
  const hasStale = s.staleFields.size > 0;
  const inflowEdgeX = l.inflow.cx + l.inflow.r;
  const outflowEdgeX = l.outflow.cx - l.outflow.r;
  const arrowMidX = (inflowEdgeX + outflowEdgeX) / 2;
  return svgWrap(`
    <rect width="792" height="612" fill="#FFFFFF"/>

    <!-- Title + subtitle -->
    <text x="396" y="58" text-anchor="middle" class="title" font-size="26" font-weight="500" fill="${C_INK}">Simple Automated Cashflow System (SACS)</text>
    <text x="396" y="84" text-anchor="middle" font-size="11" letter-spacing="1.6" fill="${C_INK_MUTED}">${escapeXml(s.householdName.toUpperCase())} &#183; ${escapeXml(formatMeetingDate(s.meetingDate))}</text>

    <!-- Top-left source decoration -->
    ${dollarSignIcon(76, 132, C_GREEN, 30)}
    ${inflowSourcesList(64, 168, s.inflowSources, s.staleFields)}

    <!-- Horizontal red arrow body (drawn first so circles overlap above it) -->
    ${horizontalBlockArrow(inflowEdgeX + 4, outflowEdgeX - 4, l.inflow.cy, 44, 22, 60, C_RED, false)}
    <text x="${arrowMidX}" y="${l.inflow.cy - 6}" text-anchor="middle" class="num" font-size="13" font-weight="500" fill="${C_RED}">X = ${moneyTspan(s.monthlyOutflowCents, s.staleFields.has('outflow'))}/month</text>
    <text x="${arrowMidX}" y="${l.inflow.cy + 12}" text-anchor="middle" font-size="9" font-style="italic" fill="${C_DANGER}">Automated transfer on the ${ordinal(s.automatedTransferDay)}</text>

    <!-- INFLOW circle -->
    ${cashflowCircle({ anchor: l.inflow, label: 'INFLOW', amountCents: s.monthlyInflowCents, floorCents: s.inflowFloorCents, fill: C_GREEN, isStale: s.staleFields.has('inflow') })}

    <!-- OUTFLOW circle -->
    ${cashflowCircle({ anchor: l.outflow, label: 'OUTFLOW', amountCents: s.monthlyOutflowCents, floorCents: s.outflowFloorCents, fill: C_RED, isStale: s.staleFields.has('outflow') })}

    <!-- Top-right envelope cluster — anchored so the label's right edge sits
         24px in from the canvas right edge (label width ~110px at font 9). -->
    ${envelopeIcon(710, 132, C_DANGER, 30)}
    <text x="710" y="170" text-anchor="middle" font-size="9" font-style="italic" fill="${C_INK_MUTED}">X = Monthly Expenses</text>

    <!-- Vertical blue arrow INFLOW → PR -->
    ${verticalBlockArrow(l.inflow.cx, l.inflow.cy + l.inflow.r + 4, l.privateReserve.cy - l.privateReserve.r - 4, 32, 18, 50, C_BLUE_PR, false)}
    <text x="${l.inflow.cx + 30}" y="${(l.inflow.cy + l.privateReserve.cy) / 2}" font-size="11" font-weight="500" class="num" fill="${C_BLUE_PR}">${moneyTspan(s.privateReserveMonthlyContributionCents, s.staleFields.has('excess'))}/mo</text>

    <!-- PRIVATE RESERVE circle -->
    ${privateReserveCircle({ anchor: l.privateReserve, floorCents: s.privateReserveFloorCents, fill: C_BLUE_PR })}

    <!-- Below PR: dotted decorative arrow + corrected MONTHLY EXPENSES label -->
    <line x1="${l.privateReserve.cx}" y1="${l.privateReserve.cy + l.privateReserve.r + 8}" x2="${l.privateReserve.cx}" y2="${l.privateReserve.cy + l.privateReserve.r + 30}" stroke="${C_BLUE_PR}" stroke-width="1.5" stroke-dasharray="2 3"/>
    <polygon points="${l.privateReserve.cx - 4},${l.privateReserve.cy + l.privateReserve.r + 28} ${l.privateReserve.cx + 4},${l.privateReserve.cy + l.privateReserve.r + 28} ${l.privateReserve.cx},${l.privateReserve.cy + l.privateReserve.r + 36}" fill="${C_BLUE_PR}"/>
    <text x="${l.privateReserve.cx}" y="${l.privateReserve.cy + l.privateReserve.r + 56}" text-anchor="middle" font-size="11" font-weight="500" letter-spacing="2" fill="${C_BLUE_PR}">MONTHLY EXPENSES</text>

    ${hasStale ? staleFootnote() : ''}
  `);
}

// =============================================================================
// Page 2 — Long-Term Cashflow
// =============================================================================
function renderPage2(s: SacsSnapshot, l: SacsBubbleLayout['page2']): string {
  const hasStale = s.staleFields.size > 0;
  const arrowY = l.pinnaclePR.cy;
  const leftEdge = l.pinnaclePR.cx + l.pinnaclePR.r + 8;
  const rightEdge = l.schwab.cx - l.schwab.r - 8;
  const arrowMid = (leftEdge + rightEdge) / 2;
  const halfW = (rightEdge - leftEdge) / 2;
  return svgWrap(`
    <rect width="792" height="612" fill="#FFFFFF"/>

    <!-- Title + subtitle -->
    <text x="396" y="58" text-anchor="middle" class="title" font-size="26" font-weight="500" fill="${C_INK}">Simple Automated Cashflow System (SACS)</text>
    <text x="396" y="84" text-anchor="middle" font-size="11" letter-spacing="1.6" fill="${C_INK_MUTED}">${escapeXml(s.householdName.toUpperCase())} &#183; ${escapeXml(formatMeetingDate(s.meetingDate))}</text>

    <!-- Decorative dotted arrow descending from title -->
    <line x1="396" y1="98" x2="396" y2="148" stroke="${C_BLUE_PR}" stroke-width="1.5" stroke-dasharray="2 3"/>
    <polygon points="392,146 400,146 396,154" fill="${C_BLUE_PR}"/>

    <!-- PINNACLE PR circle -->
    ${pinnaclePrCircle({ anchor: l.pinnaclePR, balanceCents: s.privateReserveBalanceCents, isStale: s.staleFields.has('privateReserveBalance'), fill: C_BLUE_PINNACLE })}

    <!-- Target line beneath PR circle -->
    <text x="${l.pinnaclePR.cx}" y="${l.pinnaclePR.cy + l.pinnaclePR.r + 22}" text-anchor="middle" class="num" font-size="14" font-weight="500" fill="${C_INK}">${moneyTspan(s.pinnacleTargetCents, s.staleFields.has('target'))} TARGET</text>

    <!-- Target breakdown bullets -->
    ${targetBreakdown(l.pinnaclePR.cx - 90, l.pinnaclePR.cy + l.pinnaclePR.r + 46, s)}

    <!-- Bidirectional filled blue arrow between bubbles -->
    ${horizontalBlockArrow(leftEdge, leftEdge + halfW - 4, arrowY, 22, 14, 32, C_BLUE_PR, true)}
    ${horizontalBlockArrow(rightEdge, rightEdge - halfW + 4, arrowY, 22, 14, 32, C_BLUE_PR, true)}

    <!-- SCHWAB circle -->
    ${schwabCircle({ anchor: l.schwab, balanceCents: s.schwabBalanceCents, isStale: s.staleFields.has('schwab'), fill: C_NAVY })}

    <!-- Remainder label below schwab -->
    <text x="${l.schwab.cx}" y="${l.schwab.cy + l.schwab.r + 22}" text-anchor="middle" font-size="13" font-weight="500" letter-spacing="1.5" fill="${C_INK}">REMAINDER</text>
    <text x="${l.schwab.cx}" y="${l.schwab.cy + l.schwab.r + 40}" text-anchor="middle" class="num" font-size="13" fill="${C_INK_MUTED}" font-style="italic">${moneyTspan(s.remainderCents, s.staleFields.has('remainder'))}</text>

    <!-- Mid-arrow label -->
    <text x="${arrowMid}" y="${arrowY - 18}" text-anchor="middle" font-size="9" font-style="italic" fill="${C_INK_SOFT}">flow</text>

    <!-- Bottom-center header -->
    <text x="396" y="544" text-anchor="middle" class="title" font-size="20" font-weight="500" letter-spacing="3" fill="${C_INK}">LONG TERM CASHFLOW</text>
    <text x="396" y="562" text-anchor="middle" font-size="11" font-style="italic" fill="${C_BLUE_PR}">( Magnified Private Reserve Cashflow )</text>

    ${hasStale ? staleFootnote() : ''}
  `);
}

function targetBreakdown(x: number, y: number, s: SacsSnapshot): string {
  const b = s.pinnacleTargetBreakdown;
  const lines = [
    `6x Monthly Expenses + Deductible = ${fmt(b.sixXExpensesCents + b.homeownerDeductibleCents + b.autoDeductibleCents * 2 + b.medicalDeductibleCents)}`,
    `${fmt(b.homeownerDeductibleCents)} - Homeowner`,
    `${fmt(b.autoDeductibleCents)} x 2 = ${fmt(b.autoDeductibleCents * 2)} - Auto`,
    `${fmt(b.medicalDeductibleCents)} - Medical`,
  ];
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + i * 14}" font-size="10" class="num" fill="${C_INK_MUTED}">&#8226; ${escapeXml(line)}</text>`,
    )
    .join('');
}

// =============================================================================
// Public entry
// =============================================================================
export function renderSacsSvg(
  snapshot: SacsSnapshot,
  layout: SacsBubbleLayout = DEFAULT_SACS_LAYOUT,
): { page1: string; page2: string } {
  return {
    page1: renderPage1(snapshot, layout.page1),
    page2: renderPage2(snapshot, layout.page2),
  };
}
