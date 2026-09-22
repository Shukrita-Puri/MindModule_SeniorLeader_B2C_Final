# Finish the fix: honest day shapes, real meeting types, evidence-backed why-lines

Steps 1 and 2 (notification limits, brief calendar truth) are live. This covers the remaining four, plus iPhone/web parity and the sleep note.

## What is still wrong, and why

**1. The plan says "conference day" with no conference.**
The plan works out the shape of the day by reading category letters stored on the raw calendar rows (`generate-mastery-plan/index.ts:8716-8723`), not by asking the one classifier. Your Google copies of today's meetings carry no category at all, so that read is unreliable by design. Then the allocator locks the arc even when it found nothing to hang it on (`_shared/jit/slot-allocator.ts:184-189`: `hasConferenceDay && (!top || ...)` — the `!top` branch means "no candidates" still commits to conference day). That is precisely what got stored today: conference day, zero candidates, three no-anchor slots.

**Fix:** resolve every deduplicated event once through `resolveEvent` and feed that single result to both the day-shape helper and the candidate builder. Remove the `!top` escape — a travel/conference arc requires a resolved event of that type *and* at least one matching candidate. Record the resolved evidence in the plan's diagnostics so a wrong shape is traceable next time.

**2. The 09:30 catch-up reads as focus work; the 16:00 introductions call doesn't classify at all.**
The classifier treats "catch up" as a focus/routine title and has no rule for an external introductions call, so the day has no anchor and everything downstream falls through to state-only copy. `_shared/jit/load-jit-context.ts:195-199` also still builds its memory keys from a title guess (`coarseEventType`) outside the classifier.

**Fix (ships on its own):** two-person catch-up titles resolve as a one-to-one; an external introductions/intro call resolves as the stakes-carrying conversation it is. The memory keys come from the classifier instead of the title guess. Because this classifier is shared by the brief, plan, nudges, week-ahead and insights, it ships as its own release with cross-surface tests and a before/after comparison on your real events.

**3. The why-lines are placeholders.**
The evidence framework already exists and ranks four kinds of proof (pattern, behavioural, strategic, immediate — `_shared/plan/why-signals.ts`), but for your account every tier comes back empty, so it lands on the last-resort line `"Early days — this is the base your harder weeks run on."` (why-signals.ts:616). Two reasons: the pattern tier only reads the long-run causality store, which is thin for you; and there is no notion at all of *recent load* (the last few days) or *upcoming load* (the next two days) — the exact facts you said should justify a recovery day. Separately, the plan decides "light day" locally with an ad-hoc rule (`index.ts:8014`: no titles, or one event) instead of reading the persisted day shape.

**Fix:**
- Add two evidence kinds: recent load (high-stakes/heavy days in the last 3 days) and upcoming load (high-stakes events in the next 2 days), both drawn from data already stored.
- Widen what counts as grounding: a named body/recovery signal, a recent- or upcoming-load fact, or a stated goal all qualify — not just a calendar title.
- Require the line to justify its own claim: a recovery title must cite why recovery is warranted ("three heavy days behind you, two high-stakes meetings ahead — today is where you bank the margin"), never assert it bare.
- Read the persisted light-day/day-shape instead of recomputing it locally. The light-day rules themselves are used exactly as written in `_shared/availability/light-day.ts` and `_shared/availability/` — including the regional weekend handling. Nothing there is redefined.
- A genuine light day still gets a full recovery-focused plan. No plan is ever rejected for having no JIT.

**4. Cards can publish while readiness is awaiting.**
The stored readiness verdict becomes authoritative: when readiness is awaiting, the brief and plan store their awaiting state only. Today's already-stored invalid plan snapshot (conference day) is cleared so the phone stops showing it.

## iPhone and web parity

The phone has no plan logic of its own — it renders what the server stores (there is no classifier or day-shape code anywhere in the iOS project). So parity is not a separate build: once the server stores one honest day shape and evidence-backed lines, both surfaces show the same thing. The two things that made the phone look different were the stale stored snapshot and the awaiting gate, both handled above. I will confirm the shipped iPhone bundle after deploying, then verify on your phone first and web second.

## Sleep

Noted: your Apple Watch does not record sleep, and that is expected. Nothing will wait on sleep or claim anything about it. Sleep stays an optional input — present for users who have it, silently skipped for you — and your readiness and why-lines are justified from HRV, resting heart rate, check-ins, patterns and calendar load instead.

## Safety and co-dependencies

Isolated to the points above. Untouched: everything in `_shared/availability/`, the readiness formula and MRS weights, week-ahead triggering and its last-day rule, travel-day detection, the calendar merge and deduplication, reminder copy/windows/quiet hours and the copy gate, check-ins, subscriptions and IAP, onboarding, the admin panel and usage tracking, background sync, every database schema, every screen and style.

Shared code being edited, and who else reads it — each verified before deploy:
- `_shared/events/resolve-event-category.ts` — read by brief, plan, JIT, week-ahead, nudges, insights. Own release, cross-surface tests, before/after on your real events.
- `_shared/jit/slot-allocator.ts`, `_shared/jit/load-jit-context.ts` — plan only.
- `_shared/plan/why-signals.ts`, `_shared/plan/why-llm.ts` — plan only. All new inputs are optional and default to absent, so a missing value degrades to today's behaviour.
- The awaiting gate touches each card function separately.

One function per deploy, in order, verified on your real account before the next.

## Order

1. Event classifier (catch-up, introductions, memory keys) — own deploy.
2. Plan day shape: single resolver, drop the `!top` escape, diagnostics.
3. Why-lines: recent/upcoming load evidence, wider grounding, claim-matching justification, persisted day shape.
4. Awaiting gate + clear today's invalid stored snapshot.

## Verification

On your live account: today resolves as a working day with two timed meetings (09:30 one-to-one, 16:00 introductions), not a conference day; both meetings classify; each why-line names at least one real signal, pattern or load fact that supports its title; the phone and web show identical titles and why-lines; a light day still produces three recovery-focused slots with justification.
