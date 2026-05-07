/**
 * SACS renderer — Phase 28 PIXEL-PERFECT REBUILD.
 *
 * Coordinates extracted directly from the reference PDF
 * (`docs/references/Copy_of_SACS-_for_Sagan.pdf`) using PyMuPDF. No
 * eyeballing, no guessing — these are the source-of-truth numbers.
 *
 * Canvas: 768 × 576 (matches reference 16:9, was 792×612).
 *
 * Reference fonts (Canva proprietary) substituted with our self-hosted
 * General Sans (loaded by ../_fonts.ts):
 *   Inter-Bold        → General Sans Medium (faux-bold at weight 700)
 *   Garet-Bold        → General Sans Medium
 *   CanvaSans-Bold    → General Sans Medium
 *   CanvaSans-Regular → General Sans Regular
 *
 * KEEP: real client numbers (not $00,000 placeholders), correct
 * "MONTHLY EXPENSES" spelling.
 *
 * Field accesses in renderPage1/renderPage2 adapted to the existing
 * `SacsSnapshot` shape that `lib/reports.ts` constructs (flat fields,
 * not the new file's nested `inflow`/`outflow`/`privateReserve` objects).
 */
import { FONT_FACE_CSS } from '../_fonts.js';

// =============================================================================
// Types — kept compatible with lib/reports.ts buildSacsRenderInput and
// routes/pages/dev-sacs.tsx makeFixtureSnapshot. Do not break consumers.
// =============================================================================
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
  staleFields: Set<string>;
}

export interface RenderOptions {
  debug?: boolean;
}

// =============================================================================
// CANVAS — extracted from reference (PowerPoint 16:9, NOT US Letter)
// =============================================================================
const CANVAS_W = 768;
const CANVAS_H = 576;

// =============================================================================
// COLORS — exact RGB values from the reference PDF
// =============================================================================
const C_INFLOW_GREEN = '#00C258';
const C_OUTFLOW_RED = '#F22F2E';
const C_RESERVE_BLUE = '#428BCE';
const C_PINNACLE_BLUE = '#9BCBEB';
const C_SCHWAB_NAVY = '#1B365D';
const C_PINNACLE_TEXT = '#9BCBEB';
const C_SCHWAB_TEXT = '#1B365D';
const C_SUBTITLE_BLUE = '#428DCE';
const C_INFLOW_VALUE = '#00C258';
const C_OUTFLOW_VALUE = '#F22F2E';
const C_INK = '#000000';
const C_WHITE = '#FFFFFF';
const C_DANGER = '#A33A3A';

// =============================================================================
// FONT FAMILY — General Sans is the only loaded sans-serif in our SVG
// (see ../_fonts.ts). Geist is not bundled here. Weight 700 falls back to
// faux-bold on General Sans Medium (500), which reads close to the
// Canva-proprietary bolds in the reference.
// =============================================================================
const F_BODY = "'General Sans', 'Segoe UI', system-ui, sans-serif";

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

// Stale-field marker — small superscript red asterisk appended to a value.
const STALE_TSPAN = `<tspan dx="2" dy="-4" fill="${C_DANGER}" font-size="60%" font-weight="500">*</tspan>`;
function moneyTspan(cents: number, isStale: boolean): string {
  return `${escapeXml(fmt(cents))}${isStale ? STALE_TSPAN : ''}`;
}

// =============================================================================
// PAGE 1 — Monthly Cashflow
// =============================================================================

