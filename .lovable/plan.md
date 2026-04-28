
# Smart Nudges v7 — JIT-or-State Only + Unified Pattern Store

Two surgical bodies of work, both inside `supabase/functions/`. No UI redesign.

---

## Part 1 — Smart Nudges v7: collapse to JIT-or-State

### 1.1 New mental model (replaces the old priority list)

Every nudge — Morning, Afternoon reminder, or Evening — must be **either JIT-anchored or State-anchored**. There is no third generic family.

- **JIT-anchored** = anchored to a specific upcoming or just-past calendar event (uses `jit_event_context` + the unified pattern store for cross-event history).
- **State-anchored** = anchored to today's physiology / check-in / plan-progress signal (HRV %, RHR elevated, sleep score, morning check-in outcome, consecutive-low days, heavy-day load).

Both add the **context** that justifies the push. Without one of them the nudge is suppressed.

### 1.2 Architecture change in `supabase/functions/smart-nudges/index.ts`

- Add `anchorKind: 'jit' | 'state'` to `QualifiedNudge`. Every evaluator must set it.
- Replace the numeric `priority` sort with a deterministic 3-step comparator:
  1. **Time slot** wins first: Morning → Evening → Afternoon-reminder (matches user request: "JIT and State-based … to drive user to CTA in the morning, evening or a reminder in the afternoon").
  2. Within a slot, **JIT outranks State**.
  3. Within JIT/State, prefer the variant with the strongest cited signal (e.g. JIT with a strong pattern beats JIT without; State with HRV deficit beats State with check-in alone).
- **Suppress (do not delete)** the legacy generic mid-day evaluators: `nudge_two_priorities` and `nudge_two_consecutive_low` are wrapped behind a `LEGACY_GENERIC_NUDGES_ENABLED = false` flag so the framework is preserved for future use but never fires today. Code stays in place — only the call sites are gated.
- Keep `nudge_two_recalibrate` and `nudge_two_reserves` as the legitimate State-anchored afternoon reminder. If neither qualifies, the afternoon stays silent (no generic fill).

Untouched: 2-hour suppression, in-meeting suppression, app-open cool-down, JIT-overrides-suppression, daily-cap of 3, quiet hours, engagement learning, APNs delivery.

### 1.3 Voice + CTA rewrites (all 3 slots)

Rewrite the prompts and static fallbacks for **every** surviving nudge so the body reads as JIT-context or State-context + a "prep" CTA. Reference shapes the user gave:

