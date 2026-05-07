/**
 * Phase-30 / Task 3 — rasterize the inline SVG illustrations from
 * src/reports/sacs/render.ts to PNG. PowerPoint can't embed inline SVG,
 * so the PPTX renderer references these PNG files instead.
 *
 * Run once after editing the renderer's piggy or papers geometry:
 *
 *   pnpm tsx scripts/generate-pptx-assets.ts
 *
 * Commit the resulting PNGs (~10–20 KB each) at:
 *   public/assets/piggy-bank.png
 *   public/assets/papers-icon.png
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const OUT_DIR = resolve(process.cwd(), 'public', 'assets');
mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Piggy bank — geometry mirrors the inline group in render.ts renderPage1.
// Origin is (0, 0) for this standalone SVG (no parent translate). The host
// SVG is sized so the artwork fills the viewBox tightly.
// ---------------------------------------------------------------------------
const PIGGY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -8 140 76" width="280" height="152">
  <ellipse cx="0" cy="48" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="0" cy="42" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="0" cy="36" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="0" cy="30" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="120" cy="48" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="120" cy="42" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="120" cy="36" rx="8" ry="2.5" fill="#E5B040" stroke="#A37A20" stroke-width="0.5"/>
  <ellipse cx="60" cy="35" rx="34" ry="22" fill="#F5A8B8" stroke="#C77A8C" stroke-width="1"/>
  <path d="M 47 16 L 53 12 L 55 23 Z" fill="#C77A8C"/>
  <ellipse cx="89" cy="36" rx="9" ry="7" fill="#E08FA0" stroke="#C77A8C" stroke-width="0.6"/>
  <circle cx="86" cy="34" r="1.4" fill="#5C2E3B"/>
  <circle cx="92" cy="34" r="1.4" fill="#5C2E3B"/>
  <circle cx="71" cy="29" r="2" fill="#5C2E3B"/>
  <circle cx="71.6" cy="28.4" r="0.7" fill="#FFFFFF"/>
  <rect x="42" y="55" width="6" height="7" fill="#C77A8C"/>
  <rect x="74" y="55" width="6" height="7" fill="#C77A8C"/>
  <circle cx="60" cy="3" r="6" fill="#E5B040" stroke="#A37A20" stroke-width="0.8"/>
  <text x="60" y="6" text-anchor="middle" font-family="serif" font-size="7" fill="#A37A20" font-weight="700">$</text>
  <text x="20" y="8" font-family="sans-serif" font-size="10" fill="#E5B040">&#10022;</text>
  <text x="95" y="12" font-family="sans-serif" font-size="9" fill="#E5B040">&#10022;</text>
</svg>`;

// ---------------------------------------------------------------------------
// Papers icon — three sheets with the rotation angles + stroke weights from
// the renderer's papersStackIcon helper. viewBox tuned so the rotated
// background sheets aren't clipped at the edges.
// ---------------------------------------------------------------------------
const PAPERS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -2 42 56" width="168" height="224">
  <rect x="0" y="14" width="32" height="38" fill="#FFFFFF" stroke="#0A1F3A" stroke-width="1.4" transform="rotate(-8 16 33)"/>
  <rect x="4" y="6" width="32" height="38" fill="#FFFFFF" stroke="#0A1F3A" stroke-width="1.4" transform="rotate(5 20 25)"/>
  <rect x="0" y="0" width="34" height="22" fill="#FFFFFF" stroke="#0A1F3A" stroke-width="1.6"/>
  <path d="M 0 0 L 17 13 L 34 0" fill="none" stroke="#0A1F3A" stroke-width="1.6"/>
</svg>`;

async function svgToPng(svg: string, outPath: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 600, height: 400 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}</style></head><body>${svg}</body></html>`,
      { waitUntil: 'load' },
    );
    await page.locator('svg').first().screenshot({ path: outPath, omitBackground: true });
    console.log('  →', outPath);
  } finally {
    await browser.close();
  }
}

await svgToPng(PIGGY_SVG, resolve(OUT_DIR, 'piggy-bank.png'));
await svgToPng(PAPERS_SVG, resolve(OUT_DIR, 'papers-icon.png'));
console.log('done');
