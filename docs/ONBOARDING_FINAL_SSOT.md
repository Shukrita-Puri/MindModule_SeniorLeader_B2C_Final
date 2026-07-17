# Onboarding — MASTER SSOT (V8-only, code-verified)

**Version:** v2.0 — legacy removed; V8 = onboarding + Leader Profile build
**Date:** 2026-06-30
**Supersedes:** all earlier onboarding docs. **Legacy questionnaire onboarding is deleted** and must not be built, referenced, or routed to. V8 is the single onboarding path and the source of the Chief-of-Staff (CoS) Leader Profile. Sections marked **[CURRENT]** (shipped) or **[TARGET]** (build this refresh).

**Primary route:** `/onboarding/*` (V8 stages only) · **Shell:** `OnboardingFlow.tsx` · **Guards:** `OnboardingGuard.tsx`, `OnboardingBlockGuard`.
**Edge functions:** `onboarding-v8-save`, `synthesize-cos-profile`, `linkedin-profile-scrape`, `onboarding-progress`, `complete-onboarding` (completion flag only), `reset-onboarding`, `sync-profile`, `update-profile`.
**Table of record:** `onboarding_v8_responses` (all V8 content + CoS profile). Also `profiles` (completion flag, preferences), `user_integrations` (connections).

---

## 0. Legacy removal (do this first)

**All legacy questionnaire onboarding is removed.** Delete/retire the legacy routes and stages — they do nothing and are not referenced:
`/onboarding/identity`, `/emotional-awareness`, `/stress-response`, `/recovery-patterns`, `/mental-clarity`, `/growth-intention`, `/signup-step`, `/results`, `/payment`, `/context-connection`, and the legacy `Stage1..Stage8` components, the pre-auth questionnaire `localStorage` bridge, and the legacy scoring path. Consequences:
- **`generate-onboarding-insight` legacy scoring** (q1–q4 → baseline/archetype) is legacy — not used by V8.
- **MRS baseline no longer comes from onboarding** (see §5). It was a legacy artifact; MRS now builds its baseline from live wearable and/or calendar demand signals. Pattern data may frame downstream context, but it cannot form or contribute to MRS.
- `complete-onboarding` is retained **only** to set the durable completion flag `profiles.onboarding_completed_at` (idempotent — only if NULL). It no longer needs to persist legacy baseline/component/archetype fields.

---

## 1. What onboarding is now

V8 onboarding has one job: **build the CoS Leader Profile so the Chief of Staff knows the leader from the very first session** — their preferences, goals, leadership style, communication style, high-stakes map, and cognitive-load/risk profile — and persist it so **Brief, Plan, Nudges, and Insights** can all read it. It also captures connections (calendar/wearable) and the durable completion flag. It is a persistence + personalisation system; completion is durable in the DB.

---

## 2. V8 flow **[CURRENT]**

Routes: `/onboarding/app-intro` → `leadership-context` → `cognitive-load` → `protect-goals` → `brief-prefs` → `permissions` → `connect` → `done`. Full-bleed screens. Client `onboardingV8.ts` (`saveV8`, `markV8Complete`, `synthesizeCosProfile`, `makeDebouncedSaver`) → edge `onboarding-v8-save` (`GET` / `UPSERT` / `MARK_COMPLETE`; sanitation; step + completion validation; `step_status` merge). Canonical validation `_shared/onboardingV8Validation.ts` + client mirror `src/utils/onboardingV8Validation.ts` (keep in sync). Completion requires: ≥1 protected goal, weekend signal, ≥1 calendar selection, ≥1 wearable selection; leadership context optional. Brief timing and reset modality may be explicit overrides or unset/null for system-decides.

---

## 3. Preferences are OPTIONAL overrides (not hard settings)

Every preference collected in `brief-prefs`/`connect` is an **override of the system's default dynamic behaviour**, not a replacement for it:
- If the user picks **"let the system decide"** (or the equivalent default), the app runs its **full, current, dynamic behaviour** — e.g. Brief timing is chosen by the window/context engine, reset modality by the Plan, weekend behaviour by the day-kind logic.
- Only when the user **explicitly selects a value** (e.g. brief timing = Morning, or = Evening) does that value **override** the dynamic default for that one preference.
- This applies to every preference (`brief_timing`, `reset_modality`, `weekend_signals`, etc.): default = system-decides; explicit = override. Downstream surfaces must treat an unset/"system decides" value as "use dynamic behaviour," never as an empty/forced value.

---

## 4. The CoS Leader Profile pipeline (the centrepiece)

Owner: `synthesize-cos-profile/index.ts`. Client trigger: `onboardingV8.ts → synthesizeCosProfile`. Fired from `StageDone.tsx`.

