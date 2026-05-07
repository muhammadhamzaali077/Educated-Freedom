/**
 * Phase-30 PPTX → PDF converter. Spawns LibreOffice headless with the
 * pdf export filter, reads the generated PDF from a tmpdir, and returns
 * it as a Buffer.
 *
 * Critical operational notes:
 *  - LibreOffice must be on PATH (or override via LIBREOFFICE_BIN env).
 *    On Railway/Docker the runtime stage installs `libreoffice-core
 *    libreoffice-impress` (see Dockerfile). On dev machines without
 *    LibreOffice installed, prewarmLibreOffice() logs a warning and
 *    pptxBufferToPdfBuffer() throws when called — boot is NOT blocked.
 *  - Each conversion uses a fresh tmpdir as HOME so concurrent requests
 *    don't share LibreOffice's user profile (which would force them to
 *    queue serially on the same lock file).
 *  - 30 s hard timeout. If LibreOffice hangs (it can on first JVM init),
 *    we kill -9 and surface a clear error to the route.
 *  - First conversion is 5–8 s (JVM cold start). Subsequent conversions
 *    are 1–2 s if the same instance is kept warm via prewarmLibreOffice.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import crypto from 'node:crypto';

const LIBREOFFICE_BIN = process.env.LIBREOFFICE_BIN ?? 'libreoffice';
const CONVERSION_TIMEOUT_MS = 30_000;

export class LibreOfficeMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibreOfficeMissingError';
  }
}

export async function pptxBufferToPdfBuffer(pptxBuffer: Buffer): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sacs-'));
  const pptxPath = path.join(tmpDir, `${crypto.randomUUID()}.pptx`);
  const pdfPath = pptxPath.replace(/\.pptx$/, '.pdf');

  try {
    await fs.writeFile(pptxPath, pptxBuffer);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        LIBREOFFICE_BIN,
        ['--headless', '--convert-to', 'pdf', '--outdir', tmpDir, pptxPath],
        {
          // LibreOffice writes to its user profile; pinning HOME to the
          // tmpdir avoids cross-request lock contention.
          env: { ...process.env, HOME: tmpDir },
        },
      );

      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('LibreOffice conversion timed out'));
      }, CONVERSION_TIMEOUT_MS);

      let stderr = '';
      proc.stderr?.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`LibreOffice exited ${code}: ${stderr}`));
      });

      proc.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (err.code === 'ENOENT') {
          reject(
            new LibreOfficeMissingError(
              `LibreOffice binary "${LIBREOFFICE_BIN}" not found on PATH. Install libreoffice-core libreoffice-impress, or set LIBREOFFICE_BIN to the full path.`,
            ),
          );
        } else {
          reject(err);
        }
      });
    });

    return await fs.readFile(pdfPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function prewarmLibreOffice(): Promise<void> {
  console.log('[pptx-to-pdf] Pre-warming LibreOffice...');
  const start = Date.now();
  try {
    const mod = (await import('pptxgenjs')) as unknown as {
      default?: new () => unknown;
    };
    const Ctor = (mod.default as unknown as { default?: new () => unknown })?.default ?? mod.default;
    if (!Ctor) throw new Error('pptxgenjs default export missing');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pptx = new Ctor() as any;
    pptx.addSlide().addText('warmup', { x: 1, y: 1, w: 2, h: 0.5 });
    const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
    await pptxBufferToPdfBuffer(buf);
    console.log(`[pptx-to-pdf] LibreOffice warmed in ${Date.now() - start}ms`);
  } catch (err) {
    if (err instanceof LibreOfficeMissingError) {
      console.warn(
        `[pptx-to-pdf] ${err.message}. PDF-via-PPTX route disabled until LibreOffice is installed.`,
      );
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[pptx-to-pdf] Pre-warm failed (first PDF export will be slow or fail): ${msg}`,
      );
    }
  }
}
