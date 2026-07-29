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
---

# COS Profile — Deep Audit of Scraping, Analysis, and LLM Synthesis

_Read-only audit, 29 Jul 2026. Source of truth: `supabase/functions/synthesize-cos-profile/index.ts` (738 lines), `supabase/functions/linkedin-profile-scrape/index.ts` (328 lines), and live `onboarding_v8_responses` / `user_external_profiles` rows. No code was changed._

## Section A — Scraping: what is actually fetched

### A1 — LinkedIn scraping

**The Firecrawl call** (`synthesize-cos-profile/index.ts:248-278`) is a single generic helper used for *every* URL — LinkedIn and writing URLs alike:

```ts
const res = await fetch(`${FIRECRAWL_V2}/scrape`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ url, onlyMainContent: true, formats: ["markdown", "summary"] }),
});
```

- Endpoint: `https://api.firecrawl.dev/v2/scrape` (direct API mode, `Bearer FIRECRAWL_API_KEY` — no gateway).
- Body: only `url`, `onlyMainContent: true`, `formats: ["markdown","summary"]`. **No `actions`, no `waitFor`, no `json` extraction schema, no `location`, no proxy/stealth option.**
- Timeout: **none** — no `AbortController`, no `signal`. A hung Firecrawl call hangs the whole synthesis.
- Error handling: any non-2xx or unparsable body returns `{ ok:false, error: "firecrawl_<status>" }`; thrown errors return `{ ok:false, error: message }`. Never throws upward.
- Fields kept: `markdown` (truncated to 60 000 chars), `summary`, `metadata`. `html`, `links`, `json` are **not** requested and therefore never available.

**What is stored in `onboarding_v8_responses.linkedin_scrape`** (`:571-596`): a processed subset, not the raw response —
`{ url, ok, markdown?, summary?, metadata?, error?, scraped_at }`.

**Which LinkedIn sections are covered:** in principle whatever markdown Firecrawl returns for the public page. In practice **none** — see below.

**Anti-bot reality (evidence, not inference).** Every LinkedIn scrape attempt in the live DB failed with an explicit Firecrawl refusal:

```
li_ok = false
li_err = "We apologize for the inconvenience but we do not support this site.
          If you are part of an enterprise and want to have a further conversation
          about this, please fill out our intake form here: https://…typeform.com/…"
```

- Rows with a `linkedin_scrape` object present: **3**. Rows where `ok = true`: **0**.
- `length(linkedin_scrape->>'markdown')` = **0** in every row.
- `user_external_profiles`: **3 rows, all `scrape_status = 'url_only'`, zero `ok`/`partial`.**

So Firecrawl is not being blocked by LinkedIn — **Firecrawl itself refuses linkedin.com by policy**. LinkedIn scraping success rate to date: **0 / 3 (0%)**. `FIRECRAWL_API_KEY` is clearly present in production (the API answered with a policy refusal, not an auth error).

**Duplicate scraper.** `linkedin-profile-scrape/index.ts:124-206` is a *second, richer* Firecrawl call to the same endpoint:

```ts
formats: ["markdown", "summary", { type: "json", prompt: "Extract the public LinkedIn profile fields… full_name, headline, current_company, current_role, location, about, experience, education, skills, profile_image_url…" }]
```

It adds LLM JSON extraction, URL canonicalisation (`LINKEDIN_PUBLIC_RX`), a confidence heuristic (`ok` / `partial` / `insufficient`), writes `user_external_profiles`, **and mirrors its result into `onboarding_v8_responses.linkedin_scrape`** (`:297-306` and `:227-244` for the failure path).

- Called from the client at `StageLeadershipContext.tsx:165`, `LinkedInAccountRow.tsx:95`, `LinkedInImportCard.tsx:75`.
- **Both run.** The onboarding step calls `linkedin-profile-scrape` first; `synthesize-cos-profile` then skips its own LinkedIn scrape only because of the guard `if (linkedinUrl && isValidHttpUrl(linkedinUrl) && !linkedinScrape)` (`:571`). A *failed* mirror row is a truthy object, so **the synthesis never retries LinkedIn** — a permanent negative cache with no TTL.
- Canonical in practice: `linkedin-profile-scrape` (it writes first). The block inside `synthesize-cos-profile` is effectively dead for any user who passed through the onboarding step. Neither is superior in outcome today, since both hit the same policy refusal.

