
## v5.3 — Chief-of-Staff overlays (Apr 2026)

- **3-slot ceiling absolute.** Travel arc, pattern-promotion, and look-ahead all ride existing `nudge_one`/`nudge_two`/`nudge_three` slots. Never a 4th send.
- **OR-fusion.** A nudge fires on Immediate OR Tactical OR Strategic — never an AND-gate. Other layers enrich copy only.
- **Travel sub-flags** in `dayContext`: `preFlight` (60–240 min before flight, rides morning, 45-min TTL), `inFlight` (now inside ≥90-min flight, rides mid, 90-min TTL, self-sufficient body), `postArrival` (existing).
- **Pattern-promotion JIT.** `findEventPattern` already promotes pattern-cited JITs to `signalStrength=3`; today's state enriches copy tone but does not gate firing.
- **PTO collapse.** `dayContext.ptoMode` (away-day/ooo) → only morning light-touch nudge; mid + evening + JIT skipped.
- **Look-ahead overlay.** Any evening (not just Sunday) where tomorrow has a high-stakes event in next 18 h → `nudge_three_lookahead` variant.
- **JIT silence.** If matching priority in `daily_ritual_completions.plan_ledger` is `completed`, JIT pre-event prep is suppressed.
- **Punctuality + clean desk.** Per-intent `apns-expiration` + `apns-collapse-id` (`${family}-${localDate}`, or `travel-${localDate}` for travel arc) — see `nudgeTtlSeconds` / `nudgeCollapseId`.
- **Honest receipts.** `notification_log.delivery_state` (`accepted | delivered | expired_before_delivery | failed`) + `delivered_at`. iOS Notification Service Extension and tap handler POST to `notification-receipt` edge function.
- **Intelligent badge.** `aps.badge` = pending priorities + due check-in. Computed in `buildNudgeContext` (`badgeCount`).
- **Receipt feedback.** 3 consecutive `expired_before_delivery` for a family stamps `payload.qualification_warnings = ['repeated_expiry']`.

## v1.1 — Headline + CTA + delivery-context (Jun 2026)

