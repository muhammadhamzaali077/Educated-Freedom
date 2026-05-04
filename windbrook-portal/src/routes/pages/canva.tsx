import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { db } from '../../db/client.js';
import { reports as reportsTable } from '../../db/schema.js';
import {
  CanvaApiError,
  CanvaConnectionError,
  deriveCodeChallenge,
  disconnect,
  exchangeCode,
  exportToCanva,
  generateCodeVerifier,
  getAuthorizeUrl,
  getCanvaRedirectUri,
  isConfigured,
  loadTokens,
  saveTokens,
} from '../../lib/canva.js';
import { loadClient } from '../../lib/clients.js';
import {
  pdfFilename,
  renderAndSavePdf,
  reportPdfPath,
} from '../../reports/pdf.js';
import { renderReportPages } from '../../lib/reports.js';
import type { AuthVars } from '../../middleware/auth.js';

const app = new Hono<{ Variables: AuthVars }>();

const STATE_COOKIE = 'canva_oauth_state';
const VERIFIER_COOKIE = 'canva_oauth_verifier';

// =============================================================================
// OAuth — connect (PKCE)
// =============================================================================
app.get('/api/canva/connect', async (c) => {
  if (!isConfigured()) {
    return c.text(
      'Canva is not configured. Set CANVA_CLIENT_ID and CANVA_CLIENT_SECRET in the environment, then restart.',
      503,
    );
  }
  const state = crypto.randomUUID();
  const verifier = generateCodeVerifier();
  const challenge = await deriveCodeChallenge(verifier);

  const cookieOpts = {
    httpOnly: true,
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: 600,
  };
  setCookie(c, STATE_COOKIE, state, cookieOpts);
  setCookie(c, VERIFIER_COOKIE, verifier, cookieOpts);

  return c.redirect(getAuthorizeUrl(state, challenge));
});