### A2 — Writing URL scraping

`:565` — `const writingUrls = Array.isArray(row.writing_urls) ? row.writing_urls.slice(0, 2) : []`.

- **Only the first 2 URLs are ever scraped**, regardless of how many the user entered (client allows up to `MAX_WRITING_URLS`). Silent truncation, no user-visible notice.
- Options are **identical to the LinkedIn call** — `onlyMainContent: true`, `formats: ["markdown","summary"]`. No link-following, no crawl, no per-domain handling. A Substack *index* page therefore yields post titles/blurbs, not article bodies; only a direct article URL yields the full text.
- **Video URLs:** no transcript extraction of any kind. YouTube/Loom yield page metadata and whatever markdown Firecrawl scrapes off the watch page — effectively title + description.
- Limits: per-scrape markdown capped at 60 000 chars (`:271`); the *combined* writing text is then capped at **30 000 chars** (`:611`) before reaching the LLM.
- `writing_scrapes` stores **one entry per attempted URL**: `{ url, ok, markdown?, summary?, metadata?, error?, scraped_at }`; invalid URLs get `{ url, ok:false, error:"invalid_url" }` (`:576-584`).
- Paywall / 404 / empty: **per-URL failure only** — the loop continues, the entry is stored with `ok:false`, and synthesis proceeds. The scraping step never fails the request. Note there is no content-quality check: a paywall page that returns 200 with a "Subscribe to read" stub is stored as `ok: true` and passed to the LLM as if it were real writing.
- Live data: **0 rows have any `writing_scrapes` entries.** This path has never produced data in production.

## Section B — The LLM analysis

### B1 — System prompt (verbatim, `:280-298`)

```
You are an expert analyst building a Chief of Staff for the Mind (COS) intelligence profile for a senior executive. Your role is to synthesise onboarding inputs into a structured, actionable profile that the app uses to personalise daily briefs, Readiness Assessments, Prepare protocols, and Recalibrate recommendations.

Output must be:
- Operational and precise, never generic
- Performance-coded, never wellness-coded (say "cognitive load" not "stress", "recovery deficit" not "burnout", "regulation gap" not "anxiety")
- Honest about what is known vs provisional vs missing
- Structured for both app consumption (JSON fields) and in-app display (HTML)

You are writing for a CEO-level user. Tone: highly intelligent, discreet chief of staff. Direct. Economical. High signal. Never sounds like coaching, therapy, or personality assessment.

Critical rules:
- If freetext contains DISC / Enneagram / archetype / self-assessment, treat as PRIMARY SOURCE — overrides inferred traits. Flag where LinkedIn/writing confirms or diverges.
- LinkedIn: extract role, sector, trajectory, board exposure, positioning, communication signals. Do not infer emotional states from job titles.
- Writing/interviews: richest source for cognitive style and how the COS should speak to them.
- Be honest about confidence. Avoid false certainty.
- If LinkedIn or writing missing, explicitly list gaps in what_is_missing. Never fabricate.
- display_html must follow the Rishad COS profile format with classes: .hero, .section, .sec-label, .card, .card-body, .tag, .two-col, .lean-item, .flag, .flag-amber, .flag-red, .flag-teal, .quote, .missing-item.

You MUST call the tool "emit_cos_profile" exactly once with the structured profile. Do not return prose.
```

### B2 — `buildUserPrompt()` (verbatim, `:300-349`)

