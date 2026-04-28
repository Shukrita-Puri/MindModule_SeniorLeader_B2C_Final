## Goal

Make `brief_snapshots` the single source of truth for a brief, including the three Signal Pills (Decision Readiness / Physical Reserves / Resilience Capacity), their state words (HIDDEN DRAG, BODY STEADY, RUNNING ON GRIT, etc.), and the wearable values behind them (HRV ms, RHR bpm, HR bpm, sleep duration/score, deviations and baselines).

Today these pills are computed live in `DecisionReadinessBrief.tsx` from the freshly-returned `outerBrief`. Nothing is saved. As a result:
- `HistoricalBriefOverlay` (past brief panel) shows score + phrase + body only – no pills, no wearable evidence.
- Insights pages only have access to `score`, `tier`, `phrase`, `body_text`.

## Approach

Move pill computation server-side (single source of truth), persist a structured `signal_pills` block + raw `wearable_snapshot` block on `brief_snapshots`, and use that block from both the live brief, the historical overlay, and Insights.

### 1. Database (migration)

Add nullable columns on `brief_snapshots`:
- `signal_pills jsonb` – the 3 computed pills with state, label, top/bottom lines.
- `wearable_snapshot jsonb` – the raw wearable readings at brief generation time.
- `checkin_snapshot jsonb` – clarity / confidence / sharpness / outcome at the moment the brief was written (already mostly in `payload_json.signals`, but split out for clean reads).

Backfill is intentionally skipped – nulls are rendered as "no read" by the UI.

### 2. Edge Function: `compute-outer-readiness`

- Extract the existing `buildExecutivePills` logic (currently in `DecisionReadinessBrief.tsx`) into a shared helper module placed inside the function directory (`supabase/functions/compute-outer-readiness/signalPills.ts`). The client will continue to render but server now also computes the same struct so it can be persisted.
- During the snapshot upsert (around line 4250), compute and write:
  - `signal_pills`: `[{ id, headline, signalWord, state, topLines, bottomLines, topEmptyText, bottomEmptyText }, ...]`
  - `wearable_snapshot`: `{ hrv, hrvDeviation, hrvBaseline, rhr, rhrDeviation, rhrBaseline, hr, hrDeviation, hrBaseline, sleepDuration, sleepScore, sleepDeviation, sleepBaseline, wearableConnected, wearableTrend7d, scoreTrajectory7d, capturedAt }`
  - `checkin_snapshot`: `{ checkInOutcome, clarity, confidence, sharpness, consecutiveLowConfidence, consecutiveLowClarity }`
- Include these in the response so the live UI can keep rendering instantly without an extra round-trip.

### 3. Edge Functions: `brief-by-id` and `brief-history`

Add `signal_pills`, `wearable_snapshot`, `checkin_snapshot` to the `select(...)` lists so consumers can read them.

### 4. Hook + types

- Extend `BriefSnapshotRecord` in `useBriefSnapshot.ts` (and history hook if any) with the three new jsonb fields, fully typed.
- Add a thin `renderSignalPills(pills)` helper in `src/components/home/signalPillsView.tsx` that takes the persisted `signal_pills` array and renders the same visual capsule used today. Refactor `DecisionReadinessBrief.tsx` to use this helper for both live and (later) historical paths so visual parity is guaranteed.

### 5. `HistoricalBriefOverlay`

Render the persisted `signal_pills` (read-only, no expansion/feedback) right under the score/phrase block, plus a compact "Wearable evidence" footnote (`HRV 18.1ms · RHR 64bpm · Sleep 7h12m`) sourced from `wearable_snapshot`. Falls back gracefully when the snapshot pre-dates the migration (renders nothing for those legacy briefs).

### 6. Insights page hook-up (read-only this round)

In `src/components/insights/LeadershipPatternsCard.tsx` (already queries `brief_snapshots`), expose the new fields via the existing edge function so the Insights surface can later use them for trend analysis (e.g., "Hidden Drag pattern triggered 4× this week" or HRV trajectory). No new UI in this change – just make the data available end-to-end so the next iteration on Insights can plug in directly.

### 7. Backfill (none, by design)

Old snapshots stay as-is. The historical overlay shows pills only when the snapshot has them.

## Files affected

```text
supabase/migrations/<new>_brief_snapshots_signal_pills.sql        (new)
supabase/functions/compute-outer-readiness/signalPills.ts         (new — extracted from DecisionReadinessBrief.tsx)
supabase/functions/compute-outer-readiness/index.ts               (write new fields on upsert; return them in response)
supabase/functions/brief-by-id/index.ts                            (add fields to select)
supabase/functions/brief-history/index.ts                          (add fields to select)
src/hooks/useBriefSnapshot.ts                                      (extend type)
src/components/home/signalPillsView.tsx                            (new shared renderer)
src/components/home/DecisionReadinessBrief.tsx                     (use shared renderer; consume server-computed pills when present, fall back to local compute)
src/components/home/HistoricalBriefOverlay.tsx                     (render persisted pills + wearable evidence line)
src/components/insights/LeadershipPatternsCard.tsx                 (select new fields — no UI change yet)
```

## Out of scope

- New Insights visualisations (separate follow-up – this change makes the data available).
- Backfill of legacy snapshots.
- Changing the live brief's UI/visual design.

## Verification

1. Trigger a fresh brief → `brief_snapshots` row contains non-null `signal_pills`, `wearable_snapshot`, `checkin_snapshot`.
2. Open the past-brief overlay on yesterday's brief generated after the deploy → 3 pills render with same labels as live.
3. Open a brief generated before the deploy → overlay degrades cleanly (no pills, score+phrase still shown).
4. Live brief still renders identically to today (server pills used; client fallback unused on happy path).