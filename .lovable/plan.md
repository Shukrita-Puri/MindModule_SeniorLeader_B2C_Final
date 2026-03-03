

## Plan: Card Design + Coach Layout + Completion Tracking Fixes

### Issue 1: Card-based practices — switch all to transparent glassmorphic design

Currently in `MicroPracticePlayerCards.tsx` (line 2079-2083), cards use two styles:
- Minimal cards: `bg-white/15 backdrop-blur-md border border-white/40` (the desired look)
- Non-minimal cards: `bg-white/80 backdrop-blur-xl border border-white/60 shadow-lg` (opaque)

**Fix:** Make ALL cards use the transparent style (`bg-white/15 backdrop-blur-md border border-white/40`) and update ALL text colors to use white/light variants instead of `text-foreground`/`text-muted-foreground`. This affects:

- Overview cards (lines 2084-2141): title, subtitle, source box, duration, trigger, when-to-use
- Step cards non-minimal (lines 2162-2289): step badge, title, instruction, question, reframing, examples, guidance, reframingNote, closingWisdom, insight box
- Science cards (lines 2291-2314): title, paragraphs, closing quote

All `text-foreground` → `text-white`, all `text-muted-foreground` → `text-white/60`, all `text-primary` → `text-white/50` or `text-amber-300`, all `bg-primary/5` → `bg-white/10`, all `border-primary/10` → `border-white/20`.

Also add `pt-20` padding to the card container (line 2077) to ensure content isn't hidden behind the mastery plan tracker on top.

**File:** `src/pages/MicroPracticePlayerCards.tsx`

---

### Issue 2: Coach page — conversation squished to bottom

Looking at `SelfMasteryCoach.tsx`, the layout is:
```
h-screen flex-col
  FloatingNavigation (relative, takes ~56px)
  PracticeQueueProgress (conditional, takes ~60px) 
  Performance Plan Indicator (conditional, takes ~70px)
  flex-1 min-h-0 → CoachSplitView (h-full)
```

The `CoachSplitView` uses `h-full` which should fill. But looking at the screenshot, the conversation is only at the bottom 10%. The likely issue is that `CoachSplitView`'s active conversation layout has `flex-1 overflow-y-auto` for messages but the messages are few so they naturally appear at the bottom.

The real problem from the screenshot: messages show at top but the scrollable area is huge with empty space, then input bar at bottom. This is correct behavior — messages start at top, input at bottom. But the user says "full conversation is happening there" at 10%. Looking again at screenshot 5: the user's message and coach's reply are at the very top, then huge empty space, then at the bottom there's a suggested prompt "I'm here when you're ready..." and the input bar. This appears correct for a 2-message conversation.

Wait — looking more carefully at screenshot 5: There's a "Part of Today's Performance Plan" banner AND the queue progress on top. When `messages.length > 0`, these should be hidden (they have `messages.length === 0` condition). But the `CoachSplitView` gets re-mounted on message change. The queue progress condition is `isInQueue && practiceQueue.length > 1 && messages.length === 0` — this should hide when messages exist. So the coach page should be fine once messages start.

The actual issue from screenshot 5 is that the input is stuck at the absolute bottom with the textarea showing at the very bottom. Let me re-read the layout: the `CoachSplitView` returns a `flex flex-col h-full` div, with `flex-1 overflow-y-auto` for messages and a fixed `InputBar` at the bottom. Inside `SelfMasteryCoach`, it's wrapped in `flex-1 min-h-0`. This should be fine.

The user complaint "Coach page is showing my text now at the bottom part of the page at 10% of the page" — looking at screenshot 5, I see the messages at top, then a prompt suggestion text ("I'm here when you're ready. What's really going on?") appearing near the bottom, and the input bar at the very bottom. The prompt suggestion appearing mid-chat is odd — that's the `promptSuggestions` from the empty state leaking? No, in the active state there are no prompt suggestions rendered.

Actually the "I'm here when you're ready" text is likely a coach message (assistant role) that appears at the bottom of the scrollable area. The layout looks correct. But the user is frustrated that the input area (textarea + end session) occupies a lot of space.

Let me focus on what's actionable:
1. Ensure queue progress / plan indicators are properly hidden during active chat
2. The coach page looks like it's working but the empty space is a UX concern — could be that the prompt suggestions should be more prominent or the messages area should be smaller when there are few messages

**Fix for coach page:** The queue progress and performance plan indicator should be hidden when messages exist (they already have `messages.length === 0` guards). The mastery plan tracker "not visible" issue is likely because `isInQueue` is false when not launched from the queue. This is expected behavior.

---

### Issue 3: Mastery plan completion not tracking

The user says they completed all steps but it doesn't show as completed. The `updateRitualCompletion` function updates `completed_practice_ids` and calculates status. The `checkRitualCompletion` in `DailyRitual.tsx` checks `completed_practice_ids.length >= recommended_practices_count`.

Potential bug: When the user completes practices through the queue, each player calls `updateRitualCompletion` which appends to `completed_practice_ids`. But the coach card in the queue is type `'coach'` — when the coach session ends, does it call `updateRitualCompletion`?

Looking at `SelfMasteryCoach.tsx` line 351-356: `handleEndSession` calls `markCoachComplete()` then `endSession()`. Let me check `markCoachComplete`:

This function likely handles marking the coach practice as done. But if `markCoachComplete` doesn't call `updateRitualCompletion`, the coach card won't be counted in `completed_practice_ids`, causing the total to never reach `recommended_practices_count`.

**Fix:** Need to verify and ensure `markCoachComplete` in `SelfMasteryCoach.tsx` calls `updateRitualCompletion('micro_exercise', coachContentId)` to add the coach card's content ID to completed_practice_ids.

---

### Summary of Changes

| File | Changes |
|------|---------|
| `src/pages/MicroPracticePlayerCards.tsx` | Convert all card styles to transparent glassmorphic (bg-white/15), all text to white/light variants, add top padding for queue tracker |
| `src/pages/SelfMasteryCoach.tsx` | Fix markCoachComplete to properly update ritual completion tracking |

### Implementation Order
1. MicroPracticePlayerCards card style overhaul
2. Coach ritual completion tracking fix

