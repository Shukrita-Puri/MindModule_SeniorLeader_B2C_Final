# Smart Nudges / Notifications — FINAL SSOT (redesign)

**Version:** v3.0 — redesign to Plan-slot parity
**Date:** 2026-06-30
**Supersedes:** all earlier Smart Nudges docs (Lovable-derived, code-level, and the v2 master). This is the architecture for the Nudges refresh. Sections are marked **[CURRENT]** (code-verified as shipped) or **[TARGET]** (remaining refresh work) so the build is unambiguous.

**Primary runtime:** `supabase/functions/smart-nudges/index.ts`. **Supporting:** `register-device-token`, `notification-engagement`, `notification-receipt`, `test-push`, `travel-notifications`. **Tables (unchanged):** `notification_device_tokens`, `notification_preferences`, `notification_log`, `notification_evaluator_runs`, `notification_evaluator_traces`.

---

## 1. What changes and why (design principles)

Smart Nudges is the app's **most proactive feature**: it speaks before the user opens the app. The refresh makes it a **thin push projection of the Plan**, so the system calibrates **once** (in the Executive cards) and every surface — MRS, Brief, Plan, Nudge — reads the same result.

Principles:
1. **Nudges mirror the Plan's allocated slots.** The Plan slot allocator already decides the day's shape (M/A/E, full-arc, light, rest) and the mode of each slot (JIT / State / JIT+State / full-arc phase). Nudges read those slots and send **one nudge per slot** — they do not re-classify the day. Fewer Plan slots ⇒ fewer nudges, automatically.
2. **MRS / Brief / Plan / Nudge parity.** Nudges read the persisted snapshots; they never recalculate readiness, behaviour, calendar, travel, or timezone. The Executive cards do the heavy lifting once (Exec SSOT); nudges consume it.
3. **State 1 (Early Read) basis.** Because the nudge fires *before* check-in, the data it sees is **State 1 (baseline / Early Read)** — wearable and/or calendar demand, no check-in yet. Pattern data may frame copy or context, but it cannot form or contribute to MRS. The nudge's whole job is to move the user to **State 2** (check in). This is why it is proactive, and why most CTAs are "check in."
4. **The notification can be the product.** Normally the nudge drives the user into the app. The one exception is the **back-to-back / meeting-prep cliff**: when there is too little time between meetings to open the app, the nudge does the heavy lifting in-body, with no app-open CTA.
5. **Simplify guardrails.** Day-shape, quiet days, rest days are decided at the Plan level — so most suppression is upstream. Remaining gates are loosened so genuine nudges are not lost (§7).
6. **One Chief-of-Staff voice.** Copy uses the same persona, forbidden words, and human tone as the Brief and the Plan why-line. Structure is simply **Context + CTA**.

---

## 2. The nudge model — one nudge per Plan slot **[CURRENT]**

The nudge runner reads the user's **Plan snapshot** (`mastery_plan_snapshots`, State-1 build) for today and emits at most one nudge per allocated slot, mirroring the slot's role.

> **[CURRENT]** smart-nudges reads `mastery_plan_snapshots.horizon_modules[]` and projects the active Plan slot first. The legacy candidate cascade remains only as a fallback when the Plan snapshot is missing.

| Plan slot (from `slot-allocator.ts`) | Nudge sent | Copy mode |
|---|---|---|
| Slot 1 — start of day (Prepare/Steady) | Morning nudge | JIT (if slot is event-anchored) or State |
| Slot 2 — dominant demand (Prepare/Steady/During) | Afternoon nudge | JIT or State or JIT+State |
| Slot 3 — end of day (Recover/Steady) | Evening nudge | JIT (post-event) or State |
| Full-Arc day (travel/conference) | one nudge per fanned phase (Pre / During / Post) | mirrors the phase's `arcLabel` + `jitPhase` |
| Light day / fewer slots | fewer nudges (only what the Plan allocated) | — |
| Rest day (Saturday/holiday/PTO) | none, or a single recovery-bias morning nudge if the Plan kept one | State |
| Sunday / last-PTO / last-holiday afternoon-evening | Week-Ahead nudge (instead of evening) | week-ahead |
| Second-last day of month | Insights monthly nudge (§9) | insights |

