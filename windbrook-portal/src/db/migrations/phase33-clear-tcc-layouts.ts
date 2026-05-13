/**
 * Phase 33 migration — clears stale TCC bubble_layouts rows.
 *
 * Phase 33 restructured the TCC slot grid:
 *   old: p1-1..6, p2-1..6, nr-l-1..4, nr-r-1..4
 *   new: qualified-left-1..2 (+ optional 3), qualified-right-1..2 (+ 3),
 *        non-qualified-left-1..3, non-qualified-right-1..3
 *
 * Saved layouts referencing the old IDs would all fall through to the
 * renderer's self-healing fallback, producing the same default symmetric
 * placement anyway. Clearing them makes the on-disk state match what's
 * actually rendered and avoids the self-heal log noise.
 *
 * Idempotent — safe to re-run. Invoke with:
 *   pnpm db:migrate:phase33
 */
import { eq } from 'drizzle-orm';
import { db } from '../client.js';
import { bubbleLayouts } from '../schema.js';

async function main() {
  const cleared = await db
    .delete(bubbleLayouts)
    .where(eq(bubbleLayouts.reportType, 'TCC'))
    .returning({ id: bubbleLayouts.id, clientId: bubbleLayouts.clientId });

  console.log(`[migration:phase33] Cleared ${cleared.length} TCC bubble_layouts rows`);
  for (const row of cleared) {
    console.log(`  client=${row.clientId} layoutId=${row.id}`);
  }
  console.log('[migration:phase33] Done. All TCC reports now use Phase-33 symmetric default fill.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[migration:phase33] FAILED:', err);
  process.exit(1);
});
