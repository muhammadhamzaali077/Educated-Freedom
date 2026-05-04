/**
 * Phase 22 migration — clears stale TCC bubble_layouts rows.
 *
 * Phase 21 changed the NR slot grid from 12 slots to 8. Saved layouts from
 * before Phase 21 reference slot IDs (nr-l-5, nr-l-6, nr-r-5, nr-r-6) that
 * no longer exist in the layout grid, OR they pin accounts to row 2 in the
 * old geometry which is now in a different position.
 *
 * Clearing TCC layouts forces every report to use the deterministic
 * default fill, which gives consistent shape across all households.
 *
 * Idempotent — safe to run multiple times. Run with:
 *   pnpm db:migrate:phase22
 *
 * After this migration, the renderer's self-healing slot remap (Phase 22)
 * also kicks in for any new stale layouts that get saved later.
 */
import { eq } from 'drizzle-orm';
import { db } from '../client.js';
import { bubbleLayouts } from '../schema.js';

async function main() {
  const cleared = await db
    .delete(bubbleLayouts)
    .where(eq(bubbleLayouts.reportType, 'TCC'))
    .returning({ id: bubbleLayouts.id, clientId: bubbleLayouts.clientId });

  console.log(`[migration:phase22] Cleared ${cleared.length} TCC bubble_layouts rows`);
  for (const row of cleared) {
    console.log(`  client=${row.clientId} layoutId=${row.id}`);
  }
  console.log(`[migration:phase22] Done. All TCC reports now use default fill.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[migration:phase22] FAILED:', err);
  process.exit(1);
});
