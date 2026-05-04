/**
 * pnpm db:seed — inserts the three internal users.
 * Sets WINDBROOK_ALLOW_SIGNUP before importing auth (via dynamic import,
 * because ESM hoists static imports), so the public signup route stays
 * disabled in normal server runs but is open for this script.
 */
import 'dotenv/config';

process.env.WINDBROOK_ALLOW_SIGNUP = 'true';

const { eq } = await import('drizzle-orm');
const { auth } = await import('../auth/index.js');
const { db } = await import('./client.js');
const { user: userTable } = await import('./schema.js');

const SEED_PASSWORD = 'WindbrookDev2026!';

const SEED_USERS = [
  { email: 'andrew@windbrook.dev', name: 'Andrew Windham', role: 'founder' },
  { email: 'rebecca@windbrook.dev', name: 'Rebecca Romney', role: 'advisor' },
  { email: 'maryann@windbrook.dev', name: 'Maryann Pastrana', role: 'operations' },
] as const;

console.warn('');
console.warn('  ⚠  Default seed password: "WindbrookDev2026!"');
console.warn('  ⚠  ROTATE BEFORE ANY DEPLOYMENT — manual reset by admin.');
console.warn('');

let inserted = 0;
let skipped = 0;

for (const u of SEED_USERS) {
  const existing = await db.select().from(userTable).where(eq(userTable.email, u.email)).limit(1);
  if (existing.length > 0) {
    console.log(`  ✓  ${u.email}  already seeded`);
    skipped++;
    continue;
  }

  try {
    await auth.api.signUpEmail({
      body: { email: u.email, password: SEED_PASSWORD, name: u.name },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✗  ${u.email} — ${message}`);
    continue;
  }

  await db.update(userTable).set({ role: u.role }).where(eq(userTable.email, u.email));
  console.log(`  ✓  ${u.email}  (${u.role})`);
  inserted++;
}

console.log('');
console.log(`  ${inserted} inserted, ${skipped} skipped.`);
console.log('');
process.exit(0);
