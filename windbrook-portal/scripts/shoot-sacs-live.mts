/**
 * Log in as Maryann, navigate to a Cole Household SACS report, and capture
 * the live in-browser render. Verifies the Phase-24 Page-1 fixes serve
 * end-to-end (renderer → Hono → browser) and not just from the rasterizer.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const EMAIL = 'maryann@windbrook.dev';
const PASSWORD = process.env.WINDBROOK_SEED_PASSWORD ?? 'WindbrookDev2026!';
const OUT = resolve(process.cwd(), '..', 'docs');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
await page.waitForLoadState('networkidle');

await page.goto(`${BASE}/clients`, { waitUntil: 'networkidle' });
const coleRow = page.locator('a.clients-row', { has: page.locator('h2', { hasText: 'Cole Household' }) });
const colePath = await coleRow.first().getAttribute('href');
if (!colePath) throw new Error('Cole Household row not found');

await page.goto(`${BASE}${colePath}`, { waitUntil: 'networkidle' });

const sacsLink = page.locator('a.history-row-link', {
  has: page.locator('span.type-pill-sacs'),
});
const sacsPath = await sacsLink.first().getAttribute('href');
if (!sacsPath) throw new Error('No SACS report in history');

await page.goto(`${BASE}${sacsPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// Two pages render top-to-bottom — fullPage capture grabs both
await page.screenshot({ path: `${OUT}/sacs-live-cole.png`, fullPage: true });
console.log('  → sacs-live-cole.png (full)');

// Also clip just the first page's SVG for a tighter side-by-side
const firstPage = page.locator('div.report-page').first();
await firstPage.scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await firstPage.screenshot({ path: `${OUT}/sacs-live-cole-page1.png` });
console.log('  → sacs-live-cole-page1.png');

await browser.close();
console.log('done');
