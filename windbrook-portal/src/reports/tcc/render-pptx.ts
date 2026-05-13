/**
 * Phase-32 TCC PPTX renderer.
 *
 * Single-source rendering: the PPTX is a thin wrapper around the SVG
 * produced by `renderTccSvg`. The single page becomes a PNG embedded as
 * a full-slide image. Visual fidelity is identical to the PDF export.
 *
 * The TCC SVG is 792 × 1000 (portrait). We define a custom portrait
 * slide layout matching that aspect so the image fills without
 * distortion.
 */
import PptxGenJSDefault from 'pptxgenjs';
import { renderTccSvg, type TccBubbleLayout, type TccSnapshot } from './render.js';
import { svgToPng } from '../svg-to-png.js';

// CJS/ESM interop — see comment in src/reports/sacs/render.ts.
const PptxGenJS: typeof PptxGenJSDefault =
  (PptxGenJSDefault as unknown as { default?: typeof PptxGenJSDefault }).default ??
  PptxGenJSDefault;

// TCC canvas is 792 × 1000 (≈4:5 portrait). Custom slide layout matches.
const SLIDE_W_IN = 7.92;
const SLIDE_H_IN = 10;
const LAYOUT_NAME = 'TCC_PORTRAIT';

export async function renderTccPptx(
  s: TccSnapshot,
  layout?: TccBubbleLayout,
): Promise<InstanceType<typeof PptxGenJS>> {
  const { page1 } = renderTccSvg(s, layout, { debug: false });
  const png = await svgToPng(page1, { width: 1600, scale: 2 });

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: LAYOUT_NAME, width: SLIDE_W_IN, height: SLIDE_H_IN });
  pptx.layout = LAYOUT_NAME;

  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addImage({
    data: `data:image/png;base64,${png.toString('base64')}`,
    x: 0,
    y: 0,
    w: SLIDE_W_IN,
    h: SLIDE_H_IN,
  });

  return pptx;
}
