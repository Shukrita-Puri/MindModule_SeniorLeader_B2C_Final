

## Plan: shorter sharpness label + dedupe past-brief sidebar entries

### Issue 1 — "Sharpness" overflows the row

The Recent Activity assessment row reads e.g. `Drained, ▲ Clarity, ▲ Confidence, ▲ Sharpness` and gets clipped (`Drained, ▲ Clarity, ▲ Confidence, ▲ S…`) because the sidebar width is fixed and we don't want to wrap or expand it.

**Fix:** shorten the three pill labels in `src/hooks/useRecentActivity.ts` only — keep the symbol, drop syllables:

| Before | After |
|---|---|
| `▲ Clarity` | `▲ Clear` |
| `▲ Confidence` | `▲ Confident` |
| `▲ Sharpness` | `▲ Sharp` |

Result: `Drained, ▲ Clear, ▲ Confident, ▲ Sharp` — fits the fixed sidebar width without clipping or wrapping. Tooltip already only shows the symbol legend (▲/●/▼) so no additional copy change is needed there.

No DB changes; `mental_sharpness_level` continues to flow through unchanged.

### Issue 2 — Same afternoon brief recorded multiple times under "Recent"

Confirmed in DB: 4 separate `user_engagements` rows with the same `brief_id = f56f66ed…` ("Sustaining state.") logged in a single afternoon. Every time the user lands on `/executive-home`, `ExecutiveHome.tsx` mounts → `trackedPhraseRef` resets → `trackBriefView` fires → another row is inserted. Sidebar then renders all 4 separately.

The brief itself is correctly stable (single `brief_snapshots` row reused, as designed). Only the **engagement log** is duplicated.

**Two-layer fix** (defense in depth — display dedupe + write dedupe):

#### Layer A — Server-side dedupe (write path)

In `supabase/functions/user-events/index.ts`, inside the `TRACK_ENGAGEMENT` branch when `eventType === 'brief_view'`:

- After resolving `brief_id` (existing enrichment already does this), check whether a `user_engagements` row already exists for `(user_id, event_type='brief_view', metadata->>'brief_id' = <id>)` within the last **6 hours**.
- If yes → skip insert, return `{ success: true, deduped: true }`.
- If no → insert as today.
- 6-hour window matches the time-window cadence (morning/afternoon/evening) so a genuinely new brief in a new window still records, but refresh-spam within the same window does not.

This is the canonical fix — guarantees the sidebar stays clean even across multi-device usage.

#### Layer B — Client-side dedupe (cosmetic safety net for legacy rows)

In `src/hooks/useRecentActivity.ts`, after fetching brief_view engagements, dedupe by `brief_id` keeping the most recent timestamp before slicing to 5:

```ts
const seen = new Set<string>();
const uniqueBriefEvents = briefEvents.filter((e: any) => {
  const id = e.metadata?.brief_id;
  if (!id) return true; // keep legacy rows without brief_id
  if (seen.has(id)) return false;
  seen.add(id);
  return true;
});
uniqueBriefEvents.slice(0, 5).forEach(...)
```

This immediately cleans up the existing 4 duplicates the user is seeing today without waiting for the server-side fix to take effect on new writes.

#### Optional housekeeping (one-shot SQL via migration tool)

Collapse the existing 4 duplicate rows for today's afternoon brief into 1 (keep oldest):

```sql
DELETE FROM public.user_engagements
WHERE event_type = 'brief_view'
  AND id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY user_id, (metadata->>'brief_id')
        ORDER BY timestamp ASC
      ) AS rn
      FROM public.user_engagements
      WHERE event_type = 'brief_view'
        AND metadata->>'brief_id' IS NOT NULL
    ) t WHERE rn > 1
  );
```

This wipes ~3 duplicate rows for the user's afternoon brief and any similar duplicates from other users, leaving the historical sidebar clean immediately.

### Files touched

| File | Change |
|---|---|
| `src/hooks/useRecentActivity.ts` | Shorten pill labels (Clear/Confident/Sharp); dedupe brief_view by `brief_id` before slicing |
| `supabase/functions/user-events/index.ts` | In `TRACK_ENGAGEMENT` for `brief_view`: 6-hour dedupe check before insert |
| `supabase/migrations/<ts>_dedupe_brief_view_engagements.sql` | One-shot collapse of existing duplicate `brief_view` rows by `brief_id` |

### Verification

1. Recent Activity assessment row reads `Drained, ▲ Clear, ▲ Confident, ▲ Sharp` and fits in one line without ellipsis.
2. Today's "Sustaining state." appears **once** under TODAY (not 4 times). Clicking it opens the historical glass overlay as before.
3. Refresh `/executive-home` 3× more — no new rows added under TODAY for the same brief.
4. When the evening brief generates (new `brief_id`), a new sidebar entry appears — confirming legitimate new briefs still record.
5. `SELECT COUNT(*) FROM user_engagements WHERE event_type='brief_view' AND metadata->>'brief_id'='f56f66ed-d6d5-494a-bd44-a05a788ee942'` returns 1 after the cleanup migration.

### Out of scope

- Dedupe of legacy rows where `brief_id IS NULL` (older optimistic-only entries — left intact, they fall back to live home gracefully)
- Changing the brief generation/snapshot caching logic (already correct — only the engagement log was double-firing)
- Tooltip changes (already cleaned in last patch)

