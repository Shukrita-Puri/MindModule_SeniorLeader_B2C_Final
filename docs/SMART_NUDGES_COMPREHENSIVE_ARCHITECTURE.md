# Smart Nudges — Comprehensive Architecture Document

> Last updated: 2026-06-06
> **Superseded by `docs/SMART_NUDGES_SSOT.md` v1.1** for the headline/CTA/delivery-context contract (see §20 of the SSOT). This document is retained for the v1.0 narrative and remains accurate where v1.1 does not override.
> Edge Function: `supabase/functions/smart-nudges/index.ts`
> Architecture: MVP 3-Nudge System — v8 meaning-forward copy, registry-driven CEO-behaviour wiring, 2-model AI cascade (Claude → Gemini), v5.3 Chief-of-Staff overlays (travel sub-arcs, pattern-promotion, PTO collapse, look-ahead).

---

## 1. System Purpose

Smart Nudges is a **signal-first, context-aware push notification engine** that delivers timely, personalised prompts to C-suite leaders. Every nudge leads to a **plan** — not just a screen.

### MVP Design Philosophy

- **3 nudges max per day** — hard ceiling on `notification_log` rows per local day (`DAILY_NOTIFICATION_CAP = 3`). Travel sub-arc, pattern-promotion, and look-ahead all *ride* the existing slots — never a 4th send.
- **Every nudge is action-linked** — check-in → plan, plan directly, or coach/reset
- **Calendar-aware timing** — adapts to first meeting, not fixed windows
- **Nudges are numbered 1, 2, 3** — not "morning/evening" — because Nudge 1 could be JIT prep

### How the 3/day budget actually fills

The cron tick (`smart-nudges-every-15m`, pg_cron jobid 4) **selects at most one nudge per user per run** — `deduped[0]` from the comparator. Across the day, the 3 slots fill through *separate* cron passes:

| Tick window (local) | Slot most likely to win | Why |
|---|---|---|
| 08:00–10:30 | `nudge_one` (morning / JIT) | Morning outranks afternoon/evening in `SLOT_RANK` |
| 12:00–16:00 | `nudge_two` (priorities / JIT / recalibrate) | `nudge_one` is in `alreadySentTypes`, returns null |
| 17:00–21:30 | `nudge_three` (evening close / look-ahead) | Both prior slots resolved |

If a user is seeing only **1 nudge/day** rather than 3, walk the suppression stack in this order — these are the realistic culprits:

1. **2-hour cooldown** — Nudge 2 cannot fire within 2h of Nudge 1 unless it's a JIT variant (`deepLinkRoute === '/executive-home'`). Tight morning + early-afternoon meetings can collapse the Nudge 2 window.
2. **60-min app-open cooldown** (`APP_OPEN_COOLDOWN_MS`) — if the user opened the app within the last 60 min the entire run is skipped (`continue`), not just the matched slot.
3. **Global window** — `GLOBAL_EARLIEST_LOCAL=08:00`, `GLOBAL_LATEST_LOCAL=21:30`. Anything outside is logged as `outside global window (H.M). Skipping.`
4. **Engagement-learning suppression** — `getUserEngagementProfile` can mark a `nudge_one/two/three` family as suppressed; a deterministic 50% coin (hash on `userId+type+date`) drops the run.
5. **Already-sent gate** — `evaluateNudge{One,Two,Three}` short-circuits if the family is in today's log (`already_sent_today` log line).
6. **DND / quiet days / in-meeting / PTO collapse** — `dayContext.ptoMode` (`away-day`/`ooo`) limits to a single morning light-touch send and explicitly skips Nudge 2, 3, and JIT.

The cap of 3 is therefore an *upper bound that the cascade is designed to reach* — not a guarantee. If the 1/day pattern persists for an active user with no PTO and no engagement suppression, the most common cause in production is **#2 (60-min app-open cooldown)** — opening the app shortly after the morning nudge silences the rest of the day.

### KPIs Driven

| KPI | Which Nudge |
|-----|-------------|
| Daily check-in rate | Nudge 1 (morning) + Nudge 3 (evening) |
| Practice completion rate | Nudge 2 (priorities/JIT) |
| Daily return rate | All 3 (spaced across the day) |

