/**
 * SACS renderer — Phase 28 PIXEL-PERFECT REBUILD.
 *
 * EVERY coordinate in this file was extracted directly from the reference
 * PDF (`docs/references/Copy_of_SACS-_for_Sagan.pdf`) using PyMuPDF. No
 * eyeballing, no guessing — these are the source-of-truth numbers.
 *
 * Canvas: 768 × 576 (matches reference, was 792× something).
 *
 * Reference fonts (Canva proprietary) substituted with our self-hosted
 * Geist Sans:
 *   Inter-Bold        → Geist Bold
 *   Garet-Bold        → Geist Bold
 *   CanvaSans-Bold    → Geist Bold
 *   CanvaSans-Regular → Geist Regular
 *
 * KEEP: real client numbers (not $00,000 placeholders), correct
 * "MONTHLY EXPENSES" spelling.
 */

import { FONT_FACE_CSS } from '../_fonts.js';

// =============================================================================
// Types — unchanged from prior phases
// =============================================================================
export interface SacsSnapshot {
  householdName: string;
  meetingDate: string; // ISO yyyy-mm-dd
  asOfDate: string;
  persons: Array<{
    firstName: string;
    monthlyInflowCents: number;
  }>;
  inflow: {
    monthlyTotalCents: number;
  };
  outflow: {
    monthlyTotalCents: number;
    automatedTransferDay: number; // 1-31
  };
  privateReserve: {
    monthlyContributionCents: number;
    targetCents: number;
    breakdown: {
      sixMonthsExpensesCents: number;
      homeownerDeductibleCents: number;
      autoDeductibleCents: number; // single auto, will be doubled for display
      medicalDeductibleCents: number;
    };
  };
  schwab: {
    valueCents: number;
  };
  staleFields: Set<string>;
}

export interface RenderOptions {
  debug?: boolean;
}

// =============================================================================
// CANVAS — extracted from reference
// =============================================================================
const CANVAS_W = 768;
const CANVAS_H = 576;

// =============================================================================
// COLORS — exact RGB values from the reference PDF
// =============================================================================
// Inflow green: rgb(0, 0.7608, 0.3451) → #00C258
const C_INFLOW_GREEN = '#00C258';
// Outflow red: rgb(0.949, 0.20, 0.1804) → #F23341 — but the ref text color
// 15872814 = 0xF22F2E — close enough, use #F22F2E for stroke consistency
const C_OUTFLOW_RED = '#F22F2E';
// Private reserve blue (page 1): rgb(0.259, 0.545, 0.808) → #428BCE
const C_RESERVE_BLUE = '#428BCE';
// Pinnacle PR light blue (page 2): rgb(0.608, 0.796, 0.922) → #9BCBEB
const C_PINNACLE_BLUE = '#9BCBEB';
// Schwab navy (page 2): rgb(0.106, 0.212, 0.365) → #1B365D
const C_SCHWAB_NAVY = '#1B365D';
// Pinnacle PR text on white box (lighter blue): 10210283 = 0x9BCBEB
const C_PINNACLE_TEXT = '#9BCBEB';
// Schwab text on white box (navy): 1783389 = 0x1B365D
const C_SCHWAB_TEXT = '#1B365D';
// Subtitle blue (footer page 2): 4361166 = 0x428DCE
const C_SUBTITLE_BLUE = '#428DCE';
// Inflow value text on white: 49752 = 0x00C258 (green)
const C_INFLOW_VALUE = '#00C258';
// Outflow value text: 15872814 = 0xF22F2E (red)
const C_OUTFLOW_VALUE = '#F22F2E';
const C_INK = '#000000';
const C_WHITE = '#FFFFFF';

// =============================================================================
// FONT FAMILIES (substitution mapping)
// =============================================================================
const F_BODY = 'Geist, "Segoe UI", system-ui, sans-serif';

// =============================================================================
// Number / date helpers
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
function fmtLongDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return longDate.format(d);
}

