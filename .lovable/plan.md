# Restore iPhone parity, Plan intelligence, and real reminders

## Confirmed diagnosis

### 1. Why no notification has arrived since 17 September

This is now fully explained. Shukrita's notification preferences are enabled and her current iPhone token is active. Delivery itself is healthy.

The background iPhone sync added on 18 September sends silent pushes throughout the day. Those invisible pushes are saved as `accepted`, and Smart Nudges currently counts every `accepted` row toward both:

- the three-notification daily limit; and
- the two-hour spacing rule.

Shukrita receives nine silent sync pushes most days. They therefore fill the limit before a visible reminder is considered. On 18 September a real light-day morning reminder was selected, but a silent sync sent shortly beforehand triggered the two-hour block. On 19–21 September the silent pushes repeatedly produced `daily_cap`. Her last visible reminder was consequently 17 September.

**Fix:** define one shared rule for a *user-visible notification* and use it for the daily limit, spacing and occupied-window checks. Exclude every `variant_id = silent_sync` and every `early_morning_sync_*` / `daytime_sync_*` entry. Silent sync continues unchanged; it simply stops consuming reminder slots. Add a regression replay proving nine silent pushes cannot block a morning or evening reminder.

### 2. Why the three cards disagree

This morning's stored readiness result is correctly **awaiting**: all three pills say the wearable is missing and none is score-bearing. Apple Health has recently supplied heart rate only; it has not supplied fresh HRV or sleep.

However, the backend also saved and delivered a complete Brief, then saved a ready Plan, after recording readiness as awaiting. The same run records `mrs_status: awaiting`, `brief_status: ready`, and the manually-created Plan as `awaiting` while the Plan row itself says `ready`. This is a server-side atomicity failure, not evidence that iPhone and web have different data.

The current web build applies the fresh-signal gate and shows Awaiting, as the screenshots confirm. The installed iPhone build is still displaying the already-published Brief and Plan. Before changing iPhone presentation, compare its shipped bundle/version with the current gate; do not assume an iOS-only display defect until that is confirmed.

**Fix:** make the stored readiness verdict authoritative. When readiness is awaiting, Brief and Plan may store only their awaiting state and must not publish formed content. The snapshot readers on iPhone and web must apply the same current-window gate. Clear or supersede the invalid formed snapshots so an older app cannot continue selecting them.

### 3. Why the 10:30 catch-up became a “strategy session”

The actual event is `Shukrita x Melanie catch up`, with two attendees and `isHighStakes: false`. Its Apple row is stored as Category E / `routine_sync`, which is a focus-work classification. The Brief therefore gave the model a strategy/focus interpretation; the model then exposed the contradiction by calling it both a “strategy session” and “the catch up”.

**Fix:** route two-person `catch up` titles to the relational one-to-one/catch-up category in the single A–H resolver. Preserve the real title as the Brief's wording anchor. Add a test using this exact title and attendee shape.

### 4. Duplicate meetings are not the signal-pill problem

The calendar pill already collapses the Apple and Google copies correctly. Load Shape uses the same upstream merge. Its “1 further event could not be categorised” note is an unresolved-category count after deduplication, not evidence that the pill counted a duplicate.

**Decision:** do not rewrite global deduplication. Instead, identify the distinct unresolved event and correct its category resolution only if it should resolve. Separately wire the existing Brief/Plan multi-calendar evidence helper, which currently exists but is not connected; keep this isolated from the already-correct pill count.

### 5. Why today's Plan says “conference day” with no conference

The database has no Category F conference event today. It has two timed, non-high-stakes meetings and one all-day personal event. Yet the Plan row is persisted as `conference_day` while the stored load shape is `light`.

The Plan currently runs two disconnected event classifiers:

- its structural-day flag trusts an incoming `eventCategory === F`; but
- its event-priority candidate builder ignores that stored category and reclassifies title text from scratch.