---

## 2. Architecture Overview

```text
┌───────────────────────────────────────────────────────────────┐
│                  pg_cron (every 15 min)                        │
│           jobid: 4, smart-nudges-every-15m                    │
└──────────────────────┬────────────────────────────────────────┘
                       │ HTTP POST (no auth — cron-invoked)
                       ▼
┌───────────────────────────────────────────────────────────────┐
│            Edge Function: smart-nudges/index.ts                │
│                    (verify_jwt=false)                          │
│                                                               │
│  1. FETCH USERS — notification_device_tokens → user list       │
│  2. BATCH FETCH — profiles, preferences, engagements           │
│  3. PER-USER SUPPRESSION STACK                                 │
│     Global window (08:00–21:30) → DND → Quiet days →          │
│     Daily cap (3) → 60-min app-open → engagement-learning →   │
│     2h cooldown (per-run, JIT-exempt) → In-meeting check      │
│  4. SIGNAL ASSEMBLY — buildNudgeContext()                      │
│     13 parallel DB queries → NudgeContext + dayContext        │
│     + loadPatternSummary (causality_findings.signal_summary)  │
│  5. MVP 3-NUDGE CASCADE                                        │
│     evaluateNudgeOne → Two → Three (Post-MVP gated behind      │
│     MVP_POST_LAUNCH=false). Comparator picks ONE per run:     │
│     slot rank → JIT > STATE → signalStrength → priority       │
│  6. CEO-BEHAVIOUR WIRING (Phase 2)                             │
│     evaluateForScope('nudge', ctx) → flags + slotBoosts        │
│     surface as `behaviour` block inside the LLM userPrompt    │
│  7. AI COPY GENERATION — 2-model cascade + static fallback    │
│     Claude Haiku → Gemini 3 Flash Preview → static library    │
│     V8 contract check (meaning sentence, named context,       │
│     qualified mind-prep CTA, ≤22 words / ≤140 chars)          │
│  7. DELIVERY                                                  │
│     notification_log INSERT → APNs HTTP/2 push                │
│     Deep link, badge count, apns-collapse-id, apns-expiration │
│     aiProvider stamped: 'claude' | 'gemini' | 'static'        │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. MVP 3-Nudge System

### Nudge 1 — First Touch (earliest relevant moment)

```text
What fires depends on context:

A) JIT morning event (high-stakes < 2h away)
   → /executive-home (plan with JIT slot 1)
   "Board Review at 9:30 — your prep plan is ready"

B) Loaded day (3+ meetings, first event < 2h)
   → /daily-check-in (check-in generates plan)
   "6 meetings today, first at 9 — set the tone now"

C) Light day (0-2 meetings, first event > 2h)
   → /daily-check-in
   "Your day is open — check in to decide what to own today"

Calendar-aware timing:
- If first meeting at 10am → nudge at ~8:30-9:00
- If first meeting at 8am → nudge at ~6:30-7:00
- Weekday: 6:30-9:30 (shifts based on first event)
- Saturday with meeting: 9:00-11:00 (slower entry, anchored)
- Saturday no meeting: 9:00-10:30 (recovery/reset, state-anchored)
- Sunday: 9:00-10:30 (recovery/reset habit; anchored if a meeting exists)

