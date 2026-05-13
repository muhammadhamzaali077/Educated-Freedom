/**
 * Extract embedded images from a PPTX (which is just a zip) and write
 * them to docs/. Used to verify the Phase-32 image-in-slide PPTX export
 * — the embedded PNGs should equal the SVG render pixel-for-pixel
 * modulo Playwright's anti-aliasing.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync } from 'node:zlib';

// Minimal zip reader since we only need image1.png/image2.png from
// ppt/media/. Use the `unzipper`-equivalent lifecycle via streams from
// pkware deflate header — but that's a lot. Easier: shell out to
// `tar -xf` since modern Windows ships GNU tar via WSL/MS.
import { spawnSync } from 'node:child_process';

const PPTX = resolve(process.cwd(), '..', 'docs', 'smoke-cole.pptx');
const OUT = resolve(process.cwd(), '..', 'docs', 'pptx-extracted');
mkdirSync(OUT, { recursive: true });

// PowerShell Expand-Archive can read zips. PPTX is a zip — temp-rename
// to .zip, expand, then copy the media images out.
const zipCopy = resolve(OUT, '_input.zip');
writeFileSync(zipCopy, readFileSync(PPTX));

const r = spawnSync('powershell', [
  '-NoProfile',
  '-Command',
  `Expand-Archive -Path '${zipCopy}' -DestinationPath '${OUT}' -Force`,
]);
if (r.status !== 0) {
  console.error(r.stderr.toString());
  process.exit(1);
}

const ls = spawnSync('powershell', [
  '-NoProfile',
  '-Command',
  `Get-ChildItem '${resolve(OUT, 'ppt', 'media')}' | Select-Object Name, Length | Format-Table -AutoSize`,
]);
console.log(ls.stdout.toString());