```
Build a COS intelligence profile for this executive using the onboarding data below. Follow the output schema exactly.

### INPUT DATA

**LinkedIn URL provided:** ${args.linkedinUrl ?? "(none)"}
**LinkedIn profile content (scraped):**
${args.linkedinText || "(no scrape available)"}

**Published writing / interview URLs:** ${args.writingUrls.join(", ") || "(none)"}
**Writing content (scraped):**
${args.writingText || "(no scrape available)"}

**Self-provided context (free text):**
${args.freetext || "(none provided)"}
If this contains DISC, Enneagram, archetype, or any existing self-assessment, treat as PRIMARY SOURCE.

**High-stakes events that matter to them:** ${args.stakesChips.join(", ") || "(none selected)"}
**What tends to weigh on them:** ${args.loadChips.join(", ") || "(none selected)"}
**Operating burdens:** ${args.burdenChips.join(", ") || "(none selected)"}

**Goals selected (up to 3):** ${args.goals.join(", ") || "(none selected)"}
**Brief timing preference:** ${args.briefTiming ?? "(not set)"}
**Reset modality preference:** ${args.resetModality ?? "(not set)"}
**Weekend signals preference:** ${args.weekendSignals ?? "(not set)"}

**Calendar providers connected:** ${args.calendarSelections.join(", ") || "(none selected)"}
**Wearable providers connected:** ${args.wearableSelections.join(", ") || "(none selected)"}

user_id: ${args.userId}
timestamp: ${new Date().toISOString()}

Now emit the profile via the emit_cos_profile tool.
```

- LinkedIn content: **raw markdown dump**, unlabelled, unsegmented, capped at 30 000 chars (`:609`).
- Writing scrapes: **concatenated raw markdown joined by `\n\n---\n\n`** (`:601-604`). Individual sources are **not labelled with their URL** — the LLM cannot attribute a quote to a source.
- Chips/goals: **comma-joined plain lists**, not JSON, with `(none selected)` placeholders.
- Freetext: passed **as-is**, only truncated to 6 000 chars (`:612`).
- Token estimate for a "typical" populated user (LinkedIn markdown ~8 000 chars + one Substack article ~12 000 chars + chips/freetext ~1 500 chars): ≈ 21 500 chars ≈ **5–6k tokens**. Worst case (both caps hit): ≈ 67 000 chars ≈ **17k tokens**. Today's real users: **< 700 tokens** because both scrape fields are empty.

### B3 — `emit_cos_profile` tool schema (`:351-504`)

Full property list (all leaf types are `string` unless noted):

| Field | Type | Description in schema |
|---|---|---|
| `profile_id`, `generated_at`, `confidence_overall`, `confidence_note` | string | *(none)* |
| `data_sources` | string[] | *(none)* |
| `identity` | object: `display_name`, `role`, `sector`, `organisation_stage`, `leadership_stage` | *(none)* |
| `leadership_style` | object: `primary_style`, `style_tags[]`, `style_description`, `confidence`, `source_note` | *(none)* |
| `communication_profile` | object: `how_they_think`, `how_they_communicate`, `what_lands[]`, `what_wont_land[]`, `cos_brief_rules`, `confidence` | *(none)* |
| `existing_self_knowledge` | object: `disc_provided`(bool), `disc_type`, `archetype_provided`(bool), `archetype_type`, `other_frameworks`, `alignment_note`, `confidence` | *(none)* |
| `cognitive_risk_profile` | object: `primary_risk`, `risk_flags[]{flag,severity,description,trigger_conditions}`, `regulation_strengths[]`, `confidence` | *(none)* |
| `external_persona` | object: `summary`, `legacy_signals`, `confidence` | *(none)* |
| `high_stakes_map` | object: `declared_events[]`, `inferred_events[]`, `event_frequency_estimate` | *(none)* |
| `cognitive_load_map` | object: `declared_loads[]`, `inferred_loads[]`, `operating_burdens[]`, `primary_depletion_pattern` | *(none)* |
| `goals` | object: `declared[]`, `cos_accountability_note` | *(none)* |
| `brief_personalisation` | object: `timing`, `reset_modality`, `weekend_signals`, `brief_voice_note` | *(none)* |
| `provisional_archetype` | object: `name`, `subtitle`, `description`, `to_be_confirmed_after`, `confidence` | *(none)* |
| `what_is_missing` | array of `{gap_number:number, gap, description}` | *(none)* |
| `display_html` | string | *(none)* |

`required`: `confidence_overall`, `identity`, `leadership_style`, `communication_profile`, `cognitive_risk_profile`, `goals`, `brief_personalisation`, `display_html`. `additionalProperties: false`. Tool `description`: `"Emit the structured Chief of Staff for the Mind profile."`

