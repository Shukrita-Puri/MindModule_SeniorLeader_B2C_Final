

## Audit: Sections 5.3–10 — Gaps Found

### What Already Exists (No Changes Needed)

| Section | Status |
|---------|--------|
| 5.3 Memory Retrieval — Fallback (keyword/theme) | **Implemented** — `buildServerContext` queries `coach_memory_index` by `importance_score` + `key_themes`. GIN index exists on `key_themes`. |
| 5.4 Memory Importance Scoring — Default levels | **Implemented** — `extract-session-memories` assigns correct defaults (breakthrough=10, commitment=8, summary=6, practice=5) |
| 5.5 Context Injection — `buildSystemPrompt` | **Implemented** — `self-mastery-coach` assembles BASE + flow + context + pattern prompts (~2,300 lines) |
| 6.1 JIT → Coach data flow | **Implemented** — `generate-jit-events` queries all 4 coach tables (scenarios, tools, messages, insights) |
| 6.2 Coach Boost Scoring | **Implemented** — Full 4-signal cascade (+20/+15/+12/+8) with non-stacking logic |
| 6.3 Context Statement Generation | **Implemented** — `generateContextStatement()` with 5 concern types + scenario/tool/goal fallbacks |
| 6.4 Coach Card Display | **Implemented** — `generate-jit-carousel` builds coach card with position logic |
| 6.5 Scenario → Event Type Mapping | **Partial** — 12 scenarios implemented, spec has 24 (see gap below) |
| 7.1–7.8 Upstream Input Sources | **Implemented** — All data flows wired in `buildServerContext` |
| 8.1–8.6 Downstream Consumers | **Implemented** — Brief reads insights, JIT reads scenarios/tools |
| 9.1–9.5 Post-Session Pipeline | **Implemented** — 8 fire-and-forget calls with summary→memories chaining |

### Gaps Found (7 issues)

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | **`SCENARIO_EVENT_MAPPING` incomplete** | HIGH | `detect-coach-scenarios` has 12 scenarios. Spec requires 24 — missing: `decision_making`, `time_management`, `goal_setting`, `boundary_management`, `owning_rest`, `self_forgiveness`, `identity_transition`, `reinvention`, `purpose_meaning`, `legacy_thinking`, `career_planning`, plus `strategic_planning` added to `stakeholder_management`. Also existing entries have fewer event types than spec. |
| 2 | **`generate-jit-events` queries wrong columns on `coach_tools_offered`** | HIGH | Queries `was_used` and `expires_at` (lines 159-160) but those are the OLD schema columns. The spec uses `status = 'pending'` and `check_in_at`. The `was_used`/`expires_at` columns still exist in DB but `extract-tool-commitments` writes to `status`/`check_in_at` instead. |
| 3 | **`update-commitment-status` never called from client** | MEDIUM | EF exists but no client code invokes it. Spec says coach should call it after checking on a commitment. |
| 4 | **No auto-resolve mechanism for scenarios** | MEDIUM | `coach_scenarios_detected` has `resolved_at` and `resolved_reason` columns, but no code ever sets `resolved = true`. Scenarios stay active indefinitely, inflating JIT boost scores. |
| 5 | **Memory retrieval has no relevance scoring / recency decay** | LOW | `buildServerContext` fetches memories sorted by `importance_score` only. Spec calls for `(similarity × importance × recencyDecay)` ranking. No `adjustImportanceScore` dynamic adjustment. |
| 6 | **Post-session pipeline is all fire-and-forget (no Phase 1 → Phase 2 separation)** | LOW | Spec requires Phase 1 (parallel) to complete before Phase 2 (summary → memories). Current code fires summary in parallel with everything else, so memories may run before Phase 1 completes. Summary→memories chaining works, but summary doesn't wait for Phase 1. Acceptable but differs from spec. |
| 7 | **AI model strings use Gemini, spec wants Claude** | INFO | All EFs use `google/gemini-2.5-flash` or `google/gemini-3-flash-preview`. Spec targets `anthropic/claude-opus-4.5` / `anthropic/claude-sonnet-4.5` / `anthropic/claude-haiku-4.5`. These models are **not available** on the Lovable AI Gateway — only Google and OpenAI models are supported. Current Gemini usage is correct. |

---

### Implementation Plan

#### 1. Expand `SCENARIO_EVENT_MAPPING` in `detect-coach-scenarios`

Add the 12 missing scenario keys with their full event type arrays from the spec. Update existing entries to include additional event types (e.g., `stakeholder_management` adds `strategic_planning`, `emotional_regulation` adds `investor_call`, `termination`).

#### 2. Fix `generate-jit-events` tool query

Change lines 157-161 from querying `was_used = false` + `expires_at` to querying `status = 'pending'` + `scenario` field. This aligns with what `extract-tool-commitments` actually writes.

#### 3. Add auto-resolve for stale scenarios

Add a check in `generate-jit-events` (or a separate scheduled function) that marks scenarios older than 30 days as resolved. Simplest approach: add a filter in the existing scenario query to exclude scenarios older than 30 days (already done with `gte('detected_at', sevenDaysAgo)` — but that's only 7 days, which is too aggressive). Change to 30 days per spec.

#### 4. Improve memory retrieval with recency decay

In `buildServerContext`, after fetching memories, apply the spec's relevance scoring: `(importance_score / 10) × recencyDecay` where recency decays linearly over 30 days. Re-sort and take top 5. This is a lightweight code change in the memory processing section.

#### 5. No model migration needed

Claude models (`anthropic/claude-opus-4.5`, etc.) are **not available** on the Lovable AI Gateway. The current Gemini models are the correct choice. No action needed.

---

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/detect-coach-scenarios/index.ts` | Expand `SCENARIO_EVENT_MAPPING` from 12 → 24 scenarios with full event type arrays |
| `supabase/functions/generate-jit-events/index.ts` | Fix tool query (`status`/`scenario` instead of `was_used`/`expires_at`), extend scenario window to 30 days |
| `supabase/functions/self-mastery-coach/index.ts` | Add recency decay scoring to memory retrieval in `buildServerContext` |

