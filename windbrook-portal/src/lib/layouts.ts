import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bubbleLayouts } from '../db/schema.js';
import type { AccountRow } from './clients.js';

/**
 * Layout JSON shape. Per CLAUDE.md §6 the renderer's *positions* are slot
 * anchors; the layout is just an account → slot mapping. SACS uses named
 * anchor positions (inflow/outflow/etc.) — for now those are not editable;
 * Phase 7 ships the TCC editor and stores SACS slots verbatim from defaults.
 */
export type ReportType = 'SACS' | 'TCC';

export interface LayoutPayload {
  type: ReportType;
  /** account_id -> slot_id */
  assignments: Record<string, string>;
}

/**
 * Default TCC slot assignment (Phase 33 — symmetric corner-pair grid).
 * Walks accounts in displayOrder, drops Client 1 retirement into the
 * left-column qualified slots, Client 2 retirement into the right
 * column, and alternates non-retirement accounts left/right starting
 * with row 1. The renderer's self-healing fallback covers any saved
 * layouts still referencing the pre-Phase-33 IDs (p1-*, p2-*, nr-*).
 */
export function defaultTccAssignments(accounts: AccountRow[]): Record<string, string> {
  const out: Record<string, string> = {};

  const sorted = [...accounts].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const p1Ret = sorted.filter((a) => a.accountClass === 'retirement' && a.personIndex === 1);
  const p2Ret = sorted.filter((a) => a.accountClass === 'retirement' && a.personIndex === 2);
  // PRD §User Story 1 — TCC's non-retirement section spans every non-qualified
  // holding: non_retirement, investment (Schwab brokerage), AND private_reserve
  // (Pinnacle PR). Trust gets its own central circle, not a bubble.
  const nonRet = sorted.filter(
    (a) =>
      a.accountClass === 'non_retirement' ||
      a.accountClass === 'investment' ||
      a.accountClass === 'private_reserve',
  );

  // Phase 43 — slotId now records only side. The TCC renderer reads the
  // slotId's side prefix ("qualified-left" / "qualified-right" / etc.) and
  // distributes accounts across a column zone with distributeBubbles().
  // The numeric suffix is preserved for legacy callers (the layout-editor
  // and saved-layout migration paths) but no longer drives positioning.
  p1Ret.forEach((a, i) => {
    out[a.id] = `qualified-left-${i + 1}`;
  });
  p2Ret.forEach((a, i) => {
    out[a.id] = `qualified-right-${i + 1}`;
  });
  nonRet.forEach((a, i) => {
    const side = i % 2 === 0 ? 'left' : 'right';
    const indexOnSide = Math.floor(i / 2) + 1;
    out[a.id] = `non-qualified-${side}-${indexOnSide}`;
  });

  return out;
}

/**
 * Default SACS assignments — the named-anchor model: each anchor maps to the
 * default slot id for its kind. Stored verbatim until the SACS editor lands.
 */
export function defaultSacsAssignments(): Record<string, string> {
  return {
    inflow: 'inflow-default',
    outflow: 'outflow-default',
    private_reserve: 'pr-default',
    pinnacle_pr: 'pp-default',
    schwab: 'schwab-default',
  };
}

export async function loadLayout(
  clientId: string,
  reportType: ReportType,
): Promise<LayoutPayload | null> {
  const rows = await db
    .select()
    .from(bubbleLayouts)
    .where(and(eq(bubbleLayouts.clientId, clientId), eq(bubbleLayouts.reportType, reportType)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.layoutJson) as LayoutPayload;
    if (parsed && typeof parsed === 'object' && parsed.assignments) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function saveLayout(
  clientId: string,
  reportType: ReportType,
  payload: LayoutPayload,
): Promise<void> {
  const json = JSON.stringify(payload);
  const existing = await db
    .select()
    .from(bubbleLayouts)
    .where(and(eq(bubbleLayouts.clientId, clientId), eq(bubbleLayouts.reportType, reportType)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(bubbleLayouts).values({
      clientId,
      reportType,
      layoutJson: json,
    });
  } else {
    await db
      .update(bubbleLayouts)
      .set({ layoutJson: json, updatedAt: new Date() })
      .where(and(eq(bubbleLayouts.clientId, clientId), eq(bubbleLayouts.reportType, reportType)));
  }
}

export async function deleteLayout(clientId: string, reportType: ReportType): Promise<void> {
  await db
    .delete(bubbleLayouts)
    .where(and(eq(bubbleLayouts.clientId, clientId), eq(bubbleLayouts.reportType, reportType)));
}

/**
 * Merge a saved layout over defaults: account ids the user explicitly placed
 * win; new accounts (added since the layout was saved) fall back to default
 * positions so the report renders without holes.
 */
export function mergeAssignments(
  defaults: Record<string, string>,
  saved: Record<string, string> | null,
  knownAccountIds: Set<string>,
): Record<string, string> {
  const out: Record<string, string> = { ...defaults };
  if (!saved) return out;
  for (const [accId, slot] of Object.entries(saved)) {
    if (knownAccountIds.has(accId)) out[accId] = slot;
  }
  return out;
}