**Critical schema finding: not a single property in the schema carries a `description`.** There is zero per-field instruction — no "infer", no "derive from evidence", no `display_html` formatting spec. All analytical guidance lives only in the system prompt. The *field names* are interpretive (`inferred_events`, `inferred_loads`, `primary_depletion_pattern`, `provisional_archetype`, `cognitive_risk_profile`), so the schema shape implies synthesis, but nothing in the schema enforces or explains it.

### B4 — AI call parameters (`:660-677`)

- Endpoint: `https://ai.gateway.lovable.dev/v1/chat/completions`
- Model: `google/gemini-2.5-pro` (constant `AI_MODEL` at `:13`; no runtime override, no model fallback chain — unlike the Claude→Haiku paths elsewhere).
- `temperature`: **not set** (provider default).
- `max_tokens` / `maxOutputTokens`: **not set** — a long `display_html` can be truncated with no detection; a truncated tool-call JSON fails `JSON.parse` and silently falls back.
- `tool_choice`: **forced** — `{ type: "function", function: { name: "emit_cos_profile" } }`.
- No `reasoning_effort`, no `thinking`, no `service_tier`.

## Section C — The fallback

### C1 — `buildFallbackCosProfile()` (`:117-246`)

The only "analysis" it performs is two regexes in `inferSelfKnowledge()` (`:82-89`) that look for `DISC` and `Enneagram|type` tokens in the freetext. Everything else is a direct field mapping:

- `identity.display_name` is hardcoded `"Executive"`; `sector`/`organisation_stage` hardcoded `"Not provided"`.
- `leadership_style.style_tags` = `goals.slice(0,3) + stakesChips.slice(0,2)`; `style_description` = the raw freetext or a canned sentence.
- `cognitive_risk_profile.risk_flags` = load/burden chips wrapped in `{ flag, severity: "unknown", description: "Declared load signal: <chip>" }`.
- `high_stakes_map.inferred_events` and `cognitive_load_map.inferred_loads` are **always `[]`** — the inference fields exist and are always empty.
- `communication_profile.what_lands` / `what_wont_land` are **fixed literal arrays** for every user.
- `provisional_archetype.name` is always `"Provisional Executive Operator"`.
- `confidence` = `medium` if any external text or freetext > 120 chars, else `low`, else `very_low`.

Structurally it is **field-for-field identical** to the AI schema (same keys, same nesting) but **semantically hollow**: no interpretation, no cross-source reconciliation, no archetype reasoning. It is deliberately labelled as provisional in `confidence_note`.

For a chips-only user the fallback yields, essentially: display_name "Executive", role "Role not provided", style_description = the canned "Leadership style cannot be inferred yet…" string, risk_flags = the user's own chips echoed back, and a 3-item `what_is_missing` list.

### C2 — When the fallback actually runs

Three trigger paths, all returning HTTP 200 with `fallback: true`:

| Trigger | Line | `fallback_reason` |
|---|---|---|
| `LOVABLE_API_KEY` missing | `:645-658` | `ai_unavailable` |
| AI gateway non-2xx (incl. 402 credits, 429) | `:679-693` | `ai_<status>` |
| Response has no parsable `emit_cos_profile` tool call | `:705-717` | `ai_no_tool_call` |

Note: a missing `FIRECRAWL_API_KEY` does **not** trigger the fallback — it only skips scraping (`:585-587`) and the AI still runs with empty scrape sections.

**Observability gap:** `cos_profile_status` is set to `"ready"` for both AI and fallback profiles (`persistReadyProfile`, `:625-643`). The `fallback: true` flag exists **only in the HTTP response**, never persisted. There is no stored column, no `cos_profile.data_sources` marker, and no distinguishing status value. **You cannot query how many stored profiles are fallbacks.**

**Live rows** (all 5 `onboarding_v8_responses`; only 2 have `cos_profile_generated_at`):

| user | status | generated_at | linkedin | archetype | confidence | html len |
|---|---|---|---|---|---|---|
| `linkedin\|2b…` | ready | 2026-07-17 | none | **"The Juggler (Provisional)"** | Very Low | 4 030 |
| `google-oauth…` | ready | 2026-06-16 | scrape refused | **"The Athlete"** | Very Low | 6 131 |
| 3 others | pending | — | 1 refused / 2 none | — | — | 0 |

