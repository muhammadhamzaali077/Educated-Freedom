/**
 * AES-GCM symmetric encryption keyed off BETTER_AUTH_SECRET. Used for
 * Canva OAuth tokens at rest. The output format prepends the 12-byte IV
 * before the ciphertext + auth tag, base64url-encoded.
 *
 * Implementation note: uses crypto.subtle (WebCrypto) per the brief. Node
 * 20+ exposes it via webcrypto.
 */
import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

let _keyPromise: Promise<CryptoKey> | null = null;

async function getKey(): Promise<CryptoKey> {
  if (_keyPromise) return _keyPromise;
  _keyPromise = (async () => {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret || secret === 'dev-secret-rotate-before-deploy') {
      console.warn('[encryption] using dev-fallback secret — set BETTER_AUTH_SECRET in .env');
    }
    const seed = await subtle.digest('SHA-256', enc.encode(secret ?? 'dev-secret'));
    return subtle.importKey('raw', seed, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  })();
  return _keyPromise;
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function fromBase64Url(s: string): Uint8Array {
  return Uint8Array.from(Buffer.from(s, 'base64url'));
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const cipher = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  const cipherBytes = new Uint8Array(cipher);
  const out = new Uint8Array(iv.length + cipherBytes.length);
  out.set(iv, 0);
  out.set(cipherBytes, iv.length);
  return toBase64Url(out);
}

export async function decrypt(token: string): Promise<string> {
  const key = await getKey();
  const buf = fromBase64Url(token);
  if (buf.length < 13) throw new Error('encrypted token too short');
  const iv = buf.subarray(0, 12);
  const ct = buf.subarray(12);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return dec.decode(plain);
}
