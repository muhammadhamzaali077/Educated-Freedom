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
 * Default TCC slot assignment. Walks accounts in displayOrder and fills
 * slots in order. p1 retirement → p1-1..6, p2 → p2-1..6, non-retirement
 * splits left/right by alternation so a single-row of NR accounts uses
 * both sides symmetrically.
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
  // (Pinnacle PR). Trust gets its own central circle, not a bubble. Inflow /
  // outflow are SACS-only and excluded here.
  const nonRet = sorted.filter(
    (a) =>
      a.accountClass === 'non_retirement' ||
      a.accountClass === 'investment' ||
      a.accountClass === 'private_reserve',
  );

  // Phase 18 — 24-slot grid restored. Slot IDs (p1/p2/nr-l/nr-r × 1..6)
  // map to a 2-col × 3-row grid per side per section:
  //   p1-1 = TOP_OUTER (cx=110, cy=170)
  //   p1-2 = TOP_INNER (cx=250, cy=170)
  //   p1-3 = MID_OUTER (cx=110, cy=290)
  //   p1-4 = MID_INNER (cx=250, cy=290)
  //   p1-5 = BOT_OUTER (cx=110, cy=410)
  //   p1-6 = BOT_INNER (cx=250, cy=410)
  // Phase 18 brief fill order: MID_INNER first (closest to the central
  // client oval) so a single retirement account lands beside the oval
  // rather than at a far corner. Pattern: MID_INNER → TOP_INNER →
  // BOT_INNER → MID_OUTER → TOP_OUTER → BOT_OUTER per spouse.
  const P1_FILL_ORDER = ['p1-4', 'p1-2', 'p1-6', 'p1-3', 'p1-1', 'p1-5'];
  const P2_FILL_ORDER = ['p2-3', 'p2-1', 'p2-5', 'p2-4', 'p2-2', 'p2-6'];
  // Phase 22 — fill order changed to row-major outer-mirror-first so the
  // row-1 corners fill before the row-1 inner cols. For Lipski (3 NR) the
  // expected layout is "row 1 fully populated edge-to-center, row 2 empty"
  // — with this order, 3 accounts go outer-L → outer-R → inner-L. For
  // Park-Rivera (5 NR), accounts 1-4 fill row 1 across all 4 cols,
  // account 5 spills to row 2 outer-L.
  // Slot positions (cx, cy):
  //   nr-l-1 = (100, 595)   outer-L top
  //   nr-l-2 = (270, 595)   inner-L top
  //   nr-l-3 = (100, 875)   outer-L bot
  //   nr-l-4 = (270, 875)   inner-L bot
  //   nr-r-1 = (522, 595)   inner-R top
  //   nr-r-2 = (692, 595)   outer-R top
  //   nr-r-3 = (522, 875)   inner-R bot
  //   nr-r-4 = (692, 875)   outer-R bot
  // (See `makeNonRetirementSlots` in render.ts for source of truth.)
  // Old slot IDs nr-{l,r}-5 / nr-{l,r}-6 are deprecated; the Phase 22
  // self-heal in render.ts auto-remaps any persisted bubble that references
  // them to the next free default slot.
  const NR_FILL_ORDER = [
    'nr-l-1', // row 1 outer-L
    'nr-r-2', // row 1 outer-R
    'nr-l-2', // row 1 inner-L
    'nr-r-1', // row 1 inner-R
    'nr-l-3', // row 2 outer-L
    'nr-r-4', // row 2 outer-R
    'nr-l-4', // row 2 inner-L
    'nr-r-3', // row 2 inner-R
  ];

  p1Ret.slice(0, P1_FILL_ORDER.length).forEach((a, i) => {
    out[a.id] = P1_FILL_ORDER[i] as string;
  });
  p2Ret.slice(0, P2_FILL_ORDER.length).forEach((a, i) => {
    out[a.id] = P2_FILL_ORDER[i] as string;
  });
  nonRet.slice(0, NR_FILL_ORDER.length).forEach((a, i) => {
    out[a.id] = NR_FILL_ORDER[i] as string;
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
