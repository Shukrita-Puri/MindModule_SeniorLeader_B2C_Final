# Onboarding — As-Built Audit

Read-only audit of the Mind Module onboarding feature. Every claim is cited to `file:line`. Code wins over prior docs. Unknowns are listed explicitly rather than filled from memory.

Scope: from sign-up completion through the last onboarding write, including the COS profile HTML, connector wiring, Apple payment, and downstream feature personalisation.

---

## Executive Summary — What works, what is partial, what is not built

**Working end-to-end (write + read + effect):**
- v8 onboarding step persistence to `onboarding_v8_responses` via `onboarding-v8-save` (per-step upsert, not batched).
- `preferred_practice_window` — written by brief-prefs step, read by `generate-mastery-plan`.
- `brief_timing` — written by brief-prefs step, read by `smart-nudges` scheduler.
- `goals[]` — written by protect-goals step (JIT boost read pending line-level confirmation).
- COS profile generation via `synthesize-cos-profile` (Firecrawl LinkedIn scrape + Gemini 2.5 Pro + rules-based fallback), writing `cos_profile*` fields to `onboarding_v8_responses`.
- Calendar connectors (Google, Microsoft, Apple) and wearables (Oura, HealthKit) with encrypted token storage.

**Partially built / wired-but-silent:**
- `userHomeCountry` — plumbed into `classifyAvailability`/`allocatePlanSlots` but sourced from client payload; onboarding never writes `profiles.country`.
- `user_archetype` — actively read for AI-prompt context but **v8 flow never writes it** (only legacy `complete-onboarding` body fields do).
- `practice_priority_tag` — actively drives plan `executiveObjectiveFor()` and focus-tag mapping, but **written only by the legacy pre-v8 `Stage7GrowthIntention`**, so every v8 user has it as `null`.
- `user_integrations` table — receives calendar/watch provider metadata only when `complete-onboarding` is called with those fields; v8's `markV8Complete()` doesn't send them, so table is not populated by v8.
- `enrichEvent()` — only runs at plan/brief-generation time, never inside `sync-calendar`, so `event_category`/`event_subcategory` are enriched lazily.

**Not built:**
- Admin viewer for `cos_profile_html` — HTML is generated but no UI or admin route renders it.
- Onboarding-time write of `profiles.country` / `home_country`.
- Profile-level `leadership_context`, `inferred_priorities`, `pressure_profile` writers — these `profiles` columns are dead in the v8 pipeline; the equivalent unstructured data lives inside `onboarding_v8_responses.freetext_context`/`cos_profile`.
- Payment step inside the v8 onboarding flow — `V8_PATHS` contains no payment route (paywall is decoupled).

---

## Section A — Onboarding Flow Inventory

### Entry point & guard chain
- Auth callback: `src/pages/AuthCallback.tsx:20-150` (native + web Auth0 resolution; does not itself route to onboarding).
- Guard: `src/components/OnboardingGuard.tsx:47-86` — fast-path checks `user.onboarding_completed_at`; otherwise queries DB via `fetchOnboardingProgressSnapshot()` / `isOnboardingCompleteSnapshot()` (`OnboardingGuard.tsx:16-33`) and routes to `getResumeRoute()` when incomplete.
- Whitelist: `src/pages/onboarding/OnboardingFlow.tsx:8-16` — `V8_PATHS` = `/onboarding/app-intro`, `leadership-context`, `cognitive-load`, `protect-goals`, `brief-prefs`, `permissions`, `done`. Any other onboarding path force-redirects to `app-intro` (`OnboardingFlow.tsx:26-28`). Back-nav map at `OnboardingFlow.tsx:45-53`.

### Per-step map
All writes go through `src/utils/onboardingV8.ts` → edge fn `supabase/functions/onboarding-v8-save/index.ts` → table `onboarding_v8_responses`. Writes are **per-step upserts on "next" press**, not batched (`onboarding-v8-save/index.ts:104-115`).

