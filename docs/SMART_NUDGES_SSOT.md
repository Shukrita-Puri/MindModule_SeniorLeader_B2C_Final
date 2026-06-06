# Smart Nudges — Single Source of Truth

**Document version:** v1.1
**Last updated:** 2026-06-06
**Owner:** Notifications / Signal Engine
**Edge function:** `supabase/functions/smart-nudges/index.ts` (3,505 lines)
**Architecture tag (telemetry):** `cos-mind-v8-meaning-forward`
**Supersedes:** `docs/SMART_NUDGES_COMPREHENSIVE_ARCHITECTURE.md`, `docs/SMART_NUDGES_ARCHITECTURE.md`, `docs/SMART_NUDGES_TECHNICAL_DOCUMENTATION.md` (retained for history only — **this file is canonical**).
**Companion:** `docs/GENERATE_MASTERY_PLAN_SSOT.md` (Plan SSOT — shares context, pattern store, taxonomy).

> When this document and any older nudges doc disagree, **this document wins**. Update this file in the same PR that changes nudges behaviour.

---

## 0. What "Smart Nudges" is

`smart-nudges` is the edge function invoked by `pg_cron` on a high-frequency tick. For every active user it builds a `NudgeContext`, runs three evaluators (Nudge 1 / 2 / 3), picks at most ONE qualified nudge using the v7 comparator, generates copy through the Claude→Gemini→static cascade, validates against the **V8 copy contract**, assigns a CTA A/B variant, and ships via APNs with per-intent TTL and a per-day collapse-id.

Anchored to ONE of two things, **always**:

- **JIT** — a specific upcoming/just-past calendar event from the user's morning plan.
- **STATE** — a specific physiological / check-in / plan-progress signal from today.

No anchor ⇒ no nudge. No exceptions.

---

## 1. Shared-module wiring

Smart-nudges is a **consumer** of the same shared modules the Brief and Plan use. It must not own its own calendar parser, its own taxonomy, or its own pattern store.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  _shared/executive-state-taxonomy.ts                                        │
│    isNoiseTitle • isHighStakesTitle • highStakesScore • classifyEventBucket │
│    detectDayKindFromEvents                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  _shared/calendar-provider.ts                                               │
│    detectClientPlatform • wrapDbWithCalendarPrimacy                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  _shared/ceo-behaviour/travel.ts                                            │
│    isTravelTitle • detectPreFlightTravelEvent • detectInFlightTravelEvent   │
├─────────────────────────────────────────────────────────────────────────────┤
│  _shared/events/event-phase-map.ts  +  _shared/protocols/protocol-combos.ts │
│    EVENT_PHASE_MAP.G[pre|during|post] drives travelPhaseFraming()           │
├─────────────────────────────────────────────────────────────────────────────┤
│  _shared/events/event-classifier.ts                                         │
│    classifyEvent • classifyPatternBucket  (canonical subtypes → buckets)    │
├─────────────────────────────────────────────────────────────────────────────┤
│  _shared/copy-vocabulary.ts                                                 │
│    FORBIDDEN_NOTIFICATION_WORDS  ← single source of banned vocabulary       │
├─────────────────────────────────────────────────────────────────────────────┤
│  _shared/anthropic.ts          callClaudeText  (Haiku 3.5, 6 s timeout)     │
│  _shared/ai-gateway (lovable)  callLovableAIText  (gemini-3-flash-preview)  │
├─────────────────────────────────────────────────────────────────────────────┤
│  _shared/brief-prompt-version.ts   BRIEF_PROMPT_VERSION (stamped on log)    │
└─────────────────────────────────────────────────────────────────────────────┘

        ▼ read by smart-nudges/index.ts

  causality_findings        ← loadPatternSummary → findEventPattern (unified pattern store)
  daily_context_snapshot    ← supply_demand_gap_flag, pattern_signals.sustained_deficit_flag
  jit_event_context         ← per-event prep rows (must not be dismissed)
  daily_ritual_completions  ← plan_ledger (used for JIT silence)
  notification_log          ← write-side: every emission, suppression, APNs result
  notification_device_tokens, notification_preferences, profiles, user_engagements
