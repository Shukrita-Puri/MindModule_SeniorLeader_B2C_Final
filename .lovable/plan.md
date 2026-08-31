# LLM Cost & Model Routing Architecture — Audit and Recommendation

Recommendation only. Nothing is implemented until you approve a follow-up build. Scope limited to features that are **live and produce frontend output**.

## 1. Live vs dormant — what actually spends money

Determined by tracing every `functions.invoke` / `fetch` call site in `src/`, every server-to-server invoke, and every cron schedule.

**LIVE — has a frontend output**

| Feature | Function | Trigger | Frontend surface |
|---|---|---|---|
| Readiness Brief | `compute-outer-readiness` | 3 windows/day + manual refresh | Home Brief card |
| Mastery Plan why-lines | `generate-mastery-plan` (`_shared/plan/why-llm.ts`) | Daily + regeneration | Today's 3 Priorities |
| Attendee relationship resolver | `resolve-attendee-relationship` | Post calendar-sync batch + lazy in-Plan backstop | Plan — relationship labels on events |
| Smart Nudges copy | `smart-nudges` | Scheduled, up to 8 call sites/user/day | Push notifications |
| CoS Profile synthesis | `synthesize-cos-profile` | Onboarding + calendar-sync trigger + admin | Archetype / profile |
| Onboarding insight | `generate-onboarding-insight` | Stage 8 Results | Onboarding results report |
| Leadership patterns | `state-patterns-insights` | Insights page load | LeadershipPatternsCard |

`cause-effect-engine` is live on Insights but is fully deterministic — no LLM, no cost.

`resolve-attendee-relationship` is confirmed live and part of the Plan feature: fired in batches from `sync-calendar` via `_shared/attendeeResolverQueue.ts` and lazily from `generate-mastery-plan`. It runs `google/gemini-2.5-flash` with a 50/user/day self-imposed cap. **Keep it, freeze it, do not re-route it in this exercise** — Gemini Flash is already an appropriate tier for a per-attendee classification job, and the cached `attendee_relationships` rows plus the generic-domain and freshness filters already suppress most calls. Revisit only if telemetry shows it is a material line item.

**FROZEN — LLM code exists, no live frontend path today**

Coach/Dialogue cluster: `self-mastery-coach`, `dialogue-engine`, `dialogue-session-manage`, `generate-coach-summary`, `extract-coach-insights`, `extract-tool-commitments`, `resolve-session-commitments`, `detect-coach-scenarios`, `detect-recurring-patterns`, `analyze-probing-effectiveness`, `process-orphaned-sessions`.

`insights-semantic-analysis` joins this group. It is invoked from `Insights.tsx`, but its input sources are coach/dialogue conversation data — with Coach dormant it has nothing meaningful to analyse. Freeze it with the Coach cluster and bring it back, together with its Insights theme-map output, when Coach goes live.

Orphans with no caller at all: `generate-debrief-insights`, `generate-dashboard-insight`, `generate-energy-insight`, `infer-current-state`.

All of the above are excluded from the cost plan. Recommendation: leave the code in place, do not spend optimisation effort on it, and put the whole cluster behind one explicit feature flag before Coach goes live so nothing silently starts billing.

## 2. Architecture: classify each live call by job type

LLM spend should be governed by what the call is *doing*, not by which team wrote it. Four job classes:

- **Class A — Voice/Judgement generation.** Reads a large structured context and writes short, contract-bound, user-visible prose. Quality is the product. → Brief.
- **Class B — Constrained copy generation.** Short output, tight template, high volume, deterministic fallback already exists. → Smart Nudges, Plan why-lines.
- **Class C — Structured synthesis / extraction.** Large or messy input, structured (tool-call) output, runs rarely per user. → CoS Profile.
- **Class D — Small labelling / one-line generation.** Tiny input, tiny output, no reasoning depth required. → Onboarding insight, attendee resolver (frozen as-is), Leadership patterns observation.
- **Class E — Should not be an LLM call at all.** The output is a fixed vocabulary over structured numeric inputs. → Leadership patterns observation (see 4b).


## 3. Current routing (as built today)

| Feature | Class | Provider path | Primary model | Fallback | Output cap |
|---|---|---|---|---|---|
| Brief | A | Lovable gateway → Anthropic direct | `google/gemini-2.5-flash` | `CLAUDE_MODELS.SONNET` (**aliased to `claude-haiku-4-5`**) | 380 |
| Smart Nudges | B | Anthropic direct → gateway | `claude-haiku-4-5` | `google/gemini-3-flash-preview` | 256 |
| Plan why-lines | B | Lovable gateway | `google/gemini-3-flash-preview` | deterministic repair | small |
| CoS Profile | C | Lovable gateway | `google/gemini-2.5-pro` | `anthropic/claude-3-5-haiku` | 8192 |
| Insights semantics | C | gateway | `claude-3-5-haiku-latest` | none | — |
| Onboarding insight | D | Anthropic direct | Claude model ladder | model loop | 200 |
| Leadership patterns | D | Anthropic direct | `claude-3-5-haiku-latest` | none | — |

