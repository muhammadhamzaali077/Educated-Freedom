import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

const url = process.env.DATABASE_URL ?? 'file:./data/portal.db';
// Strip optional `file:` prefix and resolve relative paths against the
// process CWD so log output shows the absolute path the kernel will see.
const rawPath = url.replace(/^file:/, '');
const dbPath = isAbsolute(rawPath) ? rawPath : resolve(rawPath);

// Production fix — Railway mounts the volume but the parent directory may
// not exist on first deploy (mount is empty by default). better-sqlite3
// raises SQLITE_CANTOPEN when the parent dir is missing. mkdirSync with
// `recursive: true` is idempotent and cheap.
mkdirSync(dirname(dbPath), { recursive: true });

export const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;