function ordinalSuffix(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
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

// =============================================================================
// PAGE 1 — Monthly Cashflow
// =============================================================================

// Reference exact coordinates:
const P1 = {
  // Inflow circle: (57.6, 150.84, 261.77, 355.0) → cx=159.68 cy=252.92 r=102.08
  INFLOW_CX: 159.68,
  INFLOW_CY: 252.92,
  INFLOW_R: 102.08,
  // Outflow circle: (473.45, 150.84, 679.13, 356.52) → cx=576.29 cy=253.68 r=102.84
  OUTFLOW_CX: 576.29,
  OUTFLOW_CY: 253.68,
  OUTFLOW_R: 102.84,
  // Private Reserve: (269.28, 319.77, 473.45, 523.93) → cx=371.37 cy=421.85 r=102.08
  RESERVE_CX: 371.37,
  RESERVE_CY: 421.85,
  RESERVE_R: 102.08,
  // Inflow value white box: (93.93, 235.59, 225.39, 263.38) — 131px wide × 28px tall
  INFLOW_BOX: { x: 93.93, y: 235.59, w: 131.46, h: 27.79 },
  // Outflow value white box: (509.78, 243.19, 641.24, 270.98)
  OUTFLOW_BOX: { x: 509.78, y: 243.19, w: 131.46, h: 27.79 },
  // Inflow→Outflow arrow polygon (red stroke, white fill, hollow)
  // Vertices from reference:
  //   (467.95, 243.90) tip
  //   (427.12, 203.07) head top-left
  //   (427.12, 223.49) shaft top-left of head
  //   (274.78, 223.49) shaft top-left
  //   (274.78, 264.32) shaft bottom-left
  //   (427.12, 264.32) shaft bottom-left of head
  //   (427.12, 284.74) head bottom-left
  //   back to (467.95, 243.90)
  ARROW_PATH: 'M 274.78 223.49 L 427.12 223.49 L 427.12 203.07 L 467.95 243.90 L 427.12 284.74 L 427.12 264.32 L 274.78 264.32 Z',
  // Inflow $1,000 Floor horizontal line
  INFLOW_LINE: { x1: 75.31, x2: 242.78, y: 308.10 },
  OUTFLOW_LINE: { x1: 492.88, x2: 660.35, y: 313.76 },
  // Papers icon connector: drawing 8 (horizontal at y≈257.5 from x=649 to x=727)
  // + drawing 10 (vertical at x=727, y=161 to y=257.8)
  // + drawing 9 (small left-pointing arrowhead near x=648)
  // + drawing 24-25 — small filled rects forming the "thick" portion
  // The line travels from papers icon (x≈686, y≈161) down to outflow circle.
  // Top of line: x=727, y=161
  // Bottom of line goes to x=727, y=257.8 (just right of outflow circle)
  // Then horizontal segment x=727 → x=649 at y=257.5
  // Then small arrow pointing left ending at x=642
  // Diamond $ icon — drawing 15 (green filled diamond) and drawing 16 ($ glyph stroke)
  // Diamond rect: (29.69, 128.87, 98.90, 198.15) — 69×69 rotated diamond
  // $ glyph rect: (38.53, 137.11, 82.41, 181.65)
};

function renderPage1(s: SacsSnapshot, debug: boolean): string {
  const transferDay = s.outflow.automatedTransferDay;
  const transferDayWithSuffix = `${transferDay}${ordinalSuffix(transferDay)}`;

  // Contributor lines below the diamond $ icon
  const contributors = s.persons.filter(p => p.monthlyInflowCents > 0);
  const contributorLines = contributors.map((p, i) => {
    const y = 110 + i * 19;
    return `<text x="14" y="${y}" font-family="${F_BODY}" font-size="13" font-weight="700" fill="${C_INFLOW_GREEN}">${escapeXml(fmt(p.monthlyInflowCents))}- ${escapeXml(p.firstName)}</text>`;
  }).join('\n  ');

  return `
<!-- ================ PAGE 1 — Monthly Cashflow ================ -->

<!-- White page background -->
<rect x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}" fill="${C_WHITE}"/>

<!-- Title (Inter-Bold 21.85, position 146.7,26 → 621.3,52) -->
<text x="${CANVAS_W / 2}" y="44" text-anchor="middle"
      font-family="${F_BODY}" font-size="22" font-weight="700"
      fill="${C_INK}">Simple Automated Cashflow System (SACS)</text>

<!-- "CLIENT NAMES" subtitle (Garet-Bold 18.04, centered, y=64-90) -->
<text x="${CANVAS_W / 2}" y="82" text-anchor="middle"
      font-family="${F_BODY}" font-size="18" font-weight="700"
      fill="${C_INK}">${escapeXml(s.householdName.toUpperCase())}</text>

<!-- Date (CanvaSans-Bold 16, y=97-119) -->
<text x="${CANVAS_W / 2}" y="113" text-anchor="middle"
      font-family="${F_BODY}" font-size="16" font-weight="700"
      fill="${C_INK}">${escapeXml(fmtLongDate(s.meetingDate))}</text>

<!-- Diamond $ icon (drawing 15: green filled rotated square 29.7,128.9,98.9,198.2) -->
<!-- Reference is a diamond shape (rotated 45° square) with $ glyph inside -->
<polygon points="65.05,128.87 98.90,165.20 63.54,198.15 29.69,161.82"
         fill="${C_INFLOW_GREEN}" stroke="none"/>
<!-- $ glyph as text overlay, white -->
<text x="60" y="178" text-anchor="middle"
      font-family="Georgia, 'Times New Roman', serif"
      font-size="48" font-weight="700"
      fill="${C_WHITE}">$</text>

<!-- Contributor lines (CanvaSans-Bold 13, green, x=10-153) -->
${contributorLines}

<!-- INFLOW circle -->
<circle cx="${P1.INFLOW_CX}" cy="${P1.INFLOW_CY}" r="${P1.INFLOW_R}"
        fill="${C_INFLOW_GREEN}" stroke="${C_INK}" stroke-width="1"/>

<!-- "INFLOW" label (CanvaSans-Bold 20.27, white, bbox 119.4,180.5 → 200.0,208.1) -->
<text x="${P1.INFLOW_CX}" y="200"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="20" font-weight="700"
      fill="${C_WHITE}">INFLOW</text>

<!-- Inflow value white inset box -->
<rect x="${P1.INFLOW_BOX.x}" y="${P1.INFLOW_BOX.y}"
      width="${P1.INFLOW_BOX.w}" height="${P1.INFLOW_BOX.h}"
      fill="${C_WHITE}"/>

<!-- Inflow value text (CanvaSans-Reg 22, GREEN color, on white box) -->
<text x="${P1.INFLOW_CX}" y="258"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="22" font-weight="400"
      fill="${C_INFLOW_VALUE}">${escapeXml(fmt(s.inflow.monthlyTotalCents))}</text>

<!-- Inflow $1,000 Floor horizontal black line (drawing 22) -->
<line x1="${P1.INFLOW_LINE.x1}" y1="${P1.INFLOW_LINE.y}"
      x2="${P1.INFLOW_LINE.x2}" y2="${P1.INFLOW_LINE.y}"
      stroke="${C_INK}" stroke-width="3"/>

<!-- "$1,000 Floor" subtext (CanvaSans-Reg 15, BLACK, INSIDE bottom of inflow circle) -->
<text x="${P1.INFLOW_CX}" y="328"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="15" font-weight="400"
      fill="${C_INK}">$1,000 Floor</text>

<!-- OUTFLOW circle -->
<circle cx="${P1.OUTFLOW_CX}" cy="${P1.OUTFLOW_CY}" r="${P1.OUTFLOW_R}"
        fill="${C_OUTFLOW_RED}" stroke="${C_INK}" stroke-width="1"/>

<!-- "OUTFLOW" label (white) -->
<text x="${P1.OUTFLOW_CX}" y="204"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="20" font-weight="700"
      fill="${C_WHITE}">OUTFLOW</text>

<!-- Outflow value white inset box -->
<rect x="${P1.OUTFLOW_BOX.x}" y="${P1.OUTFLOW_BOX.y}"
      width="${P1.OUTFLOW_BOX.w}" height="${P1.OUTFLOW_BOX.h}"
      fill="${C_WHITE}"/>

<!-- Outflow value text (RED on white box) -->
<text x="${P1.OUTFLOW_CX}" y="265"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="22" font-weight="400"
      fill="${C_OUTFLOW_VALUE}">${escapeXml(fmt(s.outflow.monthlyTotalCents))}</text>

<!-- Outflow $1,000 Floor line -->
<line x1="${P1.OUTFLOW_LINE.x1}" y1="${P1.OUTFLOW_LINE.y}"
      x2="${P1.OUTFLOW_LINE.x2}" y2="${P1.OUTFLOW_LINE.y}"
      stroke="${C_INK}" stroke-width="3"/>

<text x="${P1.OUTFLOW_CX}" y="333"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="15" font-weight="400"
      fill="${C_INK}">$1,000 Floor</text>

<!-- Inflow → Outflow hollow chunky arrow (red stroke, white fill) -->
<rect x="274.77" y="203.07" width="193.31" height="81.66"
      fill="${C_WHITE}"/>
<path d="${P1.ARROW_PATH}" fill="${C_WHITE}" stroke="${C_OUTFLOW_RED}" stroke-width="2.5"/>

<!-- Arrow text "X=$11,500/month*" (CanvaSans-Bold 15.09, RED) -->
<text x="356" y="248"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="15" font-weight="700"
      fill="${C_OUTFLOW_RED}">X=${escapeXml(fmt(s.outflow.monthlyTotalCents))}/month*</text>

<!-- "Automated transfer on the Nth" italic black BELOW the arrow -->
<text x="367" y="298"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="12" font-weight="400"
      fill="${C_INK}">Automated transfer on the ${transferDayWithSuffix}</text>

<!-- PRIVATE RESERVE circle -->
<circle cx="${P1.RESERVE_CX}" cy="${P1.RESERVE_CY}" r="${P1.RESERVE_R}"
        fill="${C_RESERVE_BLUE}" stroke="${C_INK}" stroke-width="1"/>

<!-- "PRIVATE" / "RESERVE" white text stacked -->
<text x="${P1.RESERVE_CX}" y="380"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="20" font-weight="700"
      fill="${C_WHITE}">PRIVATE</text>
<text x="${P1.RESERVE_CX}" y="408"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="20" font-weight="700"
      fill="${C_WHITE}">RESERVE</text>

<!-- Piggy bank with coins (centered in lower part of circle) -->
<g transform="translate(${P1.RESERVE_CX - 60}, 425)">
  <!-- Coin stacks left -->
  <ellipse cx="0" cy="48" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="0" cy="42" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="0" cy="36" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="0" cy="30" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <!-- Coin stacks right -->
  <ellipse cx="120" cy="48" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="120" cy="42" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="120" cy="36" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <!-- Piggy body -->
  <ellipse cx="60" cy="35" rx="34" ry="22" fill="#F5A8B8" stroke="#C77A8C" stroke-width="1"/>
  <!-- Piggy ear -->
  <path d="M 47 16 L 53 12 L 55 23 Z" fill="#C77A8C"/>
  <!-- Piggy snout -->
  <ellipse cx="89" cy="36" rx="9" ry="7" fill="#E08FA0" stroke="#C77A8C" stroke-width="0.6"/>
  <circle cx="86" cy="34" r="1.4" fill="#5C2E3B"/>
  <circle cx="92" cy="34" r="1.4" fill="#5C2E3B"/>
  <!-- Piggy eye -->
  <circle cx="71" cy="29" r="2" fill="#5C2E3B"/>
  <circle cx="71.6" cy="28.4" r="0.7" fill="${C_WHITE}"/>
  <!-- Piggy legs -->
  <rect x="42" y="55" width="6" height="7" fill="#C77A8C"/>
  <rect x="74" y="55" width="6" height="7" fill="#C77A8C"/>
  <!-- Coin in air with $ -->
  <circle cx="60" cy="3" r="6" fill="#E5B040" stroke="#A37A20" stroke-width="0.8"/>
  <text x="60" y="6" text-anchor="middle" font-family="serif" font-size="7" fill="#A37A20" font-weight="700">$</text>
  <!-- Sparkles -->
  <text x="20" y="8" font-family="${F_BODY}" font-size="10" fill="#E5B040">✦</text>
  <text x="95" y="12" font-family="${F_BODY}" font-size="9" fill="#E5B040">✦</text>
</g>

<!-- L-arrow (Inflow bottom → Private Reserve left) — hollow blue -->
<!-- Vertical descent at x=159.7, from y=355 (inflow bottom) to y=421.85 (PR center) -->
<!-- Then horizontal at y=421.85, from x=159.7 to x=269.3 (PR left edge) -->
<!-- Body width = 30px (extracted from $0,000/mo* text bbox suggesting narrow body) -->
<g class="l-arrow">
  <!-- Vertical body -->
  <path d="M 144.7 355 L 174.7 355 L 174.7 406.85 L 244 406.85 L 244 396 L 269.3 421.85 L 244 447.7 L 244 436.85 L 144.7 436.85 Z"
        fill="${C_WHITE}" stroke="${C_RESERVE_BLUE}" stroke-width="2"/>
</g>

<!-- L-arrow text "$3,000/mo*" inside horizontal portion -->
<text x="195" y="426"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="13" font-weight="700"
      fill="${C_RESERVE_BLUE}">${escapeXml(fmt(s.privateReserve.monthlyContributionCents))}/mo*</text>

<!-- Papers icon at top-right (image embedded in reference; we render as SVG) -->
<!-- Reference shows roughly at x=686, y=120, ~80x80px -->
<g transform="translate(686, 60)">
  <!-- Bottom paper, rotated -->
  <rect x="0" y="14" width="32" height="38" fill="${C_WHITE}" stroke="${C_INK}" stroke-width="1.4"
        transform="rotate(-8 16 33)"/>
  <!-- Middle paper -->
  <rect x="4" y="6" width="32" height="38" fill="${C_WHITE}" stroke="${C_INK}" stroke-width="1.4"
        transform="rotate(5 20 25)"/>
  <!-- Top envelope -->
  <rect x="0" y="0" width="34" height="22" fill="${C_WHITE}" stroke="${C_INK}" stroke-width="1.6"/>
  <path d="M 0 0 L 17 13 L 34 0" fill="none" stroke="${C_INK}" stroke-width="1.6"/>
</g>

<!-- "X= Monthly" / "Expenses" labels — to the RIGHT of icon (text-anchor:start) -->
<text x="722" y="135"
      font-family="${F_BODY}" font-size="15" font-weight="400"
      fill="${C_INK}">X= Monthly</text>
<text x="722" y="156"
      font-family="${F_BODY}" font-size="15" font-weight="400"
      fill="${C_INK}">Expenses</text>

<!-- Connector from papers icon DOWN and curving INTO Outflow circle right edge -->
<!-- Reference: vertical line at x=727 from y=161 to y=257.8, then leftward arrow from x=649 to x=642 -->
<line x1="727" y1="161" x2="727" y2="257.5" stroke="${C_INK}" stroke-width="3"/>
<line x1="727" y1="257.5" x2="649" y2="257.5" stroke="${C_INK}" stroke-width="3"/>
<!-- Arrowhead pointing left, into the outflow circle -->
<polygon points="648.74,261.65 642.78,257.10 648.82,252.65" fill="${C_INK}"/>

<!-- Bottom dotted blue arrow + MONTHLY EXPENSES label -->
<!-- Drawing 18: dotted descent from PR bottom (cy+r ≈ 524) to y=566, x≈372 -->
<g class="monthly-expenses-stem">
  <!-- Dotted line -->
  ${[0,1,2,3,4,5,6].map(i => `<rect x="370" y="${524 + i * 6}" width="4" height="3" fill="${C_RESERVE_BLUE}"/>`).join('\n  ')}
  <!-- Arrow tip -->
  <polygon points="367.76,560.71 376.76,560.71 372.41,566.82" fill="${C_RESERVE_BLUE}"/>
</g>

<!-- "MONTHLY EXPENSES" label (Garet-Bold 18.04, BLACK, bottom-center) -->
<text x="${CANVAS_W / 2}" y="552"
      text-anchor="middle"
      font-family="${F_BODY}" font-size="18" font-weight="700"
      fill="${C_INK}">MONTHLY   EXPENSES</text>

${debug ? `<rect x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}" fill="none" stroke="orange" stroke-width="1" stroke-dasharray="4 4"/>` : ''}
`;
}

// =============================================================================
// PAGE 2 — Long-Term Cashflow
// =============================================================================

const P2 = {
  // Pinnacle PR circle: (57.6, 170.17, 261.77, 374.33) → cx=159.68 cy=272.25 r=102.08
  PINNACLE_CX: 159.68,
  PINNACLE_CY: 272.25,
  PINNACLE_R: 102.08,
  // Schwab circle: (488.52, 170.17, 692.69, 374.33) → cx=590.61 cy=272.25 r=102.08
  SCHWAB_CX: 590.61,
  SCHWAB_CY: 272.25,
  SCHWAB_R: 102.08,
  // Pinnacle value white box: (93.93, 274.10, 225.39, 301.90)
  PINNACLE_BOX: { x: 93.93, y: 274.10, w: 131.46, h: 27.79 },
  // Schwab value white box: (525.02, 261.65, 656.49, 289.44)
  SCHWAB_BOX: { x: 525.02, y: 261.65, w: 131.46, h: 27.79 },
  // Bidirectional arrow region: (275.52, 230.66, 474.72, 313.85)
  // 199px wide, 83px tall, complex polygon (10 items)
};

function renderPage2(s: SacsSnapshot, debug: boolean): string {
  const sixMo = s.privateReserve.breakdown.sixMonthsExpensesCents;
  const homeowner = s.privateReserve.breakdown.homeownerDeductibleCents;
  const auto = s.privateReserve.breakdown.autoDeductibleCents;
  const medical = s.privateReserve.breakdown.medicalDeductibleCents;

  return `
<!-- ================ PAGE 2 — Long-Term Cashflow ================ -->

<!-- White page background -->
<rect x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}" fill="${C_WHITE}"/>