Three problems visible from the table alone:

1. **The Sonnet constant is a lie.** `CLAUDE_MODELS.SONNET` and `HAIKU` both resolve to `claude-haiku-4-5-20251001`. Your intent to run the Brief on Sonnet is currently not happening, and the code reads as if it is.
2. **Brief tries the cheap model first and the good model second.** On validator rejection you pay twice — a Gemini call plus a Claude call — for one brief. That is the worst possible ordering for a quality-critical surface.
3. **Model choice is scattered across 7 files** with three different call styles (raw `fetch` to Anthropic, `callClaudeText`, raw `fetch` to the gateway). There is no single place to change routing or read cost.

## 4. Recommended tiered routing

Aligned with your direction: Brief on Sonnet, Nudges and CoS on Haiku, everything else on Gemini.

| Tier | Job class | Model | Applies to | Rationale |
|---|---|---|---|---|
| T1 — Judgement | A | `claude-sonnet-4-5` (Anthropic direct) | Brief | Only surface where copy quality is the product. One call, no cheap-first attempt. |
| T2 — Constrained copy | B | `claude-haiku-4-5` | Smart Nudges | Short output, brand voice matters, Haiku is ~1/12 Sonnet cost. |
| T2 — Constrained copy | B | `google/gemini-3.1-flash-lite` | Plan why-lines | Already deterministic-repaired; cheapest viable tier. |
| T3 — Structured synthesis | C | `claude-haiku-4-5` | CoS Profile output | Tool-call reliability matters; drop from Gemini 2.5 **Pro**, the single most expensive model in the stack. |
| T3 — Structured synthesis | C | `google/gemini-3.1-flash-lite` | Insights semantics | Theme clustering does not need a frontier model. |
| T4 — Labelling | D | `google/gemini-3.1-flash-lite` | Onboarding insight, Leadership patterns | Sub-200-token outputs; frontier models are pure waste here. |

**Blocking check before any of this ships:** `CLAUDE_MODELS.SONNET` was previously set to Haiku *because* the prior Sonnet id 404'd against this workspace's Anthropic key for 14+ days. Step 1 of the build is a live `/v1/models` catalog check to get the exact Sonnet id this key can call, plus a single smoke request. If Sonnet is not available on the key, we stop and tell you rather than silently leaving Haiku behind a constant named SONNET. Same check applies to `anthropic/claude-3-5-haiku` via the Lovable gateway (used today as the CoS fallback).

## 5. Cost work beyond model choice

Moving Brief up to Sonnet *raises* per-call price, so the savings have to come from tokens and call count. Four levers, in order of value:

**L1 — Prompt caching (largest single saving, quality-neutral).** Anthropic ephemeral caching bills repeated input at ~10% of normal. The Brief system prompt (`copy-vocabulary.ts`, 42 KB source) and the Nudge system prompt are byte-stable across every user and every call, and today only one `cache_control` marker exists in the entire codebase. Mark the stable block and reorder each prompt so stable content leads and per-user content trails. This alone offsets most of the Sonnet upgrade.

**L2 — Brief input diet.** The Brief user prompt is built from 155 separate `userPrompt +=` appends across ~8 buckets, against a 380-token output cap — it is ~95% input cost. Cut buckets the validator never consumes, send compact `key: value` lines instead of prose narration, and cap Bucket 3 (patterns/history) to the top N ranked entries.

**L3 — Stop paying twice.** Brief: single Sonnet attempt, then deterministic fallback — remove the two-provider ladder. Nudges: single Haiku attempt, then the existing static copy bank — remove the Claude-then-Gemini double attempt. Nudges should also flip to static-first for the low-variance nudge types, calling the model only where phrasing genuinely varies.

**L4 — Don't regenerate unchanged output.** Skip the Brief LLM call when no input signal changed since the last snapshot for that window; skip CoS re-synthesis when the underlying profile inputs are unchanged. Also cut `synthesize-cos-profile`'s 8192 `max_tokens` to its real output size.

## 6. Governance — one routing table

Introduce a single `_shared/ai/model-routing.ts` that exports a tier→model map and is the only place a model id appears. Every live function reads from it. Add token telemetry inside the two shared helpers (`_shared/anthropic.ts` already parses `usage` and discards it; same for the gateway helper) so you get cost per feature per day and cost per user per day without touching feature code. After that, every future routing change is one file and one deploy.

## 7. Suggested sequencing

1. Telemetry + routing table (no behaviour change) — proves the $1.67 breakdown.
2. Sonnet id verification, then Brief → T1 with L1 caching and L3 single-attempt, in one change.
3. Nudges → T2 Haiku, static-first, single attempt.
4. CoS Profile → T3 Haiku, token cap, change-gating.
5. T4 sweep for onboarding/patterns/semantics.
6. Feature-flag freeze on the whole dormant Coach/Dialogue cluster.

Each step is separately deployable; Brief changes deploy only `compute-outer-readiness`. No user-visible copy contract, validator, prompt version, or deterministic fallback path changes anywhere in this plan.