| # | Step | Component | Fields collected | Written to | Validation / skip |
|---|---|---|---|---|---|
| 1 | app-intro | (StageUSPIntro-style intro, outside `stages/v8/`) | none | — | skippable |
| 2 | leadership-context | `StageLeadershipContext.tsx` | `linkedin_url`, `writing_urls[]`, `freetext_context` | `onboarding_v8_responses` | optional; `isLinkedInUrl`/`isHttpUrl` when present (`onboardingV8Validation.ts:188-203`) |
| 3 | cognitive-load | `StageCognitiveLoad.tsx` | `stakes_chips[]`, `load_chips[]`, `burden_chips[]` | `onboarding_v8_responses` | no minimum (`onboardingV8Validation.ts:205-207`) |
| 4 | protect-goals | `StageProtectGoals.tsx:49` | `goals[]` (max 3, taxonomy `GOAL_IDS`) | `onboarding_v8_responses` | ≥1, ≤3 required (`onboardingV8Validation.ts:208-213`) |
| 5 | brief-prefs | `StageBriefPrefs.tsx:53-97` | `brief_timing`, `preferred_practice_window`, `reset_modality`, `weekend_signals` | `onboarding_v8_responses` | `weekend_signals` required; "Use intelligence" → `null` (`onboardingV8Validation.ts:214-217`) |
| 6 | permissions | `StagePermissions.tsx` | `calendar_selections[]`, `wearable_selections[]` | `onboarding_v8_responses` (intent only — real connections happen via OAuth flows) | ≥1 calendar AND ≥1 wearable required (`onboardingV8Validation.ts:218-224`) |
| 7 | done | `StageDone.tsx:40-41` | none — reads back saved fields to render a summary | — | — |

**Completion marker — two flags, both must land:**
1. `onboarding_v8_responses.completed_at` — set by `onboarding-v8-save` `MARK_COMPLETE` action after `validateForCompletion()` (`onboarding-v8-save/index.ts:118-152`, `onboardingV8Validation.ts:231-238`).
2. `profiles.onboarding_completed_at` — set by `complete-onboarding` edge fn, invoked from `markV8Complete()` (`onboardingV8.ts:62-64`), idempotent (`complete-onboarding/index.ts:181-186`), and double-gated on `validateForCompletion(sanitized)` at `complete-onboarding/index.ts:73-120`.

`OnboardingGuard` reads `profiles.onboarding_completed_at` first, DB snapshot second. On completion the user lands on the default authenticated app route.

### Connector step details — see Section C
### LinkedIn / scraping trigger
Client-invoked from `StageDone.tsx` via `synthesizeCosProfile()` (`onboardingV8.ts:66-69`) → `synthesize-cos-profile` edge fn. Whether it also runs on any server trigger is not confirmed from code — see Unknowns.

### Apple Payment / subscription
**Not part of the v8 flow.** `V8_PATHS` contains no payment route. Detailed in Section E.

---

## Section B — COS Profile

### B1 — Inputs
All read from the same `onboarding_v8_responses` row for the user:
- Chips: `stakes_chips`, `load_chips`, `burden_chips`, `goals`
- Preferences: `brief_timing`, `reset_modality`, `weekend_signals`, `calendar_selections`, `wearable_selections`
- Free-text: `linkedin_url`, `writing_urls`, `freetext_context`
- Scraped: `linkedin_scrape`, `writing_scrapes` (populated in-line before AI call)

Referenced in `supabase/functions/synthesize-cos-profile/index.ts:300-349` (`buildUserPrompt()`).

### B2 — Pipeline
- Edge fn: `supabase/functions/synthesize-cos-profile/index.ts` (single canonical function; no separate `generate-cos-profile`).
- Trigger: client call from `onboardingV8.ts:66-69`. No automatic server-side trigger has been confirmed.
- LinkedIn scrape: Firecrawl v2 `/scrape` (`synthesize-cos-profile/index.ts:11,248-278,562-587`). Falls through gracefully if `FIRECRAWL_API_KEY` missing (`index.ts:585-586`). Standalone `linkedin-profile-scrape/index.ts:124-206` also exists.
- AI: Lovable AI Gateway `google/gemini-2.5-pro`, forced tool call `emit_cos_profile` (`index.ts:298,351,663-680`).
- Fallback: `buildFallbackCosProfile()` (`index.ts:117-246,653-696`) if no key, error, or missing tool call.

### B3 — DB storage
**Written only to `onboarding_v8_responses`** (`index.ts:557-596, 620-635`):
- `cos_profile` (JSON)
- `cos_profile_html` (string)
- `cos_profile_status`, `cos_profile_error`, `cos_profile_generated_at`
- `linkedin_scrape`, `writing_scrapes` (raw scraped content)

