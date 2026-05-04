import { renderTccSvg, type TccSnapshot } from '../src/reports/tcc/render.js';

const $ = (d: number) => Math.round(d * 100);

const snap: TccSnapshot = {
  householdName: 'Lipski Family',
  meetingDate: '2026-04-21',
  asOfDate: '2026-01-21',
  persons: [
    { firstName: 'Jonathan', lastName: 'Lipski', dateOfBirth: '1975-04-12', ssnLastFour: '4321' },
    { firstName: 'Sandra', lastName: 'Lipski', dateOfBirth: '1977-11-03', ssnLastFour: '8765' },
  ],
  retirementBubbles: [
    { slotId: 'p1-1', accountType: 'Roth IRA', institution: 'Schwab', accountNumberLastFour: '1001', balanceCents: $(128000), cashCents: $(5000), asOfDate: '2026-01-21', isStale: true },
    { slotId: 'p1-2', accountType: 'IRA Rollover', institution: 'Schwab', accountNumberLastFour: '1002', balanceCents: $(215500), cashCents: null, asOfDate: '2026-01-21', isStale: false },
    { slotId: 'p2-1', accountType: '401K', institution: 'Vanguard', accountNumberLastFour: '2001', balanceCents: $(87200), cashCents: $(3000), asOfDate: '2026-01-21', isStale: false },
  ],
  nonRetirementBubbles: [
    { slotId: 'nr-l-1', accountType: 'Brokerage', institution: 'Wells', accountNumberLastFour: '3001', balanceCents: $(45000), cashCents: $(2000), asOfDate: '2026-01-21', isStale: false },
    { slotId: 'nr-r-1', accountType: 'Stock Plan', institution: 'Computer', accountNumberLastFour: '3002', balanceCents: $(32000), cashCents: null, asOfDate: '2026-01-21', isStale: false },
  ],
  trust: { valueCents: $(750000), asOfDate: '2026-01-21', isStale: false },
  liabilities: [
    { creditorName: 'Lakeview', liabilityType: 'Mortgage', balanceCents: $(325000), interestRateBps: 399, payoffDate: '2050-04-01', isStale: false },
    { creditorName: 'GM Financial', liabilityType: 'Auto', balanceCents: $(24500), interestRateBps: 549, payoffDate: '2027-08-15', isStale: false },
  ],
  totals: {
    p1RetirementCents: $(343500),
    p2RetirementCents: $(87200),
    nonRetirementCents: $(77000),
    trustCents: $(750000),
    grandTotalCents: $(1257700),
    liabilitiesTotalCents: $(349500),
  },
  staleFields: new Set(['p1-1']),
};

const { page1 } = renderTccSvg(snap);

const stalePattern = /<tspan dx="2" dy="-3" fill="#A33A3A"/g;
const matches = page1.match(stalePattern) ?? [];
console.log('  red asterisks:', matches.length);
console.log('  has stale footnote:', page1.includes('Indicates we do not have up to date information'));
console.log('  has GRAND TOTAL banner:', page1.includes('GRAND TOTAL'));
console.log('  Grand Total amount in SVG ($1,257,700):', page1.includes('$1,257,700'));
console.log('  Has RETIREMENT ONLY banner:', page1.includes('RETIREMENT ONLY'));
console.log('  Has NON RETIREMENT TOTAL banner:', page1.includes('NON RETIREMENT TOTAL'));
console.log('  Has QUALIFIED labels:', (page1.match(/>QUALIFIED</g) || []).length);
console.log('  Has NON QUALIFIED labels:', (page1.match(/>NON QUALIFIED</g) || []).length);
console.log('  Has Family Trust:', page1.includes('Family Trust'));
console.log('  Has Lakeview:', page1.includes('Lakeview'));
console.log('  Liabilities $ in SVG (does NOT contribute to grand total):', !page1.includes('$908,200'));
console.log('  Embedded fonts (Fraunces b64):', page1.includes('data:font/woff2;base64'));
console.log('  Page bytes:', page1.length);
console.log('  Ends with </svg>:', page1.trim().endsWith('</svg>'));
process.exit(0);