- Morning JIT: `From your morning Plan: Board Review in 25 min — open the app to prep.`
- Morning State: `HRV down 22% vs your baseline — check into the app to prep your day.`
- Afternoon State (recalibrate): `You started low and Investor Update is next — open the app to prep.`
- Afternoon State (reserves): `RHR elevated before Board Review — open the app to prep.`
- Afternoon JIT: `From your plan: Board Review in 40 min — open the app to prep.`
- Evening State (heavy day + heavy tomorrow): `Heavy day today and tomorrow needs you sharp — open the app to prep with a cool-down.`
- Evening JIT (tomorrow's first high-stakes): `Tomorrow opens with Board Review — open the app to prep tonight.`

Implementation:

- New `ALLOWED_CTA_VERBS_V7` (replaces V6 list) — every verb is a "prep" verb:
  - `open the app to prep`, `check into the app to prep`, `open the app to prep tonight`, `open the app to prep with a cool-down`, `go to the app to prep`, `prep now`.
  - Legacy verbs (`open your plan`, `open your brief`, `open your prep plan`, `recalibrate now`, `close the day`, `lock in your prep`) are removed from V7 to stop the lint accepting non-prep CTAs.
- New `ALLOWED_OPENERS_V7` (informational, not enforced) — `From your morning Plan`, `From your plan`, `Heavy day today`, `HRV down`, `RHR elevated`, `You started low`, `Tomorrow opens with`.
- `violatesCopyContractV7(body)` extends the V6 lint:
  - Same 14-word / 95-char ceiling.
  - Same forbidden-words list (wellness, mindfulness, mechanical phrases, etc.).
  - Body MUST end with one verb from `ALLOWED_CTA_VERBS_V7`.
  - Body MUST cite at least one real signal already in `NudgeContext` (event title, HRV/RHR/sleep number, check-in outcome, meeting count, tomorrow's first meeting). If no signal is available the nudge is dropped — no generic copy.
- Rewrite all `getFallback*` functions for the surviving variants to emit V7-compliant copy. Remove the priorities-count and consecutive-low fallbacks entirely from the live cascade.
- System prompt rewritten so the gold-standard examples match the seven shapes above. The prompt explicitly says "every body is JIT-anchored or State-anchored" and "every body ends with a 'prep' CTA".

### 1.4 CTA-variant A/B (preserved, narrowed)

`CTA_PHRASES` is rewritten so every variant is still a "prep" CTA — only the surface form differs:

| Variant | brief-route phrase | plan-route phrase |
|---------|--------------------|-------------------|
| A (control) | `open the app to prep` | `open the app to prep` |
| B | `check into the app to prep` | `go to the app to prep` |
| C | `prep now` | `prep now` |
| D | `open the app to prep tonight` *(only used for evening)* | `open the app to prep with a cool-down` *(only used for evening)* |

`CTA_REWRITE_PATTERNS` recognises every legacy phrase (`open your plan`, `open your brief`, `open your prep plan`, `recalibrate now`, `close the day`, `lock in your prep`, `tap to prep`, `see your prep`) and rewrites them to the variant's "prep" CTA. Deep-link routing on the payload is unchanged — the iOS handler keeps routing by `deep_link_route`.

Bump payload stamp to `architecture: 'cos-mind-v7-jit-or-state'` and `cta_experiment: 'cta-prep-only-v1'`.

### 1.5 Memory + docs

- Update `mem://features/notifications/smart-nudges-mvp-framework` to v7:
  - Two anchor kinds only: JIT or State.
  - 3-step comparator (slot → anchor → signal strength).
  - All CTAs end with a "prep" verb.
  - Legacy generic mid-day variants suppressed via flag, not deleted.

---

## Part 2 — Unified Pattern Store

### 2.1 Problem

Patterns live in three disconnected places (`causality_findings`, `checkin_patterns`, `coach_pattern_observations`) and Smart Nudges has no fast path to read "HR ran high during last Board Meeting" when generating a JIT lure.

### 2.2 Approach: extend `causality_findings`, do not replace

`causality_findings` already holds correlation/causation deltas for HRV / RHR / sleep / PRS in `payload jsonb`. Extend it:

1. Add `pattern_kind text not null default 'cause_effect_v2'` so the table can hold multiple pattern families over time without losing the daily-snapshot model.
2. Replace the existing unique key with `(user_id, pattern_kind, computed_for_date)` so each pattern family caches independently per day.
3. Add `signal_summary jsonb` — a flat shape Smart Nudges can read in one query without parsing the full `payload`:

   ```json
   {
     "event_to_hrv": [
       { "event_type": "Board meetings", "n": 4, "hrvDeltaPct": -22, "rhrElevated": true, "confidence": "strong", "lastSeen": "2026-04-21" }
     ],
     "event_to_rhr": [ ... ],
     "event_to_cognition": [
       { "event_type": "Investor Updates", "dim": "clarity", "tierDelta": -1.0, "n": 5, "confidence": "strong" }
     ],
     "sleep_to_prs":     { "lowSleepPrsDeltaPct": -18, "n": 6, "confidence": "strong" },
     "consecutive_load": { "tailDeltaPct": -14, "n": 3, "confidence": "emerging" }
   }
   ```

4. `cause-effect-engine` writes both `payload` (Insights, unchanged) and `signal_summary` (nudges, new). All numbers already exist in the engine — this is just a flatter projection.

### 2.3 Wire the pattern store into Smart Nudges

In `evaluateNudgeOne` / `evaluateNudgeTwo` JIT branches and `evaluateNudgeThree`:

- New helper `loadPatternSummary(supabase, userId)` reads the latest `causality_findings.signal_summary` for `pattern_kind='cause_effect_v2'` (one row, one query, cached for the loop).
- For JIT: classify the JIT event using the existing event classifier shared with `cause-effect-engine`, then look up `signal_summary.event_to_hrv` for that bucket. If a `strong` or `emerging` finding with negative HRV (or `rhrElevated`) exists, inject this into the prompt:

  ```
  - Historical pattern: HRV averaged -22% during your last Board meetings (n=4)
  ```

  And extend the JIT static fallback so it produces:
  `From your morning Plan: Board Review in 25 min. HR ran high last time — open the app to prep.`

- For Evening State: read `signal_summary.consecutive_load` and `signal_summary.sleep_to_prs` to drive the "heavy day + tomorrow needs you sharp" copy with a real number, never generic.

If no pattern exists, the nudge falls through to the standard JIT/State path unchanged.

### 2.4 Other consumers

- `PerformanceCausalityCard.tsx` keeps reading `payload` exactly as today — zero UI change, zero UX risk.
- Future surfaces (Coach intelligence, weekly email) can read `signal_summary` directly.

### 2.5 Migration

One migration adds `pattern_kind` and `signal_summary`, backfills existing rows to `pattern_kind='cause_effect_v2'`, and replaces the unique key. RLS stays deny-by-default; service-role writes only.

---

## Part 3 — End-to-end validation

After deploying `smart-nudges` + `cause-effect-engine`:

1. POST `cause-effect-engine` with `{ force: true }` for a test user → confirm `signal_summary` is populated AND `PerformanceCausalityCard` still renders identically.
2. POST `smart-nudges` with `{ dry_run: true }`, simulated time = 09:00 local, JIT board-meeting context, known HRV-low Board pattern in `signal_summary`:
   - JIT Morning nudge wins.
   - Body starts with `From your morning Plan`, cites the historical pattern, ends with a "prep" CTA.
   - `architecture: 'cos-mind-v7-jit-or-state'` stamped.
3. POST same, simulated time = 09:00, no JIT, no check-in done, HRV down 22% → Morning State nudge wins, body cites HRV %, ends with "check into the app to prep".
4. POST same, simulated time = 14:00, low-morning + heavy PM → Afternoon State recalibrate fires; if no state signal qualifies, **no nudge fires** (legacy generic priorities is suppressed).
5. POST same, simulated time = 19:00, heavy day + heavy tomorrow → Evening State nudge wins with the cool-down phrasing; if a high-stakes meeting is first thing tomorrow, Evening JIT wins instead.
6. Read `notification_log` rows: confirm V7 lint never rejects the new openers/CTAs and confirm `nudge_two_priorities` / `nudge_two_consecutive_low` rows do not appear.

## Files

- `supabase/functions/smart-nudges/index.ts` — anchor-kind tagging, 3-step comparator, V7 CTA list, V7 prompt + fallbacks for all 7 shapes, legacy gate flag, pattern-store reader.
- `supabase/functions/cause-effect-engine/index.ts` — write `signal_summary` projection alongside existing `payload`.
- `supabase/migrations/<ts>_pattern_store_unification.sql` — `pattern_kind`, `signal_summary`, new unique key.
- `mem/features/notifications/smart-nudges-mvp-framework.md` — v7 contract.
- New `mem/architecture/unified-pattern-store.md` — `causality_findings` as canonical store, `pattern_kind` and `signal_summary` contracts.

## Untouched

Triggers, time windows, suppression stack, APNs delivery, deep-link routing, signal-richness gate, daily-cap, all client code, all other Insights cards, Coach prompts, Brief logic, Mastery Plan logic.