**Critical**: `profiles.profile_type / profile_description / user_archetype / archetype_title / archetype_description / leadership_context / inferred_priorities / pressure_profile / linkedin_raw_markdown / linkedin_analyzed_at / onboarding_insight` are NEVER written by v8. Those columns are populated only by the legacy `complete-onboarding` body-field path (`complete-onboarding/index.ts:127-139`) and by legacy Stages 7/8 (`Stage7GrowthIntention.tsx`, `Stage8Results.tsx`). `_shared/signal-engine/strategic-context.ts:35` reads them and gets `null` for v8 users.

### B4 — HTML output for admin / CRM
- Generated: yes. Field `cos_profile_html`, built either by AI (`display_html` in tool schema, `index.ts:296`) or `buildFallbackDisplayHtml()` (`index.ts:91-115`) following a `.hero .section .card` CSS contract.
- Stored: `onboarding_v8_responses.cos_profile_html`.
- Admin viewer: **NOT BUILT**. `src/pages/admin/AdminUserDetail.tsx:13-59` shows only generic `KeyVal` dumps of `profile / latestCheckIn / latestWearable / calendarConnections / latestBrief / latestPlan / latestMrs`. It never fetches or renders `onboarding_v8_responses.cos_profile_html`.
- CRM push: no evidence of email/CRM webhook triggered by COS synthesis.

---

## Section C — Connector Wiring

### C1 — Google Calendar (unified with Microsoft, single provider-agnostic pipeline)
- OAuth init & callback: `supabase/functions/calendar-auth/index.ts`; token exchange at `calendar-auth/index.ts:280-291`.
- Token storage: `calendar_connections.access_token_enc / refresh_token_enc / refresh_token_iv` via `encryptJson()` (`calendar-auth/index.ts:300-357`); disconnect nulls them (`index.ts:406-409`).
- Refresh: `supabase/functions/refresh-calendar-tokens/index.ts`, helper `_shared/calendar-token-refresh.ts`.
- Sync: `sync-calendar/index.ts` (on-demand), `sync-calendar-scheduled/index.ts` (cron), webhook via `calendar-webhook/index.ts` + `register-calendar-watch/index.ts`.
- Status: `check-connections-status/index.ts`, `check-calendar-status/index.ts` → surfaces per-provider `connected|disconnected|unknown` to `CalendarProviderPicker.tsx:32,86-108`.
- Failure UX: `warn` state in `StagePermissions.tsx:38-42, 75-79` blocks continue if no calendar or no wearable selected.

### C2 — Microsoft Calendar
Fully implemented alongside Google (same `calendar-auth`/`sync-calendar` pipeline); `microsoft-calendar-errors.ts`, `calendar-provider.ts`, FE type `'google'|'microsoft'|'apple'` at `CalendarProviderPicker.tsx:18`. `MICROSOFT_CALENDAR_CLIENT_ID` secret in use.

### C3 — Apple Calendar
Native bridge: `ios/App/App/AppleCalendarBridge.swift` + `AppleCalendarBackgroundSyncBridge.swift`. JS side: `src/services/appleCalendarSync.ts`. Invoked from `CalendarProviderPicker.tsx`.

### C4 — Oura
`oura-oauth-start` / `oura-oauth-callback` (writes `oura_connections` at `oura-oauth-callback/index.ts:59,102`), `sync-oura/index.ts` (`93,213,402,418`), `oura-sync-fanout`, `disconnect-oura`.

### C5 — Apple Watch / HealthKit
`ios/App/App/HealthKit/{HealthKitAnchorStore,HealthKitSampleNormalizer,HealthKitSyncManager}.swift` + `src/services/healthkit.ts`.

### C6 — Connector state fields
`calendar_connections` and `oura_connections` distinguish connected/disconnected via non-null encrypted-token columns. `check-connections-status` maps to `connected|disconnected|unknown`. **No explicit "stale" or "user skipped" state field** — "skipped" is only recorded in `onboarding_v8_responses.calendar_selections`/`wearable_selections` (intent, not state). "Stale" is inferred at read-time from `wearable_status_*` on `profiles`/`wearable_data` (see wearable-status memory), not from a connector-level column.

