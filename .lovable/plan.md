
Goal: fix completion attribution so Time-of-Day and JIT each show accurate completed counts/ticks, prevent unintended Coach redirects, and restore visible Layer 3 wearable context in Inner Readiness.

1) Audit-confirmed root causes
- Time-of-Day count bug: `DailyRitual` uses raw `completed_practice_ids.length`, so JIT completions are counted toward Time-of-Day totals.
- Completion reset bug: `DailyRitual.loadPlan()` can reset `completed_practice_ids` to `[]` when check-in timestamp is newer than plan timestamp, wiping previously completed items.
- Random Coach redirect bug: players open Coach whenever `jitInterventionData` exists, even if current queue has no coach step (stale localStorage contamination).
- Layer 3 missing bug: wearable context is not reliably reaching Inner Readiness rendering path; Layer 3 text is only embedded in one long sentence and may be absent when wearable inputs are not resolved.

2) Completion tracking fixes (Time-of-Day + JIT)
- In `DailyRitual.tsx`:
  - Derive `activeCompletedIds = completed_practice_ids ∩ timeOfDayPlan.moduleIds`.
  - Drive both card ticks/blur and “X of Y completed” from `activeCompletedIds`, not raw DB count.
  - Remove/reset logic that blindly clears completed IDs; preserve completed IDs and only recalculate against current modules.
- In `JitCarousel.tsx`:
  - Keep intersection logic with JIT module IDs, but ensure refresh runs after return from player flow (mount + visibility + route return refresh trigger).
  - Keep completed styling, but allow replay tap on completed cards (don’t increment count twice because completion writes are deduped by ID).

3) Persistence reliability fixes
- In `dailyRituals.ts` + `daily-rituals` function path:
  - Pass queue/session context consistently when completing guided/micro/soundscape (not only some paths).
  - Add optional explicit `sessionPeriod` override from queue metadata so completion writes to the correct period record even if time window changes mid-flow.
- In players (`GuidedPracticePlayer`, `SoundscapePlayer`, `MicroPracticePlayerCards`, `SelfMasteryCoach`):
  - Standardize completion write call to include queue metadata and avoid silent non-tracking paths.

4) Coach misrouting fix
- Add strict guard before Coach redirect:
  - Require `jitInterventionData.hasCoachStep === true` AND current queue actually contains a `coach` item.
- Clear stale `jitInterventionData` whenever launching Time-of-Day queue and any non-JIT standalone practice.
- Keep JIT-with-coach behavior unchanged.

5) Inner Readiness Layer 3 visibility fix
- In `compute-inner-readiness` + `energyStateEngine` + `TodayStateCard`:
  - Return Layer 3 as a dedicated field (e.g., `layer3Statement`) in addition to combined context.
  - Render Layer 3 as its own visible sentence below main context when wearable data is active.
  - Add fallback server-side wearable derivation path if wearable inputs are missing on client (so Layer 3 still appears when DB visibility from client is limited).

6) Verification checklist after implementation
- Time-of-Day: complete 1/2 → shows exactly 1/2, only that card blurred + ticked.
- JIT: complete 1/3 and exit → home shows 1/3 with correct card tick/blur.
- Replay: tapping a completed card reopens practice but does not over-count.
- No-coach plan: completion never routes to Coach.
- Coach-style plan: only routes to Coach when queue includes coach step.
- Inner Readiness: Layer 3 sentence visibly appears with wearable-backed context (especially with 30-day synced data).
