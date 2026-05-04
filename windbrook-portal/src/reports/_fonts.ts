/**
 * Shared font loading for SACS / TCC renderers. Reads woff2 once at module
 * load and base64-encodes them. Both renderers inline the same CSS in their
 * <defs><style> blocks so generated SVG is fully self-contained for browser
 * preview and Playwright PDF export.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FONT_DIR = join(process.cwd(), 'public', 'fonts');
const b64 = (file: string) => readFileSync(join(FONT_DIR, file)).toString('base64');

export const FRAUNCES_B64 = b64('Fraunces-Variable.woff2');
export const GS_REGULAR_B64 = b64('GeneralSans-Regular.woff2');
export const GS_MEDIUM_B64 = b64('GeneralSans-Medium.woff2');

export const FONT_FACE_CSS = [
  `@font-face{font-family:'Fraunces';src:url(data:font/woff2;base64,${FRAUNCES_B64}) format('woff2-variations');font-weight:100 900;font-style:normal;}`,
  `@font-face{font-family:'General Sans';src:url(data:font/woff2;base64,${GS_REGULAR_B64}) format('woff2');font-weight:400;font-style:normal;}`,
  `@font-face{font-family:'General Sans';src:url(data:font/woff2;base64,${GS_MEDIUM_B64}) format('woff2');font-weight:500;font-style:normal;}`,
  `text{font-family:'General Sans',system-ui,sans-serif;}`,
  `text.title{font-family:'Fraunces',Times,serif;font-feature-settings:"tnum";}`,
  `text.num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum";}`,
].join('');
