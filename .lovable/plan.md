

## Full Audit: Recalibrate + Proactive Mastery Plan — Completion Tracking

### Bugs Found

#### BUG 1 (Critical): `navigateToCoach` Missing `fromRitual: true`

**File:** `DailyRitual.tsx` line 115-118

```js
const navigateToCoach = (prompt, flowType, eventTitle) => {
  navigate('/coach', { state: { initialPrompt: prompt, flowType, eventTitle } });
};
```

`fromRitual: true` is never passed. On `SelfMasteryCoach.tsx` line 84, the queue only loads `if (queue && fromRitual)`. So when a user clicks a coach card from the plan carousel, the coach page doesn't load the queue, `isInQueue` stays `false`, and the `PracticeQueueProgress` bar never renders.

Other player `navigateToNext` functions (SoundscapePlayer, GuidedPracticePlayer, MicroPracticePlayerCards) DO pass `fromRitual: true` when navigating to coach — so this only affects **direct** coach card taps from the DailyRitual carousel.

**Fix:** Add `fromRitual: true` to `navigateToCoach` state.

---

#### BUG 2 (Critical): Coach Page Background — Queue Progress Bar Invisible

The coach page outer container uses `bg-stone-50` (line 345) and the `CoachSplitView` empty state overlays `from-stone-50 via-white to-stone-100`. The `PracticeQueueProgress` wrapper uses `bg-charcoal/95` which should provide contrast — but the overall page lacks the warm atmospheric feel of the active chat state (`from-amber-50/40 via-stone-50 to-rose-50/30`).

User request: use the same warm background as the chat view on the entire coach page.

**Fix:** Change `SelfMasteryCoach.tsx` line 345 from `bg-stone-50` to match the chat gradient. Also update `CoachSplitView.tsx` empty state background from `from-stone-50 via-white to-stone-100` to match the chat background: `from-amber-50/40 via-stone-50 to-rose-50/30`.

---

#### BUG 3 (Medium): Server-Side Time Window Mismatch

`daily-rituals/index.ts` line 15: `getServerTimeOfDay()` uses `< 17` for afternoon boundary. The client uses `< 18`. Between 17:00-18:00 UTC, if a client omits `sessionPeriod`, the server defaults to "evening" while the plan was generated for "afternoon".

The client currently always passes `sessionPeriod` so this is a defensive fix, but if the client ever fails to send it, completions go to the wrong row.

**Fix:** Update line 15 from `< 17` to `< 18`.

---

#### BUG 4 (Medium): `isEvening()` Helper Uses Wrong Boundary

`DailyRitual.tsx` line 89-92: `return hour >= 17`. This local helper should use `>= 18` to match all standardized time windows.

**Fix:** Change from `>= 17` to `>= 18`.

---

#### BUG 5 (Low): Player `contextData.timeOfDay` Uses `< 17`

All three players (SoundscapePlayer line 293, GuidedPracticePlayer line 917, MicroPracticePlayerCards line 1766) calculate `timeOfDay` with `< 17`. Should be `< 18`.

**Fix:** Update all three to `< 18`.

---

### Implementation Plan

| # | File | Change |
|---|------|--------|
| 1 | `src/components/home/DailyRitual.tsx` | Add `fromRitual: true` to `navigateToCoach` + fix `isEvening()` to `>= 18` |
| 2 | `src/pages/SelfMasteryCoach.tsx` | Change `bg-stone-50` to warm amber gradient matching chat view |
| 3 | `src/components/coach/CoachSplitView.tsx` | Change empty state background to match active chat gradient |
| 4 | `supabase/functions/daily-rituals/index.ts` | Fix `getServerTimeOfDay()`: `< 17` → `< 18` |
| 5 | `src/pages/SoundscapePlayer.tsx` | Fix `contextData.timeOfDay`: `< 17` → `< 18` |
| 6 | `src/pages/GuidedPracticePlayer.tsx` | Same fix |
| 7 | `src/pages/MicroPracticePlayerCards.tsx` | Same fix |

One edge function redeployment needed (daily-rituals). No database changes.

