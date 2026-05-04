/**
 * Canva Connect API client (Phase 11 rewrite).
 *
 * PKCE is required by Canva's Connect API — Phase 8's implementation skipped
 * it, which produced opaque 400s. The asset-upload + design-create flow
 * replaces /v1/imports (which is gated to certain tiers and was the second
 * failure mode). Tokens AES-GCM encrypted at rest via src/lib/encryption.ts.
 */
import { webcrypto } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { canvaCredentials } from '../db/schema.js';
import { decrypt, encrypt } from './encryption.js';

// =============================================================================
// Endpoints, scopes, timeouts
// =============================================================================
const AUTHORIZE_URL = 'https://www.canva.com/api/oauth/authorize';
const TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';
const API_BASE = 'https://api.canva.com/rest/v1';

const SCOPES = [
  'asset:read',
  'asset:write',
  'design:content:read',
  'design:content:write',
  'design:meta:read',
];

const REQUEST_TIMEOUT_MS = 30_000;
const POLL_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_500;
const REFRESH_BUFFER_MS = 60_000;

// =============================================================================
// Types + errors
// =============================================================================
export interface CanvaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  /** When the tokens were issued — used by the dev token-status view. */
  obtainedAt: Date;
  scope: string | null;
}

export class CanvaApiError extends Error {
  constructor(
    public status: number,
    public bodyText: string,
    public url: string,
    public method: string,
  ) {
    super(`Canva API ${status} on ${method} ${url}: ${bodyText.slice(0, 240)}`);
    this.name = 'CanvaApiError';
  }
}

export class CanvaConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanvaConnectionError';
  }
}

// =============================================================================
// PKCE
// =============================================================================
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  webcrypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await webcrypto.subtle.digest('SHA-256', data);
  return Buffer.from(new Uint8Array(hash)).toString('base64url');
}

// =============================================================================
// Diagnostic request wrapper
// =============================================================================
type CanvaRequestInit = Omit<RequestInit, 'body'> & {
  json?: unknown;
  body?: BodyInit | null;
};