### C7 — enrichEvent placement (Risk #9)
**Confirmed**: `enrichEvent` is imported/called in `compute-outer-readiness/index.ts:22,4326`, `generate-mastery-plan/index.ts:75,3396,3687,5839,6422`, `list-week-ahead-priorities/index.ts:43,496`, `record-event-priority-signal/index.ts:21,170`, `_shared/jit/*` — **never inside `sync-calendar/index.ts` or `sync-oura`**. Event categorization/enrichment happens at **plan/brief-generation time**, not at sync time.

---

## Section D — Complete Field Registry

| Table | Column | Written at step | Written by | Nullable | Read by downstream | Notes |
|---|---|---|---|---|---|---|
| onboarding_v8_responses | linkedin_url | leadership-context | onboarding-v8-save | yes | synthesize-cos-profile | |
| onboarding_v8_responses | writing_urls | leadership-context | onboarding-v8-save | yes | synthesize-cos-profile | |
| onboarding_v8_responses | freetext_context | leadership-context | onboarding-v8-save | yes | synthesize-cos-profile | |
| onboarding_v8_responses | stakes_chips | cognitive-load | onboarding-v8-save | yes | synthesize-cos-profile | |
| onboarding_v8_responses | load_chips | cognitive-load | onboarding-v8-save | yes | synthesize-cos-profile | |
| onboarding_v8_responses | burden_chips | cognitive-load | onboarding-v8-save | yes | synthesize-cos-profile | |
| onboarding_v8_responses | goals | protect-goals | onboarding-v8-save | required ≥1 | `_shared/jit/goal-alignment.ts` (needs line-level confirm) | See Unknowns |
| onboarding_v8_responses | brief_timing | brief-prefs | onboarding-v8-save | yes ("Use intelligence" → null) | `smart-nudges/index.ts:5413-5423`, `_shared/leader-profile-loader.ts:116,146,190` | **WORKING** |
| onboarding_v8_responses | preferred_practice_window | brief-prefs | onboarding-v8-save | yes | `generate-mastery-plan/index.ts:4714,4991,7151-7153` | **WORKING** |
| onboarding_v8_responses | reset_modality | brief-prefs | onboarding-v8-save | yes | (not verified) | Unknown |
| onboarding_v8_responses | weekend_signals | brief-prefs | onboarding-v8-save | required | (not verified — likely feeds week-ahead detection) | Unknown |
| onboarding_v8_responses | calendar_selections | permissions | onboarding-v8-save | required ≥1 | synthesize-cos-profile prompt only (intent record) | Not persisted to `user_integrations` by v8 |
| onboarding_v8_responses | wearable_selections | permissions | onboarding-v8-save | required ≥1 | synthesize-cos-profile prompt only | ditto |
| onboarding_v8_responses | step_status | every step | onboarding-v8-save (jsonb merge at :93-101) | — | — | |
| onboarding_v8_responses | cos_profile / cos_profile_html / cos_profile_status / cos_profile_error / cos_profile_generated_at / linkedin_scrape / writing_scrapes | done (client-invoked) | synthesize-cos-profile | yes | **NOT READ by any admin UI**; `cos_profile` JSON may be read by future consumers | **HTML DEAD until admin viewer built** |
| onboarding_v8_responses | completed_at | done | onboarding-v8-save MARK_COMPLETE | — | OnboardingGuard fallback | |
| profiles | onboarding_completed_at | done | complete-onboarding (`markV8Complete`) | — | OnboardingGuard fast path | **WORKING** |
| profiles | user_archetype / archetype_title / archetype_description / practice_priority_tag / pressure_context_tag / identity_role / biggest_pressure / growth_priority / onboarding_insight / mental_fitness_baseline / component_scores / self_check_ins_enabled | (legacy only) | complete-onboarding body fields (`complete-onboarding/index.ts:125-142`) | yes | actively read by generate-mastery-plan, compute-outer-readiness, coachContextBuilder, self-mastery-coach | **RISK — not written for v8 users**; produces silent no-op personalization for the entire v8 cohort |
| profiles | profile_type / profile_description / leadership_context / inferred_priorities / pressure_profile / linkedin_raw_markdown / linkedin_analyzed_at | — | never written by v8 or legacy `complete-onboarding` in the current codebase | yes | `strategic-context.ts:35`, `build-daily-context.ts:245` (defaults to null) | **DEAD** — schema exists, no writer |
| profiles | country / home_country | — | **NEVER WRITTEN by onboarding** | yes | `smart-nudges/index.ts:1801-1804` (falls back), `evaluate-week-ahead-mode/index.ts:66`; `generate-mastery-plan` accepts `req.userHomeCountry` from **client payload** (`generate-mastery-plan/index.ts:9285-9297`), not from profiles | **RISK — no fallback from onboarding**; only populated by client-supplied context or later travel/home-location flows |
| user_integrations | calendar_provider / calendar_connected_at / watch_type / watch_connection_status | (legacy only — if `complete-onboarding` body includes these fields) | complete-onboarding (`:144-175`) | yes | connector status readers | **Not populated by v8** (`markV8Complete()` only sends `{onboarding_version:"v8"}`) |
| calendar_connections | access_token_enc / refresh_token_enc / refresh_token_iv / provider / status | after user completes OAuth in permissions step | calendar-auth | non-null after success | sync-calendar, refresh-calendar-tokens | **WORKING** |
| oura_connections | (similar shape) | after Oura OAuth | oura-oauth-callback | non-null after success | sync-oura | **WORKING** |
| notification_preferences / user_preferences | — | — | **not written during onboarding** in searched paths | — | — | Unknown whether populated by any other flow |

