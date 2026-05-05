/**
 * Drizzle migration runner — invoked at container start before the server
 * boots. Applies any pending SQL migrations from `src/db/migrations/`
 * against the SQLite database at `DATABASE_URL` (or the default
 * `file:./data/portal.db`).
 *
 * Idempotent: drizzle's migrate() reads `_journal.json` from the migrations
 * folder, compares it to the `__drizzle_migrations` tracking table inside
 * the database, and applies only the diff. Re-running is a no-op once all
 * migrations are recorded.
 *
 * Wired in package.json `start` so Railway runs it on every boot. Without
 * this, deploying new schema (e.g. the `primary_monthly_inflow` column on
 * client_persons added after the volume DB was initialised) leaves the
 * persistent volume's DB at the old schema and the server crashes with
 * `SqliteError: no such column: primary_monthly_inflow` on the first query.
 */
import 'dotenv/config';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const rawEnvUrl = process.env.DATABASE_URL;
const url = rawEnvUrl ?? 'file:./data/portal.db';
const rawPath = url.replace(/^file:/, '');
const dbPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(rawPath);
const parentDir = path.dirname(dbPath);

// Migrations live next to this file under `src/db/migrations/`. Resolve via
// import.meta.url so it works whether invoked via tsx (source) or after a
// future `tsc` compile (dist/db/).
const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(here, 'migrations');

// Phase 24 — diagnostic block matching src/db/client.ts. Migrations run
// FIRST per the start script, so this is the earliest point in the
// container's life that we touch the SQLite path.
console.log('[migrate] DATABASE_URL env =', rawEnvUrl ?? '(unset, defaulting to file:./data/portal.db)');
console.log('[migrate] resolved db path =', dbPath);
console.log('[migrate] parent dir       =', parentDir);
console.log('[migrate] parent exists?   =', existsSync(parentDir));
console.log('[migrate] migrations folder=', migrationsFolder);

try {
  mkdirSync(parentDir, { recursive: true });
  console.log('[migrate] mkdir OK');
} catch (err) {
  console.error('[migrate] mkdir FAILED:', err);
}

try {
  const testFile = path.join(parentDir, '.write-test');
  writeFileSync(testFile, 'test');
  unlinkSync(testFile);
  console.log('[migrate] write test OK at', testFile);
} catch (err) {
  console.error('[migrate] write test FAILED:', err);
}

console.log('[migrate] opening Database at', dbPath);
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite);

const t0 = Date.now();
try {
  migrate(db, { migrationsFolder });
  console.log(`[migrate] ✓ migrations applied in ${Date.now() - t0}ms`);
} catch (err) {
  console.error('[migrate] ✗ migrations FAILED:', err);
  sqlite.close();
  process.exit(1);
}

sqlite.close();
process.exit(0);
