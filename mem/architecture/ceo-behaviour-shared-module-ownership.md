---
name: CEO behaviour shared-module ownership
description: _shared/ceo-behaviour-rules.ts, behaviour-evaluator.ts, brief-signal-coverage.ts, copy-vocabulary.ts, brief-validators.ts, brief-context.ts are engineering-owned. Trigger logic and thresholds change via code review, not chat sessions.
type: constraint
---
The following files are the single source of truth for CEO Self-Regulation logic (§2.11–§2.17), the §3 Signal Coverage Matrix, the Elastic Lexicon (§2.20), and brief validators (§5):

- `supabase/functions/_shared/brief-context.ts` — typed API contract (BriefContext, BehaviourFlag, SignalMatrix, SlotBoost, RuleContext)
- `supabase/functions/_shared/ceo-behaviour-rules.ts` — one pure function per §2.11–§2.17 rule
- `supabase/functions/_shared/behaviour-evaluator.ts` — orchestrator (`evaluate(ctx)`, `deriveSlotBoosts`, `flagForAnchor`)
- `supabase/functions/_shared/brief-signal-coverage.ts` — §3 matrix builder
- `supabase/functions/_shared/copy-vocabulary.ts` — Elastic Lexicon, forbidden words, pattern triggers, V8 CTA verbs
- `supabase/functions/_shared/brief-validators.ts` — §5.1 / §5.2 validators
- `supabase/functions/_shared/event-protocol-taxonomy.ts` — §2 protocol combos + §3 event matrix + `classifyEvent` / `protocolsForEvent` / `PRACTICE_TYPE_TO_COMBO`

**Rule:** Trigger logic, severity thresholds, lexicon clusters, and forbidden-word lists in these files do NOT change in a chat-driven session without an explicit human request. They have ownership banners at the top of each file. Add new rules / lexicon entries via a normal code-review PR, not by asking the chat agent to "tune" them.

**Why:** Three surfaces (brief, smart-nudges, generate-mastery-plan) consume these modules. A chat-driven tweak to a threshold silently changes copy across all three surfaces in ways the user does not see in the diff preview. For a C-suite product whose value prop is "we see you whole", that silent drift destroys trust faster than a visible bug.

**How to apply:** When the user asks for a copy or trigger change that touches §2.11–§2.17 / §2.20 / §5: confirm the change in chat, then edit the file with the change explicitly named in the response. Never refactor or "clean up" these files as a side-effect of unrelated work.

## Two-file taxonomy split

- `executive-state-taxonomy.ts` owns **pillar / stakes / keyword** vocabulary. Cadence: product / copy decisions.
- `event-protocol-taxonomy.ts` owns **§2 combos + §3 event matrix + classifyEvent**. Cadence: coaching / clinical decisions.
- Different change pressure → different files. Consumers never import from either taxonomy file directly for behaviour decisions; they call `behaviour-evaluator.evaluate(ctx, { scope })`.

## `PRACTICE_TYPE_TO_COMBO` is the single source of truth

The legacy `SlotBoost.practiceType` → `(protocol, mode)` mapping lives **only** in `event-protocol-taxonomy.ts`. In Phase 2, `generate-mastery-plan` must import this constant and stop using string literals. Do not duplicate the mapping in plan-side code. If a second copy appears in review, reject the PR.

## Phase 2 classification-path audit (write down now, execute later)

Before wiring `compute-outer-readiness`, `smart-nudges`, and `generate-mastery-plan` to `event-protocol-taxonomy`, grep consumer edge functions for direct imports of `executive-state-taxonomy.ts`. Any consumer using stakes / keyword lookups to make event-classification decisions that `classifyEvent()` now handles must migrate to the new function. Do not leave two classification paths running in parallel — that's how silent drift starts.

## Scoped rules

Every entry in `ALL_RULES` declares `scopes: RuleScope[]` (`"brief"` | `"nudge"` | `"plan"`). Consumers call `evaluate(ctx, { scope })` and get back only the rules tagged for their surface. Add new behaviours by tagging existing files, not by creating new rule files per surface (`notificationIsProduct` is nudge-only by tag, not by location).

## Stub-rule pattern

`personalFrictionInference` and `conferenceDepletion` return `null` today. They reserve the `BehaviourFlag` API surface so Phase 2 wiring is reviewed once. When the underlying data lands (≥3 weeks per-user history; `conference_day_number` field), only `brief-signal-coverage.ts` changes to populate the field — the rules, flag shapes, and downstream consumers remain identical.