**Why this is correct:** the slot allocator already guarantees a coherent day (always-3 on demand days, suspension on rest days, full-arc on a dominant structural event). Projecting it means the nudge stream inherits all of that for free — no parallel day-shape logic, no parallel quiet-day logic.

The nudge mirrors the slot's `{ mode, arcLabel, jitPhase, jitEventTitle }`:
- **JIT slot** → name the event + the relevant State/pattern + CTA.
- **State slot** → name the State (from any measured signal) + CTA.
- **Full-Arc phase** → phase-appropriate copy (Pre = prepare, During = in-the-moment, Post = recover), reusing the Plan's per-phase intent.

---

## 3. Exception — the back-to-back / meeting-prep cliff (notification is the product)

This is the **only** case where the nudge does not push the user into the app. Source: `_shared/ceo-behaviour/back-to-back.ts` (already built; surfaced as a nudge-only signal).

- **`backToBackLoadOverride`** — ≥4h back-to-back today → light-touch mode (suppress full check-in asks).
- **`meetingPrepCliff`** — gap 30–60 min before a high-stakes event (or heavy-load remainder) → **no app-open CTA; full micro-reframe in body (1–2 min)**: name the meeting, name one regulating action, end clean. Severity: gap 5 min → high (title only), 15 → medium (one-line + 90s cue), 30 → low (may include "tap for 2-min reset"). **TTL = gap minutes − 1** so the push dies when the meeting starts. **Yields to the travel landing window.**

Everything else routes to the app (§5).

> **[CURRENT]** `back-to-back.ts` imports `isHighStakesTitle` directly from `_shared/events/event-classifier.ts`; do not reintroduce the legacy `executive-state-taxonomy.ts` shim.

---

## 4. State 1 (Early Read) is the data contract for nudges

Nudges read the **State-1** projection of each card, because the user has not checked in yet:
- **MRS:** `daily_context_snapshot` baseline (`readiness_state ∈ baseline | awaiting`), never the refined State-2 score.
- **Brief:** the State-1 behaviour snapshot (parity, §8).
- **Plan:** the State-1 `mastery_plan_snapshots` slots.

If MRS is `awaiting` (no fresh wearable), the nudge does **not** go silent — it drives the user to sync + check in (§5, §7). Moving the user to State 2 is the point.

---

## 5. CTA contract

Every nudge has exactly one CTA. Routes are standardised:

| Nudge | CTA text | Route **[TARGET]** |
|---|---|---|
| Morning / Afternoon / Evening (habit-building, default) | "Check in to Prep" / "Check in to Prep your Mind" / "Check in for Clarity" (by intent) | **`/daily-check-in`** (the Mind Assessment page) |
| Week-Ahead (Sun / last-PTO / last-holiday) | "log in to prep for the week ahead" | `/plan?mode=week-ahead` |
| Insights (monthly) | "tap to see how you performed this month" | insights detail |
| Back-to-back cliff | (no CTA — notification is the product) | none |

> **[CURRENT]** routes are mixed (`/executive-home`, `/recalibrate`, `/daily-check-in`, `/plan?mode=week-ahead`). **[TARGET]** all habit-building CTAs land on **`/daily-check-in`** ("Check in to Mind Module" family); only week-ahead and insights differ; the cliff has no CTA.

---

## 6. Copy contract (simplified, Chief-of-Staff voice)

**Voice:** the **same Chief-of-Staff persona, forbidden words, and human tone as the Brief LLM and the Plan why-line** — addresses the user like someone who knows them well, never mechanical or clinical. Import the shared persona (see Exec SSOT CoS-unification item — Brief + Plan + **Nudge** import one `CHIEF_OF_STAFF_PERSONA`).

