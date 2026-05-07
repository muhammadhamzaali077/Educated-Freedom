/**
 * Phase-30 smoke test. Logs in, navigates to a Cole SACS report, hits
 * /export/pptx, saves the response, verifies it's a valid PPTX (zip
 * starting with PK signature) and reports its size.
 */
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const EMAIL = 'maryann@windbrook.dev';
const PASSWORD = process.env.WINDBROOK_SEED_PASSWORD ?? 'WindbrookDev2026!';
const OUT = resolve(process.cwd(), '..', 'docs');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true });
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

const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
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
const dl = await downloadPromise;
const outPath = resolve(OUT, 'smoke-cole.pptx');
await dl.saveAs(outPath);

const stat = statSync(outPath);
const fd = (await import('node:fs/promises')).open(outPath, 'r').then(async (f) => {
  const buf = Buffer.alloc(4);
  await f.read(buf, 0, 4, 0);
  await f.close();
  return buf.toString('hex');
});
const sig = await fd;
console.log(`pptx size: ${stat.size} bytes`);
console.log(`pptx sig:  ${sig} (PK = 504b0304)`);
const ok = sig.startsWith('504b0304');
console.log(ok ? 'OK — valid PPTX (zip)' : 'FAIL — not a zip');

await browser.close();
process.exit(ok ? 0 : 1);