- **Collapsed headline = `Mind Module` (always).** Moment headline moves to `aps.alert.subtitle`, capped 3 words / 28 chars (`clampSubtitle`, `requiresHeadlineStructure`).
- **Weekend / post-PTO CTA bucket** (`let's prioritise the week ahead`, route `/plan`) is **gated**: only fires when a `brief_snapshots` row for today AND a non-empty `daily_ritual_completions.plan_ledger` for today both exist. Missing either → fall back to the weekday CTA + `/daily-check-in`. Gate reason stamped as `payload.metadata.weekend_cta_gate ∈ {ok|missing_brief|missing_plan}`.
- **Back-to-back guard.** Largest gap between now and next 3 h of events < 30 min → suppress with `suppression_reason='back_to_back'`. Gap ∈ [30, 60] min → downgrade to reminder variant (`take 60 seconds`, no app open required, `headline_variant='reminder'`, static fallback only).
- **Offline / airplane skip.** All active device tokens stale > 60 min → skip with `suppression_reason='offline'`, **never queued** (stale nudges past 1 h have no value). Low battery via `notification_preferences.low_power_mode` (TBD column).
- **Post-landing window.** Uses `dayContext.landingPlusHighStakes`: when a meeting is 15–60 min after the most recent flight landing, anchor a Nudge 1 slot variant tagged `headline_variant='post_landing'`, CTA `take 60 seconds`, route `/executive-home`. Rides the existing slot — never a 4th send.
- **`ALLOWED_CTA_VERBS_V8` additions:** `let's prioritise the week ahead`, `take 60 seconds`.
- **New telemetry on `payload.metadata`:** `delivery_skip_reason`, `headline_variant`, `cta_bucket`, `requires_app_open`, `weekend_cta_gate`.
- **A/B CTA rewrite is bypassed** for weekend, reminder, and post-landing buckets (verb already locked).
---
name: Smart Nudges v8 Framework
description: JIT-or-State anchoring, slot/anchor/signal comparator, V8 meaning-forward + qualified mind-prep CTA contract, unified pattern store reads. V8 evolves ONLY copy principles — cascade, suppression, frequency, slot priority, comparator, routing, deep-links, scheduling are unchanged.
type: feature
---
Every Smart Nudge MUST be either JIT-anchored (a specific calendar event from the user's morning plan / today / tomorrow) or STATE-anchored (a specific physiological, check-in, or plan-progress signal). If neither anchor is present, do not send.

**Slot priority (comparator step 1):** Morning > Evening > Afternoon. Mid-day generic lures are deprecated and gated behind `LEGACY_GENERIC_NUDGES_ENABLED = false`.

**Anchor priority (comparator step 2):** JIT outranks STATE.

**Signal strength (comparator step 3, descending):** pattern-cited JIT (3) > plain JIT (2) ≈ wearable-cited state (2) > generic state (1). Final tiebreaker: legacy `priority` ascending.

**Voice:** Trusted human Chief of Staff. CEO-friendly. Never mechanical: `decision posture`, `decision readiness`, `mental sharpness`, `performance state`, `reset trajectory`, `capacity`, `reserves`, `baseline` are forbidden.

**Copy contract V8 (`violatesCopyContractV8`)** — three principles:
1. **Lead with meaning, not the data point.** First sentence translates what the data MEANS for the user's day. Raw metrics (e.g. `HRV -22% today`) NEVER lead — they sit inside the meaning sentence. Enforced by `violatesMeaningSentence`.
2. **Title = state or moment. Body = context + one clear action.** Title names a moment a CEO recognises ("Recovery in progress", "Starting from where you are"). Body delivers the so-what plus a specific in-app action.
3. **CTA always ends at a specific app screen via a "log in / check in / open" verb — and the prep is always MENTAL.** This is a mental-performance system; unqualified `prep` is banned (a CEO reads it as "prep the deck"). Allowed verbs (verbatim end of body): `log in to prep your mind` (+ `tonight` variant), `log in to prep your state`, `log in to recalibrate your mind`, `check in to recalibrate`, `check in to set your intention`, `check in to set tomorrow`, `check in to close the day`, `check in to close the week`, `check in to land the weekend`, `open your insights` (pattern alerts only).

**Banned verbs** (in `FORBIDDEN_WORDS_V6`, AI cannot regress to them):
- Passive consumption: `your prep is ready`, `your plan is ready`, `your brief is ready`, `see your prep`, `see your plan`, `see your readiness`, `tap to prep`.
- Unqualified V7 prep verbs: `open the app to prep`, `check into the app to prep`, `go to the app to prep`, `prep now`, `open the app to prep tonight`, `open the app to prep with a cool-down`.

**Named context required.** Body MUST cite at least one real token: an event title from the user's plan, a numeric physiological signal with unit, a countable today-state (`5 meetings`, `3 priorities`), a check-in outcome word the user logged, or a minutes-until / clock time for a real event. Enforced by `requiresNamedContextToken`.

**Hard ceilings:** ≤22 words, ≤140 chars, no placeholder tokens, no forbidden words. (Ceilings raised from V7's 16/95 — meaning-forward bodies are longer than metric-led ones; gold-standard examples run 18–22 words.)

**Proactive prefix:** when the JIT anchor is on the user's morning plan, the body must lead with `From your morning Plan:` or `From your plan:` — that prefix IS the proactive lure.

**Pattern citation:** when `findEventPattern(ctx.pattern, eventTitle)` returns a hit, briefly cite it with human language ("HR ran high last time"). Never quote percent or n.

**A/B CTA buckets (`CTA_PHRASES`):** all four variants are V8 qualified mind-prep verbs (see `cta-ab-experiment.md`, experiment id `cta-action-verb-v2`). Routing/deep-link is unchanged on payload — verbs imply destination but the system still controls the route.

**Telemetry:** every V8 payload is stamped `architecture: 'cos-mind-v8-meaning-forward'` and `cta_experiment: 'cta-action-verb-v2'`. V5–V7 rows remain in `notification_log` with their original stamps and must not be pooled with V8.

**V8 weekend morning policy.** Saturday AM fires whether or not a meeting exists — anchored Saturday tone if a meeting is on the calendar, recovery/reset state-anchored copy if not. Sunday AM now fires (recovery/reset habit). Both Sat-no-meeting and Sun-AM use the 09:00–10:30 local window (users sleep in). Saturday evening unchanged (no nudge); Sunday evening unchanged (17:00–19:30 week prep).

**V8 day-shape awareness (copy-only).** `buildNudgeContext` derives a `dayContext = { kind: 'normal' | 'travel-day' | 'away-day' | 'ooo'; signalToken?; postTravel }` from already-fetched today/yesterday calendar events. It influences COPY only — JIT scoring, suppression stack, comparator, scheduling, and `NOISE_KEYWORDS` are unchanged. "travel" is named verbatim (no long/short-haul distinction). Post-travel applies to both STATE and JIT mornings: lead sentence acknowledges yesterday's travel; the qualified mind-prep CTA verb is unchanged. No pre-flight lure, no `travel_*` notification type, no timezone/jet-lag scoring.