**Structure (inspired by the Brief 4-beat, simplified to two beats):**
```
Context  +  CTA
  └─ Context = JIT (the event) OR State (a measured signal), drawing on
     Immediate / Tactical / Strategic framing.
```
- **Immediate (JIT):** the event itself. *"Board meeting upcoming; you have shown elevated HR in your last 3 board meetings — Check in to Prep."*
- **Tactical (pattern/recent):** a recent measured pattern. *"A heavy week has passed, your HRV has dropped -13% — Check in to recalibrate your mind."*
- **Strategic (goal):** the user's stated goal. *"You mentioned working on visibility events as a goal — you have a CNN interview at 2pm. Check in to recalibrate your mind."*
- **Week-ahead:** *"Recovery is still low from last week. You need more signal than noise. Log in to prep for the week ahead."*

**Hard copy rules:**
1. **First sentence is meaning, never a bare metric.**
2. **Any measured signal is fair game** — sleep, RHR, HR, or HRV — not HRV-only. (The nudge context already carries `sleepScore`, `hrv`, `rhr`, `rhrElevated`, and event/sleep correlations; the copy layer must use them.)
3. **No fabricated or extrapolated data.** Only cite a number that is **fresh and measured** at send time. If a signal is stale or the wearable was removed, do **not** carry forward or invent a number (the "-9% while worn → -13% next day un-worn" bug). Use a qualitative State reference or drive to sync instead. Reuse the MRS measured-only/freshness rule.
4. **No long em dashes (—). Use the short dash (-).**
5. No claim that a Brief/Plan/prep/insight is "ready" unless it exists; no medical/clinical claims; no generic motivational copy without an anchor; no passive CTAs.
6. Forbidden words = `FORBIDDEN_NOTIFICATION_WORDS` (shared with Brief) + the nudge ban list.
7. **Collapsed-state headline = the brand `Mind Module`.** In the APNs **collapsed** state, the notification headline (title) is always the brand string `Mind Module` — the actual moment headline rides the **subtitle** (≤3 words / ≤28 chars) and the body carries the Context + CTA. Users do not yet recognise the brand, so anchoring the collapsed headline on `Mind Module` builds brand recognition every time a nudge lands. Never put the moment copy in the collapsed title.

Generation: AI primary (Claude) → fallback (Gemini) → validated static fallback. Validators enforce rules 1–7, reject fabricated wearable data, force the collapsed title to `Mind Module`, and **strip/relabel em dashes to short dashes**.

---

## 7. Delivery guardrails — simplified **[TARGET]**

Most day-level suppression now lives at the Plan level (no slot ⇒ no nudge), so the runner's own gates shrink.

**Removed / relaxed:**
| Gate | Old behaviour | New |
|---|---|---|
| **MRS gate** (`LIGHT_DAY_STRONG_STATE` total suppression) | suppress all nudges | **Removed.** Never suppress on missing/strong-state data — a light/strong day simply yields fewer Plan slots. If MRS is `awaiting`, send a sync-and-check-in nudge rather than going silent (so a user who never syncs still gets nudged toward syncing). |
| **Low-power / battery** | suppress | **Removed.** Send anyway; the user acts before the battery dies or after recharge. |
| **Engagement multi-day suppression** | suppress types a user keeps ignoring | **Removed/relaxed.** A user who hasn't opened the app for days needs the nudge **more**, not less. Keep only anti-double-send within a period. |
| **Quiet days** | per-nudge check | **Handled upstream** at the Plan (rest/quiet days allocate fewer/zero slots). Keep DND as an explicit user preference only. |
| **App-open cooldown** | 60 min | Keep a short within-period anti-spam window only; never let "no app open in N days" stop nudges. |

**Kept:**
- **Global window** 08:00–21:30 **effective-local** (travel-aware, §8).
- **DND** (explicit user pref) and **per-tick max 1**.
- **Daily cap** — naturally ≤3 because there are ≤3 Plan slots; keep the `COUNTABLE_DELIVERY_STATES` accounting (don't count `suppressed`/`dry_run`/`failed`/`expired*`).
- **Honest-copy validation**, **bad-token deactivation**, **dry-run when APNs secrets missing**.

**Missed-period staleness (important):** "period" here means one of the app's **three windows — Morning, Afternoon, Evening** (the same M/A/E periods the cards and slot allocator use; e.g. the *entire* morning duration is the Morning period). A period's nudge is valid **only within its own M/A/E window**. If the device is off / DND / silent / airplane during the **Afternoon** period and comes online in the **Evening**, the Afternoon nudge must **not** display — only the current period's. Implement via **APNs TTL = the end of that M/A/E period** (per-period expiry, anchored to the window boundary in the user's effective-local time) + a **per-period `apns-collapse-id`** (keyed to the M/A/E period) so a stale queued push is dropped/replaced. *Old notifications past their actionability are noise, not signal.*

