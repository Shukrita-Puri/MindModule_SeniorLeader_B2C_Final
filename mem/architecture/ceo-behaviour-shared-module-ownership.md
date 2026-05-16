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

**Rule:** Trigger logic, severity thresholds, lexicon clusters, and forbidden-word lists in these files do NOT change in a chat-driven session without an explicit human request. They have ownership banners at the top of each file. Add new rules / lexicon entries via a normal code-review PR, not by asking the chat agent to "tune" them.

**Why:** Three surfaces (brief, smart-nudges, generate-mastery-plan) consume these modules. A chat-driven tweak to a threshold silently changes copy across all three surfaces in ways the user does not see in the diff preview. For a C-suite product whose value prop is "we see you whole", that silent drift destroys trust faster than a visible bug.

**How to apply:** When the user asks for a copy or trigger change that touches §2.11–§2.17 / §2.20 / §5: confirm the change in chat, then edit the file with the change explicitly named in the response. Never refactor or "clean up" these files as a side-effect of unrelated work.