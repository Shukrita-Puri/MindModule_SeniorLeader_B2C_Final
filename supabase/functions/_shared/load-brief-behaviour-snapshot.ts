// OWNERSHIP: engineering. Canonical reader of the Brief's behaviour snapshot
// for downstream consumers (Plan, Nudges, Insights).
//
// Why this layer exists
// ─────────────────────
// `compute-outer-readiness` runs `buildBehaviourSnapshot` once per
// (user, local_date, time_window) and persists the result on
// `brief_snapshots.payload_json.behaviour_snapshot`. The Plan and Nudges
// MUST read that same snapshot rather than rebuilding their own — otherwise
// the Brief can fire `HighStakesPrep @"Board prep"` while the Plan never
// sees that anchor event, producing the exact Brief↔Plan drift this layer
// exists to eliminate.
//
// This module:
//   • loadBriefBehaviourSnapshot — DB read, idempotent, no writes.
//   • snapshotToWiring           — adapts the persisted shape to the same
//     `{ flags, slotBoosts, promptBlock }` envelope downstream code already
//     consumes from `behaviour-wiring.ts`, so callers swap one source for
//     the other without branching.
//
// Strict no-fallback contract: when the snapshot is absent (no Brief written
// yet for this window), the loader returns null. Callers may then fall back
// to building a fresh snapshot via `buildBehaviourSnapshot` — but only as a
// last resort.

import type { BehaviourFlag, SlotBoost } from "./brief-context.ts";

export type TimeWindow = "morning" | "afternoon" | "evening";

/** Shape persisted by compute-outer-readiness on payload_json.behaviour_snapshot. */
export interface PersistedBriefBehaviourSnapshot {
  signatureHash: string;
  flagsBrief: BehaviourFlag[];
  flagsPlan: BehaviourFlag[];
  slotBoosts: SlotBoost[];
  /** Pre-formatted "=== EVENT TAXONOMY ===" block. */
  taxonomyBlock: string;
  /** Pre-formatted "=== ACTIVE CEO BEHAVIOURS ===" block for the Brief surface. */
  promptBlockBrief?: string;
  /** Pre-formatted block for the Plan surface. */
  promptBlockPlan?: string;
}

export interface LoadedBriefBehaviourSnapshot extends PersistedBriefBehaviourSnapshot {
  /** Where the snapshot was read from. */
  source: "brief_snapshot";
  /** `brief_snapshots.id` of the row this snapshot was read from. */
  briefSnapshotId: string;
  localDate: string;
  timeWindow: TimeWindow;
}

/**
 * Load the most recent persisted Brief behaviour snapshot for the given
 * (user, local_date, time_window). Returns null when no row exists or the
 * row has no behaviour_snapshot (e.g. legacy briefs written before the
 * shared-module rollout). Never throws.
 */
export async function loadBriefBehaviourSnapshot(
  supabase: any,
  userId: string,
  localDate: string,
  timeWindow: TimeWindow,
): Promise<LoadedBriefBehaviourSnapshot | null> {
  try {
    const { data, error } = await supabase
      .from("brief_snapshots")
      .select("id, payload_json, input_signature")
      .eq("user_id", userId)
      .eq("local_date", localDate)
      .eq("time_window", timeWindow)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn(
        `[load-brief-behaviour-snapshot] query failed user=${userId} date=${localDate} window=${timeWindow}:`,
        error.message,
      );
      return null;
    }
    if (!data) return null;
    const snap = (data as any)?.payload_json?.behaviour_snapshot;
    if (!snap || typeof snap !== "object") return null;
    const flagsBrief: BehaviourFlag[] = Array.isArray(snap.flagsBrief) ? snap.flagsBrief : [];
    const flagsPlan: BehaviourFlag[] = Array.isArray(snap.flagsPlan) ? snap.flagsPlan : [];
    const slotBoosts: SlotBoost[] = Array.isArray(snap.slotBoosts) ? snap.slotBoosts : [];
    return {
      source: "brief_snapshot",
      briefSnapshotId: (data as any).id,
      localDate,
      timeWindow,
      signatureHash: String(snap.signatureHash ?? ""),
      flagsBrief,
      flagsPlan,
      slotBoosts,
      taxonomyBlock: typeof snap.taxonomyBlock === "string" ? snap.taxonomyBlock : "",
      promptBlockBrief: typeof snap.promptBlockBrief === "string" ? snap.promptBlockBrief : undefined,
      promptBlockPlan: typeof snap.promptBlockPlan === "string" ? snap.promptBlockPlan : undefined,
    };
  } catch (e) {
    console.warn(
      "[load-brief-behaviour-snapshot] exception:",
      (e as any)?.message || e,
    );
    return null;
  }
}

/**
 * Adapt a persisted snapshot for the requested scope into the same envelope
 * that `evaluateForScope(input, scope)` returns. This lets consumers replace
 * `evaluateForScope` call sites with `snapshotToWiring(snap, scope)` without
 * any further branching at the call site.
 */
export function snapshotToWiring(
  snap: PersistedBriefBehaviourSnapshot | null,
  scope: "brief" | "plan" | "nudge",
): { flags: BehaviourFlag[]; slotBoosts: SlotBoost[]; promptBlock: string } | null {
  if (!snap) return null;
  if (scope === "plan") {
    return {
      flags: snap.flagsPlan,
      slotBoosts: snap.slotBoosts,
      promptBlock: snap.promptBlockPlan ?? formatPromptBlock(snap.flagsPlan),
    };
  }
  // brief + nudge surfaces both read the brief-scoped flags. Nudges never get
  // slotBoosts (those are Plan-only) so we always zero that field here.
  return {
    flags: snap.flagsBrief,
    slotBoosts: [],
    promptBlock: snap.promptBlockBrief ?? formatPromptBlock(snap.flagsBrief),
  };
}

/**
 * Reconstruct the advisory block locally when the persisted snapshot was
 * written by an older brief that didn't store the pre-formatted strings.
 * Keeps the format identical to `behaviour-wiring.ts:formatPromptBlock`.
 */
function formatPromptBlock(flags: BehaviourFlag[]): string {
  if (!flags.length) return "";
  const lines = flags.map((f) => {
    const anchor = f.anchorEvent ? ` @"${f.anchorEvent}"` : "";
    const stake = f.stake ? ` (${f.stake})` : "";
    const evidence = f.evidence && f.evidence.length
      ? ` — evidence: ${f.evidence.join(", ")}`
      : "";
    return `- ${f.rule} [${f.severity}]${anchor}${stake}: ${f.copyHint}${evidence}`;
  });
  return [
    "",
    "",
    "=== ACTIVE CEO BEHAVIOURS (deterministic; execute the copyHint, never echo verbatim) ===",
    ...lines,
  ].join("\n");
}

/**
 * Anchor-event titles called out by the Brief (HighStakesPrep, boardLevelOutcome,
 * etc.). Plan callers use this list to guarantee that any event the Brief
 * named as high-stakes is also surfaceable in JIT slots / plan tiles.
 */
export function briefAnchorEventTitles(
  snap: PersistedBriefBehaviourSnapshot | null,
): string[] {
  if (!snap) return [];
  const out = new Set<string>();
  for (const f of [...snap.flagsBrief, ...snap.flagsPlan]) {
    const t = (f as any)?.anchorEvent;
    if (typeof t === "string" && t.trim()) out.add(t.trim());
  }
  return Array.from(out);
}