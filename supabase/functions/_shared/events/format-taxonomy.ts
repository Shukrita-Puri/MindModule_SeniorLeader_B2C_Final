// MRS v3 — Event taxonomy formatter.
//
// Renders the A–H pillar inventory of today's classified events as a single
// pre-formatted "=== EVENT TAXONOMY ===" block that Brief / Plan / Nudges
// can append to their prompts WITHOUT re-stating pillar copy.
//
// Single source of truth: ./event-categories.ts (selfRegulationFocus) +
// ./event-classifier.ts (classifyEvent). This file never defines taxonomy.

import { classifyEvent } from './event-classifier.ts';
import { EVENT_CATEGORIES, type EventCategoryId } from './event-categories.ts';

export interface FormatTaxonomyEventInput {
  title: string | null | undefined;
  /** Optional ISO start time. When provided, the block lists events in order. */
  startTime?: string | Date | null;
}

/**
 * Build the "=== EVENT TAXONOMY ===" block. Returns empty string when no
 * event classifies into a pillar — safe to concatenate unconditionally.
 */
export function formatEventTaxonomyBlock(
  events: FormatTaxonomyEventInput[],
): string {
  if (!events.length) return '';

  type Row = { title: string; categoryId: EventCategoryId; sortKey: number };
  const rows: Row[] = [];
  for (const e of events) {
    if (!e.title) continue;
    const et = classifyEvent(e.title);
    if (!et || !et.categoryId) continue;
    const cat = EVENT_CATEGORIES[et.categoryId];
    if (!cat) continue;
    const t = e.startTime
      ? (typeof e.startTime === 'string' ? new Date(e.startTime).getTime() : e.startTime.getTime())
      : 0;
    rows.push({
      title: e.title,
      categoryId: et.categoryId,
      sortKey: Number.isFinite(t) ? t : 0,
    });
  }
  if (!rows.length) return '';

  rows.sort((a, b) => a.sortKey - b.sortKey);

  const lines = rows.map((r) => {
    const cat = EVENT_CATEGORIES[r.categoryId];
    return `- "${r.title}" → Pillar ${r.categoryId} (${cat.name}): ${cat.selfRegulationFocus}`;
  });

  return [
    '',
    '',
    '=== EVENT TAXONOMY (deterministic; advisory only, do not re-state pillar copy verbatim) ===',
    ...lines,
  ].join('\n');
}