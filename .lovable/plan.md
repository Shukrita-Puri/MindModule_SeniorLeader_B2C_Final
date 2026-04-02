
Goal: audit why JIT is still not showing, verify what was actually implemented, and outline the exact fixes needed end-to-end.

What I verified
1. Your requested change was only partially implemented.
2. There are at least 3 independent reasons a JIT plan may still not appear even when many events exist.
3. The biggest current bug is not the client hide state — it is still the server-side suppression path.

What is implemented today
- In `src/components/home/JitCarousel.tsx`
  - Dismiss now writes a session key in `sessionStorage`.
  - It tracks a local per-event-type count in `localStorage`.
  - First dismiss sends `snoozed`; 2+ sends `dismissed`.
- In `supabase/functions/track-jit-skip/index.ts`
  - `dismissed_horizons` is only updated when `action === 'dismissed'`.
  - This part matches your requested server change.

Critical bug still present
In `supabase/functions/track-jit-skip/index.ts`, the fallback branch still does this:
- if `eventId` exists but action is anything other than `dismissed` with a horizon, it sets:
  - `dismissed_by_user = true`

That means a `snoozed` action can still globally suppress the event record, even though it no longer writes to `dismissed_horizons`.

Why this matters
- Your spec said: snooze should hide for the current session only and should not permanently suppress the event.
- Current code still permanently mutates backend state on snooze via `dismissed_by_user = true`.
- Even worse, this creates inconsistent suppression semantics:
  - `dismissed_horizons` says “not dismissed”
  - `dismissed_by_user` says “dismissed globally”

Audit findings beyond dismissal
1. JIT only surfaces in narrow action windows
- In `supabase/functions/generate-mastery-plan/index.ts`:
  - `0–6h` => `touch2` => can surface
  - `6–24h` => `silent` => will not surface
  - `24–48h` => `touch1` => can surface
  - `>48h` => `selection_only` => will not surface

So “I have so many JIT events coming up” does not guarantee a visible JIT plan. If most events are 6–24h away, the current logic intentionally shows nothing.

2. JIT also requires score threshold
- Same file uses `JIT_THRESHOLD_UNIFIED = 55`
- Only events above threshold become `topEvent`

So even valid-window events may still not surface if score is below threshold.

3. Daily plan cache can preserve a stale null JIT state
- In `src/components/home/DailyRitual.tsx`, the app caches the whole mastery-plan response in session storage per time window.
- If the cached response had `preEventPlan: null`, the homepage can keep reusing that stale result for the current period instead of re-fetching.

4. Bridge path depends on pre-generated event context
- `generate-mastery-plan` first reads `jit_event_context` rows with:
  - `shown_in_jit = true`
  - `updated_at` within the last 12 hours
  - `event_start >= now`
- If those rows are stale, missing, or suppressed, it may fall back or surface nothing.

5. There is also a data modeling risk
- In `generate-jit-events`, rows are upserted with `onConflict: 'id'`
- But the logical identity seems to be user + calendar event, not row id
- This can create multiple context rows per same event over time instead of cleanly updating the same row, which makes suppression/history logic less reliable

Conclusion of the audit
Your requested “Problem 3 fix” is not fully implemented.
The current behavior can still hide JIT unexpectedly because:
1. `snoozed` can still set `dismissed_by_user = true`
2. many upcoming events may be in the deliberate 6–24h silent zone
3. cached `preEventPlan: null` may keep the homepage empty
4. event-context upsert identity may be unstable

Recommended implementation plan

1. Fix snooze semantics properly
Files:
- `src/components/home/JitCarousel.tsx`
- `supabase/functions/track-jit-skip/index.ts`

Changes:
- Keep dismiss button sending `snoozed` on first/second soft dismiss
- Do not persist any global dismissal fields for `snoozed`
- In `track-jit-skip`, change fallback branch so `dismissed_by_user = true` happens only for true `dismissed`, not for `snoozed`
- Keep escalation to server-side `dismissed` only after the repeated-dismiss threshold you want

Desired rule:
```text
snoozed:
- hide in current session
- record preference row
- do NOT write dismissed_horizons
- do NOT set dismissed_by_user

dismissed:
- write dismissed_horizons for the current touch
- set dismissed_by_user only when both touches are dismissed
```

2. Make session snooze behavior align exactly to your spec
File:
- `src/components/home/JitCarousel.tsx`

Changes:
- Remove any timer-based logic if any remains
- Keep session-only hiding for the active browser session
- Keep repeated-dismiss tracking across sessions by event type
- Decide whether threshold is 2+ or 3+ and use one consistent rule across client and server