---

## Section E — Apple Payment / Subscription

- **Not in the v8 flow.** `V8_PATHS` (`OnboardingFlow.tsx:8-16`) contains no payment route. `Stage6Payment.tsx` exists only under legacy non-v8 `stages/` and is not reachable from the v8 route set.
- Native: `ios/App/App/InAppPurchasePlugin.swift` (StoreKit 2 direct); JS: `src/services/iap.ts`, `src/config/iapProducts.ts`, `src/components/subscription/ApplePaywall.tsx`.
- Verify / webhook edge fns: `verify-apple-purchase`, `verify-checkout-session`, `apple-notifications` (JWT verification disabled for the webhook in `supabase/config.toml:18-19`).
- Free trial: `src/services/iap.ts:34-38` types `introOffer?: IapIntroOffer` (StoreKit-driven). Server-side trial crediting inside `verify-apple-purchase` not confirmed — see Unknowns.
- Gating: outside the onboarding flow — driven by `SubscriptionGuard.tsx` + `resolveSubscriptionAccess()` reading `profiles.subscription_*` and `apple_transactions`.
- Onboarding is NOT gated behind payment; a user completes v8 and then may hit paywall at feature-access time.

---

## Section F — Downstream Personalisation Matrix

### F1 — MRS / Inner Readiness
| Field | Table.column | Feature reads | Use | Wiring status |
|---|---|---|---|---|
| Check-in time preference | (no direct onboarding field) | check-in scheduler | — | **NOT WIRED from onboarding** — timing is timezone-based (Morning/Afternoon/Evening buckets), not personalised via onboarding |
| user_archetype | profiles.user_archetype | compute-inner-readiness / MRS prompts (indirectly via compute-outer-readiness AI context) | AI-prompt personalization | **WIRED-BUT-SILENT for v8** (never written) |

### F2 — Brief (compute-outer-readiness)
| Field | Source | Read | Use | Status |
|---|---|---|---|---|
| brief_timing | onboarding_v8_responses.brief_timing | `_shared/leader-profile-loader.ts:116,146,190`; consumed in `smart-nudges/index.ts:5413-5423` | Determines whether Brief delivery is scheduled Morning vs Evening | **WORKING** |
| user_archetype | profiles.user_archetype | `compute-outer-readiness/index.ts:3361,7050-7051` | AI-prompt personalization line | **WIRED-BUT-SILENT for v8** |
| leadership_context / pressure_profile | profiles.* | `_shared/signal-engine/strategic-context.ts:35`, `build-daily-context.ts:245` | Brief copy / context injection | **DEAD** — never written |

### F3 — Plan (generate-mastery-plan)
| Field | Source | Read | Use | Status |
|---|---|---|---|---|
| preferred_practice_window | onboarding_v8_responses.preferred_practice_window | `generate-mastery-plan/index.ts:4714,4991,7151-7153` | Practice selector honors user's morning/evening window | **WORKING** |
| goals | onboarding_v8_responses.goals | `_shared/jit/goal-alignment.ts:1,14,43` | Goal-alignment JIT boost multiplier | **WORKING** (pending line-level source-table confirmation) |
| practice_priority_tag | profiles.practice_priority_tag | `generate-mastery-plan/index.ts:4711,4984,5976,6230,6552,7226`; `executiveObjectiveFor()` (`:4192-4193`) | Drives executive objective + focus-tag mapping | **WIRED-BUT-SILENT for v8** — legacy Stage7 writes it; v8 does not |
| archetype | profiles.user_archetype | `generate-mastery-plan/index.ts:4986` (`req.archetype`) | AI-prompt context only (no direct slot-selection hit found) | **WIRED-BUT-SILENT for v8** |
| userHomeCountry | client payload (NOT profiles.country) | `generate-mastery-plan/index.ts:9285-9297` → `classifyAvailability`/`allocatePlanSlots` | Weekend/light-day detection | **PARTIALLY WIRED** — plumbing works, onboarding never seeds it |

