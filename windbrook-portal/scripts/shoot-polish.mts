/**
 * Log in as Maryann and capture screenshots of the polished pages so the
 * UI fixes can be verified in one pass: dashboard, /clients list, and a
 * Cole-Household report detail page.
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"], input[name="email"]', EMAIL);
await page.fill('input[type="password"], input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
// htmx returns HX-Redirect → /dashboard; wait until URL changes off /login.
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
await page.waitForLoadState('networkidle');

await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/polish-dashboard.png`, fullPage: false });
console.log('  → dashboard');

// Capture household card footer (LAST MEETING block) by scrolling
await page.evaluate(() => window.scrollBy(0, 700));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/polish-dashboard-cards.png`, fullPage: false });
console.log('  → dashboard cards');

await page.goto(`${BASE}/clients`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/polish-clients-list.png`, fullPage: false });
console.log('  → /clients');

// Find first Cole household client → first report
await page.goto(`${BASE}/clients`, { waitUntil: 'networkidle' });
// Pick Cole Household (the synthetic seed has actual report history under it)
const coleRow = page.locator('a.clients-row', { has: page.locator('h2', { hasText: 'Cole Household' }) });
const firstClientHref = await coleRow.first().getAttribute('href');
if (firstClientHref) {
  await page.goto(`${BASE}${firstClientHref}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/polish-client-detail.png`, fullPage: false });
  console.log('  → client detail');

  const firstReport = await page.locator('a.history-row-link').first().getAttribute('href');
  if (firstReport) {
    await page.goto(`${BASE}${firstReport}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/polish-report-detail.png`, fullPage: false });
    console.log('  → report detail');
  }
}

await browser.close();
console.log('done');