// Reference exact coordinates (PyMuPDF extraction):
const P1 = {
  // Inflow circle: bbox (57.6, 150.84, 261.77, 355.0) → cx=159.68 cy=252.92 r=102.08
  INFLOW_CX: 159.68,
  INFLOW_CY: 252.92,
  INFLOW_R: 102.08,
  // Outflow circle: bbox (473.45, 150.84, 679.13, 356.52) → cx=576.29 cy=253.68 r=102.84
  OUTFLOW_CX: 576.29,
  OUTFLOW_CY: 253.68,
  OUTFLOW_R: 102.84,
  // Private Reserve: bbox (269.28, 319.77, 473.45, 523.93) → cx=371.37 cy=421.85 r=102.08
  RESERVE_CX: 371.37,
  RESERVE_CY: 421.85,
  RESERVE_R: 102.08,
  // Inflow value white box (131 × 28)
  INFLOW_BOX: { x: 93.93, y: 235.59, w: 131.46, h: 27.79 },
  OUTFLOW_BOX: { x: 509.78, y: 243.19, w: 131.46, h: 27.79 },
  // Inflow→Outflow hollow chunky arrow — exact 7-vertex polygon from reference
  ARROW_PATH:
    'M 274.78 223.49 L 427.12 223.49 L 427.12 203.07 L 467.95 243.90 L 427.12 284.74 L 427.12 264.32 L 274.78 264.32 Z',
  // Inflow / Outflow $X Floor horizontal divider lines
  INFLOW_LINE: { x1: 75.31, x2: 242.78, y: 308.10 },
  OUTFLOW_LINE: { x1: 492.88, x2: 660.35, y: 313.76 },
};