app.get('/api/canva/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const errorParam = c.req.query('error');
  const errorDescription = c.req.query('error_description');
  const expectedState = getCookie(c, STATE_COOKIE);
  const verifier = getCookie(c, VERIFIER_COOKIE);

  // Phase 17 diagnostic block — surface every query param + cookie state
  // so a failing OAuth round-trip leaves a paste-able trail in the server
  // log. Bearer/secret values are never printed.
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[canva:callback] Received from Canva');
  console.log('  Request URL:', c.req.url);
  console.log('  code present:', !!code);
  console.log('  state present:', !!state);
  console.log('  state matches cookie:', !!state && !!expectedState && state === expectedState);
  console.log('  verifier cookie present:', !!verifier);
  console.log('  error:', errorParam || 'none');
  console.log('  error_description:', errorDescription || 'none');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (errorParam) {
    // Phase 18 — show the operator a paste-able diagnostic block AND a
    // step-by-step fix for the most common error ("redirect uri doesn't
    // match"). The registered URI in their Canva portal is the only thing
    // they can edit; everything we send is determined by the env var.
    const escape = (s: string) =>
      s.replace(/[<&"']/g, (c) =>
        c === '<' ? '&lt;' : c === '&' ? '&amp;' : c === '"' ? '&quot;' : '&#39;',
      );
    let registeredHint = '<em>could not read CANVA_REDIRECT_URI</em>';
    try {
      registeredHint = escape(getCanvaRedirectUri());
    } catch (e) {
      registeredHint = `<em>${escape((e as Error).message)}</em>`;
    }
    const safeErr = escape(errorParam);
    const safeDesc = escape(errorDescription ?? '(none provided)');
    const safeUrl = escape(c.req.url);
    return c.html(
      `<!doctype html>
<html>
<head><title>Canva connection error</title></head>
<body style="font-family: 'Source Serif 4', Georgia, serif; max-width: 760px; margin: 60px auto; padding: 0 24px; color: #0A1F3A;">
  <h1 style="font-size: 28px; margin: 0 0 4px;">Canva connection could not be completed</h1>
  <p style="color: #4A5568; margin: 0 0 32px;">Paste this whole block back into chat so we can diagnose.</p>

  <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #4A5568; margin: 0 0 8px;">What Canva returned</h2>
  <pre style="font-family: ui-monospace, monospace; background: #F2EFE8; padding: 16px; border: 1px solid #E2DDD3; white-space: pre-wrap; word-break: break-all; font-size: 13px;">error:             ${safeErr}
error_description: ${safeDesc}

Full callback URL (what Canva redirected to):
${safeUrl}</pre>

  <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #4A5568; margin: 32px 0 8px;">What this likely means</h2>
  <p>The redirect URI sent to Canva does not match any URI registered for this integration. Canva treats trailing slashes, hostname differences (<code>localhost</code> vs <code>127.0.0.1</code>), and ports as <strong>distinct</strong> — they must be byte-identical.</p>

  <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #4A5568; margin: 32px 0 8px;">To fix</h2>
  <ol>
    <li>Open <a href="https://www.canva.com/developers/integrations">https://www.canva.com/developers/integrations</a></li>
    <li>Click into your integration → <strong>Authentication</strong> → <strong>Authorized redirects</strong></li>
    <li>Verify the registered redirect URI is EXACTLY: <code style="background: #F2EFE8; padding: 2px 6px; border: 1px solid #E2DDD3;">${registeredHint}</code></li>
    <li>If different in any way, edit it to match exactly, save, and try again</li>
  </ol>

  <p style="margin-top: 40px;"><a href="/settings">← Back to settings</a></p>
</body>
</html>`,
    );
  }

  if (!code) {
    const errCode = c.req.query('error') ?? 'unknown';
    const errDesc = c.req.query('error_description') ?? '';
    return c.text(`Canva did not return a code (${errCode}${errDesc ? ` — ${errDesc}` : ''})`, 400);
  }
  if (!state || !expectedState || state !== expectedState) {
    return c.text('OAuth state mismatch — try again from /settings.', 400);
  }
  if (!verifier) {
    return c.text(
      'Missing PKCE verifier cookie — try again from /settings (cookies must be enabled).',
      400,
    );
  }

  const user = c.get('user');
  try {
    const tokens = await exchangeCode(code, verifier);
    await saveTokens(user.id, tokens);
  } catch (err) {
    const detail =
      err instanceof CanvaApiError
        ? `${err.status}: ${err.bodyText.slice(0, 240)}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error('[canva] token exchange failed:', detail);
    return c.text(`Canva token exchange failed: ${detail}`, 502);
  }

  // Clear PKCE cookies
  setCookie(c, STATE_COOKIE, '', { path: '/', maxAge: 0 });
  setCookie(c, VERIFIER_COOKIE, '', { path: '/', maxAge: 0 });

  return c.redirect('/settings?canva=connected');
});

app.post('/api/canva/disconnect', async (c) => {
  const user = c.get('user');
  await disconnect(user.id);
  if (c.req.header('HX-Request')) {
    c.header('HX-Redirect', '/settings');
    return c.body(null, 204);
  }
  return c.redirect('/settings');
});

// =============================================================================
// Export — POST /clients/:id/reports/:reportId/export/canva
// =============================================================================
app.post('/clients/:id/reports/:reportId/export/canva', async (c) => {
  const clientId = c.req.param('id');
  const reportId = c.req.param('reportId');
  const user = c.get('user');

  // Verify client + report exist before doing any expensive work.
  const client = await loadClient(clientId);
  if (!client) return c.notFound();
  const [report] = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.id, reportId))
    .limit(1);
  if (!report || report.clientId !== clientId) return c.notFound();

  // Generate (or refresh) the PDF first — even if Canva fails, the user
  // still has the PDF on disk for the fallback path.
  const { pages } = renderReportPages(client, report, null);
  let path: string;
  try {
    path = await renderAndSavePdf(reportId, pages);
  } catch (err) {
    return c.text(
      `PDF generation failed before Canva upload: ${err instanceof Error ? err.message : err}`,
      503,
    );
  }
  await db.update(reportsTable).set({ pdfPath: path }).where(eq(reportsTable.id, reportId));

  const filename = pdfFilename({
    householdName: client.client.householdName,
    reportType: report.reportType,
    meetingDate: report.meetingDate,
  });

  let imported;
  try {
    const buf = readFileSync(reportPdfPath(reportId));
    imported = await exportToCanva(user.id, buf, filename);
  } catch (err) {
    if (err instanceof CanvaConnectionError) {
      return c.text(err.message, 401);
    }
    if (err instanceof CanvaApiError) {
      // Surface the actual Canva error message — the frontend uses this for
      // the fallback path too.
      const summary = `Canva ${err.status}: ${err.bodyText.slice(0, 240)}`;
      console.error('[canva] export failed:', summary);
      return c.text(summary, 502);
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[canva] export failed:', msg);
    return c.text(`Canva export failed: ${msg}`, 502);
  }

  await db
    .update(reportsTable)
    .set({
      canvaDesignId: imported.designId,
      canvaEditUrl: imported.editUrl,
    })
    .where(eq(reportsTable.id, reportId));

  if (c.req.header('HX-Request')) {
    c.header('HX-Redirect', imported.editUrl);
    return c.body(null, 204);
  }
  return c.redirect(imported.editUrl);
});

// =============================================================================
// Dev — token status (gated to non-production)
// =============================================================================
app.get('/dev/canva-token-status', async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.text('Not available in production.', 404);
  }
  const user = c.get('user');
  const tokens = await loadTokens(user.id);
  if (!tokens) {
    return c.json({ connected: false, user: { id: user.id, email: (user as { email?: string }).email } }, 200);
  }
  const now = Date.now();
  const ageSeconds = Math.round((now - tokens.obtainedAt.getTime()) / 1000);
  const expiresInSeconds = Math.round((tokens.expiresAt.getTime() - now) / 1000);
  return c.json(
    {
      connected: true,
      user: { id: user.id, email: (user as { email?: string }).email },
      obtainedAt: tokens.obtainedAt.toISOString(),
      expiresAt: tokens.expiresAt.toISOString(),
      ageSeconds,
      expiresInSeconds,
      isExpired: expiresInSeconds <= 0,
      shouldRefreshSoon: expiresInSeconds <= 60,
      scope: tokens.scope,
      // Tokens NEVER returned in cleartext — only their length so we can
      // confirm they're round-tripping through encryption.
      accessTokenLength: tokens.accessToken.length,
      refreshTokenLength: tokens.refreshToken.length,
    },
    200,
  );
});

// =============================================================================
// Settings page
// =============================================================================
app.get('/settings', async (c) => {
  const user = c.get('user');
  const role = (user as { role?: string | null }).role ?? null;
  const tokens = await loadTokens(user.id);
  const connected = tokens != null;
  const flash = c.req.query('canva');

  const { AppLayout } = await import('../../views/layouts/app-layout.js');
  return c.html(
    <AppLayout
      title="Settings"
      active="settings"
      crumbs={[{ label: 'Settings' }]}
      userName={user.name}
      userRole={role}
    >
      <header class="form-header">
        <h1 class="form-title">Settings</h1>
        <p class="label">Integrations · {user.name}</p>
        {flash === 'connected' ? (
          <p class="form-flash-inline">Canva connected. Reports can now be exported to your workspace.</p>
        ) : null}
      </header>

      <section class="detail-section">
        <p class="form-section-label">Canva Connect</p>
        {!isConfigured() ? (
          <p class="compass-empty">
            Canva is not configured on this server. Add CANVA_CLIENT_ID and CANVA_CLIENT_SECRET to .env.
          </p>
        ) : connected ? (
          <div>
            <p class="text-ink">
              Connected · scope: <span class="num">{tokens?.scope ?? '—'}</span>
            </p>
            <form method="post" action="/api/canva/disconnect" hx-post="/api/canva/disconnect">
              <button type="submit" class="text-link-muted" style="margin-top: 12px">
                Disconnect Canva
              </button>
            </form>
          </div>
        ) : (
          <p>
            <a class="text-link-accent" href="/api/canva/connect">
              Connect Canva &rarr;
            </a>
          </p>
        )}
      </section>
    </AppLayout>,
  );
});

export default app;