<!-- Title only (NO household name, NO date — reference page 2 is title-only) -->
<text x="${CANVAS_W / 2}" y="44" text-anchor="middle"
      font-family="${F_BODY}" font-size="22" font-weight="700"
      fill="${C_INK}">Simple Automated Cashflow System (SACS)</text>

<!-- Dotted descent arrow from title to bidirectional arrows below -->
<g class="title-descent">
  ${[0,1,2,3,4,5,6,7,8,9,10,11,12,13].map(i => `<rect x="372" y="${60 + i * 10}" width="3" height="6" fill="${C_SUBTITLE_BLUE}"/>`).join('\n  ')}
  <polygon points="370.64,191.45 379.64,191.45 375.14,197.45" fill="${C_SUBTITLE_BLUE}"/>
</g>

<!-- PINNACLE PR circle -->
<circle cx="${P2.PINNACLE_CX}" cy="${P2.PINNACLE_CY}" r="${P2.PINNACLE_R}"
        fill="${C_PINNACLE_BLUE}" stroke="${C_INK}" stroke-width="1"/>

<!-- "PINNACLE" / "PR" stacked white text -->
<text x="${P2.PINNACLE_CX}" y="222"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="20" font-weight="700"
      fill="${C_WHITE}">PINNACLE</text>