function renderPage1(s: SacsSnapshot, debug: boolean): string {
  const transferDay = s.automatedTransferDay;
  const transferDayWithSuffix = `${transferDay}${ordinalSuffix(transferDay)}`;

  // Contributor lines (CanvaSans-Bold 13, green) — sit at the top-left
  // ABOVE both the diamond $ icon and the INFLOW circle so the green
  // text isn't swallowed by the green circle fill. Filtered to earners
  // with non-zero monthly inflow.
  const contributors = s.inflowSources.filter((p) => p.monthlyAmountCents > 0);
  const contributorLines = contributors
    .map((p, i) => {
      const y = 110 + i * 19;
      return `<text x="14" y="${y}" font-family="${F_BODY}" font-size="13" font-weight="700" fill="${C_INFLOW_GREEN}">${escapeXml(fmt(p.monthlyAmountCents))}- ${escapeXml(p.personFirstName)}</text>`;
    })
    .join('\n  ');

  return `
<!-- ================ PAGE 1 — Monthly Cashflow ================ -->

<rect x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}" fill="${C_WHITE}"/>

<!-- Title (Inter-Bold 21.85 in reference) -->
<text x="${CANVAS_W / 2}" y="44" text-anchor="middle"
      font-family="${F_BODY}" font-size="22" font-weight="700"
      fill="${C_INK}">Simple Automated Cashflow System (SACS)</text>

<!-- Household name (Garet-Bold 18.04, centered) -->
<text x="${CANVAS_W / 2}" y="82" text-anchor="middle"
      font-family="${F_BODY}" font-size="18" font-weight="700"
      fill="${C_INK}">${escapeXml(s.householdName.toUpperCase())}</text>

<!-- Meeting date (CanvaSans-Bold 16) -->
<text x="${CANVAS_W / 2}" y="113" text-anchor="middle"
      font-family="${F_BODY}" font-size="16" font-weight="700"
      fill="${C_INK}">${escapeXml(fmtLongDate(s.meetingDate))}</text>

<!-- Diamond $ icon (drawing 15: green filled rotated square) -->
<polygon points="65.05,128.87 98.90,165.20 63.54,198.15 29.69,161.82"
         fill="${C_INFLOW_GREEN}" stroke="none"/>
<text x="60" y="178" text-anchor="middle"
      font-family="Georgia, 'Times New Roman', serif"
      font-size="48" font-weight="700"
      fill="${C_WHITE}">$</text>

<!-- Contributor lines (CanvaSans-Bold 13, green) -->
${contributorLines}

<!-- Phase-29 / Fix 1: chunky diagonal green arrow bridging the
     contributor area to the INFLOW circle's upper-left edge so the
     diamond + contributors don't read as orphaned. Tail at (78, 130)
     sits in the empty zone between the contributor line baseline and
     the diamond's top edge; with rotate(35°) the tip lands at world
     (105, 161) — about 5 px outside the inflow circle's 10 o'clock
     position. The brief's original (40, 145) put the tip inside the
     diamond, where green-on-green made the arrow invisible. -->
<g class="contributor-arrow" transform="translate(78, 130) rotate(35)">
  <path d="M 0 0 L 22 0 L 22 -8 L 40 10 L 22 28 L 22 20 L 0 20 Z"
        fill="${C_INFLOW_GREEN}" stroke="none"/>
</g>

<!-- INFLOW circle -->
<circle cx="${P1.INFLOW_CX}" cy="${P1.INFLOW_CY}" r="${P1.INFLOW_R}"
        fill="${C_INFLOW_GREEN}" stroke="${C_INK}" stroke-width="1"/>

<!-- "INFLOW" label (CanvaSans-Bold 20.27, white) -->
<text x="${P1.INFLOW_CX}" y="200" text-anchor="middle"
      font-family="${F_BODY}" font-size="20" font-weight="700"
      fill="${C_WHITE}">INFLOW</text>

<!-- Inflow value white inset box -->
<rect x="${P1.INFLOW_BOX.x}" y="${P1.INFLOW_BOX.y}"
      width="${P1.INFLOW_BOX.w}" height="${P1.INFLOW_BOX.h}"
      fill="${C_WHITE}"/>
<text x="${P1.INFLOW_CX}" y="258" text-anchor="middle"
      font-family="${F_BODY}" font-size="22" font-weight="400"
      fill="${C_INFLOW_VALUE}">${moneyTspan(s.monthlyInflowCents, s.staleFields.has('inflow'))}</text>

<!-- Inflow $X Floor horizontal divider + label -->
<line x1="${P1.INFLOW_LINE.x1}" y1="${P1.INFLOW_LINE.y}"
      x2="${P1.INFLOW_LINE.x2}" y2="${P1.INFLOW_LINE.y}"
      stroke="${C_INK}" stroke-width="3"/>
<text x="${P1.INFLOW_CX}" y="328" text-anchor="middle"
      font-family="${F_BODY}" font-size="15" font-weight="400"
      fill="${C_INK}">${escapeXml(fmt(s.inflowFloorCents))} Floor</text>

<!-- OUTFLOW circle -->
<circle cx="${P1.OUTFLOW_CX}" cy="${P1.OUTFLOW_CY}" r="${P1.OUTFLOW_R}"
        fill="${C_OUTFLOW_RED}" stroke="${C_INK}" stroke-width="1"/>

<text x="${P1.OUTFLOW_CX}" y="204" text-anchor="middle"
      font-family="${F_BODY}" font-size="20" font-weight="700"
      fill="${C_WHITE}">OUTFLOW</text>

<rect x="${P1.OUTFLOW_BOX.x}" y="${P1.OUTFLOW_BOX.y}"
      width="${P1.OUTFLOW_BOX.w}" height="${P1.OUTFLOW_BOX.h}"
      fill="${C_WHITE}"/>
<text x="${P1.OUTFLOW_CX}" y="265" text-anchor="middle"
      font-family="${F_BODY}" font-size="22" font-weight="400"
      fill="${C_OUTFLOW_VALUE}">${moneyTspan(s.monthlyOutflowCents, s.staleFields.has('outflow'))}</text>

<line x1="${P1.OUTFLOW_LINE.x1}" y1="${P1.OUTFLOW_LINE.y}"
      x2="${P1.OUTFLOW_LINE.x2}" y2="${P1.OUTFLOW_LINE.y}"
      stroke="${C_INK}" stroke-width="3"/>
<text x="${P1.OUTFLOW_CX}" y="333" text-anchor="middle"
      font-family="${F_BODY}" font-size="15" font-weight="400"
      fill="${C_INK}">${escapeXml(fmt(s.outflowFloorCents))} Floor</text>

<!-- Inflow → Outflow hollow chunky arrow (red stroke, white fill) -->
<rect x="274.77" y="203.07" width="193.31" height="81.66" fill="${C_WHITE}"/>
<path d="${P1.ARROW_PATH}" fill="${C_WHITE}" stroke="${C_OUTFLOW_RED}" stroke-width="2.5"/>

<!-- Arrow text "X=$X/month*" (CanvaSans-Bold 15.09, RED) -->
<text x="356" y="248" text-anchor="middle"
      font-family="${F_BODY}" font-size="15" font-weight="700"
      fill="${C_OUTFLOW_RED}">X=${moneyTspan(s.monthlyOutflowCents, s.staleFields.has('outflow'))}/month*</text>

<!-- "Automated transfer on the Nth" black BELOW the arrow -->
<text x="367" y="298" text-anchor="middle"
      font-family="${F_BODY}" font-size="12" font-weight="400"
      fill="${C_INK}">Automated transfer on the ${transferDayWithSuffix}</text>

<!-- PRIVATE RESERVE circle -->
<circle cx="${P1.RESERVE_CX}" cy="${P1.RESERVE_CY}" r="${P1.RESERVE_R}"
        fill="${C_RESERVE_BLUE}" stroke="${C_INK}" stroke-width="1"/>

<text x="${P1.RESERVE_CX}" y="380" text-anchor="middle"
      font-family="${F_BODY}" font-size="20" font-weight="700"
      fill="${C_WHITE}">PRIVATE</text>
<text x="${P1.RESERVE_CX}" y="408" text-anchor="middle"
      font-family="${F_BODY}" font-size="20" font-weight="700"
      fill="${C_WHITE}">RESERVE</text>

<!-- Piggy bank with coins inside the lower part of the circle -->
<g transform="translate(${P1.RESERVE_CX - 60}, 425)">
  <ellipse cx="0" cy="48" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="0" cy="42" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="0" cy="36" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="0" cy="30" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="120" cy="48" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="120" cy="42" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="120" cy="36" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="60" cy="35" rx="34" ry="22" fill="#F5A8B8" stroke="#C77A8C" stroke-width="1"/>
  <path d="M 47 16 L 53 12 L 55 23 Z" fill="#C77A8C"/>
  <ellipse cx="89" cy="36" rx="9" ry="7" fill="#E08FA0" stroke="#C77A8C" stroke-width="0.6"/>
  <circle cx="86" cy="34" r="1.4" fill="#5C2E3B"/>
  <circle cx="92" cy="34" r="1.4" fill="#5C2E3B"/>
  <circle cx="71" cy="29" r="2" fill="#5C2E3B"/>
  <circle cx="71.6" cy="28.4" r="0.7" fill="${C_WHITE}"/>
  <rect x="42" y="55" width="6" height="7" fill="#C77A8C"/>
  <rect x="74" y="55" width="6" height="7" fill="#C77A8C"/>
  <circle cx="60" cy="3" r="6" fill="#E5B040" stroke="#A37A20" stroke-width="0.8"/>
  <text x="60" y="6" text-anchor="middle" font-family="serif" font-size="7" fill="#A37A20" font-weight="700">$</text>
  <text x="20" y="8" font-family="${F_BODY}" font-size="10" fill="#E5B040">&#10022;</text>
  <text x="95" y="12" font-family="${F_BODY}" font-size="9" fill="#E5B040">&#10022;</text>
</g>

<!-- L-arrow Inflow bottom → Private Reserve left, hollow blue -->
<path d="M 144.7 355 L 174.7 355 L 174.7 406.85 L 244 406.85 L 244 396 L 269.3 421.85 L 244 447.7 L 244 436.85 L 144.7 436.85 Z"
      fill="${C_WHITE}" stroke="${C_RESERVE_BLUE}" stroke-width="2"/>
<text x="195" y="426" text-anchor="middle"
      font-family="${F_BODY}" font-size="13" font-weight="700"
      fill="${C_RESERVE_BLUE}">${moneyTspan(s.privateReserveMonthlyContributionCents, s.staleFields.has('excess'))}/mo*</text>

<!-- Papers icon top-right -->
<g transform="translate(686, 60)">
  <rect x="0" y="14" width="32" height="38" fill="${C_WHITE}" stroke="${C_INK}" stroke-width="1.4"
        transform="rotate(-8 16 33)"/>
  <rect x="4" y="6" width="32" height="38" fill="${C_WHITE}" stroke="${C_INK}" stroke-width="1.4"
        transform="rotate(5 20 25)"/>
  <rect x="0" y="0" width="34" height="22" fill="${C_WHITE}" stroke="${C_INK}" stroke-width="1.6"/>
  <path d="M 0 0 L 17 13 L 34 0" fill="none" stroke="${C_INK}" stroke-width="1.6"/>
</g>

<!-- "X= Monthly" / "Expenses" labels — placed to the LEFT of the icon
     (text-anchor=end) so they fit inside the 768-wide canvas. With icon
     at x=686 and labels reaching only to x=678, every glyph stays in
     bounds without clipping. -->
<text x="678" y="80" text-anchor="end" font-family="${F_BODY}" font-size="15" font-weight="400"
      fill="${C_INK}">X= Monthly</text>
<text x="678" y="98" text-anchor="end" font-family="${F_BODY}" font-size="15" font-weight="400"
      fill="${C_INK}">Expenses</text>

<!-- Black connector line from papers icon DOWN and into Outflow circle's
     right edge with a small left-pointing arrowhead. -->
<line x1="727" y1="161" x2="727" y2="257.5" stroke="${C_INK}" stroke-width="3"/>
<line x1="727" y1="257.5" x2="649" y2="257.5" stroke="${C_INK}" stroke-width="3"/>
<polygon points="648.74,261.65 642.78,257.10 648.82,252.65" fill="${C_INK}"/>

<!-- Bottom dotted blue stem + MONTHLY EXPENSES label -->
<g class="monthly-expenses-stem">
  ${[0, 1, 2, 3, 4, 5, 6]
    .map((i) => `<rect x="370" y="${524 + i * 6}" width="4" height="3" fill="${C_RESERVE_BLUE}"/>`)
    .join('\n  ')}
  <polygon points="367.76,560.71 376.76,560.71 372.41,566.82" fill="${C_RESERVE_BLUE}"/>
</g>

<!-- "MONTHLY EXPENSES" label (Garet-Bold 18.04, BLACK, bottom-center).
     Reference shows "MONTLHY EXPENSES" — typo correction is pre-approved
     by Maryann at 52:42, so we render the correctly-spelled version. -->
<text x="${CANVAS_W / 2}" y="552" text-anchor="middle"
      font-family="${F_BODY}" font-size="18" font-weight="700"
      fill="${C_INK}">MONTHLY EXPENSES</text>

${debug ? `<rect x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}" fill="none" stroke="orange" stroke-width="1" stroke-dasharray="4 4"/>` : ''}
`;
}

// =============================================================================
// PAGE 2 — Long-Term Cashflow
// =============================================================================

const P2 = {
  PINNACLE_CX: 159.68,
  PINNACLE_CY: 272.25,
  PINNACLE_R: 102.08,
  SCHWAB_CX: 590.61,
  SCHWAB_CY: 272.25,
  SCHWAB_R: 102.08,
  PINNACLE_BOX: { x: 93.93, y: 274.10, w: 131.46, h: 27.79 },
  SCHWAB_BOX: { x: 525.02, y: 261.65, w: 131.46, h: 27.79 },
};

function renderPage2(s: SacsSnapshot, debug: boolean): string {
  const sixMo = s.pinnacleTargetBreakdown.sixXExpensesCents;
  const homeowner = s.pinnacleTargetBreakdown.homeownerDeductibleCents;
  const auto = s.pinnacleTargetBreakdown.autoDeductibleCents;
  const medical = s.pinnacleTargetBreakdown.medicalDeductibleCents;

  return `
