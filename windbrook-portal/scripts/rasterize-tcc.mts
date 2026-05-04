/**
 * Phase 20 verification — rasterize the rendered TCC SVGs to PNG via the
 * already-installed Playwright chromium so the user can inspect bubble /
 * oval spacing. Saves to docs/phase20-{cole,lipski,park}-tcc.png.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const cases = [
  { name: 'cole', svg: 'D:/temp/wb/cole-tcc.svg' },
  { name: 'lipski', svg: 'D:/temp/wb/lipski-tcc.svg' },
  { name: 'park', svg: 'D:/temp/wb/park-tcc.svg' },
];

const docsDir = path.resolve('docs');
fs.mkdirSync(docsDir, { recursive: true });

// Phase 21 — canvas grew 820 → 1000.
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 792, height: 1000 },
  deviceScaleFactor: 2,
});
for (const c of cases) {
  const svg = fs.readFileSync(c.svg, 'utf8');
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:#FAF8F4;}svg{display:block;}</style></head><body>${svg}</body></html>`;
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const out = path.join(docsDir, `phase22-${c.name}-tcc.png`);
  await page.screenshot({ path: out, fullPage: true, omitBackground: false });
  await page.close();
  console.log(c.name, '→', out, fs.statSync(out).size, 'bytes');
}
await ctx.close();
await browser.close();
process.exit(0);