---

## 8. Parity & the single shared resolver

Nudges must not re-derive anything the cards already computed:
- **Behaviour:** read the Brief's persisted snapshot (`loadBriefBehaviourSnapshot` → `snapshotToWiring(snap,'nudge')`); fallback `evaluateForScope('nudge')` only when absent.
- **Plan slots:** read `mastery_plan_snapshots` (§2) — **[CURRENT]**.
- **Calendar:** merged events via `calendar-merge.ts` / `jit_event_context` (never raw rows).
- **Travel + timezone:** read from the **shared travel-aware timezone/circadian resolver** the cards use (Exec SSOT §15.5). **[TARGET]** replace `getUserLocalDate(timezone_offset)` with the shared `effectiveTimezone` + circadian quiet-hours. Same trade/travel/timezone state as MRS/Brief/Plan — no recalculation.
- **CoS Leader Profile (from onboarding):** read the same `cos_profile` the cards read (Onboarding SSOT §5). **[TARGET]** Nudges consume: (a) the **notification-relevant `brief_personalisation`** — `brief_timing`, `reset_modality`, `weekend_signals` — which shape *when* and *how* a nudge fires (note: though named "brief" personalisation, these preferences affect Nudges and Plan too, not just the Brief); (b) `goals.declared` for strategic-framing copy; (c) `high_stakes_map` / `cognitive_load_map` as priors. All of this arrives via the shared `CHIEF_OF_STAFF_PERSONA` unification (§6) — nudges never re-derive it. Preferences left as "let the system decide" mean *run dynamic behaviour*, never a forced value.
- **Travel-phase notifications:** `travel-notifications` must consume the **Plan's full-arc** (the Pre/During/Post the slot allocator already fanned) instead of re-deriving travel phases. **[TARGET].**

---

## 9. Insights — a monthly performance nudge **[TARGET]**

