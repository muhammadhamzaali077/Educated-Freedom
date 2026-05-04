# Phase 22 — Layout Consistency + Canva 403 Diagnosis

Two coordinated fixes. One is code (layout uniformity), one is configuration
(Canva integration status).

---

## Issue 1 — Lopsided TCCs because of stale saved layouts

The Lipski TCC has 3 NR accounts. With Phase 21's symmetric default fill
they should land at:

- `nr-l-1` (row 1 outer left) — Schwab One ✓
- `nr-r-1` (row 1 outer right) — Stock Plan ✓
- `nr-l-2` (row 1 inner left) — Private Reserve

Instead, Private Reserve is rendering on **row 2 left**. That can only happen
if there's a `bubble_layouts` row in the database for the Lipski TCC pinning
Private Reserve's accountId to a slot that maps to row 2 in the new geometry.

Phase 21 changed the NR slot grid from 3 rows × 4 cols (12 slots) to 2 rows
× 4 cols (8 slots), but didn't migrate existing layout rows. Saved layouts
from before Phase 21 reference slot IDs whose physical positions changed.

### The fix

A one-time database migration that clears all `bubble_layouts` rows for
TCC reports. After clearing, every TCC household will use the deterministic
default fill order — same shape across all clients with the same number of
accounts. New drag-saves will write to the new slot grid.

This is destructive but safe: the synthetic data has no manually-saved
layouts that need to be preserved. If the team has manually arranged Cole or
Lipski's layout, that arrangement gets reset to default. Given the layout
problems we've been chasing, that's a feature.

### Migration script

Save as `src/db/migrations/phase22-clear-tcc-layouts.ts`:

```ts
/**
 * Phase 22 migration — clears stale TCC bubble_layouts rows.
 *
 * Phase 21 changed the NR slot grid from 12 slots to 8. Saved layouts from
 * before Phase 21 reference slot IDs (nr-l-5, nr-l-6, nr-r-5, nr-r-6) whose
 * physical positions no longer exist, OR they pin accounts to row 2 in the
 * old geometry which is now row 2 in a different position.
 *
 * Clearing TCC layouts forces every report to use the deterministic
 * default fill, which gives consistent shape across all households.
 *
 * Idempotent — safe to run multiple times.
 */
import { eq } from 'drizzle-orm';
import { db } from '../client.js';
import { bubbleLayouts } from '../schema.js';

async function main() {
  const cleared = await db
    .delete(bubbleLayouts)
    .where(eq(bubbleLayouts.reportType, 'TCC'))
    .returning({ id: bubbleLayouts.id, clientId: bubbleLayouts.clientId });

  console.log(`[migration:phase22] Cleared ${cleared.length} TCC bubble_layouts rows:`);
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
```

Add to `package.json` scripts:

```json
"db:migrate:phase22": "tsx src/db/migrations/phase22-clear-tcc-layouts.ts"
```

Run once: `pnpm db:migrate:phase22`. Reload any TCC report — Lipski's
Private Reserve will now be in row 1 inner left, not row 2.

### Belt-and-suspenders fix in render.ts

Even with the migration, defensive code in the renderer prevents future
desync. Open `src/reports/tcc/render.ts` and find this block (around line
540 in the Phase 21 version):

```ts
const nrBubbles = s.nonRetirementBubbles
  .map((b) => {
    const a = layout.nonRetirementSlots[b.slotId];
    if (!a) return '';
    return bubbleContent(b, a, debug);
  })
  .join('');
```

Replace with this version that auto-remaps to the default fill order when
the saved slotId is invalid:

```ts
// Phase 22 — if a bubble's saved slotId doesn't exist in the current grid
// (e.g. nr-l-5 from before the Phase 21 slot reduction), remap to the
// next available default slot. Prevents lopsided rendering after
// schema changes.
const NR_DEFAULT_FILL = [
  'nr-l-1', 'nr-r-1', 'nr-l-2', 'nr-r-2',
  'nr-l-3', 'nr-r-3', 'nr-l-4', 'nr-r-4',
];

const nrBubbles = (() => {
  const usedSlots = new Set<string>();
  // First pass: keep bubbles with valid saved slotIds
  const placed = s.nonRetirementBubbles.map((b) => {
    const a = layout.nonRetirementSlots[b.slotId];
    if (a) {
      usedSlots.add(b.slotId);
      return { bubble: b, anchor: a };
    }
    return { bubble: b, anchor: null as CircleAnchor | null };
  });
  // Second pass: place bubbles with invalid slotIds into the next free
  // default slot
  for (const item of placed) {
    if (item.anchor !== null) continue;
    const freeSlot = NR_DEFAULT_FILL.find(
      (slotId) => !usedSlots.has(slotId) && layout.nonRetirementSlots[slotId],
    );
    if (freeSlot) {
      item.anchor = layout.nonRetirementSlots[freeSlot]!;
      usedSlots.add(freeSlot);
    }
  }
  return placed
    .filter((item) => item.anchor !== null)
    .map((item) => bubbleContent(item.bubble, item.anchor!, debug))
    .join('');
})();
```

