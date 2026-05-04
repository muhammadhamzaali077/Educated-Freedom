import { renderSacsSvg } from '../src/reports/sacs/render.js';

const $ = (d: number) => Math.round(d * 100);

const result = renderSacsSvg({
  householdName: 'Test Family',
  meetingDate: '2026-04-21',
  inflowSources: [{ personFirstName: 'Test', monthlyAmountCents: $(15000) }],
  monthlyInflowCents: $(15000),
  monthlyOutflowCents: $(12000),
  automatedTransferDay: 20,
  privateReserveBalanceCents: $(42000),
  privateReserveMonthlyContributionCents: $(3000),
  pinnacleTargetCents: $(79500),
  pinnacleTargetBreakdown: {
    sixXExpensesCents: $(72000),
    homeownerDeductibleCents: $(2500),
    autoDeductibleCents: $(1000),
    medicalDeductibleCents: $(3000),
  },
  schwabBalanceCents: $(145000),
  remainderCents: 0,
  inflowFloorCents: $(1000),
  outflowFloorCents: $(1000),
  privateReserveFloorCents: $(1000),
  staleFields: new Set(['inflow', 'outflow', 'schwab']),
});

const stalePattern = /<tspan dx="2" dy="-4" fill="#A33A3A"/g;
console.log('  red asterisks page 1:', (result.page1.match(stalePattern) || []).length);
console.log('  red asterisks page 2:', (result.page2.match(stalePattern) || []).length);
console.log('  stale footnote on page 1:', result.page1.includes('Indicates we do not have'));
console.log('  stale footnote on page 2:', result.page2.includes('Indicates we do not have'));
console.log('  page 1 size:', result.page1.length, 'chars');
console.log('  page 2 size:', result.page2.length, 'chars');
console.log('  page 1 contains Fraunces b64:', result.page1.includes('data:font/woff2;base64'));
console.log('  page 1 ends with </svg>:', result.page1.trim().endsWith('</svg>'));
console.log('  page 2 ends with </svg>:', result.page2.trim().endsWith('</svg>'));
process.exit(0);
