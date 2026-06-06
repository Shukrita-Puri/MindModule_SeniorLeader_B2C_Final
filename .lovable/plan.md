## Scope (isolated — Nudges only)

Touches **only** `supabase/functions/smart-nudges/index.ts` plus its companion docs (`docs/SMART_NUDGES_SSOT.md`, `docs/SMART_NUDGES_COMPREHENSIVE_ARCHITECTURE.md`) and one memory file (`mem://features/notifications/smart-nudges-mvp-framework`). No changes to Brief, Plan, MRS, Insights, DB, shared modules. Travel/PTO signal upgrades in `_shared/brief-signal-coverage.ts` from the earlier pass are reused as-is.

---

## 1. Collapsed vs Expanded headline contract

`generateNudgeCopy()` system prompt + every static fallback:

- **Collapsed (APNs `aps.alert.title`):** literal `Mind Module` for every nudge.
- **Expanded (APNs `aps.alert.subtitle`):** current 2–3-word moment headline ("Recovery in progress", "Pre-flight window"). Cap 3 words / 28 chars.
- **Body:** unchanged — V8 meaning-forward contract still applies.

Implementation:
- Move current `title` → `subtitle`; set `title='Mind Module'`.
- Extend length validator for `subtitle` (3 words / 28 chars).
- APNs payload uses `aps.alert.{title,subtitle,body}`. iOS handler already reads `data.deep_link_route`, no client change.

## 2. Weekday vs Weekend / post-holiday CTA — gated on Brief + Plan presence

Two CTA buckets, picked in `applyCtaVariant`:

- **Weekday default:** existing V8 CTAs unchanged.
- **Weekend OR `dayContext.ptoMode` rolling off** (today/tomorrow first weekday after a PTO span): force CTA = `let's prioritise the week ahead`, deep link `/plan`.

**Gating (per user note):** the weekend / post-holiday CTA only fires when **both** are true at evaluation time:

