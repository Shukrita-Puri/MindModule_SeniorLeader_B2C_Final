# Deterministic Brief — consolidate scenario copy + window-aware signals + 3 polish fixes

Three changes, one pass. Net result: one copy pack, copy that respects what each part of day can honestly say, and the three wording defects removed.

## 1. Fold the scenario copy into the existing CEO pack (delete the new file)

`_shared/brief/family-copy.ts` is deleted. Its contents move into the existing pack at `_shared/personas/ceo/behaviour-copy.ts` as a second, clearly-labelled section:

- `NARRATIVE_COPY` — the per-family beat banks (reads, closes, shape phrases, directive branches) keyed by `BriefNarrativeFamily`.
- `renderNarrativeBeats(input)` and `assembleNarrativeBody(beats)` — the two exported entry points.
- The `BEHAVIOUR_COPY` rule pack, `DAY_SHAPE_OWNED_RULES`, and `missingCopyEntries` stay exactly as they are. Rule-level copy and narrative-level copy live side by side in one file, one persona seam.

`_shared/brief/deterministic-brief.ts` imports from `../personas/ceo/behaviour-copy.ts` instead. Its branch logic (when the narrative owns the body, off-day guards) is unchanged. `lead-narrative.ts` stays where it is — it is a resolver, not copy.

## 2. Window-aware signal selection (the real correction)

Today the evidence beat reaches for sleep and overnight recovery regardless of window. That is wrong after the morning. Evidence-bucket eligibility becomes a function of the window, matching the existing window-context split:

```text
morning    body bucket = overnight recovery, sleep quality, resting rate
           day bucket  = what today demands (full day ahead)
afternoon  body bucket = intraday strain / how the day is landing so far
           day bucket  = what has already run + what is still ahead
           sleep and overnight recovery are NOT quotable
evening    body bucket = how the day sat (afternoon strain, latest recovery read)
           day bucket  = what today cost + tomorrow's pressure
           sleep is NOT quotable; "the day ahead" framing is NOT quotable
```

Consequences in copy:

- `bodySignal()` takes the window and returns null rather than reaching for sleep when the window cannot honestly speak to it. When the body bucket is empty, evidence uses felt state plus day shape — never an invented signal.
- Day-shape phrasing becomes tense-correct: morning "today runs without a gap", afternoon "what is left of the day runs without a gap", evening "the day ran without a gap".
- Directives that only make sense before the engine starts (front-load, sequence the morning, clear it before you board) are morning/pre-phase only. Afternoon shifts to the remaining half; evening shifts to close-out and tomorrow's first move.
- Closes follow: evening closes never instruct on today's work; they land on shutdown and recovery.

Guard: any narrative family whose directive is inherently pre-day gets an explicit afternoon/evening variant so nothing falls back to morning language.

## 3. The three polish fixes

1. **Repeated timing** — the anchor's time clause ("in about an hour") is emitted at most once per body. First mention wins; later beats use the plain reference. A single `anchorRef` helper tracks whether timing has been spent.
2. **The "ahead" suffix** — `visibility_pre` drops "`{event}` ahead" for a natural construction ("you are on in front of the room", "the all-hands is the room today").
3. **Mechanical evidence openers** — the fixed "X and Y. Then Z." template is replaced by a small seeded bank of connectors and orderings so consecutive days do not read identically. Same seed rule as today: stable within a day, varied across days.

## Tests

- Contract test file `personas/ceo/behaviour-copy.contract.test.ts` stays green; imports adjust only if the path changes.
- New window-eligibility test: for each family, an afternoon and an evening render contain no sleep or overnight-recovery language, and no morning-only directive verb.
- New timing test: rendered body contains at most one time-until phrase.
- Existing deterministic-brief tests must stay green; no change to `phraseFor`, weekend/PTO/travel day-shape branches, or the LLM prompt path.

## Not touched

`lead-narrative.ts` resolution logic, the four-beat contract, `copy-vocabulary.ts`, the A–H taxonomy, `daily_context_snapshot.lead_narrative` persistence, and the Plan/JIT composer.