Best practice for your product:
- 1st and 2nd dismiss = `snoozed`
- 3rd repeated dismissal of same event type = `dismissed`
This is safer for leaders who reject a specific event, not the whole JIT category.

3. Invalidate stale homepage plan cache when JIT visibility inputs change
File:
- `src/components/home/DailyRitual.tsx`

Changes:
- Do not reuse cached `plan-data-*` blindly when it contains `preEventPlan: null`
- Recompute when:
  - there are near-term calendar events
  - snooze state changed
  - dismissal state changed
  - app regains focus
- Add a lightweight JIT-specific freshness key instead of tying JIT entirely to the ToD cache

Why:
- Right now a cached null plan can mask newly eligible JIT events.

4. Audit and tighten pre-event selection logic
File:
- `supabase/functions/generate-mastery-plan/index.ts`

Changes:
- Add explicit reason logging for why each candidate was excluded:
  - below threshold
  - silent window
  - selection_only window
  - dismissed touch
  - no matched modules
- Return debug metadata in non-production/dev mode if needed

Important note:
- If you want “many upcoming events” to surface more often, you likely need a product change, not just a bug fix:
  - the 6–24h silent window is currently suppressing JIT by design

5. Review whether the silent 6–24h gap is still the right strategy
File:
- `supabase/functions/generate-mastery-plan/index.ts`

Current logic:
```text
0–6h: show
6–24h: do not show
24–48h: show
>48h: do not show
```

Recommendation:
- For C-suite leaders, this gap may be too aggressive.
- Consider replacing 6–24h “silent” with one of:
  - low-prominence prep pill
  - collapsed JIT preview
  - only surface if score is very high

This is likely why the app feels like it is “missing” obvious prep opportunities.

6. Fix event-context identity so one event updates one row
Files:
- migration
- `supabase/functions/generate-jit-events/index.ts`

Changes:
- Add a unique constraint for logical identity, likely:
  - `(user_id, calendar_event_id)`
- Update upsert conflict target accordingly
- This will stabilize surfacing history, dismissal history, and touch tracking

7. End-to-end QA scenarios to verify after implementation
You asked for all scenarios to be checked. These are the exact ones to validate:

Scenario A: first-time soft dismiss
- event in touch_2 window
- tap X
- plan hides in current session
- revisit same session: still hidden
- new session: plan returns
- backend does not set `dismissed_by_user`
- backend does not append `dismissed_horizons`

Scenario B: repeated dismiss of same event type
- dismiss same event type across multiple sessions
- confirm it only escalates when threshold is reached
- before threshold: still resurfaces on later sessions
- after threshold: backend records real dismissal and event type suppression works intentionally

Scenario C: snooze button
- tapping Snooze behaves like soft session hide only
- no permanent backend suppression

Scenario D: action-window behavior
- event 4h away => visible
- event 12h away => currently hidden by design
- event 30h away => visible
- event 72h away => hidden by design

Scenario E: cache invalidation
- cached page load with prior `preEventPlan: null`
- new qualifying event appears
- homepage refetches and JIT now appears

Scenario F: multiple events
- if top event is suppressed, next eligible event should surface
- not “no plan” unless no eligible candidates remain

Technical summary
Files definitely involved:
- `src/components/home/JitCarousel.tsx`
- `src/components/home/DailyRitual.tsx`
- `supabase/functions/track-jit-skip/index.ts`
- `supabase/functions/generate-mastery-plan/index.ts`
- `supabase/functions/generate-jit-events/index.ts`
- new migration for unique constraint/index if needed

Most important immediate fix
If we do nothing else, the first thing to correct is:
- `track-jit-skip` must stop setting `dismissed_by_user = true` for `snoozed`

Because right now that alone can explain why a user with many upcoming events still sees no JIT plan.

Clarification needed before implementation
One rule still needs to be locked:
- Should repeated escalation happen at 2 total dismisses, or 3 total dismisses?
Your latest wording says “2+ times across sessions,” but earlier logic and server filtering references a 3+ style threshold in related preference logic. I would implement one consistent threshold across client and backend, with 3 being safer unless you want stronger suppression.

Implementation order
1. Fix `track-jit-skip` snooze persistence bug
2. Fix client soft-dismiss semantics to match exact threshold
3. Decouple JIT from stale DailyRitual session cache
4. Add selection/debug logging
5. Revisit 6–24h silent window product rule
6. Stabilize `jit_event_context` upsert identity
