---
name: brief-narrative-copy-ownership
description: Scenario-family deterministic copy lives in _shared/personas/ceo/behaviour-copy.ts (NARRATIVE_COPY section); window rules gate which signals may be quoted.
type: architecture
---

# Narrative (scenario family) copy

- Single home: `supabase/functions/_shared/personas/ceo/behaviour-copy.ts`.
  Rule-level copy (`BEHAVIOUR_COPY`) and family-level copy
  (`NARRATIVE_READS` / `NARRATIVE_CLOSES`, `renderNarrativeBeats`,
  `assembleNarrativeBody`) live side by side. There is no `brief/family-copy.ts`
  — it was deleted; never recreate a separate copy folder or file.
- `_shared/brief/lead-narrative.ts` resolves WHICH story fires; it never holds copy.
- `_shared/brief/deterministic-brief.ts` is the only consumer.

## Window rule (matches the signal-engine window split)

- morning — overnight recovery / sleep / resting rate quotable; day bucket is the day ahead.
- afternoon — sleep and overnight recovery are NOT quotable; day bucket is what
  has run plus what is left; no "front-load" directives.
- evening — sleep NOT quotable, "the day ahead" NOT quotable, no time-until
  countdown clauses; directive closes the day or names tomorrow's first move;
  close is recovery only.

## Copy invariants (CI-tested in `behaviour-copy.contract.test.ts`)

- The anchor's time-until clause is emitted at most once per body.
- No `"{event} ahead"` construction.
- Evidence openers come from a seeded bank (stable within a day, varied across days).
