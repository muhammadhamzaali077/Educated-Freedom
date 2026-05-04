import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, chromium } from 'playwright';

/**
 * Singleton chromium browser for PDF export. The browser is pre-warmed at
 * server boot and kept alive for the lifetime of the process. Each export
 * creates a fresh context + page, then closes both — never the browser.
 */
let _browser: Browser | null = null;
let _launching: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  if (_launching) return _launching;
  _launching = chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  try {
    _browser = await _launching;
    return _browser;
  } finally {
    _launching = null;
  }
}

export async function prewarmBrowser(): Promise<void> {
  try {
    await getBrowser();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[pdf] chromium pre-warm failed (PDF export unavailable until fixed): ${msg}`);
    console.warn('[pdf] Install with: npx playwright install chromium');
  }
}

export async function shutdownBrowser(): Promise<void> {
  if (_browser) {
    try {
      await _browser.close();
    } catch {
      /* swallow — process is exiting */
    }
    _browser = null;
  }
}

const REPORTS_DIR = join(process.cwd(), 'data', 'reports');

async function ensureReportsDir(): Promise<void> {
  if (!existsSync(REPORTS_DIR)) {
    await mkdir(REPORTS_DIR, { recursive: true });
  }
}

export function reportPdfPath(reportId: string): string {
  return join(REPORTS_DIR, `${reportId}.pdf`);
}

/**
 * Wrap one or more SVG strings in a minimal HTML page with @page CSS for
 * landscape Letter and zero margins. Each SVG becomes its own page; the
 * page-break-after rule produces a 2-page PDF for SACS, 1-page for TCC.
 */
export function wrapSvgsInPdfHtml(svgPages: string[]): string {
  const css = `
    @page { size: 11in 8.5in; margin: 0; }
    html, body { margin: 0; padding: 0; background: #FFFFFF; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pdf-page { width: 11in; height: 8.5in; overflow: hidden; }
    .pdf-page + .pdf-page { page-break-before: always; }
    .pdf-page > svg { width: 11in; height: 8.5in; display: block; }
  `;
  const pages = svgPages.map((s) => `<section class="pdf-page">${s}</section>`).join('');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${css}</style></head>
<body>${pages}</body>
</html>`;
}

export async function renderPdf(svgPages: string[]): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const html = wrapSvgsInPdfHtml(svgPages);
    await page.setContent(html, { waitUntil: 'load' });
    // Embedded woff2 fonts are decoded synchronously inside the SVG; load
    // is sufficient. networkidle would wait forever on no-network pages.
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

export async function renderAndSavePdf(reportId: string, svgPages: string[]): Promise<string> {
  await ensureReportsDir();
  const buf = await renderPdf(svgPages);
  const path = reportPdfPath(reportId);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, buf);
  return path;
}

export function pdfFilename(args: { householdName: string; reportType: string; meetingDate: string }): string {
  const safe = args.householdName.replace(/[\/\\?%*:|"<>]/g, '').trim();
  return `${safe} ${args.reportType} ${args.meetingDate}.pdf`;
}
