/**
 * Phase-32 SVG → PNG rasterizer.
 *
 * Single chromium instance kept warm for the lifetime of the process —
 * each call gets a fresh context + page so requests can run concurrently
 * without sharing cookies or local state. The rasterizer is the only
 * step that runs Playwright in the PPTX pipeline; the resulting PNG is
 * embedded directly into a slide.
 *
 * The PDF export at /export/pdf already keeps its own chromium instance
 * (see src/reports/pdf.ts). The two browsers are independent — separate
 * pre-warm, separate shutdown — because pdf.ts pre-dates this rasterizer
 * and we deliberately don't share singletons across modules to keep
 * shutdown semantics clean.
 */
import { chromium, type Browser } from 'playwright';

let sharedBrowser: Browser | null = null;
let launching: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.isConnected()) return sharedBrowser;
  if (launching) return launching;
  launching = chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  try {
    sharedBrowser = await launching;
    return sharedBrowser;
  } finally {
    launching = null;
  }
}

export interface RasterizeOptions {
  /** Hint width for the initial viewport. The viewport is then snapped to
   *  the SVG's bounding rect, so this is mostly a sanity bound — pick a
   *  value larger than the largest SVG you'll render (currently TCC at
   *  792 px wide). */
  width: number;
  /** DPI multiplier — 2 = retina, 3 = print quality. Default 2. */
  scale?: number;
}

/**
 * Rasterize an SVG string to a PNG buffer at the SVG's natural width
 * times `scale`. Anti-aliased; no transparent background (the source
 * SVGs paint a white rect as their first element so cropping to the
 * SVG bounding box already yields a white-backed PNG).
 */
export async function svgToPng(svg: string, options: RasterizeOptions): Promise<Buffer> {
  const scale = options.scale ?? 2;
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    deviceScaleFactor: scale,
    viewport: { width: options.width, height: options.width },
  });

  try {
    const page = await ctx.newPage();
    await page.setContent(
      `<!doctype html><html><body style="margin:0;padding:0;background:#fff">${svg}</body></html>`,
      { waitUntil: 'load' },
    );

    const dims = await page.evaluate(() => {
      const el = document.querySelector('svg');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    if (!dims) throw new Error('No SVG element found in rasterizer input');

    await page.setViewportSize({
      width: Math.max(1, Math.ceil(dims.width)),
      height: Math.max(1, Math.ceil(dims.height)),
    });

    const buf = await page.locator('svg').screenshot({
      omitBackground: false,
      type: 'png',
    });
    return buf as Buffer;
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function shutdownSvgRasterizer(): Promise<void> {
  if (sharedBrowser) {
    try {
      await sharedBrowser.close();
    } catch {
      /* swallow — process is exiting */
    }
    sharedBrowser = null;
  }
}