1. A Brief snapshot exists for the user for today (`brief_snapshots` row for today's `local_date`, any window) — i.e. the Brief that frames the week-ahead.
2. A Plan exists for today (`daily_ritual_completions` row with a non-empty `plan_ledger` of priorities for today/the week-ahead view).

If either is missing → fall back to the weekday CTA bucket and standard `/daily-check-in` route. Never send `let's prioritise the week ahead` into an empty Plan.

`ALLOWED_CTA_VERBS_V8` gains: `let's prioritise the week ahead`.
`ACTION_ROUTES` gains: weekend/post-holiday → `/plan`.

## 3. Mandate the 3-nudge cadence + windows

Tighten existing evaluators:

- **Morning (Nudge 1):** 60 min before first meeting (virtual) / 90 min (in-person), clamped `[06:30, 10:00]` when there's a meeting; else `[08:00, 09:00]`. Widen lower bound to 06:30 only when first meeting < 08:30 (commute / at-home prep).
- **Afternoon (Nudge 2):** 60/90 min before next afternoon meeting; **no nudge** if no afternoon meeting. Gate `reserves` / `recalibrate` state-only fallbacks behind `hasAfternoonMeeting`.
- **Evening (Nudge 3):** 60/90 min before any evening meeting; else `[19:00, 20:00]`; else new branch: `15–30 min after` a late meeting (anchor on `lastMeetingEndedMinAgo ∈ [15,30]`).

## 4. Back-to-back guard + low-friction reminder variant

New gate in `pickWinningNudge`:

- No gap ≥ 30 min between now and anchored event → suppress, `suppression_reason='back_to_back'`.
- Largest gap ∈ `[30, 60] min` → downgrade to **reminder variant**: in-context one-liner, CTA = `take 60 seconds`, `requires_app_open=false`, no deep link. Static fallback only — no LLM call.

## 5. Delivery-context skips (DND / battery / airplane / offline)

Add to pre-evaluator gate block:

- **DND active** → skip (existing).
- **Airplane mode** OR **device offline** (`notification_device_tokens.last_seen_at` > 60 min ago) → skip, `suppression_reason='offline'`. **Never queue** — stale nudges past 1 h have no value.
- **Low battery** → ride APNs `410` feedback for now; `notification_preferences.low_power_mode` is a TODO marker (not wired this pass).
- **TTL hardening:** explicit `nudge_one*` TTL cap of **60 min** post-anchor so delayed delivery cannot land post-hoc.

## 6. Travel arc — post-landing meeting awareness

Extend `dayContext.postTravel` in `buildNudgeContext`:

- Use already-present `surroundingEvents` + today's events (no shared-module changes).
- Compute `landingTimeLocal` from most recent flight `endTime` in last 24 h (handles late-night landings across midnight).
- Find `firstMeetingAfterLanding` in next **15–60 min**.
- If present, schedule **`nudge_one_post_landing`** (rides Nudge 1 slot, no 4th send):
  - Anchor at `landingTime + 15 min`, valid until `landingTime + 60 min`.
  - Tone written for immigration line / taxi — body must work without opening app.
  - CTA: `take 60 seconds` (reminder-style, no-app-open).
  - Route still set to `/executive-home` so a tap works.

Reuses existing `landingPlusHighStakes` plumbing at `index.ts:1036`.

## 7. Copy & validator updates

- `FORBIDDEN_NOTIFICATION_WORDS` — unchanged.
- `ALLOWED_CTA_VERBS_V8` — add `let's prioritise the week ahead`, `take 60 seconds`.
- `CTA_REWRITE_PATTERNS` — add legacy-form recognisers ("plan the week", "60 seconds") so older fallbacks self-heal.
- `validateStaticFallbackCopy` — extend to check new `subtitle` (3 words / 28 chars).
- New validator `requiresHeadlineStructure(title, subtitle)` runs after V8 contract: `title === 'Mind Module'`, subtitle non-empty.
- New gating helper `weekendCtaPrerequisitesMet(ctx)`: returns true only when Brief snapshot for today AND Plan ledger for today both exist.

## 8. Telemetry additions

`payload.metadata` gains:
- `delivery_skip_reason` ∈ `{dnd|offline|airplane|battery|back_to_back|stale_ttl|null}`
- `headline_variant` ∈ `{full|reminder|post_landing}`
- `cta_bucket` ∈ `{weekday|weekend_post_holiday}`
- `requires_app_open` boolean
- `weekend_cta_gate` ∈ `{ok|missing_brief|missing_plan}` (only stamped when in weekend/post-PTO context)

`notification_log.delivery_state='suppressed'` rows for new skips get `suppression_stage='pre_evaluator'`.

## 9. Tests (Deno, in `smart-nudges/v5_validation_test.ts`)

New cases:
1. Title is always `Mind Module`; subtitle ≤ 3 words / 28 chars.
2. Weekend + Brief + Plan present → CTA `let's prioritise the week ahead`, route `/plan`.
3. Weekend + missing Brief OR missing Plan → falls back to weekday CTA + `/daily-check-in`; `weekend_cta_gate` telemetry stamped.
4. Back-to-back day (no gap ≥ 30 min) → no send, suppression reason logged.
5. 45-min gap day → reminder variant, no app-open CTA.
6. Late evening meeting ending 20:45 → evening nudge anchored 21:00–21:15.
7. Flight lands 18:00, meeting 18:45 → `nudge_one_post_landing` fires at 18:15 with reminder CTA.
8. DND / offline / airplane gates each skip with explicit reason.

## 10. Docs + memory

- `docs/SMART_NUDGES_SSOT.md` — bump to v1.1; rewrite §2 (windows), §3 (variants — add `post_landing` + `reminder`), §7.2 (CTA list), §7.5 (length table — add Subtitle), §9 (APNs `alert.subtitle`), §10 (new telemetry), §12 (post-landing + weekend gating), §14 (delivery-context skip semantics).
- `docs/SMART_NUDGES_COMPREHENSIVE_ARCHITECTURE.md` — mark superseded sections, point to SSOT v1.1.
- `mem://features/notifications/smart-nudges-mvp-framework` — append: collapsed/expanded headline, weekend CTA bucket **gated on Brief + Plan presence**, 30-min gap rule, post-landing window, offline-skip-never-queue.

---

## Out of scope (explicit non-goals)

- No Brief / MRS / Plan logic changes — only **read** Brief snapshot + Plan ledger presence for the weekend CTA gate.
- No new shared modules; reuse existing travel signal upgrades.
- No iOS native client changes.
- No new DB tables; `low_power_mode` remains a TODO.
- No change to daily cap of 3, comparator slot ordering, or AI cascade.

## Risks

- iOS may render `subtitle` differently on older devices — verify in preview. Mitigation: if subtitle missing, lock screen still shows `Mind Module` + body.
- Forcing `title='Mind Module'` reduces glanceability — counter-balanced by 3-word subtitle.
- Dropping state-only afternoon nudges (§3) reduces afternoon send rate ~30%. Acceptable per spec.
- Weekend CTA gating means users without a generated Brief/Plan on Saturday AM get the standard weekday CTA — intentional, prevents a "prioritise the week" lure that lands in an empty Plan.