Gate: No morning check-in yet (or no JIT plan started)
```

#### Copy Library

| Context | Title | Body | Deep Link |
|---------|-------|------|-----------|
| JIT morning (high-stakes < 2h) | `Prep ready` | `{EventTitle} in {min} min — your prep plan is built` | `/executive-home` |
| Loaded + high-stakes | `{EventTitle} today` | `{count} events including {EventTitle} — check in to sharpen` | `/daily-check-in` |
| Loaded day (3+) | `Loaded day` | `{count} meetings today — set the tone before it sets you` | `/daily-check-in` |
| Light day | `Your day is open` | `Light calendar — check in to decide what to own today` | `/daily-check-in` |
| Saturday | `No agenda` | `Check in when you are ready — your day, your terms` | `/daily-check-in` |
| Sunday morning | `Sunday reset` | `A moment to land before the week forms` | `/daily-check-in` |
| Low recovery (wearable) | `Ground First` | `Low recovery last night. Ground yourself before the day starts.` | `/daily-check-in` |
| Saturday no meeting (V8) | `Saturday recovery` | `No meetings today — a short reset shapes the kind of weekend you actually need. Check in to set your intention.` | `/daily-check-in` |
| Sunday no meeting (V8) | `Sunday reset` | `Quiet Sunday on the calendar — a short reset lands you before the week forms. Check in to set your intention.` | `/daily-check-in` |
| Travel-day morning (V8) | `Travel today` | `Travel on today's calendar. Ground yourself before the day moves — check in to set your intention.` | `/daily-check-in` |
| Away-day / OOO (V8) | `Day away` | `On your day away — a short reset before you switch off. Check in to set your intention.` | `/daily-check-in` |
| Post-travel STATE (V8) | `Recovery context` | `Yesterday included travel — body may still be carrying load. Log in to prep your state.` | `/daily-check-in` |
| Post-travel JIT (V8) | `Preparing mental performance` | `From your morning Plan: {Event} in {min} min. Yesterday included travel — log in to prep your mind.` | `/executive-home` |

### Nudge 2 — Mid-day Action (plan-driven)

```text
What fires depends on context:

A) JIT event approaching (30-360 min away)
   → /executive-home (JIT slot in plan)
   "{EventTitle} at 2pm — your prep sequence is queued"

B) Priorities incomplete (afternoon, 13:00+)
   → /executive-home (plan with open priorities)
   "Priority 1 still open — 4 min to complete"

C) State-aware recalibrate (started low + heavy PM)
   → /daily-check-in (recalibrate → plan refresh)
   "You started low. Reset before {EventTitle}"

Window: 9:30-16:00
Gate: Plan must exist (priorities generated or JIT plan)
```

#### Copy Library

| Context | Title | Body | Deep Link |
|---------|-------|------|-----------|
| JIT < 2h | `{EventTitle} shortly` | `{min} min window — your prep plan is ready` | `/executive-home` |
| JIT 2-6h | `Prep window open` | `{EventTitle} at {time} — practice sequence queued` | `/executive-home` |
| Priority open (PM) | `Priority still open` | `{PriorityTitle} waiting — 4 min to complete` | `/executive-home` |
| Recalibrate | `Recalibrate` | `Started low — reset before {EventTitle}` | `/daily-check-in` |

### Nudge 3 — Evening Close (reflection + forward-set)

```text
Weekday:
→ /daily-check-in (evening check-in closes the loop)

Friday:
→ /daily-check-in (close-the-week)

Sunday (ONLY early evening 17:00-19:30):
→ /daily-check-in (week-prep framing)
"Monday has {meetingCount} events — set your intent tonight"

Saturday: NO EVENING NUDGE (their time)

Gate: No evening check-in yet
Gate: Exempt from signal richness (drive check-in KPI)
```

#### Copy Library

| Context | Title | Body | Deep Link |
|---------|-------|------|-----------|
| All priorities done | `Day complete` | `All priorities done — close the loop` | `/daily-check-in` |
| Priorities open | `Before you switch off` | `{remaining} priority still open — close or carry forward` | `/daily-check-in` |
| Friday | `Week complete` | `5 days behind you — close the week before you switch off` | `/daily-check-in` |
| Sunday (high-stakes Mon) | `Monday is forming` | `{count} events Monday including {EventTitle} — set your intent tonight` | `/daily-check-in` |
| Sunday (normal Mon) | `Monday is forming` | `{count} events Monday — set your intent tonight` | `/daily-check-in` |
| Wearable (RHR elevated) | `Body carried load` | `A proper close helps you let go of today` | `/daily-check-in` |
| Heavy day | `Heavy day done` | `{count} meetings done — one check-in to close the loop` | `/daily-check-in` |
| Default | `Evening close` | `Day done — close the loop before switching off` | `/daily-check-in` |

---

