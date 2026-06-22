## What's wrong

**1. Past Briefs still includes undelivered rows.**
`brief_snapshots` is written in two modes per evaluation:
- `refined_state='refined'` or `baseline_state='baseline'` → a real brief was generated and shown.
- `baseline_state='awaiting'` → wearable/check-in missing; this is the "Sync your wearable…" placeholder the user actually sees on the home card. It still gets persisted with a phrase like *"Maintain your line"* or *"Readiness signals are still coming in."*

`brief-history` returns both kinds, so the sidebar shows phrases for briefs the user was never actually given. Shukrita's row today (`Maintain your line`, 2026-06-22 afternoon) is exactly one of these awaiting rows — confirmed in DB: `baseline_state='awaiting'`, `pillar_mode='wearable'`, `refined_state=null`.

**2. "Poised" is truncated.**
`RecentActivity.tsx` renders the assessment row inside `<span className="text-xs truncate flex-1">`. `truncate` = single line + ellipsis. With four `▲ Word` segments joined by `, ` the line is ~35 chars and the sidebar clips at "▲ P…". The truncation is real, not a perception issue.

## Fix A — Past Briefs: delivered-only filter (server-side, in `brief-history`)

Add a query-string flag `delivered=1` and use it from the sidebar. Server-side filter:

```
WHERE user_id = :uid
  AND (refined_state = 'refined' OR baseline_state = 'baseline')
```

This keeps the existing `brief-history` callers (Insights / Past Brief overlay) untouched — they continue to receive every row. Only the sidebar hook opts into the strict filter.

Frontend change in `src/hooks/useRecentActivity.ts`:
- Invoke `brief-history` with `?delivered=1`.
- Title fallback chain stays `refined_phrase || phrase || baseline_phrase`.

Net effect for Shukrita: today's *"Maintain your line"*, yesterday's *"Readiness signals are still coming in."*, and Jun 20's *"Close with care."* / *"Stay present for what's left."* drop out of RECENT, because they all have `baseline_state='awaiting'`. *"Steady and selective."*, *"Close strong."*, *"Sustain the pace."*, *"Begin with intention."*, etc. remain.

## Fix B — Make all 4 dims visible without widening the sidebar

Two minimal-cost levers; recommend doing both:

**B1. Tighter glyphs in the composer (`useRecentActivity.ts`)**
- Drop the space between arrow and word.
- Replace `, ` separator with a middle dot `·` surrounded by single spaces.

Before: `▲ Clear, ▲ Steady, ▲ Ease, ▲ Poised` (35 chars)
After: `▲Clear · ▲Steady · ▲Ease · ▲Poised` (31 chars)

Saves ~12% width. Same visual grammar, same arrow vocabulary.

**B2. Allow assessment rows to wrap to 2 lines (`RecentActivity.tsx`)**
On the assessment branch only (line 113), swap `truncate` → `line-clamp-2 leading-tight break-words`. Row height grows from 1 line to at most 2 lines *only when needed* (mixed-direction rows like `▼Clear · ●Steady · ▲Ease` still fit on one line). Sidebar width unchanged. Brief/Recalibrate rows keep `truncate` so their UX is unchanged.

If you'd rather keep every assessment row strictly 1 line, we ship B1 only and accept that very long full-▲ rows still clip the last word. B1+B2 together is the only way to guarantee every dim is visible at every width.

## Out of scope
- Brief overlay rendering, Insights history, MRS scoring, awaiting-state copy in the main brief card (already correct).
- The `brief_snapshots` writer in `compute-outer-readiness` — we are not changing what gets persisted, only what the sidebar reads.

## Files touched
- `supabase/functions/brief-history/index.ts` — add optional `delivered` query filter.
- `src/hooks/useRecentActivity.ts` — pass `delivered=1`; tighten title separators.
- `src/components/navigation/RecentActivity.tsx` — `truncate` → `line-clamp-2` on assessment rows only.

## Verification
1. `SELECT count(*) FROM brief_snapshots WHERE user_id=<shukrita> AND (refined_state='refined' OR baseline_state='baseline')` — sidebar row count should match (capped at 5 per group).
2. Reload sidebar: today's *"Maintain your line"* and yesterday's *"Readiness signals are still coming in."* are gone; *"Steady and selective."* remains.
3. Latest assessment row reads `▲Clear · ▲Steady · ▲Ease · ▲Poised` with "Poised" fully visible.
4. Past Brief overlay (`/executive-home?briefId=…`) still opens for the remaining brief rows.

## Decision needed
Confirm: ship **B1 + B2** (recommended, guarantees all 4 dims visible), or **B1 only** (keeps strict 1-line rows, accepts occasional clip on max-length rows)?