/**
 * Seed the three internal users. Idempotent — safe to run on every container
 * boot. The package.json `start` script chains this between `migrate` and
 * the server, so a fresh Railway volume gets users created on first deploy
 * and subsequent deploys are no-ops.
 *
 * Password source (in priority order):
 *   1. `WINDBROOK_SEED_PASSWORD` env var (recommended for production)
 *   2. `WindbrookDev2026!` dev fallback — emits a loud warning when used
 *
 * Sets WINDBROOK_ALLOW_SIGNUP=true before importing auth so the better-auth
 * signup route is reachable for this script even when the public signup is
 * disabled in normal server runs (ESM hoists static imports, hence the
 * dynamic `await import` chain).
 */
import 'dotenv/config';

process.env.WINDBROOK_ALLOW_SIGNUP = 'true';

const { eq } = await import('drizzle-orm');
const { auth } = await import('../auth/index.js');
const { db } = await import('./client.js');
const { user: userTable } = await import('./schema.js');

const DEV_FALLBACK_PASSWORD = 'WindbrookDev2026!';
const SEED_PASSWORD = process.env.WINDBROOK_SEED_PASSWORD ?? DEV_FALLBACK_PASSWORD;
const usingDevFallback = SEED_PASSWORD === DEV_FALLBACK_PASSWORD;

const SEED_USERS = [
  { email: 'andrew@windbrook.dev', name: 'Andrew Windham', role: 'founder' },
  { email: 'rebecca@windbrook.dev', name: 'Rebecca Romney', role: 'advisor' },
  { email: 'maryann@windbrook.dev', name: 'Maryann Pastrana', role: 'operations' },
] as const;

if (usingDevFallback) {
  console.warn('[seed] ⚠  WINDBROOK_SEED_PASSWORD not set — using dev fallback "WindbrookDev2026!"');
  console.warn('[seed] ⚠  Rotate before production: set WINDBROOK_SEED_PASSWORD in Railway env vars,');
  console.warn('[seed] ⚠  or have each user reset their password via the auth flow once seeded.');
} else {
  console.log('[seed] using WINDBROOK_SEED_PASSWORD from env');
}

let inserted = 0;
let skipped = 0;

for (const u of SEED_USERS) {
  const existing = await db.select().from(userTable).where(eq(userTable.email, u.email)).limit(1);
  if (existing.length > 0) {
    console.log(`[seed] ✓ ${u.email} already exists, skipping`);
    skipped++;
    continue;
  }

  try {
    await auth.api.signUpEmail({
      body: { email: u.email, password: SEED_PASSWORD, name: u.name },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[seed] ✗ ${u.email} — ${message}`);
    continue;
  }

  await db.update(userTable).set({ role: u.role }).where(eq(userTable.email, u.email));
  console.log(`[seed] ✓ ${u.email} (${u.role}) created`);
  inserted++;
}

if (inserted === 0 && skipped > 0) {
  console.log(`[seed] all ${skipped} users already exist`);
} else if (inserted > 0) {
  console.log(`[seed] created ${inserted} users (${skipped} already existed)`);
} else {
  console.warn('[seed] no users inserted or found — check log for failures');
}

process.exit(0);
