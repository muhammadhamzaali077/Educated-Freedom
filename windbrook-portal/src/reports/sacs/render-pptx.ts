/**
 * Phase-32 SACS PPTX renderer.
 *
 * Single-source rendering: the PPTX is a thin wrapper around the SVG
 * produced by `renderSacsSvg`. Each SVG page becomes a single PNG
 * embedded as a full-slide image. Visual fidelity is identical to the
 * PDF export — both formats share the SVG renderer as their canonical
 * source. Editability is sacrificed (each slide is one image, not
 * editable PowerPoint shapes) — the explicit Phase-32 trade-off.
 *
 * Slide aspect matches the SVG (768×576 → 4:3) so the embedded image
 * fills the slide without stretching. Custom layout via `defineLayout`.
 */
import PptxGenJSDefault from 'pptxgenjs';
import { renderSacsSvg, type SacsSnapshot } from './render.js';
import { svgToPng } from '../svg-to-png.js';

// CJS/ESM interop — see comment in src/reports/sacs/render.ts.
const PptxGenJS: typeof PptxGenJSDefault =
  (PptxGenJSDefault as unknown as { default?: typeof PptxGenJSDefault }).default ??
  PptxGenJSDefault;

// SACS canvas is 768 × 576 (4:3). Define a slide that matches so the
// rasterized PNG fills the slide without distortion.
const SLIDE_W_IN = 10;
const SLIDE_H_IN = 7.5;
const LAYOUT_NAME = 'SACS_4x3';

export async function renderSacsPptx(s: SacsSnapshot): Promise<InstanceType<typeof PptxGenJS>> {
  const { page1, page2 } = renderSacsSvg(s, { debug: false });
  const [png1, png2] = await Promise.all([
    svgToPng(page1, { width: 1536, scale: 2 }),
    svgToPng(page2, { width: 1536, scale: 2 }),
  ]);

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: LAYOUT_NAME, width: SLIDE_W_IN, height: SLIDE_H_IN });
  pptx.layout = LAYOUT_NAME;

  const slide1 = pptx.addSlide();
  slide1.background = { color: 'FFFFFF' };
  slide1.addImage({
    data: `data:image/png;base64,${png1.toString('base64')}`,
    x: 0,
    y: 0,
    w: SLIDE_W_IN,
    h: SLIDE_H_IN,
  });

  const slide2 = pptx.addSlide();
  slide2.background = { color: 'FFFFFF' };
  slide2.addImage({
    data: `data:image/png;base64,${png2.toString('base64')}`,
    x: 0,
    y: 0,
    w: SLIDE_W_IN,
    h: SLIDE_H_IN,
  });

  return pptx;
}
