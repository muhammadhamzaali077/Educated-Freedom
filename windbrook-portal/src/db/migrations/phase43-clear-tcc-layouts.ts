/**
 * Phase 43 migration — clears TCC bubble_layouts rows.
 *
 * Phase 43 replaced the fixed slot grid with column zones + dynamic
 * distribution (see src/reports/tcc/render.ts). The renderer now reads
 * only the slotId's side prefix; the numeric suffix is informational.
 * Any saved layout written before Phase 43 still points at the OLD
 * fixed slot positions, which no longer exist. Clearing them makes the
 * on-disk state match the new default render and avoids confusion if
 * Phase 44 brings drag-and-drop back online.
 *
 * Idempotent — safe to re-run. Invoke with:
 *   pnpm exec tsx src/db/migrations/phase43-clear-tcc-layouts.ts
 */
import { eq } from 'drizzle-orm';
import { db } from '../client.js';
import { bubbleLayouts } from '../schema.js';

async function main() {
  const cleared = await db
    .delete(bubbleLayouts)
    .where(eq(bubbleLayouts.reportType, 'TCC'))
    .returning({ id: bubbleLayouts.id, clientId: bubbleLayouts.clientId });

  console.log(`[migration:phase43] Cleared ${cleared.length} TCC bubble_layouts rows`);
  for (const row of cleared) {
    console.log(`  client=${row.clientId} layoutId=${row.id}`);
  }
  console.log('[migration:phase43] Done. All TCC reports now use the column-zone renderer.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[migration:phase43] FAILED:', err);
  process.exit(1);
});