## 4. Suppression Stack

All 7 layers apply to all nudge types:

| Layer | Rule | Override |
|-------|------|---------|
| 1. Quiet Hours | 22:00-06:30 local | None |
| 2. DND | User-configured `dnd_start`/`dnd_end` | None |
| 3. Quiet Days | User-configured `quiet_days[]` | None |
| 4. Daily Cap | 3 notifications max per day | None |
| 5. 2-hour Cooldown | No notification within 2h of last | JIT nudges override |
| 6. App-open | Skip if app opened within 30 min + suppressed | None |
| 7. In-meeting | Skip if currently in a calendar event | None |

---

## 5. Signal Assembly (NudgeContext)

`buildNudgeContext()` runs 13 parallel DB queries + 1 dependent query per user.

### Data Sources

| # | Table | Signals |
|---|-------|---------|
| 1 | `calendar_events` | Today/tomorrow events, noise filtering, high-stakes detection |
| 2 | `wearable_data` | HRV, RHR, sleep score, 30-day baselines |
| 3 | `energy_snapshots` | Today's HRV delta from snapshot |
| 4 | `coach_accountability_tracker` | Pending commitments |
| 5 | `coach_pattern_observations` | Active patterns (top 5) |
| 6 | `dialogue_sessions` | Coach sessions in last 7 days |
| 7 | `coach_session_summaries` | Stress signals from session topics |
| 8 | `daily_checkins` | Today's outcomes + 30-day history |
| 9 | `daily_ritual_completions` | Pending/completed practice IDs |
| 10 | `jit_event_context` | JIT-qualified events (30-360 min, score ≥ 55) |
| 11 | `practice_sessions` | 30-day practice history |
| 12 | `notification_device_tokens` | Active device tokens |
| 13 | `notification_log` | Today's logs + 2h suppression |

---

## 6. AI Copy Generation — Two-Model Cascade

Implemented in `tryAIProvider()` (smart-nudges/index.ts ~L1612). Each provider gets a 6-second `AbortController` timeout and must return JSON-parseable copy that survives the V8 contract checks; otherwise the cascade advances.

| Order | Provider | Model | Why |
|---|---|---|---|
| 1 | Anthropic Claude | `claude-haiku-4-5` (`CLAUDE_MODELS.HAIKU`) | Best executive tone for ≤22-word, meaning-forward copy; fast and cheap at Haiku tier |
| 2 | Lovable AI Gateway | `google/gemini-3-flash-preview` | Newest fast model on the gateway. Recommended over `gemini-2.5-flash` and `gemini-2.5-flash-lite` for nudge copy: stronger instruction-following on the V8 contract (forbidden-word list, qualified mind-prep CTA), still sub-second at 256-token outputs. Cheaper / faster than `gemini-2.5-pro`. Use `gemini-2.5-flash-lite` only if cost becomes a problem at scale — lite drops nuance on the meaning-sentence rule |
| 3 | Static library | `validateStaticFallbackCopy()` | Variant-specific copy in `getFallback*Copy()`; tagged `aiProvider='static'` |

**Validation chain (applied to every AI candidate before acceptance):**

1. `containsFabricatedWearableData` — rejects HRV/RHR/sleep claims when the underlying context has no value
2. Per-metric guards — bare keyword scan rejects `hrv`, `rhr`, `sleep score` when the corresponding `ctx.wearable.*` field is null
3. `violatesCopyContractV8` — meaning-sentence, named-context token, forbidden-word list, qualified mind-prep CTA, ≤22 words / ≤140 chars
4. On failure → log `[smart-nudges v8 {provider}] Rejected ...` and fall through

**Provider telemetry:** every shipped payload is stamped with `aiProvider` (`claude` | `gemini` | `static`) and the dispatch row carries `ai_fallback_chain: 'claude-haiku → gemini-flash → static'` for analytics.

**Fallback chain when Anthropic is unavailable:** the run-log line `[anthropic] HTTP 400: ... credit balance is too low` is non-fatal — `tryAIProvider('claude')` returns null, the cascade falls through to Gemini, and only if Gemini also fails does the static library serve. The `qualified=0` summary observed in the latest log was driven by V8 contract rejections (no named context token), not by provider failures.