```

**Hard rules:**

1. The forbidden-word list lives **only** in `_shared/copy-vocabulary.ts` (`FORBIDDEN_NOTIFICATION_WORDS`). `FORBIDDEN_WORDS_V6` in `index.ts` is `[...FORBIDDEN_NOTIFICATION_WORDS]` — never edit one without the other.
2. Event classification (noise / high-stakes / pattern bucket) **never** uses inline keyword tables in `index.ts`; it always delegates to `_shared/executive-state-taxonomy.ts` and `_shared/events/event-classifier.ts`.
3. Travel framing is sourced from `EVENT_PHASE_MAP.G` + `PROTOCOL_COMBOS` so Brief / Plan / Travel-notifications / Smart-nudges narrate Pre / During / Post travel identically.
4. The pattern store is `causality_findings.signal_summary` (the **unified** store) — no parallel reads from legacy `event_outcome_patterns`.

---

## 2. Scheduling, timing contract, hard caps

| Constant | Value | Where | Purpose |
|---|---|---|---|
| `DAILY_NOTIFICATION_CAP` | **3** | `index.ts:166` | Absolute per-user daily ceiling across the 3-nudge cascade. **Never a 4th send**, even with travel / look-ahead overlays. |
| `INTRA_TICK_MAX` | **1** | `index.ts:218` | Per-user, per-cron-tick: at most one notification regardless of evaluator hits. |
| `GLOBAL_EARLIEST_LOCAL` | **08:00 local** | `index.ts:213` | Hard floor. Kills 6/7am sends. Enforced before any evaluator runs. |
| `GLOBAL_LATEST_LOCAL` | **21:30 local** | `index.ts:214` | Hard ceiling. |
| `APP_OPEN_COOLDOWN_MS` | **60 min** | `index.ts:216` | After app-open engagement, no push. Was 30; raised in v5. |
| 2-hour suppression | between any two sends | `index.ts:3007` | Overridable **only** by JIT mid-day or by `SUPPLY_DEMAND_GAP + sustained_deficit_flag` MRS escalation. |
| DND window | per-user `notification_preferences.dnd_start/dnd_end` | `index.ts:2981` | Hard skip. |
| Quiet days | per-user `notification_preferences.quiet_days[]` | `index.ts:2984` | Hard skip. |

**Cron tick:** `smart-nudges` is invoked by `pg_cron` (see `notification_cron_invoke_smart_nudges` job created via earlier migration). Every tick re-evaluates every user with an active iOS device token. The function is idempotent per-user-per-day because the daily cap + per-type `alreadySentTypes` are read from `notification_log`.

**Force / test path:** `?force_user=<id>` (alias `?force_user_id=`) bypasses the global window + DND for one user; cooldowns, suppression, anchor presence, and the V8 validators still run. `?force_dry=1` skips APNs delivery.

---

## 3. The 3-Nudge cascade (what fires, when, why)

The system uses **exactly three slots** regardless of overlays. Travel arc, pattern-promotion, and look-ahead all ride existing `nudge_one`/`nudge_two`/`nudge_three` slots.

### 3.1 Nudge 1 — First Touch (morning)

**File:** `evaluateNudgeOne()` at `index.ts:2131`.
**Default route:** `/daily-check-in`. **JIT variant route:** `/executive-home`.
**Window:**
- With first non-noise meeting: anchor 60 min before (virtual) / 90 min before (in-person), clamped to `[08:00, 10:00]`; never closer than 15 min to the meeting.
- No meeting: `08:00–09:30`.
- **Saturday** with a meeting: `≥ 09:00`.
- **Saturday** with no meeting, **Sunday**: `09:00–10:30` (sleep-in policy, V8).
- First event ≥ 30 min away required.

**Variant priority (first match wins):**
1. `nudge_one_pre_flight` — `dayContext.preFlight` detected, route `/recalibrate`. `signalStrength=3`.
2. `nudge_one_post_arrival` — `dayContext.postTravel` + no morning check-in yet, route `/daily-check-in`. `signalStrength=2`.
3. `nudge_one_jit` — `jit_event_context` row exists for the event (`dismissed_by_user=false`), event in `[30 min, 3 h]`, **no notification-only category**, **plan ledger does NOT mark prep completed**. Route `/daily-check-in` if check-in pending else `/executive-home`. `signalStrength=3` if `findEventPattern` hits, else `2`.
4. `nudge_one_morning` — morning anchor, AI or fallback. Route `/daily-check-in`. `signalStrength=2` if wearable data present, else `1`.

**PTO mode** (`dayContext.ptoMode`): skip step 3 entirely — never fire JIT on a day off. Fall through to a single light-touch morning anchor.

### 3.2 Nudge 2 — Mid-day Action

**File:** `evaluateNudgeTwo()` at `index.ts:2343`.
**Window:** `08:00–16:00` local.

**Variant priority:**
1. `nudge_two_in_flight` — `dayContext.inFlight` (now inside a flight ≥ 90 min). Route `/recalibrate`. `signalStrength=3`, TTL 90 min.
2. PTO collapse → return null.
3. `nudge_two_jit` — same gates as Nudge 1 JIT (event in `[30 min, 3 h]`, `jit_event_context` row alive). Smart routing: `/executive-home` if already checked in, else `/daily-check-in`. `signalStrength=3` if pattern, else `2`.
4. `nudge_two_reserves` — `wearable.rhrElevated` **or** `hrvDeltaPct < -15` + an upcoming high-stakes event today + app not opened in 4 h. Route `/daily-check-in`. `signalStrength=2`. Refuses to send if no real number can be cited.
5. `nudge_two_priorities` — **gated off by `LEGACY_GENERIC_NUDGES_ENABLED = false`** (v7 deprecation). Framework retained for future opt-in.
6. `nudge_two_recalibrate` — weekday + morning check-in was `depleted|managing` + an afternoon high-stakes event remains. Route `/daily-check-in`. `signalStrength=2`.

**JIT override:** even when the 2-hour suppression is active, the JIT variant of Nudge 2 (route `/executive-home`) is allowed through.

### 3.3 Nudge 3 — Evening Close

**File:** `evaluateNudgeThree()` at `index.ts:2533`.
**Route:** `/daily-check-in`.
**Window:**
- Weekday: `18:00–21:30`.
- Friday: `18:30–21:30` (close-the-week tone).
- Sunday: **only** `17:00–19:30` (week-prep tone).
- Saturday: **disabled** (their time).

**Gates:** PTO collapse → skip. `checkinCountToday ≥ 2` → skip. `afternoonCheckinOutcome !== null` → skip.

**Variant priority:**
1. `nudge_three_lookahead` — any non-Sunday evening where tomorrow has a high-stakes event in the next 18 h. `signalStrength=3`, TTL 10 h.
2. `nudge_three` — standard close. `anchorKind = 'jit'` if tomorrow has a non-noise first meeting, else `'state'`. `signalStrength = 2` (jit) or `2` (state w/ wearable) or `1` (state w/o wearable).

---

## 4. Selection comparator (v7) — picks ONE nudge per user per tick

After all three evaluators run, the candidate list is sorted by:

1. **Slot rank:** `morning(0) > evening(1) > afternoon(2)`. Mid-day generic lures are deprecated — afternoon survives only via JIT, reserves-down, or in-flight.
2. **Anchor:** `jit > state`.
3. **Signal strength** (descending): pattern-cited JIT (3) > plain JIT (2) ≈ wearable-cited state (2) > generic state (1) > travel-arc (3 for pre-flight/in-flight by design).
4. **Priority** (ascending) as final tiebreaker.

Then dedupe by `type`. The top candidate ships. If the user is in 2-hour suppression and the top candidate is **not** a JIT mid-day, the send is skipped.

---

## 5. NudgeContext — the data block every nudge reasons over

Built once per user per tick by `buildNudgeContext()` (`index.ts:635`). The same context block flows into every evaluator and into the LLM user-prompt blocks. Critical fields:

- **Calendar:** `firstNonNoiseEvent`, `eventCount` (non-noise today), `highStakesEvents`, `tomorrowEvents`, `jitEvents[]` (from `jit_event_context`), `inMeetingNow`, `calendarGaps[]`.
- **Check-in / plan:** `morningCheckinOutcome` (`peak|focused|managing|depleted|null`), `afternoonCheckinOutcome`, `checkinCountToday`, `pendingPracticeIds[]`, `lastCheckinTime`.
- **Wearable** (`hasWearableData`): `wearable.hrvDeltaPct` (vs personal baseline), `wearable.rhrElevated`, `wearable.sleepScore`. Strict honesty: never cite a metric whose source is `null`.
- **Pattern:** `pattern` = `loadPatternSummary()` from `causality_findings.signal_summary`. `findEventPattern(pattern, eventTitle)` returns a typed pattern hit used to promote JIT signal strength to `3`.
- **Day shape:** `dayContext = { kind: 'normal'|'travel-day'|'away-day'|'ooo', preFlight?, inFlight?, postTravel?, ptoMode? }`. Travel sub-flags (`preFlight` 60–240 min before flight, `inFlight` inside ≥ 90-min flight, `postArrival` ≥ next morning local) ride existing slots — they do not create a 4th send.
- **Coach:** `coach.pendingCommitments[]`, `coach.stressSignals[]`, `coach.lastSessionAt` (post-MVP evaluators only).
- **Engagement:** `engagementProfile` from `getUserEngagementProfile()` — `suppressedTypes[]` is consulted to deterministically thin types the user has stopped tapping.
- **Badge:** `badgeCount` = pending priorities + due check-in, set on the APNs payload (`aps.badge`).

---

## 6. MRS v2 snapshot-first cadence gating

Read from `daily_context_snapshot` (the canonical daily snapshot produced by `compute-daily-intelligence`):

| `supply_demand_gap_flag` | `pattern_signals.sustained_deficit_flag` | Behaviour |
|---|---|---|
| `LIGHT_DAY_STRONG_STATE` | — | **Suppress all nudges for this user today.** (CEO-friendly: don't push someone whose system is already aligned and easy.) |
| `SUPPLY_DEMAND_GAP` | `true` | **Escalate:** bypass the 2-hour suppression so the urgent recovery / prep lure can break through. |
| anything else | — | No change. |

Missing snapshot row falls back to existing behaviour (never throws).

---

## 7. Copy generation cascade

Order, per nudge type:

1. **Claude Haiku 3.5** (`tryAIProvider('claude', …)`) via `callClaudeText` — `max_tokens=256`, `temperature=0.7`, 6-second `AbortController` timeout.
2. **Gemini 3 Flash Preview** (`google/gemini-3-flash-preview`) via the Lovable AI Gateway — same temperature/tokens/timeout. Triggered when Claude returns `null` or throws.
3. **Static fallback** — one of the `getFallbackNudge*` builders (e.g. `getFallbackNudgeOneMorningCopy`, `getFallbackNudgeOneJitCopy`, `getFallbackNudgeThreeLookaheadCopy`). Every static fallback is run through `validateStaticFallbackCopy` so a stale fallback can never bypass the V8 contract.

`payload.metadata.ai_fallback_chain` is stamped `'claude-haiku → gemini-flash → static'` on every log row. `payload.metadata.ai_provider_used` records which step actually produced the shipped copy.

### 7.1 The system prompt (verbatim contract — keep in sync with `generateNudgeCopy` at `index.ts:1279`)

> You are the Chief of Staff for the Mind of a C-suite leader. You write push notifications for a MENTAL-PERFORMANCE app. The user's job, every time, is to OPEN THE APP and do MENTAL prep — never strategic prep, never deck prep.
>
> EVERY notification is anchored to ONE of two things:
> • JIT — a specific upcoming/just-past calendar event from the user's morning plan
> • STATE — a specific physiological / check-in / plan-progress signal from today
> If neither anchor is present, do not write copy.
>
> THE THREE V8 PRINCIPLES (non-negotiable):
> 1. **Lead with meaning, not the data point.** Raw metrics never lead. The first sentence translates what the data MEANS for the user's day. The number, if used, sits INSIDE the meaning sentence — it never carries the message alone.
> 2. **Title = state or moment. Body = context + one clear action.** Title names a moment a CEO recognises ("Recovery in progress", "Starting from where you are"). Body delivers the so-what plus a specific in-app action.
> 3. **CTA always ends at a specific app screen via a "log in / check in / open" verb — and the prep is always MENTAL.** Plain "prep" is ambiguous (a CEO reads it as "prep the deck"). Every CTA must qualify the prep as MIND / STATE / RECALIBRATE / CLOSE / SET / LAND.

Per-nudge user prompts (also in `generateNudgeCopy`) add the available signals block + a `Required CTA verb at end of body: …` line. Gold-standard examples are embedded so the model has 12 worked examples to imitate (see Appendix A).

### 7.2 Allowed CTA verbs (V8 — `ALLOWED_CTA_VERBS_V8`)

Verbatim end of body (modulo trailing punctuation):

- `log in to prep your mind`
- `log in to prep your mind tonight`
- `log in to prep your state`
- `log in to recalibrate your mind`
- `check in to recalibrate`
- `check in to set your intention`
- `check in to set tomorrow`
- `check in to close the day`
- `check in to close the week`
- `check in to land the weekend`
- `open your insights` (pattern alerts only)

### 7.3 Banned CTA verbs and vocabulary (`FORBIDDEN_WORDS_V6` + `FORBIDDEN_NOTIFICATION_WORDS`)

- Passive consumption: `your prep is ready`, `your plan is ready`, `your brief is ready`, `see your prep`, `see your plan`, `see your readiness`, `tap to prep`.
- Unqualified V7 prep verbs: `open the app to prep`, `check into the app to prep`, `go to the app to prep`, `prep now`, `open the app to prep tonight`, `open the app to prep with a cool-down`.
- Wellness vocabulary: `wellness`, `mindful`, `mindfulness`, `relax`, `breathe`, `calm`, `recharge`, `self-care`.
- Streak / praise vocabulary: `streak`, `keep it up`, `well done`, `great job`, `productive`, `productivity`.
- Mechanical product vocabulary: `intent`, `strategy`, `strategic`, `decision posture`, `decision readiness`, `mental sharpness`, `anchor sharpness`, `performance state`, `reset trajectory`, `capacity`, `reserves`, `baseline`, `set the tone`, `loaded day`, `come back`.

### 7.4 Validators (run in this exact order)

- `violatesMeaningSentence(body)` — rejects a bare metric first sentence (e.g. `HRV -22% today`, `RHR +9 bpm`).
- `requiresNamedContextToken(body, ctx)` — body MUST cite **one** of: a real event title from the user's plan, an `HRV|RHR|HR|Sleep` number with unit, a count (`5 meetings`, `3 priorities`), a minutes-until / clock time, or a check-in outcome word the user actually logged.
- `violatesCopyContractV8(body, ctx)` — runs forbidden-word lint, V8 CTA terminal-verb check, placeholder-token lint, meaning-sentence lint, named-context lint, then length caps.
- `containsFabricatedWearableData(body, hasWearableData)` — rejects HRV/RHR/sleep citations when the source is `null`.

### 7.5 Length ceilings

| Surface | Max words | Max chars |
|---|---|---|
| **Title (V8)** | 6 | 60 (truncated by `parsed.title.substring(0,60)`) |
| **Body (V8)** | **22** | **140** (truncated by `parsed.body.substring(0,140)`) |
| Body (V6 legacy lint, retained but not the active gate) | 14 | 95 |
| Event title in body | truncated to first 3 words if > 20 chars (`truncateEventTitle`) |

V8 raised the body cap from V7's 16/95 because meaning-forward bodies are longer; gold-standard examples run **18–22 words**.

---

## 8. CTA A/B experiment (V8 — `cta-action-verb-v2`)

Stamped on every payload: `payload.cta_experiment = 'cta-action-verb-v2'`, `payload.cta_variant ∈ {A,B,C,D}`. The `variant_id` is suffixed `::A|B|C|D` so per-copy×variant slicing works in SQL. Variant assignment is FNV-1a hash of `userId::nudgeFamily` — user×family stable.

| Arm | Brief route (`/daily-check-in`) | Plan route (`/executive-home`) |
|---|---|---|
| **A** control / morning anchor | `check in to set your intention` | `log in to prep your mind` |
| **B** state-framed | `check in to recalibrate` | `log in to prep your state` |
| **C** urgency / recovery | `log in to recalibrate your mind` | `log in to prep your mind` |
| **D** close-of-day / week | `check in to close the day` | `check in to close the week` |

`applyCtaVariant` rewrites the trailing verb to match the assigned arm (Variant A is the control — body is left untouched, only tagged). After rewrite, `violatesCopyContractV8` runs **one more time**; any post-rewrite violation is logged with `delivery_state='suppressed'` and `suppression_stage='post_cta'` and the send is dropped (low-context static fallbacks are exempt from the named-context branch of the post-CTA recheck to avoid suppressing morning anchors).

---

## 9. APNs delivery contract

| Aspect | Behaviour |
|---|---|
| **JWT** | ES256, signed in-function via `createApnsJwt(APNS_P8_KEY, APNS_KEY_ID, APNS_TEAM_ID)`. P8 normalisation handled by `normalizeP8Key()` (handles `\n` literals, missing BEGIN/END, padding). |
| **Host** | `api.push.apple.com` if `APNS_ENVIRONMENT=production`, else `api.sandbox.push.apple.com`. |
| **Topic** | `APNS_BUNDLE_ID` (default `com.moonshot.mindmoduleapp`). |
| **Token validation** | `isCanonicalIosApnsToken` requires hex + length ∈ {64, 72, 128}. Malformed tokens are deactivated immediately. |
| **TTL (`apns-expiration`)** | Per-variant via `nudgeTtlSeconds()` — JIT 45 min, morning anchor 3 h, in-flight 90 min, evening 6 h, look-ahead 10 h, recalibrate / reserves / priorities 2 h. After expiry, APNs drops the queued push — no zombie notifications. |
| **Collapse-id (`apns-collapse-id`)** | `${family}-${localDate}` for non-travel, `travel-${localDate}` for pre-flight + in-flight (latest update wins on reconnect). |
| **Badge (`aps.badge`)** | `ctx.badgeCount` — pending priorities + due check-in. Computed in `buildNudgeContext`. |
| **Auto-deactivation** | APNs `410 Unregistered` or `400 BadDeviceToken` / `DeviceTokenNotForTopic` → `is_active=false` on `notification_device_tokens`. |
| **Dry-run** | If any of `APNS_P8_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID` is missing **or** `?force_dry=1`, the function logs the row with `dry_run:true` and does not call APNs. |

---

## 10. Telemetry contract — what lands in `notification_log`

Every row carries:

- `user_id`, `notification_type` (`nudge_one|nudge_two|nudge_three|…`), `variant_id` (`AI-claude-nudge_one_jit-<ts>::A` style), `event_reference` (calendar `external_id` for JIT, else `null`), `delivery_state` (`pending|accepted|delivered|expired_before_delivery|failed|suppressed`), `delivered_at` (set by `notification-receipt` edge function from the iOS Notification Service Extension + tap handler).
- `payload`:
  - `title`, `body`, `notification_type`, `variant_id`, `deep_link_route`, `dry_run`
  - `architecture: 'cos-mind-v8-meaning-forward'`
  - `prompt_version: BRIEF_PROMPT_VERSION`
  - `cta_variant: 'A'|'B'|'C'|'D'`, `cta_experiment: 'cta-action-verb-v2'`
  - `apns_expiration`, `apns_collapse_id`, `apns_status`, `apns_reason`, `apns_token_prefix` (first 12 chars only — never the full token)
  - `badge`
  - `qualification_warnings: string[]` (e.g. `['repeated_expiry']`)
  - `suppression_reason`, `suppression_stage` (when suppressed)
  - `metadata.ai_fallback_chain`, `metadata.ai_provider_used`
  - `decision_trace.{variant, route, type, cta_variant, ai_provider_used}`

**Receipt feedback:** if the last 3 sends for a `(user, family)` were all `expired_before_delivery`, the next send is stamped `payload.qualification_warnings = ['repeated_expiry']` (a per-user timing signal for future cadence learning).

---

## 11. Deep-link routing (client side)

`src/hooks/usePushNotificationHandler.ts` reads `data.deep_link_route` from the APNs payload; falls back to `ACTION_ROUTES[notification_type]` if absent. Routes used in production:

| Variant | Route |
|---|---|
| `nudge_one_morning`, `nudge_one_post_arrival`, `nudge_three*` | `/daily-check-in` |
| `nudge_one_jit` (after check-in), `nudge_two_jit` (after check-in), `nudge_two_priorities` | `/executive-home` |
| `nudge_one_jit` (no check-in), `nudge_two_jit` (no check-in), `nudge_two_reserves`, `nudge_two_recalibrate` | `/daily-check-in` |
| `nudge_one_pre_flight`, `nudge_two_in_flight` | `/recalibrate` |
| (post-MVP) `pattern_alert` | `/insights` |

On tap, the client also fires `notification-receipt` so the row is upgraded from `accepted` → `delivered` (taps are also a delivered signal — closes the APNs accept-vs-deliver gap).

---

## 12. Day-shape, travel arc, weekend / PTO policy

- **Travel arc** rides existing slots (never a 4th send):
  - `preFlight` (60–240 min before flight, morning slot, TTL 45 min)
  - `inFlight` (now inside ≥ 90-min flight, mid-day slot, TTL 90 min, body is self-sufficient — body must work without push details)
  - `postArrival` (next morning local, morning slot, TTL 3 h)
  - Naming: "travel" is named verbatim — no long/short-haul distinction.
- **PTO collapse** (`dayContext.ptoMode`): only the morning light-touch nudge; mid-day, evening, **and JIT pre-event prep** are skipped.
- **Saturday:** morning anchored if there is a meeting; recovery/reset state-anchored if not (09:00–10:30); evening **disabled**.
- **Sunday:** morning recovery/reset (09:00–10:30); evening 17:00–19:30 week-prep tone. Friday close window is `18:30–21:30`.

---

## 13. JIT silence and dedupe

- **JIT silence:** if `daily_ritual_completions.plan_ledger` contains a matching priority with `status='completed'` (matched by `event_reference` exact or by event-bucket title substring), the JIT pre-event nudge is suppressed — the user has already done the work.
- **Event-reference dedupe:** `sentEventRefs` (today's `notification_log.event_reference` set) blocks repeat JITs for the same calendar event.
- **Notification-only categories:** `suppressJitForNotificationOnlyCategory(eventTitle)` blocks JIT for categories like 1:1s where the intent is reminder-only, not coaching.

---

## 14. Engagement-based suppression

`getUserEngagementProfile(userId)` returns `suppressedTypes[]` — types the user has stopped tapping. `isEngagementSuppressed(type)` deterministically thins those types (hash of `userId+type+todayStr` mod 2 → keep half), so the user is not 100% silenced but the bad-fit type is dampened.

---

## 15. Validation harness

Run `supabase--test_edge_functions {functions:["smart-nudges"]}` to invoke the v5 validation suite (`supabase/functions/smart-nudges/v5_validation_test.ts`). It asserts:

1. **Source audit** — no V4 forbidden vocabulary in any active fallback; every fallback has a CTA verb.
2. **Constants** — `GLOBAL_EARLIEST_LOCAL = 8.0`, `APP_OPEN_COOLDOWN_MS = 60 min`, `INTRA_TICK_MAX = 1`, payload stamps `architecture: 'cos-mind-v5'` (legacy assertion — V8 stamps `cos-mind-v8-meaning-forward`; harness must be updated when V9 ships).
3. **CTA distribution** — `assignCtaVariant` uniform 20–30% per arm over 4,000 synthetic IDs; stable per user.
4. **Live tick** — POST to deployed function; every emission has a valid `deep_link`, a CTA verb, no forbidden words, `::A|B|C|D` variant_id suffix.
5. **DB audit (24h)** — every row respects the 08:00 floor, 21:30 ceiling, 60-min cool-down; required payload fields present.
6. **Weekend audit (7d)** — Sat/Sun morning `nudge_one` only fires anchored variants.

---

## 16. The bridge — legacy → V8 (rewrite layer)

`CTA_REWRITE_PATTERNS` at `index.ts:476` is the defensive bridge. It recognises **all** of:

- Legacy V5/V6 CTAs (`open your brief`, `see your readiness`, `tap to prep`, `recalibrate now`, …)
- V7 unqualified-prep verbs (`open the app to prep`, `prep now`, …)
- V8 surface forms (so a body already wearing one V8 verb can be rewritten to match a different assigned arm)

Any matched phrase is replaced with the assigned arm's `CTA_PHRASES[variant][kind]`. If no canonical phrase is detected, the variant verb is appended (`body + ', ' + phrase`).

**Removal plan:** keep the rewrite patterns indefinitely. They cost nothing at runtime and protect against any LLM regression to a banned verb.

---

## 17. Post-MVP evaluators (currently dark)

Gated entirely by `MVP_POST_LAUNCH = false` (`index.ts:171`). Code retained:

- `evaluateCalendarGap` — 5-min-into-gap detection, requires ≥ 2 post-gap meetings or a post-gap high-stakes event.
- `evaluateCoachMeetingMatch` — open coach commitments + a matching meeting today.
- `evaluateStateAwareAfternoon` — afternoon state-aware nudge once the signal-richness gate is added.
- `evaluatePatternAlert` — routes to `/insights` with the `open your insights` CTA.
- `evaluateDailyFallback` — last-chance daily lure.

When activated, each must additionally honour the v7 anchor rule (JIT-or-STATE) and the V8 copy contract — no exceptions.

---

## 18. Memory references (rules layer — keep in sync)

- `mem://features/notifications/smart-nudges-mvp-framework` — V8 framework rules.
- `mem://features/notifications/cta-ab-experiment` — V8 four-arm experiment, telemetry, SQL.
- `mem://features/notifications/v5-validation-harness` — what the validation suite asserts.
- `mem://features/performance-readiness/prompt-snapshot-nudges` — verbatim pre-refactor prompt capture (rollback reference).
- `mem://architecture/brief/copy-vocabulary-ownership` — `_shared/copy-vocabulary.ts` ownership.
- `mem://architecture/unified-pattern-store` — `causality_findings.signal_summary` as canonical store.
- `mem://infrastructure/apns-delivery-diagnostics` — APNs error model + token deactivation rules.
- `mem://infrastructure/apns-p8-key-normalization-protocol` — P8 parsing.

