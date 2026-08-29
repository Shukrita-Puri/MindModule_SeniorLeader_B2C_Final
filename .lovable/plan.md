# CHANGE 2 — A–H categories in the Brief prompt (internal only, never in user copy)

Brief only. One deploy: `compute-outer-readiness`. Plan's JIT v2 keeps its own priority source — untouched.

## The governing rule

A–H letters and category names are **internal allocation vocabulary**. "Cat H" means nothing to a CEO reading the card.

| Situation | What the Brief says to the user |
|---|---|
| One prioritised event | The **event title** (shortened) — "the Acme board review" |
| A cluster in one category | The category / load language — "three back-to-back governance calls", "a heavy interpersonal block" |
| Mixed cluster, no clear anchor | Load language — "high-stakes stack", "back-to-back", "context switching" |
| Never | "Cat A", "[Cat-H]", the letter, or a bare pillar name as if it were the event |

This applies to today, tomorrow and yesterday references equally.

## Verified current state

Priority chain, already shared by both paths:

```text
EVENT_CATEGORIES -> event-subtypes -> stakesScore() -> rankByStakes()
  -> getServerCalendarMetrics()  (stakes >= 60, top 2)
  -> todayHighStakes / tomorrowHighStakes
       -> LLM prompt (renders ranked titles)
       -> deterministic fallback (anchors beat (c) on todayHighStakes[0])
```

Both paths already read one ranked source in one order — confirmed, no change needed there.

Prompt today renders `HH:mm Title [Category Name]` for today and tomorrow, plus a one-line importance guide. `EVENT_CATEGORIES` is already imported (index.ts:35). No test asserts this prompt text.

## The change — `supabase/functions/compute-outer-readiness/index.ts`

### 1. CALENDAR TODAY / TOMORROW blocks

Keep the existing headings and all Load / Total meetings / Back-to-back / Next event / CLOCK TIME RULE lines. Change only the high-stakes rendering:

- Per-event line: `\n  HH:mm Title  (internal: Cat-X <Category Name>)` — using the same parallel indices (`todayHighStakes[i]` / `todayHighStakesCategories[i]`), letter resolved from `EVENT_CATEGORIES` by name, omitted when unresolved
- One line: `Events are listed highest-priority first.`
- `\n  No classified meetings today.` when empty

### 2. A–H reference block — generated from the existing source, not written out

No new list is authored. The block is built at runtime from the files that already own this data:

- `_shared/events/event-categories.ts` → `EVENT_CATEGORIES` gives each `id`, `name`, and its canonical `triggers` array (already imported in `index.ts:35`)
- `_shared/events/event-subtypes.ts` → `EVENT_TYPES` gives the granular `label` per `categoryId` if finer examples are wanted

Both are read-only imports; nothing in `_shared/events/` is edited. Rendering is a loop over `EVENT_CATEGORY_ORDER` emitting `id`, `name`, and the first two or three `triggers` as the worked example, so the block cannot drift from the taxonomy:

```text
A  Board & Governance             Board Meeting, Investor / Fundraising Meeting, QBR
...
H  Daily Rhythm & Baseline        Morning Check-in, Lunch / Recovery Slot, Back-to-back Block
```

The exact example strings come from the file at runtime — the sample above is illustrative only.

### 3. Output-language contract (the part the user sees)

Added alongside the same block, stated as hard rules:

- Never write a category letter, "Cat A/H", or a bracketed label in the brief text — internal only
- When one event carries the day, name the event by its **title**, shortened to the recognisable part (roughly 3–5 words / ~25 chars, keep the distinguishing word: "the Acme board review", not "the meeting" and not "Board & Governance")
- When several events share a category, or the day is a stack, use category or load language instead of listing titles — "back-to-back governance calls", "a heavy interpersonal block", "context switching across four calls"
- Cat H never anchors the work directive, even when it is the only classified event
- Focus beat (c) on the highest-priority event

These rules live inline in `index.ts` for this change. They arguably belong in `copy-vocabulary.ts`, which owns prompt voice and hard constraints — that file is reserved for Change 5, so moving them is deferred rather than done here.

### 4. Deterministic path — same rule, same source

The contract above is not LLM-only. `_shared/brief/deterministic-brief.ts:196 shortRefImpl()` currently *replaces* the title with a generic phrase: any title matching `/board|governance/` becomes `"the board call"`, so "Acme Q3 Board Review" loses the identifying word. That breaks the same rule the LLM is being given.

Fix, in the same file:

- Preserve the title's distinguishing words, shortened the same way ("the Acme board review"); fall back to the generic phrase only when nothing distinguishing remains ("Board Meeting" → "the board call")
- Existing `<=25 char` / `slice(0,22)` truncation and the travel/flight branch unchanged
- Cluster wording (two or more high-stakes events) continues to use load/category language, matching the LLM rule
- No category letters can enter deterministic output — it never had them, and none are added

Result: both paths read one ranked source (`todayHighStakes`) and now obey one naming rule.


### 5. Files touched, and nothing else

- `supabase/functions/compute-outer-readiness/index.ts` — prompt rendering, reference block, output contract
- `supabase/functions/_shared/brief/deterministic-brief.ts` — `shortRefImpl` naming rule

Read-only imports from `_shared/events/` (`EVENT_CATEGORIES`, optionally `EVENT_TYPES`); those files are not edited. Frozen and untouched: `rankByStakes`, `getServerCalendarMetrics`, category derivation, JIT v2 / `generate-mastery-plan`, `compute-inner-readiness`, `smart-nudges`, `cause-effect-engine`, `performance-rhythm-insights`, `build-executive-home-cards`, `_shared/brief-validators.ts`, `_shared/signal-engine/`, `_shared/signal-pills/`, `_shared/personas/ceo/behaviour-copy.ts`, `copy-vocabulary.ts` (reserved for Change 5), all frontend files, all migrations, and `BRIEF_PROMPT_VERSION` (not bumped).

If a test outside `_shared/brief` or `_shared/personas` fails, that is a scope leak: stop, roll back the offending line, and report rather than fix.


## Verification

- `deno test supabase/functions/_shared/brief` and `_shared/personas` — green
- New deterministic cases: distinguishing title preserved ("Acme Q3 Board Review" → "the acme board review"); bare "Board Meeting" still collapses cleanly; travel branch unchanged
- Golden-set fixtures: the `shortRefImpl` fix changes wording in fixtures whose titles carry distinguishing words — expected diffs will be reviewed line by line and re-baselined only where the new output is strictly better; any fixture that regresses blocks the change
- Prompt-side: code review of the rendering block plus a grep proving no letter label can reach the output contract
- Deploy `compute-outer-readiness` only; one live invocation; confirm the brief names the event title and contains no "Cat" string