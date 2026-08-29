# CHANGE 2 — A–H categories in the Brief prompt (internal only, never in user copy)

Brief only. Two files. One deploy: `compute-outer-readiness`. Plan's JIT v2 keeps its own priority source — untouched.

## The governing rule

A–H letters and category names are **internal allocation vocabulary**. "Cat H" means nothing to a CEO reading the card.

| Situation | What the Brief says to the user |
|---|---|
| One prioritised event | The **event title**, shortened — "the Acme board review" |
| Several events in one category | Category language — "back-to-back governance calls" |
| The day's *shape* is the story | Load language — "back-to-back", "context switching" |
| Never | "Cat A", "[Cat-H]", or a bare pillar name standing in for the event |

## Two axes, never conflated

**A–H is event kind. Load Shape is day shape.** They are separate SSOTs and a load never demotes into a category.

- A–H: `_shared/events/event-categories.ts`
- Load: `_shared/load-shape/` (`back_to_back`, `switching`), mirrored in `src/lib/loadShape.ts`

"Back-to-back block" is a **load shape**, not a Cat-H event. The Cat-H non-anchor rule applies only to genuine H events (gym, commute, social, wind-down) and must never suppress a back-to-back or switching day — those are load signals and rank on their own axis. The prompt states this explicitly so the LLM cannot file a stacked day as low-priority rhythm.

## Verified current state

```text
EVENT_CATEGORIES -> event-subtypes -> stakesScore() -> rankByStakes()
  -> getServerCalendarMetrics()  (stakes >= 60, top 2)
  -> todayHighStakes / tomorrowHighStakes
       -> LLM prompt (ranked titles)
       -> deterministic fallback (anchors beat (c) on todayHighStakes[0])
```

Both paths already read one ranked source in one order. `todayHighStakesCategories[]` is built via `categoryNameOf()` → `enrichEvent()`. `EVENT_CATEGORIES` is imported at `index.ts:35`. The prompt already carries a one-line `EVENT IMPORTANCE GUIDE`, which the generated block replaces. No test asserts the CALENDAR TODAY prompt text; the 174 golden fixtures are deterministic-only.

## 1. CALENDAR TODAY / TOMORROW rendering — `compute-outer-readiness/index.ts`

Keep every existing Load / Total meetings / Back-to-back / Next event / CLOCK TIME RULE line. Change only the high-stakes rendering:

- Per-event: `HH:mm Title (internal: Cat-X <Category Name>)` — same parallel indices (`todayHighStakes[i]` / `todayHighStakesCategories[i]`)
- Letter resolved by name from `EVENT_CATEGORIES`; when unresolved, **omit the internal label entirely** rather than falling back to the bare name (a bare name could read as user-facing)
- One line: `Events are listed highest-priority first.`
- `No classified meetings today.` when empty

The `(internal: ...)` marker is what tells the LLM the label is for reasoning, not output.

## 2. A–H reference block — generated from `EVENT_CATEGORIES` at runtime

No list is authored. Loop `EVENT_CATEGORIES`, emit `id`, `name`, and the **first three `triggers`** as worked examples. Use `triggers` — not `selfRegulationFocus`, which is coaching-protocol text and wrong for a prompt. Nothing in `_shared/events/` is edited; it is a read-only import.

```text
  A  Board & Governance    e.g. Board Meeting, Board Presentation, Investor / Fundraising Meeting
  ...
```

Example strings come from the file at runtime; the sample above is illustrative.

## 3. Output-language contract

Stated inline as hard rules alongside the block:

- Never write a category letter, "Cat A/H", a bracketed label, or a pillar name in `phrase`, `body`, `leanOn` or `watchFor` — internal only
- One dominant event: name it by **title**, shortened to the recognisable part (~3–5 words, keep the distinguishing word — "the Acme board review", not "the meeting", not "Board & Governance")
- Several events sharing a category, or a stacked day: use category or load language instead of listing titles
- A back-to-back or switching day is a load signal and ranks on its own — never demoted as Cat H
- Cat H never anchors the work directive; Focus beat (c) on the highest-priority event

These rules live in `index.ts` for this change. They arguably belong in `copy-vocabulary.ts`, which owns prompt voice and constraints — that file is reserved for Change 5, so the move is deferred, not done here.

## 4. Deterministic path — same rule — `_shared/brief/deterministic-brief.ts`

`shortRefImpl()` currently *replaces* the title with a generic phrase: any `/board|governance/` match becomes "the board call", so "Acme Q3 Board Review" loses the identifying word. Fix, preserving check order:

1. **Travel/flight branch stays first, unchanged** (regex + flight-number pattern → "the flight")
2. **Bare-generic patterns, `^`-anchored.** The anchor is the whole point: unanchored `/board/i` matches mid-title. `/^board(\s|$|\s*meeting|\s*review|\s*call|\s*prep)/i`, `/^governance/i`, `/^strategy\s|^deep work|^planning/i`, `/^investor.../i`, `/^pitch(\s|$)/i`, `/^keynote|^speaking|^media|^press/i`, `/^all.?hands|^town.?hall/i`, `/^conference|^summit(\s|$)/i`, `/^feedback|^difficult/i`, `/^1.?1$|^one.?to.?one/i`, `/^qbr|^quarterly(\s|$)/i`
3. **Distinguishing prefix preserved.** `<=25` chars → `the <title>`; longer → truncate at the last word boundary before 22 chars (`slice(0,22).replace(/\s+\S*$/,'')`) so words are never cut mid-way

Cluster wording (two or more high-stakes events) keeps using load/category language, matching the LLM rule. No category letters exist in deterministic output and none are added.

## 5. Files touched, and nothing else

- `supabase/functions/compute-outer-readiness/index.ts`
- `supabase/functions/_shared/brief/deterministic-brief.ts`

Read-only imports from `_shared/events/` and `_shared/load-shape/`. Frozen and untouched: `rankByStakes`, `getServerCalendarMetrics`, category derivation, `BODY_FOUR_BEAT_CONTRACT`, `copy-vocabulary.ts` (Change 5), `_shared/brief-validators.ts`, `_shared/signal-engine/`, `_shared/signal-pills/`, `_shared/personas/ceo/behaviour-copy.ts`, `generate-mastery-plan` / JIT v2, `compute-inner-readiness`, `smart-nudges`, `cause-effect-engine`, `performance-rhythm-insights`, `build-executive-home-cards`, all frontend, all migrations, and `BRIEF_PROMPT_VERSION` (not bumped).

A failing test outside `_shared/brief` / `_shared/personas` means scope leak: stop, roll back the offending line, report — do not fix.

## Verification

- `deno test _shared/brief` and `_shared/personas` — green
- New deterministic cases: "Acme Q3 Board Review" → "the acme q3 board review"; bare "Board Meeting" → "the board call"; travel branch unchanged; long title truncates on a word boundary
- Golden fixtures: only titles carrying distinguishing words shift. Re-baseline a fixture only if the new output contains no forbidden vocabulary, passes `validateBrief()` and `validateNoScoreRestatement()`, is no longer in word count, and carries the distinguishing word. Any fixture not strictly better blocks the change
- Post-deploy, one live brief: assert `payload_json.phrase/body/leanOn/watchFor` contain none of `Cat A`…`Cat H`, `[Cat-`, or any of the eight pillar names. Also confirm no pillar name was added to the validator's forbidden list — the internal labels live in the prompt only
- Deploy `compute-outer-readiness` only