Same pattern for `s.retirementBubbles` (with `RET_DEFAULT_FILL` listing
`p1-1..p1-6` for spouse 1, `p2-1..p2-6` for spouse 2 — the bubble's
`accountId` already encodes which spouse owns it via the existing
`person_index` field; route bubbles into the appropriate spouse's slots
based on whether the bubble's saved slotId starts with `p1-` or `p2-`).

This makes the renderer self-healing: even if a future schema change leaves
stale slot IDs in the DB, the report still renders symmetrically.

### Verification after migration

1. Run `pnpm db:migrate:phase22`
2. Hard-refresh each TCC:
   - **Cole** (3 retirement, 2 NR) — both NR bubbles in row 1, one per side
   - **Lipski** (4 retirement, 3 NR) — Schwab One row 1 outer left, Stock
     Plan row 1 outer right, Private Reserve row 1 inner left, NR row 2
     completely empty
   - **Park-Rivera** (7 retirement, 5 NR) — row 1 fully filled (4 cols),
     row 2 has 1 bubble in `nr-l-1` position (outer left)
3. Drag any bubble in Edit Layout → release on a different slot → reload.
   The new position should persist. The layout for OTHER households should
   not be affected.

---

## Issue 2 — Canva 403 Forbidden after OAuth

Significant progress: OAuth now completes (no more redirect URI errors,
PKCE works, `s256` lowercase is in flight). The 403 happens at API call
time, not auth time.

The error code `9f617e308b04ce8b-SIN` is a Canva trace ID. Almost certain
cause: **the integration is in "Draft" status** and Draft integrations have
restrictions on which API endpoints they can call against external accounts.

Your earlier screenshot of the Canva Authentication page shows
"educated_freedom **Draft**" in the upper-left under the integration name.

### Three options, in order of preference

**Option A — Submit the integration for review (becomes Public)**

Suitable for: Production use across multiple advisor accounts later.

1. Open https://www.canva.com/developers/integrations
2. Click into educated_freedom
3. Left sidebar → **Submit for review**
4. Fill out: integration name, description, support email, screenshots
   (a couple of dashboard screenshots are fine), category
5. Submit. Canva reviews in 5–10 business days
6. Once approved, the integration goes Public — full API access

This is the path to ship. Probably want to do this anyway given Andrew's
team plans to use Canva exports as part of client deliverables.

**Option B — Convert to Private + Enterprise (faster, but requires plan upgrade)**

Suitable for: Immediate access without review.

1. The Canva account hosting `educated_freedom` needs to be on **Canva
   Enterprise** plan
2. Settings → Integration type → change to Private
3. Private integrations skip Canva review and work immediately for the
   Enterprise team's accounts only

Cost trade-off: Canva Enterprise pricing isn't published — usually quoted
per seat. May not make sense for a 3-person team.

**Option C — Use the integration as-is in Development mode (limited)**

Suitable for: Demo / prototype testing only.

1. Confirm the integration is still in Draft (not Public, not Private)
2. The Canva account that *owns* the integration can use it without
   restrictions for development testing
3. Other Canva accounts (different login) hit the 403 you're seeing

Practical implication: only the Canva account that registered the
integration can authorize and use it. If Andrew wants any other team
member to also use Canva export, they'd need to log into the same Canva
account.

### Code-side check before declaring Canva blocked

Before assuming Option A/B is required, capture the FULL Canva error
response body. The 403 page in your screenshot is a generic Canva web
page — but the actual API call returns a JSON body with a specific reason.

Look in your server logs after clicking "Export to Canva". The Phase 11
diagnostic logging in `src/lib/canva.ts` will print:

```
[canva:XXXXXXXX] ← 403 {
  contentType: "application/json...",
  body: "{\"error\":\"...\",\"error_description\":\"...\"}"
}
```

The `error` field tells us which restriction was hit:

| Canva error | Meaning | Fix |
|---|---|---|
| `permission_denied` | Integration draft, account can't use endpoint | Submit for review (Option A) |
| `insufficient_scope` | Missing scope at OAuth time | Re-authorize with full scopes (in `src/lib/canva.ts` SCOPES const) |
| `quota_exceeded` | Free tier rate limit | Upgrade Canva account |
| `feature_not_enabled` | API not enabled for this account type | Submit for review or upgrade |

Send me that full log block. If the error is `permission_denied`, Option
A is the only path. If it's `insufficient_scope`, we add the missing
scope — that's a 1-line code fix.

---

## Where the report saves in Canva (your earlier question)

Once Canva access is unlocked, exports land in:
- Canva web → "Recent designs" or "Your designs"
- Direct URL via the portal's "View in Canva →" link (saved per export
  in the `reports.canva_edit_url` column)

If you want exports organized into a specific folder (e.g., "Windbrook
Reports / 2026 Q1 / Lipski Family"), say so and I'll add folder support
in a future phase. The Canva API supports `folder_id` on the design
create call.

---

## To apply Phase 22

```bash
# 1. Code-side belt-and-suspenders fix in the renderer
cp patches/render.ts src/reports/tcc/render.ts

# 2. Database migration to clear stale TCC layouts
cp patches/phase22-clear-tcc-layouts.ts src/db/migrations/
# Add the script entry to package.json (see above)
pnpm db:migrate:phase22

# 3. Restart server and hard-refresh browser
pnpm dev
```

For Canva: capture the next 403's full error response from the server log
and send it. Diagnosis-first is faster than guessing the right fix.