async function canvaRequest<T = unknown>(
  method: string,
  url: string,
  init: CanvaRequestInit = {},
): Promise<T> {
  const requestId = webcrypto.randomUUID().slice(0, 8);

  const finalInit: RequestInit = { method, ...init };
  if (init.json !== undefined) {
    const headers = new Headers((init.headers as HeadersInit | undefined) ?? {});
    headers.set('Content-Type', 'application/json');
    finalInit.headers = headers;
    finalInit.body = JSON.stringify(init.json);
  }

  console.log(`[canva:${requestId}] → ${method} ${url}`, {
    headers: scrubHeaders(finalInit.headers),
    bodyKind: detectBodyKind(finalInit.body),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { ...finalInit, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[canva:${requestId}] ✗ network error`, msg);
    throw new CanvaApiError(0, msg, url, method);
  }
  clearTimeout(timer);

  const bodyText = await res.text();
  console.log(`[canva:${requestId}] ← ${res.status}`, {
    contentType: res.headers.get('content-type'),
    body: bodyText.slice(0, 1000),
  });

  if (!res.ok) {
    throw new CanvaApiError(res.status, bodyText, url, method);
  }

  if (!bodyText) return null as T;
  try {
    return JSON.parse(bodyText) as T;
  } catch {
    return bodyText as unknown as T;
  }
}

function scrubHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  const apply = (k: string, v: string) => {
    const lower = k.toLowerCase();
    if (lower === 'authorization') {
      out[k] = v.startsWith('Bearer ') ? 'Bearer ***' : v.startsWith('Basic ') ? 'Basic ***' : '***';
    } else {
      out[k] = v;
    }
  };
  if (headers instanceof Headers) {
    headers.forEach((v, k) => apply(k, v));
  } else if (Array.isArray(headers)) {
    for (const [k, v] of headers) apply(k, v);
  } else {
    for (const [k, v] of Object.entries(headers)) apply(k, String(v));
  }
  return out;
}

function detectBodyKind(body: unknown): string {
  if (body == null) return 'none';
  if (body instanceof FormData) return 'multipart';
  if (typeof body === 'string') return 'string';
  if (body instanceof Blob) return 'blob';
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return 'binary';
  return typeof body;
}

// =============================================================================
// OAuth
// =============================================================================
export function isConfigured(): boolean {
  return Boolean(process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET);
}

/**
 * Phase 18 — locked redirect-URI source. Single helper that:
 *   1. Throws if the env var is missing (no silent localhost fallback).
 *   2. Validates the hostname is 127.0.0.1 OR a real domain (rejects
 *      'localhost', empty, ip, etc.).
 *   3. Strips any trailing slash. Canva treats `…/callback` and
 *      `…/callback/` as distinct registrations — one of those will not
 *      match what we send.
 *
 * Every Canva call site (authorize URL, token exchange, refresh) MUST go
 * through this. `process.env.CANVA_REDIRECT_URI` is no longer read directly
 * anywhere else in the file. If you find a bare `process.env.CANVA_REDIRECT_URI`
 * outside this function, route it through here.
 */
export function getCanvaRedirectUri(): string {
  const value = process.env.CANVA_REDIRECT_URI;
  if (!value) {
    throw new Error('CANVA_REDIRECT_URI is not set in environment');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`CANVA_REDIRECT_URI is not a valid URL: "${value}"`);
  }
  const isIp4 = url.hostname === '127.0.0.1';
  const isDomain = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(url.hostname);
  if (!isIp4 && !isDomain) {
    throw new Error(
      `CANVA_REDIRECT_URI hostname is invalid: "${url.hostname}". Use 127.0.0.1 for local or a real domain for production. Canva does NOT accept 'localhost'.`,
    );
  }
  return value.replace(/\/$/, '');
}

// Internal alias kept for the rest of this file (so the diff to existing
// call sites stays small). All routes still flow through getCanvaRedirectUri.
function redirectUri(): string {
  return getCanvaRedirectUri();
}

function basicAuth(): string {
  const id = process.env.CANVA_CLIENT_ID ?? '';
  const secret = process.env.CANVA_CLIENT_SECRET ?? '';
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

export function getAuthorizeUrl(state: string, codeChallenge: string): string {
  const clientId = process.env.CANVA_CLIENT_ID;
  const ru = getCanvaRedirectUri(); // throws if invalid
  const scopeStr = SCOPES.join(' ');
  const parsed = new URL(ru);

  // Phase 18 diagnostic block — surfaces the byte-exact redirect_uri being
  // sent to Canva so the operator can paste-compare against the registered
  // URI in the developer portal.
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[canva:authorize] redirect_uri value being sent to Canva:');
  console.log(`   "${ru}"`);
  console.log('[canva:authorize] BYTE-FOR-BYTE COMPARISON:');
  console.log('   Length:', ru.length);
  console.log('   Has trailing slash:', ru.endsWith('/'));
  console.log('   Hostname:', parsed.hostname);
  console.log('   Port:', parsed.port);
  console.log('   Path:', parsed.pathname);
  console.log('');
  console.log('[canva:authorize] Operator: copy the quoted URI above and verify');
  console.log('   it appears EXACTLY in the Canva developer portal at:');
  console.log('   https://www.canva.com/developers/integrations → your integration');
  console.log('   → Authentication → Authorized redirects');
  console.log('');
  console.log('[canva:authorize] CANVA_CLIENT_ID env value:', clientId ? `${clientId.slice(0, 8)}...` : '!!! MISSING !!!');
  console.log('[canva:authorize] Scopes:', scopeStr);
  console.log('[canva:authorize] PKCE code_challenge:', `${codeChallenge.slice(0, 16)}...`);
  console.log('[canva:authorize] PKCE code_challenge length:', codeChallenge.length);
  console.log('[canva:authorize] code_challenge_method: s256 (lowercase — Phase 19 fix)');
  console.log('[canva:authorize] state:', state);

  // Phase 19 — code_challenge_method MUST be lowercase 's256' per Canva docs.
  // Uppercase 'S256' (the OAuth 2.0 / RFC 7636 spec form) is silently
  // rejected by Canva — the OAuth round-trip succeeds the redirect but
  // returns redirect-uri-mismatch / invalid_request errors. This was the
  // root cause of every Phase 8/12/15/17/18 OAuth failure that we kept
  // misdiagnosing as a redirect-URI registration issue. Source: the
  // Canva-generated example URL on https://www.canva.dev/docs/connect/
  // uses lowercase 's256'.
  const params = new URLSearchParams({
    client_id: clientId ?? '',
    redirect_uri: ru,
    response_type: 'code',
    scope: scopeStr,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 's256',
  });
  const url = `${AUTHORIZE_URL}?${params.toString()}`;
  console.log('[canva:authorize] Final authorize URL:');
  console.log(`   ${url}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return url;
}

export async function exchangeCode(code: string, codeVerifier: string): Promise<CanvaTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: codeVerifier,
  });
  const json = await canvaRequest<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
  }>('POST', TOKEN_URL, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(),
    },
    body: body.toString(),
  });
  const now = new Date();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(now.getTime() + json.expires_in * 1000),
    obtainedAt: now,
    scope: json.scope ?? null,
  };
}

export async function refreshTokens(refreshToken: string): Promise<CanvaTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPES.join(' '),
  });
  const json = await canvaRequest<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  }>('POST', TOKEN_URL, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(),
    },
    body: body.toString(),
  });
  const now = new Date();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: new Date(now.getTime() + json.expires_in * 1000),
    obtainedAt: now,
    scope: json.scope ?? null,
  };
}

