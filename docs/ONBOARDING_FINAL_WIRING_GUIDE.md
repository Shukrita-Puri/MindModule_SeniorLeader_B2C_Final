# Onboarding — MASTER Wiring Guide (V8-only, code-verified)

Companion to `ONBOARDING_MASTER_SSOT.md`. **Legacy questionnaire onboarding is deleted — do not build or reference it.** Steps marked **[CURRENT]** or **[TARGET]**.

---

## 0. Delete legacy first

Remove the legacy routes/stages and stop referencing them anywhere:
`/onboarding/identity|emotional-awareness|stress-response|recovery-patterns|mental-clarity|growth-intention|signup-step|results|payment|context-connection`, the legacy `Stage1..Stage8*` components, the pre-auth questionnaire `localStorage` bridge, and legacy scoring. `generate-onboarding-insight` legacy q1–q4 scoring is unused. `complete-onboarding` stays only to set `profiles.onboarding_completed_at`. **MRS baseline no longer sourced from onboarding** (MRS builds from live data).

---

## 1. Read first

```
src/App.tsx                                   (V8 routes + guards)
src/pages/onboarding/OnboardingFlow.tsx       (shell; legacy gating now dead)
src/components/OnboardingGuard.tsx / OnboardingBlockGuard.tsx
src/utils/onboardingStatus.ts                 (resume authority)
src/utils/onboardingV8.ts                     (saveV8 / markV8Complete / synthesizeCosProfile)
src/utils/onboardingV8Validation.ts            (client mirror)
src/pages/onboarding/stages/v8/StageDone.tsx   (fires synthesis, navigates away — does NOT show profile)
supabase/functions/onboarding-v8-save/index.ts
supabase/functions/_shared/onboardingV8Validation.ts   (canonical)
supabase/functions/synthesize-cos-profile/index.ts     (Firecrawl + Gemini)
supabase/functions/linkedin-profile-scrape/index.ts
supabase/functions/complete-onboarding/index.ts        (completion flag only)
```

---

## 2. Wiring shape (V8)

```text
app-intro → leadership-context → cognitive-load → protect-goals
  → brief-prefs → permissions → connect → done
  → onboarding-v8-save (partial saves + MARK_COMPLETE)   → onboarding_v8_responses + profiles.onboarding_completed_at
  → synthesize-cos-profile (Firecrawl + Gemini)          → cos_profile(_html) on same row
  → StageDone navigates → /executive-home  (profile NOT shown to user)
  → [TARGET] downstream reads (Brief/Plan/Nudges/Insights) + send-cos-profile-email
```

---

## 3. CoS Leader Profile pipeline wiring