### 4.1 Pipeline **[CURRENT]**
1. **Inputs** from `onboarding_v8_responses`: `linkedin_url`, `writing_urls[]` (≤2), `freetext_context`, `stakes_chips`, `load_chips`, `burden_chips`, `goals` (≤3), `brief_timing`, `reset_modality`, `weekend_signals`, `calendar_selections`, `wearable_selections`, `leadership_context`.
2. **Firecrawl v2 scrape** (`FIRECRAWL_API_KEY`): LinkedIn URL + up to 2 writing/interview URLs → markdown; persisted as `linkedin_scrape` + `writing_scrapes` (even on partial). Missing key → skip, list gaps.
3. **LLM synthesis** via Lovable AI Gateway (`LOVABLE_API_KEY`), model **`google/gemini-2.5-pro`**, tool-forced `emit_cos_profile`. Rules: discreet CoS voice; DISC/Enneagram/archetype in freetext = PRIMARY SOURCE; LinkedIn → role/sector/trajectory/board; writing → cognitive style + how to speak; **never fabricate** → `what_is_missing[]`.
4. **Persist + idempotent** (cached if `ready` & not `force`).
5. **Best-effort** — onboarding completion must NOT block on CoS status.

### 4.2 Profile schema (`emit_cos_profile`) **[CURRENT]**
`identity` · `leadership_style` {primary_style, style_tags, style_description, source_note} · `communication_profile` {how_they_think, how_they_communicate, what_lands, what_wont_land, **cos_brief_rules**} · `existing_self_knowledge` {disc/archetype/frameworks, alignment_note} · `cognitive_risk_profile` {primary_risk, risk_flags[{flag, severity, description, trigger_conditions}], regulation_strengths} · `external_persona` · `high_stakes_map` {declared_events, inferred_events, event_frequency_estimate} · `cognitive_load_map` {declared_loads, inferred_loads, operating_burdens, primary_depletion_pattern} · `goals` {declared, **cos_accountability_note**} · `brief_personalisation` {timing, reset_modality, weekend_signals, **brief_voice_note**} · `provisional_archetype` · `what_is_missing[]` · per-section `confidence` · **`display_html`**.

### 4.3 Where it is stored (DB) **[CURRENT]**
All on **`onboarding_v8_responses`** (keyed by Auth0 `user_id`):
- structured profile → **`cos_profile`** (jsonb)
- rendered HTML → **`cos_profile_html`**
- status → **`cos_profile_status`** (`in_progress|ready|failed`), **`cos_profile_error`**, **`cos_profile_generated_at`**
- scrapes → **`linkedin_scrape`**, **`writing_scrapes`**
- raw V8 inputs → `linkedin_url`, `writing_urls`, `freetext_context`, `stakes_chips`, `load_chips`, `burden_chips`, `goals`, `brief_timing`, `reset_modality`, `weekend_signals`, `calendar_selections`, `wearable_selections`, `leadership_context`, `step_status`, `completed_at`.

### 4.4 Is it shown to the user? **[CURRENT] — NO.**
Code-verified: `StageDone.tsx` calls `synthesizeCosProfile()` fire-and-forget and then navigates to `/executive-home`. **It does not render `cos_profile_html`; the profile is surfaced to no one in the UI today** (`dangerouslySetInnerHTML`/`cos_profile_html` appear in no user-facing component). The profile is generated and stored purely as a downstream/CRM asset.

### 4.5 Email follow-up + storage-for-CRM **[TARGET — no email infra exists]**
Because the profile is stored but not shown, it is ready to be picked up by a follow-up channel. **[TARGET]** add `send-cos-profile-email`: the day after onboarding, send the leader a follow-up email built from `cos_profile_html` (or a templated email from `cos_profile`), gated on `cos_profile_status='ready'`, with `what_is_missing` visible so the leader can close gaps (a learning loop that enriches the profile). For a separate email blaster / CRM, the **single place to read from is `onboarding_v8_responses.cos_profile` + `cos_profile_html`**; **[TARGET]** consider mirroring to a stable `profiles.cos_profile` / `user_cos_profile` store so CRM/email and the edge engines can read it cheaply without loading the whole onboarding row.

---

## 5. Downstream data contract — ONE centralised read (`LeaderProfileContext`)

**The onboarding profile is read ONCE per cycle into a single `LeaderProfileContext`, then passed to every surface** — exactly the pattern the cards already use for `WindowContextInput` (built once from pre-fetched data, passed to MRS + Brief + Plan). There is **no per-surface read of different fields**: every surface receives the *whole* resolved profile and uses the parts relevant to it. This avoids drift, avoids re-fetching, and means a field like `goals.declared` (needed by Brief *and* Plan *and* Nudges) or `brief_timing` (needed everywhere) is resolved in one place.