<!-- ================ PAGE 2 — Long-Term Cashflow ================ -->

<rect x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}" fill="${C_WHITE}"/>

<!-- Title only — reference page 2 is title-only, NO household name, NO date. -->
<text x="${CANVAS_W / 2}" y="44" text-anchor="middle"
      font-family="${F_BODY}" font-size="22" font-weight="700"
      fill="${C_INK}">Simple Automated Cashflow System (SACS)</text>

<!-- Dotted descent arrow from title to bidirectional bowtie below. -->
<g class="title-descent">
  ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    .map((i) => `<rect x="372" y="${60 + i * 10}" width="3" height="6" fill="${C_SUBTITLE_BLUE}"/>`)
    .join('\n  ')}
  <polygon points="370.64,191.45 379.64,191.45 375.14,197.45" fill="${C_SUBTITLE_BLUE}"/>
</g>

<!-- PINNACLE PR circle -->
<circle cx="${P2.PINNACLE_CX}" cy="${P2.PINNACLE_CY}" r="${P2.PINNACLE_R}"
        fill="${C_PINNACLE_BLUE}" stroke="${C_INK}" stroke-width="1"/>
<text x="${P2.PINNACLE_CX}" y="222" text-anchor="middle"
      font-family="${F_BODY}" font-size="20" font-weight="700"
      fill="${C_WHITE}">PINNACLE</text>