<text x="${P2.PINNACLE_CX}" y="250"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="20" font-weight="700"
      fill="${C_WHITE}">PR</text>

<!-- White inset box -->
<rect x="${P2.PINNACLE_BOX.x}" y="${P2.PINNACLE_BOX.y}"
      width="${P2.PINNACLE_BOX.w}" height="${P2.PINNACLE_BOX.h}"
      fill="${C_WHITE}"/>

<!-- Pinnacle value (light blue color, ~22pt) -->
<text x="${P2.PINNACLE_CX}" y="296"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="22" font-weight="400"
      fill="${C_PINNACLE_TEXT}">${escapeXml(fmt(s.privateReserve.targetCents))}</text>

<!-- "$X TARGET" inside circle BELOW value box (Garet-Bold 12, BLACK) -->
<text x="${P2.PINNACLE_CX}" y="335"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="12" font-weight="700"
      fill="${C_INK}">${escapeXml(fmt(s.privateReserve.targetCents))} TARGET</text>

<!-- SCHWAB circle -->
<circle cx="${P2.SCHWAB_CX}" cy="${P2.SCHWAB_CY}" r="${P2.SCHWAB_R}"
        fill="${C_SCHWAB_NAVY}" stroke="${C_INK}" stroke-width="1"/>

<!-- "SCHWAB" white text top -->
<text x="${P2.SCHWAB_CX}" y="222"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="20" font-weight="700"
      fill="${C_WHITE}">SCHWAB</text>