### F4 — Smart Nudges
| Field | Source | Read | Use | Status |
|---|---|---|---|---|
| brief_timing | onboarding_v8_responses | `smart-nudges/index.ts:5413-5423` | Nudge/Brief delivery time | **WORKING** |
| home_country | profiles.country | `smart-nudges/index.ts:1801-1804` | Country-specific planning cadence (weekend detection, Saturday-planning countries) | **PARTIALLY WIRED** — falls back if null; onboarding never writes |

### F5 — Week-Ahead
| Field | Source | Read | Use | Status |
|---|---|---|---|---|
| home_country | profiles.country | `evaluate-week-ahead-mode/index.ts:66`, `list-week-ahead-priorities` | Country-aware `planningDayOfWeek`; Sunday vs Saturday trigger | **PARTIALLY WIRED** — same gap as F4 |
| timezone | profiles.timezone | week-ahead mode | Sunday trigger localization | Written by timezone-persistence protocol (not v8); assumed **WORKING** independent of onboarding |

### F6 — Insights / Cause-Effect
| Field | Source | Read | Use | Status |
|---|---|---|---|---|
| user_archetype / practice_priority_tag | profiles.* | (indirect via plan / brief prompts) | Baseline personalization before wearable data | **WIRED-BUT-SILENT for v8** |

### F7 — Coach cards / COS profile use
| Field | Source | Read | Use | Status |
|---|---|---|---|---|
| user_archetype | profiles.user_archetype | `coachContextBuilder.ts:275`, `self-mastery-coach/index.ts:1685` | Coach persona / context | **WIRED-BUT-SILENT for v8** |
| cos_profile / cos_profile_html | onboarding_v8_responses | not read by admin UI or coach features today | intended for admin / CRM / coach context | **NOT WIRED downstream** despite being generated |

---

## Section G — Risk verifications

| # | Suspicion | Verdict | Evidence |
|---|---|---|---|
| 1 | `preferred_practice_window` not written | **DENIED** | Written by `StageBriefPrefs.tsx:97` to `onboarding_v8_responses.preferred_practice_window`; read at `generate-mastery-plan/index.ts:4714,4991,7151-7153` |
| 2 | `preferred_brief_time` not read by scheduler | **DENIED** | Read at `smart-nudges/index.ts:5413-5423` and `_shared/leader-profile-loader.ts:116,146,190` |
| 3 | `home_country` not passed to classifyAvailability/allocatePlanSlots | **PARTIALLY DENIED** | Plumbing exists (`generate-mastery-plan/index.ts:9285-9297`), but value is sourced from client payload; onboarding never writes `profiles.country` |
| 4 | `archetype` read but unused in slot selection | **CONFIRMED** | Only AI-prompt injections found (`compute-outer-readiness:7051`); no hard slot-selection hit for `req.archetype` in `generate-mastery-plan` |
| 5 | `practice_priority_tag` not written by v8 | **CONFIRMED** | Only legacy `Stage7GrowthIntention.tsx:26` / `Stage8Results.tsx:110` / `complete-onboarding/index.ts:128` write it. v8's `protect-goals` step writes `goals[]` to `onboarding_v8_responses`, not `practice_priority_tag` to `profiles`. |
| 6 | LinkedIn scraper not wired to COS | **DENIED** | Firecrawl invoked directly in `synthesize-cos-profile/index.ts:562-587` |
| 7 | COS profile HTML not built | **PARTIALLY CONFIRMED** | HTML *is* generated (`cos_profile_html`, `buildFallbackDisplayHtml`) but no admin UI renders it (`AdminUserDetail.tsx` has no COS section) |
| 8 | Apple Payment partially built | **CONFIRMED (as expected)** | StoreKit 2 + verify functions exist; payment fully decoupled from v8 onboarding |
| 9 | Calendar sync doesn't call enrichEvent | **CONFIRMED** | `enrichEvent` only appears in plan/brief-time functions; not in `sync-calendar` / `sync-oura` |