```
STEP 1 → Collect V8 inputs (onboarding-v8-save)   [CURRENT]
  onboarding_v8_responses: linkedin_url, writing_urls[≤2], freetext_context,
  stakes_chips, load_chips, burden_chips, goals[≤3], brief_timing, reset_modality,
  weekend_signals, calendar_selections, wearable_selections, leadership_context, step_status

  ⚑ PREFERENCE DEFAULT: when a preference is "let the system decide" (unset), persist it
     as unset/null — downstream MUST treat that as "run dynamic behaviour", NOT as a forced
     value. Only an explicit choice (e.g. brief_timing=morning|evening) overrides the engine.

STEP 2 → synthesize-cos-profile   [CURRENT]
  ENV: FIRECRAWL_API_KEY, LOVABLE_API_KEY
  Firecrawl v2 /scrape (LinkedIn + ≤2 writing URLs) → linkedin_scrape / writing_scrapes (persist even partial)
  Gemini 2.5 Pro, tool_choice=emit_cos_profile (forced); DISC/Enneagram=PRIMARY; never fabricate → what_is_missing
  Persist on onboarding_v8_responses: cos_profile (jsonb), cos_profile_html,
    cos_profile_status(in_progress|ready|failed), cos_profile_error, cos_profile_generated_at
  Idempotent (cached if ready & !force). Best-effort — never blocks completion.

STEP 3 → Store only (NOT shown)   [CURRENT]
  StageDone.tsx fires synthesizeCosProfile() then navigate('/executive-home').
  cos_profile_html is stored on onboarding_v8_responses.cos_profile_html and rendered to NO ONE.
  It is a downstream/CRM asset, not a UI screen.

STEP 4 → Consume downstream via ONE centralised read   [TARGET — not wired today]
  Build ONE resolver: loadLeaderProfile(userId) → LeaderProfileContext
    { voice{cos_brief_rules,brief_voice_note}, goals{declared,cos_accountability_note},
      priors{high_stakes_map,cognitive_load_map},
      preferences{brief_timing,reset_modality,weekend_signals,calendar_selections,wearable_selections},
      analysis{archetype,leadership_style,cognitive_risk_profile,communication_profile,...},
      meta{confidence,what_is_missing,status} }
  Source: onboarding_v8_responses.cos_profile → mirror to profiles.cos_profile / user_cos_profile
          (stable, edge-readable). Card orchestrator loads it ONCE alongside WindowContextInput
          and hands the SAME object to every surface (parallel to the WindowContextInput pattern).
  Each surface uses its slice of the ONE object (no per-surface re-read):
    MRS    ← priors
    Brief  ← voice + goals + priors + preferences.brief_timing        (phrase + body)
    Plan   ← voice + goals(→goal-alignment) + priors + preferences.reset_modality/weekend_signals
    Nudges ← voice + goals + priors + preferences (notification timing/reset/weekend)
    Insights ← goals + priors.high_stakes_map + analysis (recovery-time + burnout-risk)
  Naming: brief_personalisation is legacy — its contents are cross-surface preferences.
  Unset "system decides" preference ⇒ null ⇒ surfaces run dynamic behaviour (never forced).
  (Exec SSOT §19 + persona-unification; Nudges §8/§18; Exec Insights burnout/recovery.)

STEP 5 → Email follow-up + CRM store   [TARGET — no email infra exists]
  send-cos-profile-email: day-after follow-up; gate on cos_profile_status='ready';
  render cos_profile_html (or template from cos_profile); keep what_is_missing visible.
  CRM/email blaster reads from onboarding_v8_responses.cos_profile(_html) (or the mirrored store).
```

---

## 4. Plan relationship enrichment via the leader's LinkedIn   [TARGET, cross-feature]

```
When Plan Event Prioritisation resolves an UNTAGGED attendee's relationship:
  use the leader's own scraped LinkedIn (onboarding_v8_responses.linkedin_scrape:
  company, role, sector, positioning) + attendee LinkedIn (if scrapable) to infer a
  connection BEFORE falling back to the domain heuristic alone.
  Honest scope: Firecrawl scrapes the PROFILE page, not the private connections graph —
  "connected" is inferred from shared company/sector/role, not a literal connection list.
See the Exec card SSOT/Wiring "Standalone" callout for the exact insertion point in §6.5.
```

---

## 5. Persistence / guards / resume **[CURRENT]**

```
V8:      saveV8 (partial) → markV8Complete → synthesizeCosProfile (best-effort)
         keep _shared/onboardingV8Validation.ts and src mirror in sync
Complete: onboarding-v8-save MARK_COMPLETE → onboarding_v8_responses.completed_at + profiles.onboarding_completed_at (idempotent, only if NULL)
Guards:  OnboardingGuard (product routes; fail-open on unknown; incomplete → resume)
         OnboardingBlockGuard (completed → /executive-home)
Resume:  onboardingStatus.ts (DB-first then local) — one authority
```

---

## 6. Do not duplicate / red flags

**Do not duplicate:** V8 chip/enum validation; completion writes; Auth0 verification; the CoS persona (derive once from `cos_profile`, import everywhere); the Firecrawl scrape (reuse `synthesize-cos-profile` / `linkedin-profile-scrape` — confirm they aren't redundant).

**Red flags:** any legacy onboarding route still routed/referenced; MRS reading a baseline from onboarding; treating an unset "system decides" preference as a forced value; CoS synthesis blocking completion; fabricated profile fields (must use `what_is_missing`); a second CoS persona outside the shared source; the CoS profile left unread by every engine; migrating onboarding ids to UUID.