> **Naming note:** the DB field `brief_personalisation` is a legacy name — its contents (`brief_timing`, `reset_modality`, `weekend_signals`) are **cross-surface preferences**, not Brief-only. In `LeaderProfileContext` treat them as `preferences`, read by Brief, Plan, and Nudges alike. **MRS baseline is NOT part of this** — MRS builds its baseline from live data; onboarding contributes only priors.

**The single read (build once):**
```
loadLeaderProfile(userId) → LeaderProfileContext {          // [TARGET] one loader, one shape
  voice:        { cos_brief_rules, brief_voice_note }        // → the shared CHIEF_OF_STAFF_PERSONA
  goals:        { declared[], cos_accountability_note }
  priors:       { high_stakes_map, cognitive_load_map }
  preferences:  { brief_timing, reset_modality, weekend_signals,   // legacy: brief_personalisation
                  calendar_selections, wearable_selections }
  analysis:     { provisional_archetype, leadership_style, cognitive_risk_profile,
                  communication_profile, existing_self_knowledge, external_persona }
  meta:         { confidence_overall, what_is_missing[], cos_profile_status }
}
```
Source: `onboarding_v8_responses.cos_profile` (**[TARGET]** mirror to a stable `profiles.cos_profile` / `user_cos_profile` so edge functions read it cheaply — the card orchestrator loads it alongside `WindowContextInput` and hands the same object to all surfaces).

**Which surface uses which part (all from the ONE read):**

| Surface | Uses (from the single `LeaderProfileContext`) |
|---|---|
| **MRS** | `priors` (high_stakes_map, cognitive_load_map) — day-one priors only; **no baseline** |
| **Brief** (phrase + body) | `voice` + `goals` + `priors` + `preferences.brief_timing` |
| **Plan** (why-this-matters) | `voice` + `goals` (→ `goal-alignment`) + `priors` + `preferences.reset_modality/weekend_signals` |
| **Nudges** | `voice` + `goals` + `priors` + `preferences` (notification timing/reset/weekend) |
| **Insights** | `goals` + `priors.high_stakes_map` + **`analysis`** (archetype/leadership_style/cognitive_risk_profile) — §5.1 |

**Preferences are optional overrides (§3):** any preference left "system decides" is read as *run dynamic behaviour*, never a forced value — the loader returns null for unset preferences and each surface treats null as dynamic.

**Parity rule:** compute the profile once (onboarding) → resolve once per cycle (`loadLeaderProfile`) → every surface reads the same object. Do not let any surface re-read or re-interpret onboarding fields on its own.

### 5.1 Insights uses more of the total profile (recovery time + burnout risk)
- **Drain map:** `goals` + `priors.high_stakes_map` anchor the "what drains the leader" analysis — the leader's declared high-stakes event types mapped to wearable response (HR/HRV/sleep), so Insights reports performance in exactly the events the leader said matter.
- **Recovery time + burnout risk from `analysis`:** feed `cognitive_risk_profile` (primary_risk, risk_flags, regulation_strengths), `leadership_style`, and `provisional_archetype` into the recovery/burnout model. A leader whose archetype/style/cognitive-risk indicates they **take on more pressure/stress than required** is modelled as **recovering slower / higher burnout risk** as a prior, then live wearable/pattern data confirms or corrects it. Do more with the whole profile here, not just goals.

---

## 6. Plan relationship enrichment via LinkedIn (cross-feature) **[TARGET]**

When the **Plan's Event Prioritisation** resolves an attendee's **relationship** and the user has **not tagged** that attendee, enrich the inference from LinkedIn before the domain-only fallback. Two-fold aim, both within honest scope:
1. **Leader-anchored:** use the leader's own scraped LinkedIn (`linkedin_scrape`: company, role, sector, positioning) to place the attendee *relative to the leader* — same company ⇒ internal peer/report; same board/investor sector ⇒ board_member/investor; different org ⇒ external_partner with seniority from the attendee's own profile.
2. **Attendee-anchored (independent):** if the leader is not "connected," resolve the attendee's own LinkedIn **profile** by name/email (via the same Firecrawl path, `linkedin-profile-scrape`) and infer role/company/seniority directly from it.

**Honest scope (do not complicate beyond this):** Firecrawl scrapes a **public profile page**, not the private connections graph. "Connection" is therefore inferred from **shared company/sector/role signals**, not a literal connection list — this is the best-in-class, allowed approach and the design intentionally stops here. Output is an `AttendeeRoleSignal` (`source:'llm'` or a new `'linkedin_graph'`) flowing through the existing `confidenceMultiplier`, so a user tag still overrides it and `unknown` still costs nothing. Documented as a standalone callout in the Exec card SSOT §6.5 / Wiring Step 5 so it drops straight into the cards.

---

## 7. Progress · resume · guards **[CURRENT]**

