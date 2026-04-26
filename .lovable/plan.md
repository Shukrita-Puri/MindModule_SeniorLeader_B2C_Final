## Root cause (confirmed against live DB)

The Cause & Effect card returns the honest empty state for this real user because **all 4 lenses produce zero findings**:

| Lens | Failure |
|---|---|
| A (Events → Physiology) | `eventTypeDays` map is **empty** — 0/11 of the user's actual event titles match the hard-coded keyword list (board, investor, 1:1, client, interview, deep work, exec, etc.). Real titles look like "Intro Call > Isabel @ Karyon Partners", "Chief AI Thursday connects", "MEETUP: AI, Data & Analytics", "LSE School Governor Scheme". Even if titles matched, only 2 days have HRV and 5 have RHR — too thin for n≥3 per event type. |
| B (Events → Cognition) | Same empty `eventTypeDays` → loop never runs. |
| C (Sleep → Next day) | `sleepRows.length >= 5` requires sleep_score OR total_sleep_minutes; user has **0** of either. Sleep data isn't being synced from HealthKit for this user. |
| D (Heavy-day streaks) | 11 events / 30 days is too sparse to produce ≥3 consecutive 2-day heavy runs. |

A latent UI bug also exists: the empty-state branch uses `totalFindings === 0` as its gate, so the "highest-impact pattern" hero row would not render even if `top` were populated (it's currently null here, but the bug is real).

---

## Fix plan

### 1. Widen the event classifier (Lens A & B unblock)

Edit `supabase/functions/cause-effect-engine/index.ts`:

- **Add catch-all buckets** so virtually every meeting gets classified:
  - `"Networking & community"` — `meetup, connect, women on the rise, summit, expo, conference, info session, governor scheme, scale, ai thursday, community`
  - `"Intro / discovery calls"` — `intro, intro call, discovery, chemistry`
  - `"Catch-ups & syncs"` — `catchup, catch-up, sync, check-in, check in, weekly, standup`
  - `"School & family"` — `school, parents evening, open evening, parents`
  - `"Internal builds"` — `db, debug, dashboard, planning, engineering, build, sprint`
- Keep existing buckets (board / investor / review / 1:1 / all-hands / client / interview / deep work / exec).
- **Add `__general__` fallback bucket** keyed by event organizer or solo-block detection (events with no attendees → `"Solo work blocks"`, events with ≥3 attendees → `"Group meetings"`). This guarantees `eventTypeDays.size > 0` whenever the user has events.
- Adjust copy in lens output so labels read naturally ("On Networking & community days, your HRV…").

### 2. Soft thresholds with explicit confidence tier (Lens A & C)

Currently every gate is binary (`n≥3` AND `|Δ|≥10%`) — anything below is dropped silently. For a real user who has *some* signal but not enough for production-grade confidence, this gives them nothing.

Add a `confidence` field to `Finding`:
- `"strong"` — current gate (n≥5, |Δ|≥10% / 0.5 tier)
- `"emerging"` — n≥3, |Δ|≥10% / 0.5 tier (today's gate becomes "emerging")
- Anything weaker → still dropped.

UI renders an "Emerging" pill chip on emerging rows so the executive sees the data is preliminary, not falsely authoritative. This stays true to the CEO contract while letting thin-data users actually see something actionable.

### 3. Add a fifth source for Lens A: calendar load → physiology

Even with bad title classification, **calendar minutes/day is a clean numeric input**. Compute:
- High-load days (top tertile of `loadByDay`) vs the rest
- Compare HRV / RHR averages
- Same gating as event-type findings

This unlocks Lens A for any user with wearable data and any calendar at all — independent of title keywords. Surface as cause `"High-load calendar days"`.

### 4. Lens C fallback: total_sleep_minutes → checkins-only when wearable sleep is absent

If the user has zero sleep_score *and* zero total_sleep_minutes (this user's situation), fall back to **morning-checkin "renewal" / "sleep_quality" self-report** if those fields exist on `daily_checkins`. (Will check the actual columns; if not present, keep Lens C empty and update the empty-state copy to "Connect Apple Health sleep tracking to unlock".) This keeps data honesty intact.

### 5. Lower Lens D occurrence floor with confidence tier

Drop `runEndPlusOne.length >= MIN_OCCURRENCES` (3) to `>= 2` for `confidence: "emerging"`. Keep `>= 3` for `"strong"`.

### 6. Fix the hero-finding UI gate

Edit `src/components/insights/PerformanceCausalityCard.tsx`:

- Change the empty-state condition from `!data || totalFindings === 0` to `!data || (totalFindings === 0 && !data.top)`.
- When `top` exists but all lenses are empty, render the hero card + a soft note: "More patterns will surface as your signals build."
- Render an "Emerging" pill on rows where `confidence === "emerging"`.

### 7. Improve the lens empty-state copy to be specific

Each lens already has tailored empty-state messages. Update them to reference the *actual* missing inputs:
- Lens A empty → "We've classified N event types but none cleared the threshold yet. {wearableDayCount} wearable days available."
- Lens C empty → "Connect Apple Health sleep tracking — currently 0 sleep records."

### 8. Force-refresh + redeploy

After the engine update, invalidate today's cache row for the affected user (`DELETE FROM causality_findings WHERE computed_for_date = current_date`) so the next page load runs the new engine. Add a small `?force=1` button affordance is **not** in scope — the cache will naturally roll over tomorrow, and the manual delete handles today.

### 9. Validation steps

1. Deploy `cause-effect-engine`.
2. Delete the cached row for the test user.
3. Curl the function with the user's auth token.
4. Verify the response now has at least 1–2 findings (likely Lens A "High-load calendar days → RHR" or "Networking & community → RHR" given the actual data shape) and a non-null `top`.
5. Reload `/insights` → Patterns tab and confirm the hero row + at least one chevron lens shows content.
6. Confirm the "Emerging" pill renders correctly on lower-confidence findings.

---

## Files to edit

- `supabase/functions/cause-effect-engine/index.ts` — wider classifier, confidence tier, calendar-load lens, sleep fallback, lower Lens D floor, updated copy.
- `src/components/insights/PerformanceCausalityCard.tsx` — fix hero gate, render confidence pill, refresh empty-state copy.
- `mem/features/insights/performance-causality.md` — document confidence tiers and the calendar-load fifth source.

## Files NOT touched

- `causality_findings` schema — unchanged; payload shape is purely additive (`confidence` field is optional on the type).
- Mock data / preview auth — unchanged; this user is fully authenticated.
- `Insights.tsx` — unchanged.