// =============================================================================
// Token storage
// =============================================================================
export async function saveTokens(userId: string, tokens: CanvaTokens): Promise<void> {
  const accessTokenEncrypted = await encrypt(tokens.accessToken);
  const refreshTokenEncrypted = await encrypt(tokens.refreshToken);
  const existing = await db
    .select()
    .from(canvaCredentials)
    .where(eq(canvaCredentials.userId, userId))
    .limit(1);
  const row = {
    userId,
    accessTokenEncrypted,
    refreshTokenEncrypted,
    expiresAt: tokens.expiresAt,
    scope: tokens.scope,
    updatedAt: new Date(),
  };
  if (existing.length === 0) {
    await db.insert(canvaCredentials).values(row);
  } else {
    await db.update(canvaCredentials).set(row).where(eq(canvaCredentials.userId, userId));
  }
}

export async function loadTokens(userId: string): Promise<CanvaTokens | null> {
  const rows = await db
    .select()
    .from(canvaCredentials)
    .where(eq(canvaCredentials.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    accessToken: await decrypt(row.accessTokenEncrypted),
    refreshToken: await decrypt(row.refreshTokenEncrypted),
    expiresAt: row.expiresAt,
    obtainedAt: row.updatedAt,
    scope: row.scope,
  };
}

/**
 * Returns a usable access token. Refreshes 60 s before expiry. Returns null
 * if the user is not connected. Throws CanvaConnectionError if refresh fails
 * (refresh_token expired or revoked) so the route can prompt re-connect.
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const tokens = await loadTokens(userId);
  if (!tokens) return null;
  if (tokens.expiresAt.getTime() - REFRESH_BUFFER_MS > Date.now()) {
    return tokens.accessToken;
  }
  try {
    const refreshed = await refreshTokens(tokens.refreshToken);
    await saveTokens(userId, refreshed);
    return refreshed.accessToken;
  } catch (err) {
    if (err instanceof CanvaApiError && (err.status === 400 || err.status === 401)) {
      // refresh_token expired/revoked — drop the credential row so the UI
      // shows "Connect Canva" again.
      await db.delete(canvaCredentials).where(eq(canvaCredentials.userId, userId));
      throw new CanvaConnectionError('Canva connection expired — please reconnect.');
    }
    throw err;
  }
}

export async function disconnect(userId: string): Promise<void> {
  await db.delete(canvaCredentials).where(eq(canvaCredentials.userId, userId));
}

// =============================================================================
// Asset upload + design create
// =============================================================================
interface UploadJob {
  job: {
    id: string;
    status: 'in_progress' | 'success' | 'failed';
    asset?: { id: string; type?: string };
    error?: { code?: string; message?: string };
  };
}

interface DesignResponse {
  design: {
    id: string;
    title?: string;
    urls?: { edit_url?: string; view_url?: string };
    edit_url?: string;
  };
}

export async function exportToCanva(
  userId: string,
  pdfBytes: Buffer,
  filename: string,
): Promise<{ designId: string; editUrl: string }> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) throw new CanvaConnectionError('Canva not connected for this user.');

  const auth = `Bearer ${accessToken}`;

  // ---- 1. Asset upload (multipart) ----
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' }),
    filename,
  );

  const upload = await canvaRequest<UploadJob>('POST', `${API_BASE}/asset-uploads`, {
    headers: {
      Authorization: auth,
      'Asset-Upload-Metadata': JSON.stringify({
        name_base64: Buffer.from(filename).toString('base64'),
      }),
    },
    body: form,
  });

  // The upload response is sometimes already complete (small files) — short-circuit
  // when we already have an asset id, otherwise poll.
  let assetId =
    upload.job.status === 'success' && upload.job.asset?.id ? upload.job.asset.id : null;
  if (!assetId) {
    assetId = await pollAssetUpload(auth, upload.job.id);
  }

  // ---- 2. Create design ----
  const design = await canvaRequest<DesignResponse>('POST', `${API_BASE}/designs`, {
    headers: { Authorization: auth },
    json: {
      design_type: { type: 'preset', name: 'doc' },
      asset_id: assetId,
      title: filename,
    },
  });

  const editUrl =
    design.design.urls?.edit_url ??
    design.design.edit_url ??
    `https://www.canva.com/design/${design.design.id}/edit`;

  return { designId: design.design.id, editUrl };
}

async function pollAssetUpload(authHeader: string, jobId: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const j = await canvaRequest<UploadJob>('GET', `${API_BASE}/asset-uploads/${jobId}`, {
      headers: { Authorization: authHeader },
    });
    if (j.job.status === 'failed') {
      throw new Error(`Canva asset upload failed: ${j.job.error?.message ?? 'unknown'}`);
    }
    if (j.job.status === 'success' && j.job.asset?.id) return j.job.asset.id;
  }
  throw new Error(`Canva asset upload still processing after ${POLL_TIMEOUT_MS / 1000}s.`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