<text x="${P2.PINNACLE_CX}" y="250" text-anchor="middle"
      font-family="${F_BODY}" font-size="20" font-weight="700"
      fill="${C_WHITE}">PR</text>

<!-- White inset value chip — shows the CURRENT private reserve balance -->
<rect x="${P2.PINNACLE_BOX.x}" y="${P2.PINNACLE_BOX.y}"
      width="${P2.PINNACLE_BOX.w}" height="${P2.PINNACLE_BOX.h}"
      fill="${C_WHITE}"/>
<text x="${P2.PINNACLE_CX}" y="296" text-anchor="middle"
      font-family="${F_BODY}" font-size="22" font-weight="400"
      fill="${C_PINNACLE_TEXT}">${moneyTspan(s.privateReserveBalanceCents, s.staleFields.has('privateReserveBalance'))}</text>

<!-- "$X TARGET" inside circle below value box (Garet-Bold 12) -->
<text x="${P2.PINNACLE_CX}" y="335" text-anchor="middle"
      font-family="${F_BODY}" font-size="12" font-weight="700"
      fill="${C_INK}">${moneyTspan(s.pinnacleTargetCents, s.staleFields.has('target'))} TARGET</text>

<!-- SCHWAB circle -->
<circle cx="${P2.SCHWAB_CX}" cy="${P2.SCHWAB_CY}" r="${P2.SCHWAB_R}"
        fill="${C_SCHWAB_NAVY}" stroke="${C_INK}" stroke-width="1"/>
