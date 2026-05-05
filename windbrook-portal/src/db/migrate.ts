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
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const url = process.env.DATABASE_URL ?? 'file:./data/portal.db';
const rawPath = url.replace(/^file:/, '');
const dbPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(rawPath);

// Migrations live next to this file under `src/db/migrations/`. Resolve via
// import.meta.url so it works whether invoked via tsx (source) or after a
// future `tsc` compile (dist/db/).
const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(here, 'migrations');

console.log('[migrate] db path:           ', dbPath);
console.log('[migrate] migrations folder: ', migrationsFolder);

// Production fix — see comment in src/db/client.ts. Railway mounts the
// volume but the parent dir may not exist on first deploy.
mkdirSync(path.dirname(dbPath), { recursive: true });

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