---

## 6a. CEO-Behaviour Delegation

Smart Nudges is one of three consumers of the shared `_shared/ceo-behaviour/*` registry. The registry is also consumed by Brief generation (`generate-readiness-brief`) and Plan generation (`generate-mastery-plan`) — editing one rule shifts all three surfaces in lockstep.

### Registry layout (`_shared/ceo-behaviour/`)

| Module | Rule(s) it owns | Category |
|---|---|---|
| `high-stakes-prep.ts` | Board/investor pre-load, `postGovernanceOffload` | A |
| `influence-persuasion.ts` | Negotiation / pitch persuasion load | B |
| `visibility-comms.ts` | Keynote / media / all-hands stage exposure | C |
| `interpersonal.ts` | `interpersonalMeetingContext` (1:1, mediation, conflict) | D |
| `deep-work.ts` | Weekday deep-work blocks ≥90 min, context-switching | E |
| `delivery.ts` | Delivery/launch sequences | F |
| `travel.ts` | Pre-flight / in-flight / post-arrival sub-arcs, `TRAVEL_TITLE_RX` | G |
| `daily-baseline.ts` | `morningBaseline`, `eveningShutdown` anchors on quiet days | — |
| `back-to-back.ts`, `decision-density.ts`, `post-peak.ts`, `conference.ts`, `upward-reporting.ts`, `multi-calendar.ts`, `calendar-dedupe.ts`, `empty-slot.ts`, `pto-holiday.ts`, `weekend.ts`, `workweek.ts` | Day-shape and load modifiers | mixed |
| `stubs.ts` | `contextSwitchingCost`, `stackedStakes` | mixed |
| `index.ts` | `ALL_RULES` typed export — single source of truth for the registry | — |
| `registry.contract.test.ts` | Auto-discovers `ALL_RULES`, validates every module emits well-formed `BehaviourFlag` outputs and that declared `slotBoost` descriptors trigger correctly | — |

### How smart-nudges consumes the registry

```text
enrich-event.ts                       (per-event RuleContext: categoryId A–H, isInterpersonal, …)
        │
        ▼
ALL_RULES.forEach(rule.evaluate(ctx)) (each module returns BehaviourFlag[] + optional slotBoost)
        │
        ▼
behaviour-evaluator.ts                (deriveSlotBoosts: registry-driven, no hardcoded switch)
        │
        ▼
behaviour-wiring.ts                   (evaluateForScope('nudge', ctx) — scope filter: brief|plan|nudge)
        │
        ▼
smart-nudges/index.ts ~L1483          (wiring → behaviour block injected into LLM userPrompt;
                                       slot boosts adjust `signalStrength` in comparator)
```

**Adding a new behaviour domain** is a 3-step contract:

1. Add a module under `_shared/ceo-behaviour/<domain>.ts` exporting `BehaviourModule` (`id`, `scopes`, `evaluate`, optional `slotBoost`)
2. Register it in `_shared/ceo-behaviour/index.ts` → `ALL_RULES`
3. The `registry.contract.test.ts` suite auto-discovers it and asserts non-empty `copyHint`, valid `severity`, `evidence.length > 0`, non-empty `promptBlock`, and valid slot boosts. CI fails if any of these are missing.

No edits are needed inside `smart-nudges/index.ts`, `generate-readiness-brief/index.ts`, or `generate-mastery-plan/index.ts` — the consumer-side wiring is registry-driven.

### Travel sub-arcs (v5.3, owned by `travel.ts`)

| `dayContext` flag | Window | Variant | TTL | Collapse-id key |
|---|---|---|---|---|
| `preFlight` | 60–240 min before flight | `nudge_one_pre_flight` | 45 min | `travel-${localDate}` |
| `inFlight` | inside a ≥90-min flight event | `nudge_two_in_flight` | 90 min | `travel-${localDate}` |
| `postArrival` | day after a travel event | `nudge_one_post_arrival` | 3 h | `travel-${localDate}` |

