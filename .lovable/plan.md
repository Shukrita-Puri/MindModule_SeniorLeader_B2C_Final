

## Full Audit: Proactive Mastery Plan Player — Completion Tracking

### Bugs Found

#### BUG 1 (Critical): `todayRecommendedIds` Dead Reference — Completions Not Tracked

`DailyRitual.tsx` line 407 has `// todayRecommendedIds removed — redundant with DB`. But all three player files **still read** it from localStorage to determine `shouldTrackRitual`:

- `SoundscapePlayer.tsx` line 279
- `GuidedPracticePlayer.tsx` line 905
- `MicroPracticePlayerCards.tsx` line 1754

Since `todayRecommendedIds` is never written, it always parses as `[]`, so `isRecommendedPractice` is always `false`. The only way `shouldTrackRitual` becomes `true` is if `isInQueue` is `true` — which requires the practice ID to be found in the `practiceQueue` localStorage array.

**Impact:** If a user navigates to a practice from DailyRitual but the queue doesn't contain that exact ID (or the queue was cleared), completion is never recorded. This explains why completed practices aren't showing as done.

**Fix:** Replace the dead `todayRecommendedIds` check with `practiceQueue` membership check (the queue IS the source of truth now). All three players already parse the queue — just use it consistently.

#### BUG 2 (Medium): `dailyRituals.ts` Time Window Mismatch

`getCurrentTimeWindowForRituals()` in `dailyRituals.ts` uses `< 17` for afternoon boundary, but `getCurrentTimeWindow()` in `dailyCheckins.ts` uses `< 18`. This was standardized in the last session for all other locations but missed in this file.

**Impact:** Between 17:00–18:00, `DailyRitual.tsx` calls `getCurrentTimeWindow()` (afternoon) but `updateRitualCompletion()` calls `getCurrentTimeWindowForRituals()` (evening). The upsert creates a new evening row while the plan query looks for an afternoon row — completions "disappear".

**Fix:** Update `dailyRituals.ts` line 12 from `< 17` to `< 18`.

#### BUG 3 (Medium): Coach Page — "Complete" Button Fires Without Conversation

`markCoachComplete()` (line 237) can be triggered by the `PracticeQueueProgress` "Complete" button at any time — even before the user sends a single message. There's no guard checking `messages.length > 0`.

**Fix:** Gate `handleQueueComplete` to only call `markCoachComplete()` when `messages.length > 0`. When no messages, show a toast prompting the user to engage first.

#### BUG 4 (UI): Coach Page — Queue Progress Bar Invisible

The queue progress bar (line 369–383) renders inside `bg-charcoal/95` but is placed after `FloatingNavigation` with no top padding or spacing. On the Coach page's light `bg-background`, the bar blends into or hides behind the floating nav.

**Fix:** Add `pt-16` (or equivalent safe area + nav height offset) to the queue progress wrapper so it sits visibly below the navigation bar. Also give the Coach page a subtle warm background (`bg-stone-50`) for contrast.

#### BUG 5 (UI): "Mark Complete" Button — Icon & Text Color

The MicroPracticePlayerCards "Mark Complete" button (line 2308–2314) has a `CheckCircle2` icon and `text-black` on green background. User wants: remove icon, white text.

### Implementation Plan

| # | File | Change |
|---|------|--------|
| 1 | `src/utils/dailyRituals.ts` | Fix time window: `< 17` → `< 18` |
| 2 | `src/pages/SoundscapePlayer.tsx` | Replace dead `todayRecommendedIds` with `practiceQueue` membership check |
| 3 | `src/pages/GuidedPracticePlayer.tsx` | Same fix |
| 4 | `src/pages/MicroPracticePlayerCards.tsx` | Same fix + update Mark Complete button (remove icon, white text) |
| 5 | `src/utils/practiceCompletionTracker.ts` | Replace dead `todayRecommendedIds` with `practiceQueue` check |
| 6 | `src/pages/SelfMasteryCoach.tsx` | Gate `markCoachComplete` on `messages.length > 0` + add `bg-stone-50` + adjust queue bar positioning |
| 7 | `src/components/PracticeQueueProgress.tsx` | Remove `CheckCircle2` icon from Complete button, ensure white text |

No database or edge function changes needed.

