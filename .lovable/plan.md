## Move "+ ADD TAG" below the event title (all priority cards)

### What changes (UI-only, `src/components/home/TodayThreePriorities.tsx`)

The `PriorityTagAffordance` currently renders in three spots. Reposition all three to sit immediately under the event title line, before any "Why this matters" copy or recommended-action text. No logic, no DB, no styling system changes.

1. **Expanded active card** (around line 1418)
   - Currently rendered AFTER the `Why this matters` block.
   - Move it to sit directly under the title row, BEFORE the `Why this matters` block. Order becomes:
     `title → tag affordance → why this matters → recommended action`.

2. **Collapsed active card** (around line 1359)
   - Currently rendered AFTER the truncated whyLine snippet.
   - Move it to sit directly under `{module.title}` and BEFORE the italic whyLine. Order:
     `timeLabel → title → tag affordance → whyLine snippet`.

3. **Cancelled card** (around line 1233)
   - Currently rendered AFTER the "Cancelled" label.
   - Move it to sit directly under the strikethrough title and BEFORE the "Cancelled" label. Order:
     `title (strikethrough) → tag affordance → "Cancelled"`.

Spacing: keep the existing `mt-1.5` wrapper; adjust the now-following element's top margin only if visual rhythm needs it (single-line tweak).

### Where tag selections are stored (answer to your question)

Tags are persisted by `persistPlanLedgerEdit` (`src/utils/dailyRituals.ts`) into the existing JSONB column:

- **Table:** `public.daily_ritual_completions`
- **Column:** `plan_ledger` (jsonb)
- **Path:** `plan_ledger.userEdits.slotEdits["slot-{N}"]`
- **Fields per slot:**
  - `priorityTag`: `'high' | 'medium' | 'low' | null` (Importance)
  - `relationshipTag`: `'boss' | 'colleague' | 'junior' | 'vendor' | 'client' | 'customer' | 'board' | 'leadership' | 'team' | null`
  - `customTags`: `string[]` — open-ended free-text tags (cap 5, 24 chars each)

Write path on every tag change in `updateSlotTags`:
1. Optimistic local state update.
2. Local mirror write (`plan-user-edits-${date}-${period}` in localStorage) so it survives refresh before the network round-trip.
3. Background `persistPlanLedgerEdit` → upsert into `daily_ritual_completions.plan_ledger` for the current `(user_id, ritual_date, time_window)` row.
4. Server-side `applyLedgerEditsToModules` in `generate-mastery-plan` rehydrates the saved tags onto every future plan response for that window.

### Feeding the memory spine (custom open-ended tags)

The current edge function only round-trips tags back onto the plan; it does not yet emit them to the proactive-pattern store. Per `mem://architecture/unified-pattern-store`, the canonical proactive-pattern store is `causality_findings.signal_summary`. Plan a follow-up (separate task — not in this UI change) to:

- Mint `priority_tag_observation` records in `causality_findings.signal_summary` when a slot completes, carrying `{ importance, relationship, customTags, slotTitle, completed }` so the coach/brief context can learn from both preset and free-text tags.

This plan only covers the UI repositioning. Say the word and I'll add the memory-spine wiring as a separate change.

### Files touched

- `src/components/home/TodayThreePriorities.tsx` (3 small JSX moves)

No schema, no edge function, no new components.
