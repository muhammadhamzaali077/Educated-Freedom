/**
 * Phase-26 alignment verification. Measures the bounding rect of every
 * action button on the report-detail action bar and on the client-detail
 * history rows, then asserts top + bottom edges align across all siblings.
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
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
await page.waitForLoadState('networkidle');

const measure = async (selector: string) => {
  return page.$$eval(selector, (els) =>
    els.map((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return {
        tag: el.tagName,
        text: (el.textContent ?? '').trim().slice(0, 32),
        top: Math.round(r.top * 100) / 100,
        bottom: Math.round(r.bottom * 100) / 100,
        height: Math.round(r.height * 100) / 100,
      };
    }),
  );
};

const report = (label: string, rows: Awaited<ReturnType<typeof measure>>) => {
  console.log(`\n=== ${label} ===`);
  for (const r of rows) console.log(`  ${r.tag.padEnd(8)} h=${r.height.toString().padStart(5)} top=${r.top.toString().padStart(7)} bottom=${r.bottom.toString().padStart(7)} '${r.text}'`);
  if (rows.length === 0) {
    console.log('  (no elements found)');
    return;
  }
  const tops = rows.map((r) => r.top);
  const bots = rows.map((r) => r.bottom);
  const heights = rows.map((r) => r.height);
  const topSpread = Math.max(...tops) - Math.min(...tops);
  const botSpread = Math.max(...bots) - Math.min(...bots);
  const heightSpread = Math.max(...heights) - Math.min(...heights);
  const ok = topSpread < 0.5 && botSpread < 0.5 && heightSpread < 0.5;
  console.log(`  spreads → top:${topSpread.toFixed(2)} bottom:${botSpread.toFixed(2)} height:${heightSpread.toFixed(2)} ${ok ? '✓ ALIGNED' : '✗ DRIFT'}`);
};

// Navigate to Cole TCC report (has the action bar)
await page.goto(`${BASE}/clients`, { waitUntil: 'networkidle' });
const coleHref = await page
  .locator('a.clients-row', { has: page.locator('h2', { hasText: 'Cole Household' }) })
  .first()
  .getAttribute('href');
if (!coleHref) throw new Error('Cole row not found');
await page.goto(`${BASE}${coleHref}`, { waitUntil: 'networkidle' });

// === Client-detail history rows: take measurements first
const historyRows = await measure('.history-row-actions:nth-of-type(1) > *, .history-row-actions:nth-of-type(1) form button, .history-row-actions:nth-of-type(1) > a');
report('client-detail · history row (action-button-sm)', historyRows);

// Better selector: each row's action cluster
const histPerRow = await page.$$eval('.history-row-actions', (rows) =>
  rows.slice(0, 1).map((row) => {
    const items = Array.from(row.children).map((el) => {
      let target: Element = el;
      if (el.tagName === 'FORM') {
        const btn = el.querySelector('button');
        if (btn) target = btn;
      }
      const r = (target as HTMLElement).getBoundingClientRect();
      return {
        tag: target.tagName,
        text: (target.textContent ?? '').trim().slice(0, 32),
        top: Math.round(r.top * 100) / 100,
        bottom: Math.round(r.bottom * 100) / 100,
        height: Math.round(r.height * 100) / 100,
      };
    });
    return items;
  }),
);
report('client-detail · history row (resolved through forms)', histPerRow[0] ?? []);

// Capture screenshot of the history rows region
await page.locator('.history-row').first().scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
const histRegion = page.locator('.history-list').first();
await histRegion.screenshot({ path: `${OUT}/align-history-rows.png` });
console.log('  → docs/align-history-rows.png');

// === Report-detail action bar
const tccLink = page.locator('a.history-row-link', { has: page.locator('span.type-pill-tcc') });
const tccHref = await tccLink.first().getAttribute('href');
if (!tccHref) throw new Error('TCC report link not found');
await page.goto(`${BASE}${tccHref}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const actionBar = await page.$$eval('.report-detail-actions', (bars) =>
  bars.map((bar) => {
    const items = Array.from(bar.children).map((el) => {
      let target: Element = el;
      if (el.tagName === 'FORM') {
        const btn = el.querySelector('button');
        if (btn) target = btn;
      }
      const r = (target as HTMLElement).getBoundingClientRect();
      return {
        tag: target.tagName,
        text: (target.textContent ?? '').trim().slice(0, 32),
        top: Math.round(r.top * 100) / 100,
        bottom: Math.round(r.bottom * 100) / 100,
        height: Math.round(r.height * 100) / 100,
      };
    });
    return items;
  }),
);
report('report-detail · action bar (resolved through forms)', actionBar[0] ?? []);

const actionRegion = page.locator('.report-detail-actions').first();
await actionRegion.screenshot({ path: `${OUT}/align-action-bar.png` });
console.log('  → docs/align-action-bar.png');

await browser.close();
console.log('\ndone');
