

## Root Cause: `supabase.auth.getUser()` Returns Null for Auth0 Users

The app uses **Auth0** for authentication, not Supabase Auth. Every call to `supabase.auth.getUser()` returns `null` for production users. This is why:

1. **Completion tracking silently skips** — all three players gate tracking behind `if (userId && practice)` or `if (!user) return`, and `userId` is always null.
2. **Ratings/feedback never persist** — `relevanceFeedback.ts` does `supabase.auth.getUser()` and returns early with "Not authenticated".

The `trackSanctuaryEvent()` call itself works fine (it uses `getAuthToken()` → Auth0 token → edge function). But the players never reach it because they bail out on the Supabase auth check first.

### Coach Page Visibility

`bg-charcoal/95` is not defined in `tailwind.config.ts` — it compiles to nothing, making the queue bar wrapper transparent against the warm background.

---

### Fixes (7 files, no DB changes)

#### 1. SoundscapePlayer.tsx — Remove Supabase auth gate
- **Line 275**: Replace `(await supabase.auth.getUser()).data.user?.id` with a simple existence check. The `trackSanctuaryEvent` already handles auth via Auth0 token internally.
- Remove the `if (userId && soundscape)` gate — just check `if (soundscape)`. The edge function authenticates the user server-side.

#### 2. GuidedPracticePlayer.tsx — Same fix  
- **Line 898**: Remove `supabase.auth.getUser()` gate. Check `if (practice)` only.

#### 3. MicroPracticePlayerCards.tsx — Same fix (most critical)
- **Lines 1739-1744**: Currently does `supabase.auth.getUser()` and if `!user`, skips ALL tracking and jumps straight to rating modal. Remove this gate entirely — just proceed to track + show rating.

#### 4. relevanceFeedback.ts — Route through edge function
- **Lines 78-83**: `submitRelevanceFeedback` uses `supabase.auth.getUser()` then does a direct DB insert. Since RLS blocks this for Auth0 users, route through the existing `content-feedback` edge function instead, using `getAuthToken()` for the bearer token.
- **`submitPracticeRating`**: Same — the `practice_sessions` update also uses a direct Supabase client call with RLS. Route the rating update through `track-sanctuary-event` or a new action on `content-feedback`.

#### 5. SelfMasteryCoach.tsx — Fix queue bar wrapper
- **Line 375**: Replace `bg-charcoal/95` with `bg-neutral-900/90` (a valid Tailwind class that renders a near-black background with transparency).

#### 6. CoachSplitView.tsx — Verify gradient applied
- Confirm the empty-state background uses the warm amber gradient (was changed in last round — verify it stuck).

#### 7. practiceCompletionTracker.ts — Remove Supabase auth gate
- **Line 34**: Uses `supabase.auth.getUser()`. Replace with a no-op since `trackSanctuaryEvent` handles auth internally. This util just delegates to `trackSanctuaryEvent` anyway.

### Summary Table

| File | Bug | Fix |
|---|---|---|
| `SoundscapePlayer.tsx` | `supabase.auth.getUser()` = null → skips tracking | Remove auth gate; `trackSanctuaryEvent` handles auth |
| `GuidedPracticePlayer.tsx` | Same | Same |
| `MicroPracticePlayerCards.tsx` | Same (+ skips rating modal flow) | Same |
| `relevanceFeedback.ts` | Direct DB insert blocked by RLS | Route through `content-feedback` edge function |
| `practiceCompletionTracker.ts` | Same auth gate | Remove; delegate to `trackSanctuaryEvent` |
| `SelfMasteryCoach.tsx` | `bg-charcoal/95` undefined → transparent | Use `bg-neutral-900/90` |
| `CoachSplitView.tsx` | Verify warm gradient | Confirm previous fix applied |

No new edge functions needed. No DB migrations. The `track-sanctuary-event` and `content-feedback` edge functions already authenticate via Auth0 JWT and use service role for writes.