---

## 19. Change-log discipline

1. Any change to: cap, window, cooldown, evaluator priority, CTA verb list, forbidden vocabulary, length cap, validator order, telemetry stamp, or comparator — **must** bump this doc's version + date in the same PR.
2. New variant ⇒ add a row to §3 with route, window, gates, signal strength; add the TTL to `nudgeTtlSeconds`; add the deep-link to §11; add fallback copy + put it through `validateStaticFallbackCopy`.
3. Removing legacy code (e.g. flipping `LEGACY_GENERIC_NUDGES_ENABLED` permanently off) ⇒ delete the dead branch and update §3.2.
4. LLM provider swap ⇒ update §7 cascade + `payload.metadata.ai_fallback_chain` string and the validation harness.

---

## Appendix A — Gold-standard examples embedded in the system prompt

These shipped examples are the **executable spec** for tone. If a new variant lands and you cannot write a body that matches one of these shapes, the variant is wrong — not the contract.

- **Evening · 7 meetings** — Title: *Evening cool-down* / Body: *Seven meetings, no real break for your mind today. Close the day before it carries into tomorrow — log in to recalibrate your mind.*
- **Evening · HRV deficit** — Title: *Recovery in progress* / Body: *Your body's running below baseline (HRV -22%). Close the day with a short reset before tomorrow loads up — log in to recalibrate your mind.*
- **Morning · yesterday depleted + heavy day** — Title: *Starting from where you are* / Body: *Yesterday was heavy and today has 5 meetings ahead. Manage your energy instead of reacting to it — check in to set your intention.*
- **Morning · JIT board in 60m** — Title: *Preparing mental performance* / Body: *Board Review in an hour. Walk in with the edge, not the anxiety — log in to prep your mind.*
- **Afternoon · morning was low** — Title: *Mid-day reset window* / Body: *Your morning state was low and the afternoon is still ahead. This is the recovery window — check in to recalibrate.*
- **Afternoon · 3 more meetings** — Title: *Recalibrating mid-day* / Body: *Halfway through with three more meetings ahead. Stay sharp instead of running on fumes — check in to recalibrate.*
- **Pre-event · investor 60m, peak** — Title: *You're ready for this* / Body: *Investor Update in an hour. Your mental prep is built for exactly this moment — log in to prep your mind.*
- **Pre-event · board 45m, depleted** — Title: *Managing the moment* / Body: *Board Review in 45 minutes and you're running low. Short, sharp, built for right now — log in to prep your state.*
- **Friday close** — Title: *Week complete* / Body: *Five heavy days behind you. Close the week before you disconnect so it doesn't bleed into the weekend — check in to close the week.*
- **Sunday · heavy Monday** — Title: *Monday is already mapped* / Body: *Tomorrow opens with Board Review and a full calendar. Three minutes of clarity tonight beats two hours of catch-up — check in to set tomorrow.*
- **Sunday · high-stakes Monday** — Title: *Big Monday — pre-loading now* / Body: *Tomorrow opens with a high-stakes moment. Wake up ahead instead of behind — log in to prep your mind tonight.*
- **Saturday · low HRV** — Title: *The body's still catching up* / Body: *Recovery from the week isn't instant — your HRV is still below baseline. A short check-in tells you what kind of weekend you actually need — check in to land the weekend.*

