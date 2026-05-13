/**
 * Phase-30 diagnostic — capture the three SACS exports for visual
 * comparison: the in-portal SVG preview, the downloaded PDF, and the
 * downloaded PPTX. PPTX is reported as file metadata only because we
 * have no LibreOffice locally to render it to image.
 */
import { mkdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const EMAIL = 'maryann@windbrook.dev';
const PASSWORD = process.env.WINDBROOK_SEED_PASSWORD ?? 'WindbrookDev2026!';
const OUT = resolve(process.cwd(), '..', 'docs');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });

await page.goto(`${BASE}/clients`, { waitUntil: 'networkidle' });
const coleHref = await page
  .locator('a.clients-row', { has: page.locator('h2', { hasText: 'Cole Household' }) })
  .first()
  .getAttribute('href');
if (!coleHref) throw new Error('Cole row not found');

await page.goto(`${BASE}${coleHref}`, { waitUntil: 'networkidle' });
const sacsHref = await page
  .locator('a.history-row-link', { has: page.locator('span.type-pill-sacs') })
  .first()
  .getAttribute('href');
if (!sacsHref) throw new Error('No SACS report');

const m = sacsHref.match(/\/clients\/([^/]+)\/reports\/([^/?#]+)/);
if (!m) throw new Error(`Could not parse client/report id: ${sacsHref}`);
const [, clientId, reportId] = m;

// === Output 1: in-portal SVG preview ===
await page.goto(`${BASE}${sacsHref}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const previewPath = resolve(OUT, 'diag-1-preview-svg.png');
const firstPage = page.locator('div.report-page').first();
await firstPage.scrollIntoViewIfNeeded();
await firstPage.screenshot({ path: previewPath });
console.log(`[1/3] preview SVG → ${previewPath}`);

// === Output 2: downloaded PDF (Playwright path) ===
const dl1 = page.waitForEvent('download', { timeout: 60000 });
await page.evaluate(
  ({ clientId, reportId }) => {
    const f = document.createElement('form');
    f.method = 'POST';
    f.action = `/clients/${clientId}/reports/${reportId}/export/pdf`;
    document.body.appendChild(f);
    f.submit();
  },
  { clientId, reportId },
);
const pdfDl = await dl1;
const pdfPath = resolve(OUT, 'diag-2-cole.pdf');
await pdfDl.saveAs(pdfPath);
console.log(`[2/3] PDF saved at ${pdfPath} (${statSync(pdfPath).size} bytes)`);

// Headless chromium has no PDF plugin → PDFs always download, never
// render inline. Skipping in-place PDF→PNG rasterization. The PDF was
// produced by /export/pdf which is the existing Playwright SVG→PDF
// pipeline — the rendered PDF should be visually equivalent to the
// in-portal SVG preview captured above. Keep diag-2-cole.pdf for manual
// side-by-side inspection.

// === Output 3: downloaded PPTX (pptxgenjs path) ===
await page.bringToFront();
const dl2 = page.waitForEvent('download', { timeout: 60000 });
await page.evaluate(
  ({ clientId, reportId }) => {
    const f = document.createElement('form');
    f.method = 'POST';
    f.action = `/clients/${clientId}/reports/${reportId}/export/pptx`;
    document.body.appendChild(f);
    f.submit();
  },
  { clientId, reportId },
);
const pptxDl = await dl2;
const pptxPath = resolve(OUT, 'diag-3-cole.pptx');
await pptxDl.saveAs(pptxPath);
const pptxStat = statSync(pptxPath);
const fd = openSync(pptxPath, 'r');
const sigBuf = Buffer.alloc(4);
readSync(fd, sigBuf, 0, 4, 0);
closeSync(fd);
console.log(`[3/3] PPTX saved at ${pptxPath}`);
console.log(`      size=${pptxStat.size} bytes, sig=${sigBuf.toString('hex')} (PK = 504b0304)`);
console.log('      (No LibreOffice locally — cannot render PPTX to PNG.)');

await browser.close();
console.log('done');