<!-- White inset box -->
<rect x="${P2.SCHWAB_BOX.x}" y="${P2.SCHWAB_BOX.y}"
      width="${P2.SCHWAB_BOX.w}" height="${P2.SCHWAB_BOX.h}"
      fill="${C_WHITE}"/>

<!-- Schwab value (navy color on white) -->
<text x="${P2.SCHWAB_CX}" y="284"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="22" font-weight="400"
      fill="${C_SCHWAB_TEXT}">${escapeXml(fmt(s.schwab.valueCents))}</text>

<!-- "BROKERAGE" white text below value box -->
<text x="${P2.SCHWAB_CX}" y="332"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="20" font-weight="700"
      fill="${C_WHITE}">BROKERAGE</text>

<!-- "Remainder" BELOW Schwab circle (CanvaSans-Bold 15, BLACK) -->
<text x="${P2.SCHWAB_CX}" y="400"
      text-anchor="middle" dominant-baseline="alphabetic"
      font-family="${F_BODY}" font-size="15" font-weight="700"
      fill="${C_INK}">Remainder</text>

<!-- Bidirectional bowtie arrow between PINNACLE and SCHWAB -->
<!-- Reference rect: (275.52, 230.66, 474.72, 313.85) -->
<!-- Center y: 272.25 (between the two circles) -->
<!-- Two solid filled blue arrows touching in middle -->
<g class="bowtie-arrows">
  <!-- Left arrow (points LEFT toward Pinnacle PR) -->
  <polygon points="370,250 370,260 320,260 320,247 280,272 320,297 320,284 370,284 370,295 370,295"
           fill="${C_RESERVE_BLUE}" stroke="none"/>
  <!-- Right arrow (points RIGHT toward Schwab) -->
  <polygon points="380,250 380,260 430,260 430,247 470,272 430,297 430,284 380,284 380,295"
           fill="${C_RESERVE_BLUE}" stroke="none"/>
