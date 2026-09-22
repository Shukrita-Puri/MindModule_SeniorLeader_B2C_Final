# Restore iPhone parity, honest day shapes, and evidence-backed why-lines

## Confirmed diagnosis

### 1. Why no notification has arrived since 17 September

Her preferences are on and her iPhone token is active; delivery is healthy.

The background sync added on 18 September sends silent pushes through the day. They are recorded as `accepted`, and Smart Nudges counts every `accepted` entry toward both the three-per-day limit and the two-hour spacing rule. She receives nine silent pushes most days, so the allowance is consumed before a visible reminder is considered.

Trace evidence: 18 September selected a real light-day morning reminder and then blocked it with `two_hour_suppression`; 19–21 September show repeated `daily_cap`; today's early runs are simply before her 08:00 window. No meeting-count rule was ever reached.

**Fix:** define one shared rule for a *user-visible* notification and use it for the daily limit, the spacing rule and window occupancy — excluding `silent_sync` and all `early_morning_sync_*` / `daytime_sync_*` entries. Silent sync is unchanged; it just stops consuming reminder slots. Add a replay proving nine silent pushes cannot block a morning or evening reminder.

### 2. Light Day — the existing definition stays exactly as it is

The shared light-day module is already the single definition and already covers everything: a working day with zero or one timed meeting, a weekend day, an applicable public holiday, and PTO/OOO — with the last day of any weekend, holiday or PTO run excluded so week-ahead behaviour is preserved, and with "last day" resolved through the regional planning day (Sunday for most countries, Saturday for Israel and the Gulf). Travel and all-day conference days are explicit overrides and are never light days.

**Nothing in that module is redefined, reworded or re-derived.** It is the rule all three surfaces keep reading.

Today already fails it: two timed meetings, so it is not a light day. The correct shape is an ordinary working day, anchored on the presentation. Everything below fixes the surfaces that ignored or contradicted this verdict — not the rule itself.

### 3. Why today's Plan says “conference day”

No Category F event exists today. Two timed meetings and one all-day personal event do. Yet the Plan persisted `conference_day` while the stored load shape says `light`.

The Plan runs two disconnected classifiers: its day-shape flag trusts an incoming `eventCategory === F`, while its candidate builder ignores stored categories and re-reads titles from scratch. The allocator is then allowed to lock a conference arc with an **empty** candidate list — exactly what was saved: `conference_day`, `candidateCount: 0`, three `state_fallback_no_meaningful_jit` slots.

**Fix:** resolve each deduplicated event **once** through the single A–H resolver and use that one result for both the day shape and the candidate list. A structural arc (conference, travel) requires a genuinely resolved event of that type plus at least one matching candidate. Persist the resolved event evidence in plan diagnostics so this is auditable.

### 4. The 10:30 catch-up mislabelled as a strategy session

`Shukrita x Melanie catch up` — two attendees, not high stakes — is stored as Category E / `routine_sync`, a focus-work classification. The Brief therefore called it a strategy session and a catch-up in the same paragraph.

**Fix:** two-person `catch up` titles resolve to the relational one-to-one category, and the Brief describes a meeting using its own title. Test with this exact title and attendee shape.

Today's second meeting is a presentation and must resolve as high stakes, which is what gives today's plan a real anchor.

### 5. Duplicate meetings are not the pill's problem

The calendar pill already collapses the Apple and Google copies correctly, and Load Shape uses the same merge. The “1 further event could not be categorised” note is an unresolved-category count *after* deduplication.

**Decision:** no global deduplication rewrite. Only the Google copies currently carry no category, so resolution must run on the merged event rather than on one provider's row; correct that, and identify the genuinely unresolved event.

### 6. Why “why this matters” says nothing meaningful — the real defect

This is the important one, and it is not about banned words. The titles are right; the justification is missing.

The why-line writer already accepts HRV, sleep, resting heart rate, mind and body state, stress and burnout load, pattern summary and growth intention. Today it received almost none of it:

- readiness is awaiting, so the state band is empty;
- HRV and sleep are absent, so every wearable phrase is dropped;
- all three slots have no event, so there is no anchor.

The validator then requires **either** an event anchor **or** a state-band word. With neither, every line is rejected as “generic” and the deterministic fallback writes the placeholder sentences you saw — three unrelated claims about high-demand, light and heavy days with nothing behind them.

Two further gaps:

- **Recovery is asserted without recovery proof.** The prompt may say “recover” with no obligation to cite a recovery signal, so the recommendation appears without its reason.
- **Recent and upcoming load are not inputs at all.** There is no field for “the last three days were heavy or high-stakes” and none for “the next two days are high stakes”, so the writer cannot make the argument you described even when the data exists.

**Fix — reason first, then write:**

1. Add recent-load and upcoming-load evidence to the why-line input: how many recent days carried heavy load or high-stakes commitments, and what is coming in the next two days, computed from stored day context and the calendar.
2. Widen acceptable grounding: a line is grounded by an event anchor **or** a named body/recovery signal **or** a recent/upcoming load fact **or** a stated strategic goal from onboarding. Only a line citing none of these is generic.
3. Require the justification to match the claim: a recovery recommendation must cite the reason to recover — recent heavy load, upcoming high-stakes load, or a named body signal. A preparation recommendation must cite what it prepares for.
4. On a light day the plan is still produced and still recovery-focused; the difference is that its lines read like the argument you gave — today is light, recent days were heavy, the next days are high stakes, so today is where the margin is built.
5. Keep the deterministic path, but make its sentences carry the same evidence instead of placeholder text.
6. An empty candidate list is **not** grounds to reject a plan. Only slots with no evidence of any kind fall back, and that fallback still names a real signal.

### 7. Why the three cards disagree between iPhone and web

Today's stored readiness is correctly awaiting. The same run nevertheless published a full Brief and stored a ready Plan. Web applies the fresh-signal gate and shows Awaiting; the installed iPhone build is still showing the published Brief and Plan.

**Fix:** the stored readiness verdict is authoritative — when it is awaiting, Brief and Plan store only their awaiting state and never publish formed content. Both platforms read through the same gate. Clear the invalid formed snapshots so an older app cannot keep selecting them. Confirm the shipped iPhone bundle version before treating this as an iOS-only display defect.

### 8. Wearable data

Apple Health has supplied heart rate only since 20 September — no HRV, no sleep. Trace the authorisation and read path for those sample types and restore them. The readiness formula is unchanged.

## Implementation order

1. Notifications: exclude silent sync from limits and spacing; deploy Smart Nudges alone; replay 18–22 September.
2. Event resolution: resolve merged events once; fix catch-up and presentation stakes.
3. Plan day shape and candidates: one classifier, evidence required for structural arcs.
4. Why-lines: add recent/upcoming load, widen grounding, require claim-matching justification.
5. Card atomicity and retirement of today's invalid snapshots.
6. HealthKit HRV and sleep.

The light-day module itself is not edited at any step.

## Verification

On her real account, iPhone first then web:

- silent sync no longer consumes any visible notification allowance, and a morning and evening reminder can send;
- today is an ordinary working day anchored on the presentation — not a conference day;
- the 10:30 meeting reads as a catch-up;
- every “why this matters” line names its evidence: the event, a body signal, recent or upcoming load, or a stated goal — and a recovery recommendation always shows why recovery is warranted;
- a genuine light day still produces a full recovery-focused plan with justified lines;
- the three cards agree on both platforms, and nothing is shown as formed without a fresh score-bearing signal;
- HRV and sleep appear before readiness is allowed to form.

No visual redesign, no reminder-copy rewrite, and no changes to subscriptions, onboarding screens or admin analytics.
