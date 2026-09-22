# Restore iPhone parity, honest day shapes, and evidence-backed why-lines

## Confirmed diagnosis

### 1. Why no notification has arrived since 17 September

Her preferences are on and her iPhone token is active; delivery is healthy.

The background sync added on 18 September sends silent pushes through the day. They are recorded as `accepted`, and Smart Nudges counts every `accepted` entry toward both the three-per-day limit and the two-hour spacing rule. She receives nine silent pushes most days, so the allowance is consumed before a visible reminder is considered.

Trace evidence: 18 September selected a real light-day morning reminder and then blocked it with `two_hour_suppression`; 19–21 September show repeated `daily_cap`; today's early runs are simply before her 08:00 window. No meeting-count rule was ever reached.

**Fix:** one shared rule for a *user-visible* notification, used by the daily limit, the spacing rule and window occupancy — excluding `silent_sync` and all `early_morning_sync_*` / `daytime_sync_*` entries. Silent sync itself is unchanged. Replay 18–22 September to prove nine silent pushes cannot block a morning or evening reminder.

### 2. Light Day — the existing definition is used as-is, not redefined

The definition already lives in these files and none of them is edited:

- `supabase/functions/_shared/availability/light-day.ts` — the light-day SSOT: `light_workday` (zero or one timed meeting), `weekend`, `public_holiday`, `pto`; the last-day-of-run exclusion that preserves week-ahead behaviour; the 2+ meeting hard gate (`packed_day_meeting_count_gate`); the travel and conference overrides; `countTimedMeetings` (all-day markers never count).
- `supabase/functions/_shared/availability/availability-classifier.ts` — the availability states the light-day module projects from.
- `supabase/functions/_shared/availability/holiday-applicability.ts` — which public holidays apply to the user.
- `supabase/functions/_shared/availability/week-ahead-hydration.ts` — the planning-day / last-off-day inputs, including the Sunday-versus-Saturday planning day for Israel and the Gulf.
- Tests that pin all of the above: `availability-classifier.test.ts`, `availability-classifier-consolidation.test.ts`, `availability-cross-surface.test.ts`, `holiday-run-awareness.test.ts`, `light_day_surfaces_test.ts`.

Its consumers stay as they are: `generate-mastery-plan/index.ts`, `smart-nudges/index.ts`, `_shared/brief/deterministic-brief.ts`, `compute-outer-readiness/index.ts`, `_shared/jit/slot-allocator.ts`.

Today already fails that rule — two timed meetings, so `packed_day_meeting_count_gate` applies and it is not a light day. The work below fixes the surfaces that contradicted the verdict, never the rule.

### 3. There is one A–H resolver — the Plan has a second, non-resolver path

You are right that JIT v2 uses a single classifier. The duplicate is not a second A–H resolver; it is the Plan's day-shape helper reading raw stored columns instead of asking the resolver:

- `generate-mastery-plan/index.ts:8716-8723` derives `hasTravelDay`, `hasConferenceDay` and `hasOffsiteDay` straight off `e.eventCategory` / `e.eventSubcategory` on the calendar row — no `resolveEvent` call, no merge of the duplicate provider copies. Her Google rows carry no category at all, so this read is unreliable by construction.
- `_shared/jit/load-jit-context.ts:195-199` still builds legacy memory keys from `coarseEventType(ev.title)`, a title heuristic outside the resolver.
- `_shared/jit/slot-allocator.ts:188-189` then commits the arc: `hasConferenceDay && (!top || top.categoryId === "F")`. The `!top` branch means an **empty** candidate list still locks `conference_day` — exactly what was persisted today: `day_kind: conference_day`, `candidateCount: 0`, three `state_fallback_no_meaningful_jit` slots, while the stored load shape says light.

**Fix:** the Plan calls `resolveEvent` (`_shared/events/resolve-event-category.ts`) once per deduplicated event and feeds that one result to both the day-shape helper and the candidate builder, replacing the raw-column read at 8716 and the title heuristic at 199. In `slot-allocator.ts:184-189`, a structural arc requires a resolved event of that type **and** at least one matching candidate — the `!top` escape goes. Record the resolved evidence in plan diagnostics.

### 4. The 10:30 catch-up mislabelled as a strategy session

`Shukrita x Melanie catch up` — two attendees, not high stakes — is stored as Category E / `routine_sync`, a focus-work classification, so the Brief called it a strategy session and a catch-up in one paragraph.

**Fix:** in the resolver, two-person `catch up` titles resolve to the relational one-to-one category, and `_shared/brief/deterministic-brief.ts` describes a meeting by its own title. Test with this exact title and attendee shape. The 16:00 introductions meeting must resolve as the high-stakes presentation it is, which is what gives today's plan a real anchor.

### 5. Duplicate meetings are not the pill's problem

The calendar pill already collapses the Apple and Google copies, and Load Shape uses the same merge. The “1 further event could not be categorised” note is an unresolved-category count *after* deduplication.

**Decision:** no deduplication rewrite. Resolution simply runs on the merged event rather than one provider's row — the same change as item 3 — and then the genuinely unresolved event is identified.

### 6. Why “why this matters” says nothing meaningful — the real defect

The titles are right; the justification is missing.

`_shared/plan/why-llm.ts` already accepts HRV, sleep, resting heart rate, mind and body state, stress and burnout load, pattern summary and growth intention. Today it received almost none of it: readiness is awaiting so `stateBand` is null, HRV and sleep are absent so every wearable phrase in `pickRelevantSignalPhrases` is dropped, and no slot has an event so there is no anchor.

