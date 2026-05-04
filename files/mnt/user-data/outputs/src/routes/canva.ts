// src/routes/canva.ts
//
// Canva OAuth routes. Mount with: app.route('/api/canva', canvaRoutes)
//
// Provides:
//   GET  /api/canva/connect    -- redirects user to Canva authorize URL
//   GET  /api/canva/callback   -- handles redirect-back from Canva
//   POST /api/canva/disconnect -- clears stored tokens

import { Hono } from 'hono';
import { setCookie, getCookie } from 'hono/cookie';
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  getCanvaConfig,
} from '../lib/canva';
// import { saveCanvaTokens, clearCanvaTokens } from '../db/queries';
// ^^^ wire to your actual DB query module

export const canvaRoutes = new Hono();

// =============================================================================
// GET /api/canva/connect
// =============================================================================

canvaRoutes.get('/connect', (c) => {
  const session = c.get('session'); // adjust to your session retrieval
  if (!session?.userId) {
    return c.redirect('/login');
  }

  try {
    const { url, state } = buildAuthorizeUrl();

    // Store state in a httpOnly cookie scoped to the callback route.
    // We need to verify the state matches when the callback fires.
    setCookie(c, 'canva_oauth_state', state, {
      httpOnly: true,
      secure: false, // 127.0.0.1 is not https in dev
      sameSite: 'Lax',
      path: '/',
      maxAge: 600, // 10 min
    });

    return c.redirect(url);
  } catch (err) {
    console.error('[canva:connect] failed to build authorize URL:', err);
    return c.html(`
      <pre style="padding: 2em; font-family: monospace;">
Canva connection setup failed:

${(err as Error).message}

Check your .env values and CLAUDE.md for setup steps.
      </pre>
    `, 500);
  }
});

// =============================================================================
// GET /api/canva/callback
// =============================================================================

canvaRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  const errorDescription = c.req.query('error_description');

  console.log('━'.repeat(80));
  console.log('[canva:callback] received');
  console.log('  code present:           ' + !!code);
  console.log('  state present:          ' + !!state);
  console.log('  error:                  ' + (error || '(none)'));
  console.log('  error_description:      ' + (errorDescription || '(none)'));
  console.log('━'.repeat(80));

  if (error) {
    return renderCallbackError(c, error, errorDescription);
  }

  if (!code || !state) {
    return renderCallbackError(c, 'missing_params', 'Required code or state missing from callback URL');
  }

  // Verify state matches the one we set
  const expectedState = getCookie(c, 'canva_oauth_state');
  if (!expectedState || expectedState !== state) {
    console.error('[canva:callback] state mismatch — possible CSRF or expired session');
    return renderCallbackError(c, 'state_mismatch',
      'OAuth state does not match. The connection may have expired (>10 min) or been tampered with.');
  }

  try {
    const tokens = await exchangeCodeForTokens(code, state);
    console.log('[canva:callback] tokens obtained, expires_in=' + tokens.expiresIn);

    // Persist tokens for the current user
    // const session = c.get('session');
    // await saveCanvaTokens(session.userId, tokens);

    setCookie(c, 'canva_oauth_state', '', { maxAge: 0, path: '/' });

    return c.redirect('/dashboard?canva=connected');
  } catch (err) {
    console.error('[canva:callback] token exchange failed:', err);
    return renderCallbackError(c, 'token_exchange_failed', (err as Error).message);
  }
});

// =============================================================================
// POST /api/canva/disconnect
// =============================================================================

canvaRoutes.post('/disconnect', async (c) => {
  // const session = c.get('session');
  // await clearCanvaTokens(session.userId);
  return c.redirect('/dashboard?canva=disconnected');
});

// =============================================================================
// ERROR PAGE
// =============================================================================

function renderCallbackError(c: any, error: string, description?: string) {
  let config;
  try {
    config = getCanvaConfig();
  } catch {
    config = { redirectUri: '(env not configured)' };
  }

  return c.html(`
<!doctype html>
<html>
<head><title>Canva connection error</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 760px; margin: 80px auto; padding: 0 24px; color: #0A1F3A;">
  <h1 style="font-family: 'Source Serif 4', serif; font-weight: 500; font-size: 32px;">Canva connection could not be completed</h1>

  <table style="border-collapse: collapse; margin-top: 24px; font-size: 14px;">
    <tr><td style="padding: 4px 16px 4px 0; color: #8B9099;">Error</td><td style="padding: 4px 0; font-family: monospace;">${escapeHtml(error)}</td></tr>
    <tr><td style="padding: 4px 16px 4px 0; color: #8B9099;">Description</td><td style="padding: 4px 0;">${escapeHtml(description || '(none)')}</td></tr>
  </table>

  ${error === 'invalid_request' && description?.includes('redirect') ? `
    <h2 style="margin-top: 40px; font-size: 18px;">How to fix this</h2>
    <ol style="line-height: 1.7;">
      <li>Open <a href="https://www.canva.com/developers/integrations" target="_blank">https://www.canva.com/developers/integrations</a></li>
      <li>Click into your integration → Authentication tab</li>
      <li>Under "Authorized redirects", verify URL 1 is EXACTLY: <code style="background: #F2EFE8; padding: 2px 6px;">${escapeHtml(config.redirectUri)}</code></li>
      <li>If different, edit it to match exactly (no trailing slash, hostname is 127.0.0.1 not localhost)</li>
      <li>Click Save</li>
      <li>Wait ~30 seconds for the change to propagate</li>
      <li>Return to /dashboard and click "Connect Canva" again</li>
    </ol>
  ` : ''}

  <p style="margin-top: 40px;"><a href="/dashboard" style="color: #B8956A;">← Return to dashboard</a></p>
</body>
</html>
  `);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