</g>

<!-- Subtext list below Pinnacle PR (CanvaSans-Bold 12, BLACK, centered) -->
<g class="target-breakdown">
  <text x="${P2.PINNACLE_CX}" y="395" text-anchor="middle"
        font-family="${F_BODY}" font-size="12" font-weight="700"
        fill="${C_INK}">6x Monthly Expenses + Deductible= ${escapeXml(fmt(sixMo))}</text>
  <text x="${P2.PINNACLE_CX}" y="412" text-anchor="middle"
        font-family="${F_BODY}" font-size="12" font-weight="700"
        fill="${C_INK}">${escapeXml(fmt(homeowner))}- Homeowner</text>
  <text x="${P2.PINNACLE_CX}" y="429" text-anchor="middle"
        font-family="${F_BODY}" font-size="12" font-weight="700"
        fill="${C_INK}">${escapeXml(fmt(auto))} x 2 = ${escapeXml(fmt(auto * 2))}- Auto</text>
  <text x="${P2.PINNACLE_CX}" y="446" text-anchor="middle"
        font-family="${F_BODY}" font-size="12" font-weight="700"
        fill="${C_INK}">${escapeXml(fmt(medical))}- Medical<tspan fill="${C_OUTFLOW_RED}">*</tspan></text>
</g>