- **Progress** (`onboarding-progress`, `useOnboardingProgress`): durable step markers; fire-and-forget, dedupes in-flight writes. (Legacy step columns are unused now.)
- **Resume** (`onboardingStatus.ts`): DB-first then local; complete → `/executive-home`; incomplete → next V8 stage. One authority; do not recreate in stages.
- **Guards:** `OnboardingGuard` (product routes; fast path from `onboarding_completed_at`; slow DB reconcile; **fail-open on unknown**; incomplete → resume). `OnboardingBlockGuard` (completed users blocked from onboarding except whitelist/upgrade).

---

## 8. Database & auth contract **[CURRENT]**

Table of record **`onboarding_v8_responses`** (columns in §4.3). Also `profiles` (`onboarding_completed_at`, preference fields), `user_integrations` (connections). Auth0 `sub` **text** ids; RLS via `auth.jwt()->>'sub'`; edge functions use service role after authenticating the caller. Do not migrate to UUID.

---

## 9. Gap audit — expected / built / wired / missing / legacy / cleanup

| Area | Expected | Built? | Wired? | Status |
|---|---|---|---|---|
| **Legacy onboarding removed** | delete routes/stages/scoring | — | — | **[TARGET] delete entirely (§0)** |
| V8 flow + validation | full flow | ✅ | ✅ | keep mirrors in sync |
| CoS profile synthesis (Firecrawl + Gemini) | rich schema + html | ✅ | ✅ (generated + stored) | — |
| CoS profile stored | `onboarding_v8_responses.cos_profile*` | ✅ | ✅ | — |
| CoS profile shown to user | UI render | ❌ | ❌ | **not shown (§4.4)** — intentional for now |
| **CoS profile → downstream** | Brief/Plan/Nudge/Insights read it | ✅ generated | ❌ not read | **[TARGET] §5** |
| **MRS baseline from onboarding** | REMOVE | (was legacy) | — | **[TARGET] remove; MRS builds from live data** |
| Preferences as optional overrides | system-decides default | partial | partial | **[TARGET] enforce "unset = dynamic" downstream (§3)** |
| Email follow-up / CRM store | send `cos_profile_html` | ❌ | ❌ | **[TARGET] §4.5** |
| Plan relationship via leader LinkedIn | untagged-attendee enrichment | ❌ | ❌ | **[TARGET] §6 + Exec standalone** |
| Insights: recovery/burnout from CoS | use archetype/risk/style | ❌ | ❌ | **[TARGET] §5.1** |
| Guards fail-open / Auth0 text ids | — | ✅ | ✅ | — |

---

## 10. Connection to Executive cards, Nudges & Insights (onboarding is the seed)

Onboarding computes the profile **once**; every surface reads it. Do not re-derive persona/goals/priors per surface.

1. **CoS persona unification:** `communication_profile.cos_brief_rules` + `brief_personalisation.brief_voice_note` define the one `CHIEF_OF_STAFF_PERSONA` imported by **Brief (phrase AND body)**, **Plan (`why-llm`)**, and **Nudges** (Exec SSOT persona-unification + Nudges §18).
2. **Goals → Brief, Plan, and Nudges:** `goals.declared` feeds the Plan's `jit/goal-alignment.ts` (strategic axis), the **Brief** (goal references in phrase/body), and **Nudges** (strategic-framing copy).
3. **Priors → MRS, Brief, Plan, and Nudges:** `high_stakes_map` + `cognitive_load_map` are day-one priors; Nudges read them via the shared unification.
4. **Preferences → Brief, Plan, and Nudges:** `brief_timing`, `reset_modality`, `weekend_signals`, `calendar_selections`, `wearable_selections` drive Brief timing, Plan modality/weekend behaviour, connections — **and the notification-relevant preferences are read by Nudges** (timing/reset/weekend shape when and how a nudge fires). Treat "system decides" as dynamic (§3).
5. **Insights → Goals + High-stakes map + recovery/burnout from the profile:** drain map (events↔wearable) + recovery-time/burnout-risk tuned by archetype/leadership_style/cognitive_risk_profile (§5.1). Month-over-month framing anchors on archetype (not an onboarding baseline).

---

## 11. Invariants

1. **No legacy onboarding.** V8 is the only path; legacy routes/scoring/baseline are deleted.
2. Completion is durable (`profiles.onboarding_completed_at`), idempotent, never blocked by CoS synthesis/scrape failure.
3. The CoS profile never fabricates — gaps → `what_is_missing`; DISC/Enneagram/archetype = primary source.
4. Preferences are optional overrides — "system decides" means run dynamic behaviour, not a forced/empty value.
5. **MRS baseline is not sourced from onboarding.**
6. The CoS profile is stored on `onboarding_v8_responses.cos_profile(_html)` and is the single seed read by Brief, Plan, Nudges, Insights — computed once, read everywhere.
7. Auth0 text ids; RLS via `auth.jwt()->>'sub'`.
