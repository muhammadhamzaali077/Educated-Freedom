// src/lib/canva.ts
//
// Canva Connect API client — complete rewrite based on canva.dev docs.
//
// Key fixes vs previous versions:
//  1. code_challenge_method is "s256" (lowercase) per Canva spec — NOT "S256"
//  2. Token exchange uses HTTP Basic auth header — NOT body-based creds
//  3. Redirect URI strips trailing slash and is read from a single source
//  4. Verbose logging at every step so failures are diagnosable
//  5. PKCE state stored in-memory keyed by state param, expires in 10min

import crypto from 'node:crypto';

// ============================================================================
// CONFIG — single source of truth for all Canva env values
// ============================================================================

export interface CanvaConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getCanvaConfig(): CanvaConfig {
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  const rawRedirect = process.env.CANVA_REDIRECT_URI;

  if (!clientId) throw new Error('CANVA_CLIENT_ID is not set');
  if (!clientSecret) throw new Error('CANVA_CLIENT_SECRET is not set');
  if (!rawRedirect) throw new Error('CANVA_REDIRECT_URI is not set');

  // Strip trailing slash — Canva treats /callback and /callback/ as different
  const redirectUri = rawRedirect.replace(/\/$/, '');

  // Validate hostname
  const url = new URL(redirectUri);
  if (url.hostname === 'localhost') {
    throw new Error(
      `CANVA_REDIRECT_URI uses 'localhost' which Canva rejects. ` +
      `Use '127.0.0.1' instead. See https://www.canva.dev/docs/connect/quickstart/`
    );
  }

  return { clientId, clientSecret, redirectUri };
}

// ============================================================================
// PKCE STATE STORAGE
// ============================================================================
// In-memory store keyed by `state` value. Expires after 10 minutes.
// For a real production app this would go in Redis or the DB, but for the
// 3-user internal portal in-memory is fine and avoids race conditions.

interface PkceEntry {
  codeVerifier: string;
  createdAt: number;
}

const pkceStore = new Map<string, PkceEntry>();
const PKCE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function cleanupPkceStore(): void {
  const now = Date.now();
  for (const [state, entry] of pkceStore.entries()) {
    if (now - entry.createdAt > PKCE_EXPIRY_MS) {
      pkceStore.delete(state);
    }
  }
}

// ============================================================================
// SCOPES
// ============================================================================
// Per Canva docs, scopes are space-separated and must be explicit.
// Each scope action is independent — asset:write does NOT grant asset:read.

const SCOPES = [
  'profile:read',
  'asset:read',
  'asset:write',
  'design:meta:read',
  'design:content:read',
  'design:content:write',
  'brandtemplate:meta:read',
  'brandtemplate:content:read',
].join(' ');

// ============================================================================
// PKCE HELPERS
// ============================================================================

function generateCodeVerifier(): string {
  // 96 bytes -> 128 base64url chars (within Canva's 43-128 limit)
  return crypto.randomBytes(96).toString('base64url');
}

function generateCodeChallenge(codeVerifier: string): string {
  return crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
}

function generateState(): string {
  return crypto.randomBytes(32).toString('base64url');
}

// ============================================================================
// AUTHORIZE URL
// ============================================================================

export interface AuthorizeUrlResult {
  url: string;
  state: string;
}

export function buildAuthorizeUrl(): AuthorizeUrlResult {
  cleanupPkceStore();

  const config = getCanvaConfig();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  pkceStore.set(state, {
    codeVerifier,
    createdAt: Date.now(),
  });

  // CRITICAL: code_challenge_method must be "s256" (lowercase) per Canva docs.
  // The Canva-generated example URL uses lowercase "s256". Using "S256" causes
  // silent OAuth failures.
  const params = new URLSearchParams({
    code_challenge: codeChallenge,
    code_challenge_method: 's256',
    scope: SCOPES,
    response_type: 'code',
    client_id: config.clientId,
    state,
    redirect_uri: config.redirectUri,
  });

  const url = `https://www.canva.com/api/oauth/authorize?${params.toString()}`;

  // ─── DIAGNOSTIC LOGGING ──────────────────────────────────────────────────
  console.log('━'.repeat(80));
  console.log('[canva:authorize] Building authorization URL');
  console.log('  client_id:                ' + config.clientId);
  console.log('  redirect_uri:             "' + config.redirectUri + '"');
  console.log('    .length:                ' + config.redirectUri.length);
  console.log('    trailing slash:         ' + (config.redirectUri.endsWith('/')));
  console.log('    hostname:               ' + new URL(config.redirectUri).hostname);
  console.log('    port:                   ' + new URL(config.redirectUri).port);
  console.log('    pathname:               ' + new URL(config.redirectUri).pathname);
  console.log('  code_challenge_method:    s256 (lowercase, per Canva docs)');
  console.log('  scope:                    ' + SCOPES);
  console.log('  state (first 12 chars):   ' + state.slice(0, 12) + '...');
  console.log('');
  console.log('  >>> COPY THIS EXACT redirect_uri INTO CANVA PORTAL <<<');
  console.log('  >>> https://www.canva.com/developers/integrations <<<');
  console.log('  >>> integration → Authentication → Authorized redirects <<<');
  console.log('  >>> Must match BYTE FOR BYTE: "' + config.redirectUri + '" <<<');
  console.log('━'.repeat(80));

  return { url, state };
}

