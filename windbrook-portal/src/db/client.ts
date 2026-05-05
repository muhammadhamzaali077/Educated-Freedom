import 'dotenv/config';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

// =============================================================================
// Phase 24 — db init diagnostics
// =============================================================================
// SQLITE_CANTOPEN at startup means one of: the parent dir is missing, the
// volume mount path is wrong, the env var doesn't point where the operator
// thinks it does, or filesystem perms are wrong. Print every fact the
// kernel sees BEFORE calling new Database() so the next failure tells us
// exactly which of the four it is.
const rawEnvUrl = process.env.DATABASE_URL;
const url = rawEnvUrl ?? 'file:./data/portal.db';
const rawPath = url.replace(/^file:/, '');
const dbPath = isAbsolute(rawPath) ? rawPath : resolve(rawPath);
const parentDir = dirname(dbPath);

console.log('[db] DATABASE_URL env =', rawEnvUrl ?? '(unset, defaulting to file:./data/portal.db)');
console.log('[db] resolved db path =', dbPath);
console.log('[db] parent dir       =', parentDir);
console.log('[db] parent exists?   =', existsSync(parentDir));

try {
  mkdirSync(parentDir, { recursive: true });
  console.log('[db] mkdir OK');
} catch (err) {
  console.error('[db] mkdir FAILED:', err);
}

// Active write test — proves the mount is writable from this process. If
// this fails, the volume is read-only or the user/group running node
// doesn't have write perms on the mount point.
try {
  const testFile = join(parentDir, '.write-test');
  writeFileSync(testFile, 'test');
  unlinkSync(testFile);
  console.log('[db] write test OK at', testFile);
} catch (err) {
  console.error('[db] write test FAILED:', err);
}

console.log('[db] opening Database at', dbPath);
export const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;
