/**
 * planUserEdits — client-side mirror of `plan_ledger.userEdits.slotEdits`.
 *
 * Why this exists: the cancel / undo / tag flow writes optimistically to local
 * state AND to the server (`persistPlanLedgerEdit`). If the user refreshes or
 * the plan regenerates before the server-side write lands, the fresh response
 * comes back without the edits and the cancelled / tagged state visibly
 * disappears.
 *
 * This mirror stores those edits in localStorage scoped to `${date}-${period}`
 * and is re-applied on top of every plan response (cached or fresh) so the UI
 * never regresses. The server is still the canonical store — when its response
 * already carries an edit newer than the local mirror, the mirror entry is
 * dropped.
 */

export interface SlotEdit {
  cancelled?: boolean;
  cancelReason?: string | null;
  replacementEventIds?: string[];
  priorityTag?: 'high' | 'medium' | 'low' | null;
  relationshipTag?: string | null;
  customTags?: string[];
  updatedAt?: string;
}

export interface PlanUserEdits {
  slotEdits: Record<string, SlotEdit>;
  updatedAt: string;
}

const keyFor = (dateISO: string, period: string) => `plan-user-edits-${dateISO}-${period}`;

export function readEdits(dateISO: string, period: string): PlanUserEdits | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(keyFor(dateISO, period));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlanUserEdits;
    if (!parsed || typeof parsed !== 'object' || !parsed.slotEdits) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeEdits(dateISO: string, period: string, edits: PlanUserEdits): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(keyFor(dateISO, period), JSON.stringify(edits));
  } catch { /* quota — silent */ }
}

export function clearEdits(dateISO: string, period: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(keyFor(dateISO, period)); } catch { /* ignore */ }
}

export function patchSlotEdit(
  dateISO: string,
  period: string,
  slotIndex: number,
  patch: Omit<SlotEdit, 'updatedAt'>,
): PlanUserEdits {
  const now = new Date().toISOString();
  const existing = readEdits(dateISO, period) || { slotEdits: {}, updatedAt: now };
  const slotKey = `slot-${slotIndex}`;
  const merged: SlotEdit = {
    ...(existing.slotEdits[slotKey] || {}),
    ...patch,
    updatedAt: now,
  };
  const next: PlanUserEdits = {
    slotEdits: { ...existing.slotEdits, [slotKey]: merged },
    updatedAt: now,
  };
  writeEdits(dateISO, period, next);
  return next;
}

export function clearSlotEdit(dateISO: string, period: string, slotIndex: number): void {
  const existing = readEdits(dateISO, period);
  if (!existing) return;
  const slotKey = `slot-${slotIndex}`;
  if (!(slotKey in existing.slotEdits)) return;
  const { [slotKey]: _drop, ...rest } = existing.slotEdits;
  writeEdits(dateISO, period, { slotEdits: rest, updatedAt: new Date().toISOString() });
}

/**
 * Apply the local mirror on top of a plan response.
 * If the server module already carries a newer edit (same fields populated),
 * we trust the server and drop the local entry for that slot.
 */
export function applyEditsToModules<T extends {
  isCancelled?: boolean;
  cancelReason?: string | null;
  replacementEventIds?: string[];
  priorityTag?: 'high' | 'medium' | 'low' | null;
  relationshipTag?: any;
  customTags?: string[];
}>(modules: T[], dateISO: string, period: string): T[] {
  const edits = readEdits(dateISO, period);
  if (!edits) return modules;
  let mutatedAny = false;
  const result = modules.map((m, idx) => {
    const edit = edits.slotEdits[`slot-${idx}`];
    if (!edit) return m;
    // Server already reflects same cancelled flag and tags → drop local entry.
    const serverMatches =
      (edit.cancelled === undefined || m.isCancelled === edit.cancelled) &&
      (edit.priorityTag === undefined || (m.priorityTag ?? null) === (edit.priorityTag ?? null)) &&
      (edit.relationshipTag === undefined || (m.relationshipTag ?? null) === (edit.relationshipTag ?? null)) &&
      (edit.customTags === undefined || JSON.stringify(m.customTags || []) === JSON.stringify(edit.customTags || []));
    if (serverMatches) {
      mutatedAny = true;
      return m;
    }
    return {
      ...m,
      ...(edit.cancelled !== undefined ? { isCancelled: edit.cancelled } : {}),
      ...(edit.cancelReason !== undefined ? { cancelReason: edit.cancelReason } : {}),
      ...(edit.replacementEventIds !== undefined ? { replacementEventIds: edit.replacementEventIds } : {}),
      ...(edit.priorityTag !== undefined ? { priorityTag: edit.priorityTag } : {}),
      ...(edit.relationshipTag !== undefined ? { relationshipTag: edit.relationshipTag } : {}),
      ...(edit.customTags !== undefined ? { customTags: edit.customTags } : {}),
    } as T;
  });
  // Prune entries that the server has now caught up with.
  if (mutatedAny) {
    const remaining: Record<string, SlotEdit> = {};
    modules.forEach((m, idx) => {
      const edit = edits.slotEdits[`slot-${idx}`];
      if (!edit) return;
      const serverMatches =
        (edit.cancelled === undefined || m.isCancelled === edit.cancelled) &&
        (edit.priorityTag === undefined || (m.priorityTag ?? null) === (edit.priorityTag ?? null)) &&
        (edit.relationshipTag === undefined || (m.relationshipTag ?? null) === (edit.relationshipTag ?? null)) &&
        (edit.customTags === undefined || JSON.stringify(m.customTags || []) === JSON.stringify(edit.customTags || []));
      if (!serverMatches) remaining[`slot-${idx}`] = edit;
    });
    if (Object.keys(remaining).length === 0) {
      clearEdits(dateISO, period);
    } else {
      writeEdits(dateISO, period, { slotEdits: remaining, updatedAt: new Date().toISOString() });
    }
  }
  return result;
}