The validator at `why-llm.ts:378-391` then requires **either** an event anchor **or** a state-band word. With neither, every line is rejected as `generic` and the deterministic fallback writes the placeholders you saw.

Two further gaps:

- **Recovery is asserted without recovery proof** — nothing obliges a recovery recommendation to cite a recovery signal.
- **Recent and upcoming load are not inputs at all** — `WhyLLMInput` has no field for "recent days were heavy or high-stakes" and none for "the next two days are high stakes", so the writer cannot make your argument even when the data exists.

**Fix — reason first, then write:**

1. Add recent-load and upcoming-load evidence to `WhyLLMInput`, computed from stored day context and the calendar.
2. Widen grounding in the validator: an event anchor **or** a named body/recovery signal **or** a recent/upcoming load fact **or** a stated strategic goal. Only a line citing none of these is generic.
3. Require the justification to match the claim: a recovery recommendation must cite the reason to recover; a preparation recommendation must cite what it prepares for.
4. On a light day the plan is still produced and still recovery-focused — its lines must read like your example: today is light, recent days were heavy, the next days are high stakes, so today is where the margin is built.
5. Keep the deterministic path, but make its sentences carry the same evidence instead of placeholder text.
6. An empty candidate list is **not** grounds to reject a plan. Only slots with no evidence of any kind fall back, and that fallback still names a real signal.

### 7. Why the three cards disagree between iPhone and web

Today's stored readiness is correctly awaiting, yet the same run published a full Brief and stored a ready Plan. Web applies the fresh-signal gate and shows Awaiting; the installed iPhone build is still showing the published content.

**Fix:** the stored readiness verdict is authoritative — when awaiting, Brief and Plan store only their awaiting state. Both platforms read through the same gate. Clear today's invalid formed snapshots so an older app cannot keep selecting them, and confirm the shipped iPhone bundle version before calling this iOS-only.

### 8. Wearable data

Apple Health has supplied heart rate only since 20 September — no HRV, no sleep. Trace the authorisation and read path for those sample types and restore them. The readiness formula is unchanged.

## Safety and co-dependencies

This is an isolated change to the eight points above. Nothing else in these features moves.

**Not touched anywhere in this work:** every file under `_shared/availability/` (the light-day, availability, holiday and week-ahead rules); the readiness formula and MRS weights; week-ahead triggering and its last-day rule; travel-day detection; the calendar merge and deduplication; reminder copy, windows, quiet hours and the copy gate; check-ins; subscriptions and IAP; onboarding; the admin panel and usage tracking; the "finish setting up" reminder; background sync itself; any database schema; any frontend screen or styling.

**Shared code being edited, and who else reads it — each verified before deploy:**

- The user-visible notification rule (`_shared/countable-notification-states.ts` and its Smart Nudges callers) — read only by Smart Nudges limits and spacing. Silent sync writes the same rows as today; only the counting changes.
- `_shared/events/resolve-event-category.ts` — the single A–H entry point read by Brief, Plan, JIT v2, Week Ahead, Smart Nudges, Insights and the signal engine. The catch-up and presentation changes alter classification for those titles on **every** surface. That is the intent (the Brief was wrong too), and it is the highest-reach change here, so it ships on its own with the cross-surface tests and a before/after comparison on her real events.
- `_shared/jit/slot-allocator.ts` — read by the Plan only. Removing the `!top` conference escape can only stop a structural arc being claimed without evidence; travel, week-ahead, weekend and mixed-day ordering are untouched.
- `_shared/plan/why-llm.ts` — read by the Plan only. New input fields are optional and default to absent, so a missing value degrades to today's behaviour rather than failing.
- `_shared/brief/deterministic-brief.ts` — read by the Brief and the home cards. Only the meeting-description sentence changes; state copy, validators and pill logic stay.
- The readiness-authoritative gate touches each card function separately; Brief and Plan already read the same stored verdict, so this removes a disagreement rather than adding a rule.

**Deployment discipline:** one function per deploy, in the order below, each verified on her real account before the next. Every new read is failure-tolerant — if evidence is missing, the surface degrades to today's content instead of erroring.

## Implementation order

1. Notifications: exclude silent sync from limits and spacing (Smart Nudges alone); replay 18–22 September.
2. Event resolution: resolve merged events once; catch-up and presentation stakes; cross-surface tests.
3. Plan day shape: replace the raw-column read and the legacy title heuristic; require evidence for structural arcs.
4. Why-lines: add recent/upcoming load, widen grounding, require claim-matching justification.
5. Card atomicity and retirement of today's invalid snapshots.
6. HealthKit HRV and sleep.

## Verification

On her real account, iPhone first then web:

- silent sync consumes no visible-notification allowance, and a morning and evening reminder can send;
- today is an ordinary working day anchored on the 16:00 presentation — not a conference day;
- the 10:30 meeting reads as a catch-up;
- every “why this matters” line names its evidence — the event, a body signal, recent or upcoming load, or a stated goal — and a recovery recommendation always shows why recovery is warranted;
- a genuine light day still produces a full recovery-focused plan with justified lines;
- the three cards agree on both platforms, and nothing shows as formed without a fresh score-bearing signal;
- HRV and sleep appear before readiness is allowed to form;
- the existing availability, light-day, week-ahead and cross-surface test suites pass unchanged.
