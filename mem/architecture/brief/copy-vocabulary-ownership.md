---
name: brief-copy-vocabulary-ownership
description: Persona, voice banks, hard constraints, priority order, silent reasoning, and JSON output schema for the Brief LLM live exclusively in `_shared/brief/copy-vocabulary.ts`. Never duplicate in edge functions.
type: architecture
---

# Brief LLM voice + system-prompt ownership

- Single source of truth: `supabase/functions/_shared/brief/copy-vocabulary.ts`.
- Consumer: `supabase/functions/compute-outer-readiness/index.ts` calls
  `buildBriefSystemPrompt()` and uses `contextHeaderForSlot()` /
  `PRE_COMPUTED_USER_NOTICE` when assembling the user message.
- Rules:
  - Never inline persona, voice examples, blacklists, or the JSON output
    contract in any edge function. Import from `copy-vocabulary.ts` instead.
  - `=== CONTEXT: [MORNING|AFTERNOON|EVENING] ===` is the canonical header
    for the time-of-day block — the legacy `=== TIME ===` label is removed.
  - `dayKind` (travel / PTO / holiday / weekend / conference) is carried
    inside the CONTEXT block via `buildWindowContext()` — never a separate
    day-type block.
  - The Brief never prescribes a practice, duration, or "do X" — that is the
    Plan's job. Body holds at most ONE orientation posture (how to carry
    yourself), per the four-beat body contract.
  - Phrase never restates Body and vice versa.
  - LLM does not analyse data — shared modules pre-compute every signal,
    classification, flag, and pattern. The user-prompt includes the
    `PRE_COMPUTED_USER_NOTICE` sentence at the top to lock this in.

# References
- June 3, 2026 spec: "Brief LLM Prompt — Final Recommendation (Phrase + Body
  Copy)" — verbatim source for the persona, voice banks, and JSON schema.
- `docs/SHARED_MODULES_DELEGATION_AUDIT.md` — F-07 resolution notes.
- `mem://reliability/brief-prompt-variable-scoping` — variable-scoping
  guard for any new field referenced in `userPrompt`.






