Replace the ad-hoc `pattern_alert` "open your insights" with a **scheduled monthly** notification:
- Fires on the **second-last calendar day of the month** (computed from that month's last day).
- Copy: a short performance reflection in CoS voice; CTA **"tap to see how you performed this month"**; routes to the Insights surface (`InsightDetail` / `InsightsSnapshot`).
- Draws on the Insights feature family (`user_coach_insights`, `performance-rhythm-insights`, `state-patterns-insights`, etc.) — the nudge only *announces* a real, freshly-generated monthly insight (honest-copy rule: never announce insights that don't exist).

> **[CURRENT]** `pattern_alert` (gated by `pattern_alert_enabled`) fires ad-hoc with a generic "open your insights" CTA. **[TARGET]** retire ad-hoc pattern alerts in favour of the monthly Insights nudge (keep `pattern_alert_enabled` as the on/off pref for the monthly insight).

---

## 10. Data contract (infrastructure — unchanged)

Tables and APNs contract are unchanged from the shipped implementation (see the prior master for full column lists): `notification_device_tokens`, `notification_preferences` (`morning_anchor_enabled`, `pre_event_prep_enabled`, `evening_close_enabled`, `pattern_alert_enabled`, `state_aware_nudge_enabled`, `dnd_start/end`, `quiet_days`, windows), `notification_log` (delivery_state ledger + engagement), `notification_evaluator_runs`, `notification_evaluator_traces`. APNs: ES256, brand title `Mind Module`, subtitle ≤3 words, per-intent TTL + collapse-id, secrets `APNS_*`, token 64/72/128 hex, Auth0 text user ids. `register-device-token` + `useDeviceTokenRegistration` own token lifecycle.

> **[CLEANUP]** `low_power_mode` is read but is not a migration column; since the battery gate is removed (§7), drop the read.

---

## 11. Gap audit — current vs target (build list)

| # | Item | [CURRENT] | [TARGET] | Type |
|---|---|---|---|---|
| 1 | Read `mastery_plan_snapshots`; one nudge per Plan slot | reads Plan slots first; legacy cascade only when snapshot missing | preserve Plan-slot projection (§2) | Built (core) |
| 2 | Travel-phase notifications consume Plan full-arc | `travel-notifications` re-derives phases | read Plan's fanned Pre/During/Post (§8) | Build |
| 3 | Shared travel-aware timezone + circadian resolver | static `timezone_offset` | shared resolver (§8) | Build |
| 4 | Remove MRS `LIGHT_DAY_STRONG_STATE` total suppression | suppresses all | never suppress on data absence (§7) | Change |
| 5 | Remove low-power/battery gate | suppresses | send anyway (§7) | Change |
| 6 | Relax engagement/app-open multi-day suppression | suppresses ignored users | nudge them more, not less (§7) | Change |
| 7 | Standardise habit CTA → `/daily-check-in` | mixed routes | one route (§5) | Change |
| 8 | Copy: any measured signal, not HRV-only | HRV-dominant copy | sleep/RHR/HR/HRV (§6) | Change |
| 9 | Copy: no fabricated/stale data | partial validators | measured-only + freshness (§6) | Change |
| 10 | Copy: no long em dashes | not enforced | strip/relabel to `-` (§6) | Change |
| 11 | Copy: Context + CTA two-beat; shared CoS persona | bespoke prompt | import shared persona (§6) | Change |
| 12 | Missed-period staleness (per-period TTL + collapse) | partial TTL | end-of-window expiry (§7) | Change |
| 13 | Insights → monthly (2nd-last day) | ad-hoc `pattern_alert` | scheduled monthly (§9) | Build |
| 14 | `back-to-back.ts` import off the legacy shim | imports `executive-state-taxonomy` | import `events/*` | Cleanup |
| 15 | Drop `low_power_mode` read | informal field | removed (§10) | Cleanup |

**Kept as-is (already correct):** single evaluator, token registration, APNs delivery, evaluator runs/traces, Brief↔Nudge parity mechanism, week-ahead own-bucket, honest-copy validators, cap accounting.

---

## 12. Connection to Executive cards & Insights

- **Plan** is the nudge's source of truth for the day's shape and slots (§2); the Plan SSOT must expose its slots for nudge consumption (Exec additions).
- **MRS** provides State-1 readiness (§4); no gate suppression (§7).
- **Brief** provides the behaviour snapshot (parity) and the CoS voice (§6, §8).
- **Insights** is announced monthly (§9).
- **Shared resolver** (timezone/travel/calendar) is read, not recomputed (§8).

---

## 13. Invariants

1. Nudges project the Plan's slots; they never re-classify the day (except the back-to-back cliff, §3).
2. Nudges read State-1 snapshots; never recalculate MRS/Brief/Plan/travel/timezone.
3. Exactly one CTA per nudge; habit CTAs → `/daily-check-in`; week-ahead → week-ahead; insights → insights; cliff → none.
4. Copy = Context + CTA, CoS voice, any measured signal, no fabricated/stale data, no em dashes, no forbidden words, meaning-first.
5. A missed period's nudge never shows late — per-period TTL + collapse.
6. Never suppress for missing data, low battery, or inactivity; drive the user to sync/check in instead.
7. Daily cap follows the Plan's slot count (≤3); per-tick ≤1; DND + effective-local window honoured.
8. One CoS persona, one forbidden-word list, one calendar merge, one event taxonomy, one timezone resolver — shared with the cards.

---

## 14. Open / build items (MVP)

Items 1–3 in §11 are the core build (Plan-slot projection, travel-from-Plan, shared resolver); 4–12 are the guardrail + copy refresh; 13 is the monthly Insights nudge; 14–15 are cleanups. The Executive-card additions needed to support all of this are in the Exec SSOT/Wiring updates accompanying this refresh.
