# Redesign "What Restores Your Performance"

Two files only: the `GET_PRACTICE_IMPACT` branch of the `content-feedback` edge function and `src/components/insights/PracticeEffectiveness.tsx`. No schema changes, no new tables, no other actions touched.

## What changes for the user

- Every practice with at least one session now shows a row. No more "Log N more sessions to see its effect" placeholders, and the footer nag line goes away.
- Each row shows: practice name + n chip, a Pause/Flow/Energise chip, an optional event-category chip (the A–H day type this practice usually precedes), and a signal line combining self-declared thumbs and a wearable signal.
- Wearable signal is category-aware: Pause is judged by HR drop during the session, Flow by next-morning HRV, Energise by HR rise during plus HR recovery after.
- Neutral (=) ratings no longer count for or against a practice — only 👍 and 👎.
- New "Before Your Hardest Days" section: for each hard day type, which practices were used in the 24h before, and how HR during those events compares with days where no practice preceded them.
- The old "What's measurably shifting" block is removed to make room.

## Engine work (content-feedback, GET_PRACTICE_IMPACT only)

1. **Bounded check-in pairing** — `findPriorCheckin` limited to the 60 minutes before, `findNextCheckin` to the 90 minutes after; outside the window returns null. The event still counts as a session but contributes no delta.
2. **New reads** — add `hr_samples` to the `wearable_data` select; add a parallel `calendar_events` read (`title, start_time, end_time, attendees_count`) over the 90-day delta window. `sanctuary_content` already selects `category` — verify only.
3. **Canonical A–H classification** — import `enrich as enrichCalendarEvent` from `_shared/events/pattern-bucket.ts` and copy the pure `durationMinutesOf` / `classifyDominantDayType` functions verbatim from `cause-effect-engine/index.ts`. No new keyword logic.
4. **Per-practice wearable signal** from intraday `hr_samples` (`{t, v}` arrays, read from both the practice day and the following day so an after-window that crosses midnight still resolves):
   - HR before: mean of samples in [start − 15m, start); HR during: [start, end); HR after: (end, end + 60m]. Each needs ≥ 2 samples or it is null.
   - Practice end comes from `sanctuary_events.duration_seconds` when present, otherwise start + 20 minutes (the table has no `end_timestamp`).
   - Next-morning HRV from the daily summary for day + 1.
   - RHR is deliberately excluded from the per-practice signal — it duplicates next-morning HRV at the same granularity.
   - Category mapping: Pause → primary "HR during" (drop = good), secondary none; Flow → primary "HRV next AM" (rise = good), secondary "HR during"; Energise → primary "HR during" rise (`isPositive: true`), secondary "HR recovered"; unknown → "HR during". Signals require n ≥ 2 (hrN or hrvN as applicable) and are rounded to 1 decimal.
5. **Thumbs** — `thumbsUp` = ratings of 5, `thumbsDown` = ratings of 1, `thumbsTotal` = up + down (3 = neutral excluded from both). `thumbsRate` is null when total is 0. Composite scoring uses the same neutral-safe rate.
6. **Event-category chip** — for each completed practice, if a calendar event starts within 24h after it, classify that day with `classifyDominantDayType` and tally per content id; the highest-count label becomes `dominantEventCategory`.
7. **Section 2** — per A–H day type appearing in any `dominantEventCategory`: split that type's calendar events into "practice in prior 24h" vs not, take mean HR during each event window from `hr_samples`, and compute `hrDeltaPct = (withoutMean − withMean) / withoutMean * 100` (positive = more composed). When there is no "without" group but ≥ 2 "with" events, compare against the user's overall event-window mean HR; otherwise null. Include `practicesUsed` (top 3 by frequency), `hrDeltaN`, and `postEventRating: null` / `postEventRatingN: 0` for Phase 2. Sort by `hrDeltaN` desc, keep rows with `hrDeltaN >= 1`.
8. **Cleanup** — drop `clarityDelta` from box1 practices; add `wearableSignal`, `thumbsRate`, `dominantEventCategory`; return `section2`. `box2` and `box3` computation stay exactly as-is (box3 is still returned, just unrendered).

## UI work (PracticeEffectiveness.tsx)

- New `WearableSignal`, updated `Box1Practice`, new `Section2Entry` interfaces; `section2` added to `ImpactPayload`.
- `FindingRow` rewritten: no locked/unlocked split, all practices with `sessions >= 1` render. Header line = title + n chip; second line = category chip (Pause blue / Flow emerald / Energise amber / default muted, `text-[9px] rounded-full px-1.5 py-0.5`) plus the muted event-category chip truncated at 20 chars.
- Signal row (`text-xs tabular-nums text-foreground/80`), slots joined by `·` with absent slots collapsing (no empty dividers): thumbs `👍 {up}/{total}` when total ≥ 1; wearable `{sign}{abs}% {label}` when the signal exists and n ≥ 2, emerald when the direction is a positive impact; slot 3 stays absent in Phase 1.
- Summary line: "Most effective: {title}" (drop the AM/afternoon suffix), "Building signal: {title}" (drop the "N more sessions" suffix), else "Complete a practice session to see what restores your performance."
- New "Before Your Hardest Days" section below the list when `section2.length > 0`: uppercase micro-header, rows in `rounded-md overflow-hidden bg-muted/20 px-3 py-3` with `divide-y divide-border/30`, each showing event type, "Practices: a · b", and the HR line with the specified copy for composed / similar (abs < 3%) / need more data (`hrDeltaN < 2`) / no wearable data.
- Remove the box3 "What's measurably shifting" block, the `PhysiologyRow` helper, and the "Log N more sessions" footer.

## Verification

- Typecheck plus the existing edge-function and frontend test suites.
- Deploy `content-feedback`, then probe `GET_PRACTICE_IMPACT` for a live user to confirm `wearableSignal`, `dominantEventCategory`, and `section2` populate with real data (and degrade to null rather than fabricating when HR samples are missing).
