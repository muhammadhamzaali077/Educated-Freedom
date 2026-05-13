/**
 * Log in as Maryann, navigate to the SACS reports for Lipski and Cole,
 * and capture the live in-browser render. Used to verify SACS renderer
 * fixes end-to-end (renderer → Hono → browser).
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

async function shoot(householdName: string, slug: string) {
  await page.goto(`${BASE}/clients`, { waitUntil: 'networkidle' });
  const row = page.locator('a.clients-row', { has: page.locator('h2', { hasText: householdName }) });
  const path = await row.first().getAttribute('href');
  if (!path) throw new Error(`${householdName} row not found`);

  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });

  const sLink = page.locator('a.history-row-link', { has: page.locator('span.type-pill-sacs') });
  const sPath = await sLink.first().getAttribute('href');
  if (!sPath) throw new Error(`No SACS report in history for ${householdName}`);

  await page.goto(`${BASE}${sPath}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  await page.screenshot({ path: `${OUT}/sacs-live-${slug}.png`, fullPage: true });
  console.log(`  → sacs-live-${slug}.png (full)`);

  const firstPage = page.locator('div.report-page').first();
  await firstPage.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await firstPage.screenshot({ path: `${OUT}/sacs-live-${slug}-page1.png` });
  console.log(`  → sacs-live-${slug}-page1.png`);
}

await shoot('Lipski Family', 'lipski');
await shoot('Cole Household', 'cole');

await browser.close();
console.log('done');