<text x="${P2.SCHWAB_CX}" y="222" text-anchor="middle"
      font-family="${F_BODY}" font-size="20" font-weight="700"
      fill="${C_WHITE}">SCHWAB</text>

<rect x="${P2.SCHWAB_BOX.x}" y="${P2.SCHWAB_BOX.y}"
      width="${P2.SCHWAB_BOX.w}" height="${P2.SCHWAB_BOX.h}"
      fill="${C_WHITE}"/>
<text x="${P2.SCHWAB_CX}" y="284" text-anchor="middle"
      font-family="${F_BODY}" font-size="22" font-weight="400"
      fill="${C_SCHWAB_TEXT}">${moneyTspan(s.schwabBalanceCents, s.staleFields.has('schwab'))}</text>

<text x="${P2.SCHWAB_CX}" y="332" text-anchor="middle"
      font-family="${F_BODY}" font-size="20" font-weight="700"
      fill="${C_WHITE}">BROKERAGE</text>

<!-- "Remainder" caption below Schwab (sentence case, bold black) -->
<text x="${P2.SCHWAB_CX}" y="400" text-anchor="middle"
      font-family="${F_BODY}" font-size="15" font-weight="700"
      fill="${C_INK}">Remainder</text>

<!-- Phase-29 / Fix 2: bidirectional bowtie as a SINGLE continuous
     10-vertex polygon using exact coordinates extracted from the
     reference PDF. The shafts touch from x=333.57 to x=416.71 with
     zero gap, so the bowtie reads as one shape rather than two
     separate arrows. -->
<polygon points="333.57,230.66 275.53,272.25 333.57,313.84 333.57,285.49 416.71,285.49 416.71,313.84 474.75,272.25 416.71,230.66 416.71,259.00 333.57,259.00"
         fill="#428BCE" stroke="none"/>

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

<!-- Subtitle in BOLD blue, NOT italic -->
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
  snapshot: SacsSnapshot,
  options: RenderOptions = {},
): { page1: string; page2: string } {
  const debug = options.debug === true;
  return {
    page1: svgWrap(renderPage1(snapshot, debug)),
    page2: svgWrap(renderPage2(snapshot, debug)),
  };
}