Both generated rows are **AI-generated, not fallback** — proof: the archetype names ("The Juggler (Provisional)", "The Athlete") are not the hardcoded `"Provisional Executive Operator"`, and the confidence notes are bespoke interpretive prose ("This is a thin profile based solely on the initial onboarding questionnaire… It should be treated as a provisional starting point…"). Fallback-marked rows: **0**.

But both are AI runs over **chips only** — the LLM's own text confirms it: *"No inputs from LinkedIn, written materials, or self-description were provided."* So the pipeline is running the expensive path on the thinnest possible input.

### C3 — `buildFallbackDisplayHtml()` (`:91-115`)

```ts
function buildFallbackDisplayHtml(profile: any): string {
  const gaps = Array.isArray(profile.what_is_missing) ? profile.what_is_missing : [];
  return `
<div class="hero">
  <div class="sec-label">Chief of Staff profile</div>
  <h2>Provisional leadership context</h2>
  <p>${escapeHtml(profile.confidence_note)}</p>
</div>
<div class="section">
  <div class="sec-label">What we know</div>
  <div class="card"><div class="card-body">
    <span class="tag">Goals: ${escapeHtml(compactList(profile.goals?.declared ?? [], "not selected"))}</span>
    <span class="tag">High stakes: ${escapeHtml(compactList(profile.high_stakes_map?.declared_events ?? [], "not declared"))}</span>
    <span class="tag">Load: ${escapeHtml(compactList(profile.cognitive_load_map?.declared_loads ?? [], "not declared"))}</span>
  </div></div>
</div>
<div class="section">
  <div class="sec-label">How Mind Module should brief you</div>
  <div class="card"><div class="card-body">${escapeHtml(profile.communication_profile?.cos_brief_rules ?? "")}</div></div>
</div>
<div class="section">
  <div class="sec-label">Missing context</div>
  ${gaps.map((g: any) => `<div class="missing-item">${escapeHtml(g.gap)} — ${escapeHtml(g.description)}</div>`).join("")}
</div>`.trim();
}
```

Four sections, three of which are a chip echo. It is **a placeholder, not a profile page** — no leadership style, no risk profile, no archetype, no prose. It is correctly HTML-escaped. Note the fallback path overwrites whatever `display_html` might exist (`:244`).

## Section D — End-to-end quality assessment

1. **Is the LLM doing real analysis?** *Partly — instructed to, but not enforced.* The system prompt does ask for synthesis: *"synthesise onboarding inputs"*, *"extract role, sector, trajectory, board exposure, positioning"*, *"Writing/interviews: richest source for cognitive style"*, *"treat as PRIMARY SOURCE — overrides inferred traits. Flag where LinkedIn/writing confirms or diverges."* That is genuine interpretive instruction, not copy-paste. **But** the tool schema carries **zero field descriptions**, and the user prompt is a flat label→value dump with no analytical framing. Evidence from live rows shows Gemini *is* interpreting (bespoke archetypes, honest confidence notes) — it is simply interpreting almost nothing, because there is almost nothing to interpret.

2. **Is the LinkedIn scrape returning useful data?** **No — 0% success.** Firecrawl returns a policy refusal for `linkedin.com` ("we do not support this site"), not a login wall or a truncation. 0/3 attempts succeeded; `markdown` length is 0 in every stored scrape; all 3 `user_external_profiles` rows are `url_only`. The single richest input the whole design depends on has **never once been captured**.

3. **Are writing URLs meaningfully analysed?** **Unproven and structurally limited.** Zero rows have any `writing_scrapes`. Structurally: only the first 2 URLs are scraped; `onlyMainContent` with no link-following means a Substack *index* URL yields blurbs not articles (a direct article URL would work); video URLs yield no transcript; sources are concatenated without URL labels; a paywall stub returning 200 is treated as valid content.