// ============================================================================
// TOKEN EXCHANGE
// ============================================================================

export interface CanvaTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  obtainedAt: number; // unix epoch ms
}

export async function exchangeCodeForTokens(
  code: string,
  state: string
): Promise<CanvaTokens> {
  const config = getCanvaConfig();

  console.log('━'.repeat(80));
  console.log('[canva:token-exchange] Exchanging code for tokens');
  console.log('  state (first 12):        ' + state.slice(0, 12) + '...');
  console.log('  code (first 12):         ' + code.slice(0, 12) + '...');

  const pkceEntry = pkceStore.get(state);
  if (!pkceEntry) {
    console.error('[canva:token-exchange] FAILURE: state not found in PKCE store');
    console.error('  Possible causes:');
    console.error('    1. State expired (>10 min since authorize)');
    console.error('    2. Server restarted between authorize and callback');
    console.error('    3. State value tampered with');
    throw new Error('PKCE state not found — re-initiate connection from the portal');
  }

  pkceStore.delete(state); // single-use

  // CRITICAL: Canva requires HTTP Basic auth on the token endpoint.
  // The credentials format is base64({client_id}:{client_secret}).
  // Sending client_id and client_secret in the body does NOT work.
  const basicAuth = Buffer.from(
    `${config.clientId}:${config.clientSecret}`
  ).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: pkceEntry.codeVerifier,
    redirect_uri: config.redirectUri,
  });

  console.log('  Sending POST to https://api.canva.com/rest/v1/oauth/token');
  console.log('  Authorization:           Basic <base64-encoded credentials>');
  console.log('  Content-Type:            application/x-www-form-urlencoded');
  console.log('  grant_type:              authorization_code');
  console.log('  redirect_uri:            "' + config.redirectUri + '"');
  console.log('  code_verifier length:    ' + pkceEntry.codeVerifier.length);

  const res = await fetch('https://api.canva.com/rest/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const responseText = await res.text();
  console.log('  Response status:         ' + res.status);
  console.log('  Response body (first 500):');
  console.log('    ' + responseText.slice(0, 500));
  console.log('━'.repeat(80));

  if (!res.ok) {
    throw new CanvaTokenError(res.status, responseText);
  }

  const json = JSON.parse(responseText) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    obtainedAt: Date.now(),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<CanvaTokens> {
  const config = getCanvaConfig();

  const basicAuth = Buffer.from(
    `${config.clientId}:${config.clientSecret}`
  ).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch('https://api.canva.com/rest/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new CanvaTokenError(res.status, text);
  }

  const json = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    obtainedAt: Date.now(),
  };
}

// ============================================================================
// ASSET UPLOAD + DESIGN CREATION
// ============================================================================

export async function uploadAssetAndCreateDesign(
  pdfBuffer: Buffer,
  designTitle: string,
  accessToken: string
): Promise<{ designId: string; editUrl: string }> {
  // Step 1: upload the PDF as an asset
  const filenameBase64 = Buffer.from(`${designTitle}.pdf`).toString('base64');

  const uploadRes = await fetch('https://api.canva.com/rest/v1/asset-uploads', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Asset-Upload-Metadata': JSON.stringify({ name_base64: filenameBase64 }),
      'Content-Type': 'application/octet-stream',
    },
    body: pdfBuffer,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Asset upload failed (${uploadRes.status}): ${text}`);
  }

  const uploadJson = await uploadRes.json() as {
    job: { id: string; status: string; asset?: { id: string } };
  };

  // Step 2: poll until job succeeds
  let jobStatus = uploadJson.job.status;
  let assetId = uploadJson.job.asset?.id;
  let attempts = 0;

  while (jobStatus === 'in_progress' && attempts < 30) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
    const pollRes = await fetch(
      `https://api.canva.com/rest/v1/asset-uploads/${uploadJson.job.id}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    if (!pollRes.ok) throw new Error(`Asset poll failed: ${pollRes.status}`);
    const pollJson = await pollRes.json() as {
      job: { status: string; asset?: { id: string } };
    };
    jobStatus = pollJson.job.status;
    assetId = pollJson.job.asset?.id;
  }

  if (jobStatus !== 'success' || !assetId) {
    throw new Error(`Asset upload did not succeed: status=${jobStatus}`);
  }

  // Step 3: create design from asset
  const designRes = await fetch('https://api.canva.com/rest/v1/designs', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      design_type: { type: 'preset', name: 'Letter' },
      asset_id: assetId,
      title: designTitle,
    }),
  });

  if (!designRes.ok) {
    const text = await designRes.text();
    throw new Error(`Design creation failed (${designRes.status}): ${text}`);
  }

  const designJson = await designRes.json() as {
    design: { id: string; urls: { edit_url: string } };
  };

  return {
    designId: designJson.design.id,
    editUrl: designJson.design.urls.edit_url,
  };
}

// ============================================================================
// ERRORS
// ============================================================================

export class CanvaTokenError extends Error {
  constructor(public status: number, public responseBody: string) {
    super(`Canva token endpoint returned ${status}: ${responseBody.slice(0, 200)}`);
    this.name = 'CanvaTokenError';
  }
}
