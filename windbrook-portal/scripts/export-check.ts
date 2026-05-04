/**
 * Phase 8 self-check: encryption round-trip, PDF render against a TCC fixture.
 * Run: npx tsx scripts/export-check.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decrypt, encrypt } from '../src/lib/encryption.js';
import { renderTccSvg, type TccSnapshot } from '../src/reports/tcc/render.js';
import { renderPdf, shutdownBrowser } from '../src/reports/pdf.js';

async function main() {
  // ---- Encryption round-trip ----
  const sample = 'access_token_abc-123-xyz';
  const enc1 = await encrypt(sample);
  const enc2 = await encrypt(sample);
  const dec1 = await decrypt(enc1);
  console.log('encryption round-trip:', dec1 === sample ? 'OK' : 'FAIL');
  console.log('  ciphertext is non-deterministic (random IV):', enc1 !== enc2 ? 'OK' : 'FAIL');
  console.log('  encrypted token length:', enc1.length, 'chars');

  // ---- PDF render ----
  const $ = (d: number) => Math.round(d * 100);
  const snap: TccSnapshot = {
    householdName: 'Lipski Family',
    meetingDate: '2026-04-21',
    asOfDate: '2026-01-21',
    persons: [
      { firstName: 'Jonathan', lastName: 'Lipski', dateOfBirth: '1975-04-12', ssnLastFour: '4321' },
    ],
    retirementBubbles: [
      {
        slotId: 'p1-1',
        accountType: 'Roth IRA',
        institution: 'Schwab',
        accountNumberLastFour: '1001',
        balanceCents: $(128000),
        cashCents: $(5000),
        asOfDate: '2026-01-21',
        isStale: false,
      },
    ],
    nonRetirementBubbles: [],
    trust: { valueCents: $(750000), asOfDate: '2026-01-21', isStale: false },
    liabilities: [],
    totals: {
      p1RetirementCents: $(128000),
      p2RetirementCents: 0,
      nonRetirementCents: 0,
      trustCents: $(750000),
      grandTotalCents: $(878000),
      liabilitiesTotalCents: 0,
    },
    staleFields: new Set<string>(),
  };
  const { page1 } = renderTccSvg(snap);

  console.log('rendering PDF…');
  const start = Date.now();
  try {
    const buf = await renderPdf([page1]);
    const elapsed = Date.now() - start;
    console.log('  PDF generated:', buf.length, 'bytes in', elapsed, 'ms');
    const out = join(process.cwd(), 'data', 'reports', '_check.pdf');
    writeFileSync(out, buf);
    console.log('  saved to:', out);

    // Validate it's a real PDF (starts with %PDF-)
    const head = buf.subarray(0, 5).toString('ascii');
    console.log('  PDF magic header:', head, head === '%PDF-' ? '(valid)' : '(INVALID)');

    // Verify it has 1 page (look for /Type /Page in the PDF stream)
    const pdfText = buf.toString('binary');
    const pageCount = (pdfText.match(/\/Type\s*\/Page[^s]/g) || []).length;
    console.log('  /Type /Page count:', pageCount);
  } catch (err) {
    console.error('  PDF render FAILED:', err instanceof Error ? err.message : err);
  } finally {
    await shutdownBrowser();
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