These ride the existing `nudge_one`/`nudge_two`/`nudge_three` slots — no 4th send, no `travel_*` notification type.

---

## 7. Client-Side Push Handling

### `usePushNotificationHandler.ts`

The `ACTION_ROUTES` map handles routing for both MVP and legacy nudge types:

```typescript
const ACTION_ROUTES: Record<string, string> = {
  nudge_one: '/daily-check-in',      // Default; JIT uses deep_link_route
  nudge_two: '/executive-home',       // Default; recalibrate uses deep_link_route
  nudge_three: '/daily-check-in',     // Evening close
  // Legacy backward compat
  morning_prep: '/daily-check-in',
  pre_event_prep: '/executive-home',
  ...
};
```

Priority: `deep_link_route` from payload > `ACTION_ROUTES` > `/executive-home` fallback.

---

## 8. Deferred Nudge Types (Post-MVP)

These evaluators exist in code but are wrapped in `MVP_POST_LAUNCH = false`:

| Type | Description | When to Enable |
|------|------------|----------------|
| P2: `calendar_gap` | Fires during ≥20 min gaps between meetings | After MVP launch |
| P3: `coach_meeting_match` | Semantic match: commitment ↔ upcoming event | After MVP launch |
| P4: `state_aware_nudge` | Low morning + afternoon high-stakes | After MVP launch |
| P6: `pattern_alert` | Consecutive low, recovery deficit, streaks | After MVP launch |
| P7: `daily_fallback` | Generic fallback when nothing else fires | After MVP launch |

To activate: set `const MVP_POST_LAUNCH = true` in `smart-nudges/index.ts`.

---

## 9. Notification Types Reference

| Notification Type | MVP Active | Deep Link | Preference Toggle |
|------------------|-----------|-----------|-------------------|
| `nudge_one` | ✅ | Context-dependent | `morning_anchor_enabled` |
| `nudge_two` | ✅ | Context-dependent | `pre_event_prep_enabled` |
| `nudge_three` | ✅ | `/daily-check-in` | `evening_close_enabled` |
| `calendar_gap` | ❌ | `/executive-home` | — |
| `coach_meeting_match` | ❌ | `/self-mastery-coach` | — |
| `state_aware_nudge` | ❌ | `/daily-check-in` | `state_aware_nudge_enabled` |
| `pattern_alert` | ❌ | `/insights` | `pattern_alert_enabled` |
| `daily_fallback` | ❌ | `/executive-home` | — |

---

## 10. Variant Matrix (v5.3 + v8)

Variants are sub-types within a `nudge_one/two/three` family. The family is what counts against `DAILY_NOTIFICATION_CAP` and APNs `apns-collapse-id`.

| Variant | Family | Anchor | TTL | Notes |
|---|---|---|---|---|
| `nudge_one_morning` | nudge_one | STATE / day-shape | 3 h | Default morning anchor |
| `nudge_one_jit` | nudge_one | JIT | 45 min | Overrides 2 h cooldown |
| `nudge_one_jit_post_travel` | nudge_one | JIT + post-travel | 45 min | Lead acknowledges yesterday's travel |
| `nudge_one_pre_flight` | nudge_one | JIT travel arc | 45 min | 60–240 min pre-flight |
| `nudge_one_post_arrival` | nudge_one | STATE travel arc | 3 h | Day after travel |
| `nudge_two_jit` | nudge_two | JIT | 45 min | Overrides 2 h cooldown |
| `nudge_two_priorities` | nudge_two | STATE | 2 h | Open priorities in PM |
| `nudge_two_recalibrate` | nudge_two | STATE | 2 h | Started low + heavy PM |
| `nudge_two_reserves` | nudge_two | STATE | 2 h | Wearable reserves dip |
| `nudge_two_in_flight` | nudge_two | JIT travel arc | 90 min | Self-sufficient body (no app open needed) |
| `nudge_three` | nudge_three | STATE | 6 h | Evening close |
| `nudge_three_lookahead` | nudge_three | STATE + tomorrow JIT | 10 h | Any evening where tomorrow has a high-stakes event in next 18 h |