---

## Appendix B — File map

| File | Role |
|---|---|
| `supabase/functions/smart-nudges/index.ts` | Edge function (entire pipeline). 3,505 lines. |
| `supabase/functions/smart-nudges/v5_validation_test.ts` | Deno validation harness. |
| `supabase/functions/_shared/executive-state-taxonomy.ts` | Noise / high-stakes / day-kind. |
| `supabase/functions/_shared/events/event-classifier.ts` | `classifyEvent`, `classifyPatternBucket`. |
| `supabase/functions/_shared/events/event-phase-map.ts` | Travel phase contract. |
| `supabase/functions/_shared/protocols/protocol-combos.ts` | Combo outcomes for travel framing. |
| `supabase/functions/_shared/ceo-behaviour/travel.ts` | Pre/in-flight detectors. |
| `supabase/functions/_shared/calendar-provider.ts` | Platform + calendar-primacy DB wrapper. |
| `supabase/functions/_shared/copy-vocabulary.ts` | `FORBIDDEN_NOTIFICATION_WORDS`, CTA verb tables. |
| `supabase/functions/_shared/anthropic.ts` | Claude client. |
| `supabase/functions/_shared/brief-prompt-version.ts` | Prompt-version stamp. |
| `src/hooks/usePushNotificationHandler.ts` | Client-side tap routing + receipt-on-tap. |
| `src/hooks/useNotificationEngagement.ts` | Tap / open / target-action tracking. |
| `src/utils/notificationDiagnostics.ts` | Local-notification telemetry listeners. |
| `supabase/functions/notification-receipt/` | Receives delivered/tapped acknowledgements from iOS. |

---

_End of SSOT v1.0 — 2026-06-04._