4. **AI vs fallback share?** Of the 2 generated profiles, **both are AI-generated (100%)**; 0 fallbacks. But this is unmeasurable at scale — the fallback flag is never persisted (C2). The dominant real-world failure is not the fallback, it is **AI-on-empty-input**: 100% of generated profiles were produced with no LinkedIn, no writing, and no freetext.

5. **Is the HTML a genuine profile?** For the AI path, plausibly — 4 030 and 6 131 chars of structured markup against the CSS contract `.hero .section .sec-label .card .card-body .tag .two-col .lean-item .flag .flag-amber .flag-red .flag-teal .quote .missing-item` (`:296`). For the fallback path, no — it is a 4-block placeholder. **Either way it is currently unreachable:** `rg` over `src/` finds `cos_profile_html` **only in the generated `types.ts`** — no component, page, or email template renders it. The profile is generated, stored, and never shown to anyone.

## Section E — Gap list

1. **LinkedIn scraping is 100% non-functional.** Firecrawl refuses linkedin.com by policy. Not a bug in the calling code — a provider capability gap. Requires a different provider (Proxycurl / Bright Data / official LinkedIn API) or dropping LinkedIn as an input.
2. **Failed LinkedIn scrapes are cached forever.** `!linkedinScrape` (`:571`) treats a `{ok:false}` object as "already scraped". No TTL, no retry-on-failure, even with `force: true` (force only bypasses the *profile* cache, not the scrape cache).
3. **Two competing LinkedIn scrapers.** `linkedin-profile-scrape` (richer, with LLM JSON extraction) and the inline block in `synthesize-cos-profile` (basic). The richer one writes the shared field first and thereby disables the other. Undocumented coupling.
4. **Writing URLs silently truncated to 2** (`:565`) with no user feedback.
5. **No timeout on any Firecrawl call** — a hung scrape hangs synthesis, and there is no wall-clock budget for the whole function.
6. **No content-quality gate on scrapes.** A paywall/consent/404-soft page returning 200 is stored `ok:true` and fed to the LLM as genuine writing.
7. **No transcript extraction for video URLs** despite the UI inviting interview/video links.
8. **Writing sources are unlabelled** in the prompt (`\n\n---\n\n` join) — the LLM cannot attribute or weight by source.
9. **Tool schema has zero field descriptions** — all analytical intent depends on the system prompt surviving into a forced tool call.
10. **No `max_tokens`** on a call that must emit multi-KB HTML → silent truncation risk → `JSON.parse` failure → silent fallback.
11. **No model fallback** for `google/gemini-2.5-pro`; a 402/429 drops straight to the hollow fallback.
12. **Fallback vs AI is not persisted.** `cos_profile_status = 'ready'` for both. Impossible to measure fallback rate, impossible to re-run only the fallbacks.
13. **`inferred_events` / `inferred_loads` are structurally always empty in fallback** and unenforced in the AI path — the "inference" half of the data model is decorative.
14. **`cos_profile_html` is never rendered.** No UI, no admin viewer, no email. The entire pipeline currently has no consumer.
15. **No downstream consumer of `cos_profile` at all** in `src/` — pairs with the ONBOARDING_AS_BUILT "WIRED BUT SILENT" findings (`user_archetype`, `practice_priority_tag` never written).
16. **No user-facing error surface** when synthesis fails or produces a very-low-confidence profile (`cos_profile_error` is written but never read by the client).
17. **Cost/benefit inversion:** Gemini 2.5 Pro (the most expensive text path in the app) is being invoked on ~600-token chips-only prompts.

## Unknowns

- Whether Firecrawl's refusal is plan-tier-dependent (an enterprise Firecrawl agreement might unblock linkedin.com) — determinable only with Firecrawl, not from code.
- Real-world Substack/blog scrape fidelity — **zero** production samples exist to measure.
- Whether `synthesize-cos-profile` is ever invoked server-side or is purely opt-in from `StageDone.tsx` (carried over from the prior audit; still unresolved).
- Whether Gemini 2.5 Pro would produce materially better output with populated LinkedIn/writing input — untestable without a working scraper.
- Whether the truncation caps (30 000 chars each for LinkedIn and writing) are ever hit in practice.

_Read-only audit. No code, schema, or data was modified._