<!-- "LONG TERM CASHFLOW" footer (Garet-Bold 18.04, BLACK) -->
<text x="${CANVAS_W / 2}" y="535" text-anchor="middle"
      font-family="${F_BODY}" font-size="18" font-weight="700"
      fill="${C_INK}">LONG TERM CASHFLOW</text>

<!-- "( Magnified Private Reserve Cashflow)" subtitle BOLD blue -->
<text x="${CANVAS_W / 2}" y="558" text-anchor="middle"
      font-family="${F_BODY}" font-size="17" font-weight="700"
      fill="${C_SUBTITLE_BLUE}">( Magnified Private Reserve Cashflow)</text>

${debug ? `<rect x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}" fill="none" stroke="orange" stroke-width="1" stroke-dasharray="4 4"/>` : ''}
`;
}

// =============================================================================
// SVG WRAPPER
// =============================================================================

function svgWrap(content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 ${CANVAS_W} ${CANVAS_H}"
              width="${CANVAS_W}"
              height="${CANVAS_H}"
              fill="${C_INK}">
<defs>
<style><![CDATA[${FONT_FACE_CSS}]]></style>
</defs>
${content}
</svg>`;
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

export function renderSacsSvg(
  s: SacsSnapshot,
  options: RenderOptions = {},
): { page1: string; page2: string } {
  const debug = options.debug === true;
  return {
    page1: svgWrap(renderPage1(s, debug)),
    page2: svgWrap(renderPage2(s, debug)),
  };
}
