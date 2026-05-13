import { serve } from '@hono/node-server';
import { app } from './app.js';
import { prewarmBrowser, shutdownBrowser } from './reports/pdf.js';
import { prewarmLibreOffice } from './reports/pptx-to-pdf.js';
import { shutdownSvgRasterizer } from './reports/svg-to-png.js';

const port = Number(process.env.PORT ?? 3000);

function validateCanvaConfig(): void {
  const required = ['CANVA_CLIENT_ID', 'CANVA_CLIENT_SECRET', 'CANVA_REDIRECT_URI'] as const;
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.warn(
      `[canva] Missing env vars: ${missing.join(', ')}. Canva export disabled until these are set + the server is restarted.`,
    );
    return;
  }
  const redirectUri = process.env.CANVA_REDIRECT_URI as string;
  try {
    const parsed = new URL(redirectUri);
    // Canva does NOT accept `localhost` as a registered redirect URL — only
    // `127.0.0.1` for local development. This was the root cause of every
    // "educated_freedom has not configured its redirect URI" error.
    // https://www.canva.dev/docs/connect/creating-integrations/
    if (parsed.hostname === 'localhost') {
      console.error(
        `[canva] CANVA_REDIRECT_URI uses 'localhost' which Canva rejects. Use '127.0.0.1' instead and browse the portal at http://127.0.0.1:${port}. See https://www.canva.dev/docs/connect/creating-integrations/`,
      );
      return;
    }
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      console.warn(
        `[canva] CANVA_REDIRECT_URI uses ${parsed.protocol} in production — Canva requires HTTPS for live tokens.`,
      );
    }
    console.log(`[canva] ✓ OAuth redirect URI: ${redirectUri}`);
    console.log(
      '[canva] This exact URI must be registered in your Canva developer integration at https://www.canva.com/developers/integrations (Authentication → Authorized redirects).',
    );
  } catch {
    console.error(`[canva] CANVA_REDIRECT_URI is not a valid URL: "${redirectUri}"`);
  }
}

validateCanvaConfig();

// Bind to 0.0.0.0 so connections to BOTH 127.0.0.1 (IPv4) and ::1 (IPv6 / the
// "localhost" alias on most systems) succeed. On some Node versions the
// default binding is IPv6-only, which silently breaks Canva OAuth — Canva
// redirects to 127.0.0.1 (IPv4) and a `:: -only` socket returns
// ECONNREFUSED. Forcing 0.0.0.0 makes the failure mode impossible.
serve(
  { fetch: app.fetch, port, hostname: '0.0.0.0' },
  (info) => {
    console.log(`[server] Listening on:`);
    console.log(`  http://127.0.0.1:${info.port}   ← USE THIS for Canva OAuth`);
    console.log(`  http://localhost:${info.port}   ← convenience, do NOT use for Canva`);
    prewarmBrowser();
    // Phase-30 — pre-warm LibreOffice for the PPTX → PDF pipeline. Both
    // pre-warms run independently; either is allowed to fail without
    // crashing boot. Playwright stays because /export/pdf still uses it
    // until the LibreOffice path is verified in production via
    // /internal/test-pptx-pdf.
    prewarmLibreOffice();

    // Confirm the IPv4 socket is reachable before the operator opens the
    // browser. A failed self-check almost certainly means another process
    // grabbed the port or the firewall blocked it — both produce a Canva
    // error mid-OAuth otherwise.
    setTimeout(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${info.port}/healthz`);
        if (res.ok) {
          console.log(`[server] ✓ 127.0.0.1:${info.port} is reachable`);
        } else {
          console.warn(`[server] ✗ 127.0.0.1:${info.port} returned ${res.status}`);
        }
      } catch (err) {
        console.error(
          `[server] ✗ 127.0.0.1:${info.port} unreachable — Canva OAuth will fail. ${(err as Error).message}`,
        );
      }
    }, 1000);
  },
);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await Promise.all([shutdownBrowser(), shutdownSvgRasterizer()]);
    process.exit(0);
  });
}