The slot allocator is allowed to choose `conference_day` even when the candidate list is empty. That is exactly the impossible combination saved today: `conference_day`, `candidateCount: 0`, and three `state_fallback_no_meaningful_jit` slots. The exact source that supplied the transient F flag still needs to be captured from the Plan request/run trace; current calendar rows do not contain it.

**Fix:** the Plan must consume the single resolved A–H event result once, not classify the same event twice. A conference arc requires an actual resolved Category F event and at least one matching candidate; it may never be inferred from a stale/transient flag with zero candidates. Persist the resolved event evidence in Plan diagnostics so this can be audited later.

### 6. Correct Light Day rule for Plan

Apply the rule stated here:

- zero timed meetings → Light Day;
- one timed **non-high-stakes** meeting → Light Day;
- one high-stakes meeting, or two or more timed meetings → not Light Day;
- travel, conference, PTO/holiday and last-off-day rules retain their existing explicit precedence.

Under this rule, today is **not** a Light Day because it has two distinct timed meetings, even though both are low stakes. The Plan must therefore use an ordinary working-day shape — not `conference_day`, and not a Light Day recovery arc.

Update the shared Light Day classifier and every caller together so Brief, Plan and Smart Nudges cannot disagree. Add tests for 0 meetings, 1 low-stakes, 1 high-stakes, 2 low-stakes, and duplicated provider copies of the same single meeting.

### 7. Why event priority and “why this matters” collapsed

All three Plan slots have zero candidates. Once that happened:

- no event title, phase, category or lead time could anchor a slot;
- immediate/tactical signals had no event to attach to;
- stored patterns could not be matched to the meeting category;
- strategic goals and onboarding context were not sufficient to rescue the empty slots; and
- the why-line validator fell back to generic state language.

That produced the mixed phrases about high-demand, light and heavy days. They are three unrelated fallback sentences, not an arc assessment.

**Fix the priority chain in this order:**

1. Resolve each deduplicated event once through the A–H resolver and preserve category, subcategory, stakes and confidence.
2. Rank real events using explicit priority memory, derived priority, immediate signals, tactical patterns and strategic/onboarding relevance.
3. Bind each selected practice and why-line to the chosen event or, when there is genuinely no event anchor, to one named current signal or strategic goal.
4. Reject a formed Plan when all slots have `state_fallback_no_meaningful_jit`; use an honest awaiting/low-evidence state instead of three generic claims.
5. Validate the whole arc: every slot must agree with the one day shape, and no line may mention heavy/high-demand/light unless that is the persisted day shape.

## Implementation order

1. **Notifications first:** exclude silent sync from cap, spacing and slot occupancy; deploy Smart Nudges alone; replay 18–22 September and observe one real iPhone send.
2. **Calendar classification:** correct catch-up resolution and record the unresolved-event identity; deploy only the functions using the resolver.
3. **Plan event priority:** remove the double-classifier split, require evidence for structural arcs, restore immediate/tactical/strategic grounding, and enforce coherent fallback behaviour; deploy Plan alone.
4. **Atomic cards:** prevent formed Brief/Plan publication when readiness is awaiting and retire today's invalid snapshots; deploy each card function separately.
5. **HealthKit:** trace why HRV and sleep authorisation/read/write stopped while heart rate still syncs; restore those sample types without changing the readiness formula.

## Verification

Use Shukrita's real account, **iPhone first, then web**:

- silent background sync continues but does not consume any visible notification allowance;
- a morning and evening reminder can send when the applicable day rule calls for them;
- the three cards show the same state on both platforms;
- no score, Brief or Plan is presented as formed without a fresh score-bearing signal;
- `Shukrita x Melanie catch up` remains a catch-up, not strategy work;
- today is an ordinary two-meeting working day, never a conference day;
- every Plan slot exposes its actual event/signal/goal evidence and has a meaningful, consistent “why this matters” line;
- HRV and sleep appear in the wearable record before readiness is allowed to form.

No visual redesign, no notification-copy rewrite, and no changes to subscriptions, payments, onboarding screens or admin analytics.