---

## Section H — Findings by Bucket

### WORKING
- Per-step v8 persistence (`onboarding-v8-save`) and completion double-gating.
- `preferred_practice_window` — write + read + effect.
- `brief_timing` — write + read + effect in nudge scheduler.
- COS profile generation (Firecrawl + Gemini 2.5 Pro + rules fallback) writing to `onboarding_v8_responses`.
- Google, Microsoft, Apple calendar connector pipelines and Oura/HealthKit connectors with encrypted token storage.
- Apple IAP StoreKit 2 verify/webhook stack (separate from onboarding flow).

### PARTIALLY BUILT
- `userHomeCountry` — plumbing complete but never seeded by onboarding.
- `apple-notifications` webhook: verify flow present, full trial-crediting path not fully traced.
- `enrichEvent` runs only at plan/brief time (lazy), not at calendar sync.

### NOT BUILT
- Admin viewer / CRM push for `cos_profile_html`.
- Onboarding write for `profiles.country`.
- Onboarding writers for `profiles.leadership_context`, `inferred_priorities`, `pressure_profile`, `profile_type`, `profile_description`, `linkedin_raw_markdown`, `linkedin_analyzed_at` — all dead columns in the v8 pipeline.
- Payment step inside the v8 flow (paywall is decoupled).
- `user_integrations` write from v8 (`markV8Complete` sends no such body).

### WIRED BUT SILENT (code runs, no effect for v8 users)
- `profiles.user_archetype` — read in Plan / Brief / Coach; never written by v8 onboarding.
- `profiles.practice_priority_tag` — actively drives Plan's `executiveObjectiveFor()` and focus-tag mapping; never written by v8.
- `profiles.archetype_title / archetype_description / onboarding_insight / identity_role / biggest_pressure / growth_priority / mental_fitness_baseline / component_scores` — same pattern.
- Any consumer reading the above from `profiles` receives `null` for the entire v8 cohort — silent personalization loss.

---

## Section I — Unknowns / Cannot Determine From Code

- Does `_shared/jit/goal-alignment.ts` read `onboarding_v8_responses.goals` directly? File not opened line-by-line — needs direct inspection.
- Full server-side free-trial crediting path in `verify-apple-purchase/index.ts` — no grep hits for `apple_transactions` / `subscription_events` writes in the sub-agent pass.
- Whether any server trigger auto-invokes `synthesize-cos-profile` on completion, or whether it's purely opt-in from `StageDone.tsx`.
- Whether legacy `Stage6Payment.tsx` / `Stage7GrowthIntention.tsx` are still reachable by any route (dead code vs. fallback).
- Whether `notification_preferences` / `user_preferences` are populated by any post-onboarding init path (not written during v8 onboarding).
- Runtime population of `profiles.country` — believed to come from later travel/home-location flows, not confirmed from an onboarding path.

---

## New Findings (not anticipated in the prompt)

1. **Two completion flags with different gates.** `onboarding_v8_responses.completed_at` and `profiles.onboarding_completed_at` are set by two different edge functions with overlapping validation. A partial failure could leave the v8 row completed but the profile flag unset, or vice versa.
2. **`user_integrations` orphaned by v8.** v8 collects `calendar_selections` / `wearable_selections` but `markV8Complete()` doesn't forward them to `complete-onboarding`, so `user_integrations` never receives the v8 provider metadata that the legacy flow used to populate.
3. **Standalone `linkedin-profile-scrape` edge function** exists in parallel to the Firecrawl block inside `synthesize-cos-profile` — possible duplication; unclear which is canonical.
4. **`resolve-attendee-relationship`** also uses Firecrawl (`:120-301`), so Firecrawl has three separate call sites in the repo.
5. **`apple-notifications` webhook has `verify_jwt = false`** in `supabase/config.toml:18-19` — expected for a public Apple-signed webhook, but worth noting for future security scans.
6. **COS profile "status/error" fields exist** (`cos_profile_status`, `cos_profile_error`) but there is no UI surfacing this to the user if synthesis fails after they've completed `StageDone`.

---

_Audit produced from a read-only pass of the repo at commit-current. No code was modified._