/**
 * Phase-33 TCC capture. Logs in, navigates to each household's most
 * recent TCC report, screenshots Page 1 of the rendered SVG so we can
 * verify the new section structure: paired QUALIFIED / NON-QUALIFIED
 * corner badges, central client + trust ovals, symmetric account
 * bubbles, centered "Retirement Only" + "NON RETIREMENT TOTAL" badges,
 * grey liabilities table, permanent red disclaimer pinned bottom-right.
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });

async function shootTcc(householdName: string, outFile: string) {
  await page.goto(`${BASE}/clients`, { waitUntil: 'networkidle' });
  const href = await page
    .locator('a.clients-row', { has: page.locator('h2', { hasText: householdName }) })
    .first()
    .getAttribute('href');
  if (!href) {
    console.log(`  ✗ ${householdName} not found`);
    return;
  }
  await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle' });
  const tccHref = await page
    .locator('a.history-row-link', { has: page.locator('span.type-pill-tcc') })
    .first()
    .getAttribute('href');
  if (!tccHref) {
    console.log(`  ✗ ${householdName} has no TCC report`);
    return;
  }
  await page.goto(`${BASE}${tccHref}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const firstPage = page.locator('div.report-page').first();
  await firstPage.scrollIntoViewIfNeeded();
  await firstPage.screenshot({ path: outFile });
  console.log(`  → ${outFile}`);
}

await shootTcc('Lipski Family', resolve(OUT, 'tcc-lipski.png'));
await shootTcc('Cole Household', resolve(OUT, 'tcc-cole.png'));
await shootTcc('Park-Rivera Family', resolve(OUT, 'tcc-park-rivera.png'));

await browser.close();
console.log('done');
