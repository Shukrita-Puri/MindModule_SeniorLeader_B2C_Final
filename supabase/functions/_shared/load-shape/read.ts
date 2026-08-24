// Load Shape — the ONLY reader. Surfaces (Insights, Brief, Plan, Nudges)
// call fetchLoadShape() and never query daily_context_snapshot.load_shape
// themselves, and never re-classify.
//
// Render gate: LOAD_SHAPE_RENDER_ENABLED (default false) is INDEPENDENT of
// the write flag, so shape data accumulates in production before any copy
// becomes user-visible.

import {
  getLoadShapeOrDefault,
  hasLoadShape,
  type LoadShape,
} from "./types.ts";

type AnySupabase = { from: (table: string) => any };

export function loadShapeRenderEnabled(): boolean {
  try {
    const v = (globalThis as any)?.Deno?.env?.get?.(
      "LOAD_SHAPE_RENDER_ENABLED",
    );
    return String(v ?? "false").toLowerCase() === "true";
  } catch {
    return false;
  }
}

/**
 * Write gate — INDEPENDENT of the render gate (default true) so shape data
 * accumulates in production before any copy becomes user-visible. Exported
 * here so every writer shares one definition.
 */
export function loadShapeWriteEnabled(): boolean {
  try {
    const v = (globalThis as any)?.Deno?.env?.get?.(
      "LOAD_SHAPE_WRITE_ENABLED",
    );
    return String(v ?? "true").toLowerCase() !== "false";
  } catch {
    return true;
  }
}

/**
 * Read the stored shape for a day. Returns `null` when nothing is stored
 * (never a fabricated shape) so a surface can stay silent. Use
 * `getLoadShapeOrDefault` only where a non-null value is required.
 */
export async function fetchLoadShape(
  db: AnySupabase,
  userId: string,
  localDate: string,
  mrsWindow?: "morning" | "afternoon" | "evening",
): Promise<LoadShape | null> {
  try {
    let q = db
      .from("daily_context_snapshot")
      .select("load_shape")
      .eq("user_id", userId)
      .eq("local_date", localDate);
    if (mrsWindow) q = q.eq("mrs_window", mrsWindow);
    const { data, error } = await q
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const raw = (data[0] as { load_shape?: unknown })?.load_shape;
    return hasLoadShape(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Convenience for surfaces that must render something: stored shape when
 * present and the render gate is open, otherwise `null`.
 */
export async function fetchRenderableLoadShape(
  db: AnySupabase,
  userId: string,
  localDate: string,
  mrsWindow?: "morning" | "afternoon" | "evening",
): Promise<LoadShape | null> {
  if (!loadShapeRenderEnabled()) return null;
  return await fetchLoadShape(db, userId, localDate, mrsWindow);
}

export { getLoadShapeOrDefault };
