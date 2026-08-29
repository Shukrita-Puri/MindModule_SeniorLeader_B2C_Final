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

### 2. A–H reference block (new, appended once)

Built from `EVENT_CATEGORIES` — ids, names, and a short worked example per pillar so the LLM knows what each level *means*, e.g.:

```text
A  Board & Governance             board meeting, investor update, QBR
B  Influence & Persuasion         sales pitch, negotiation, client presentation
C  Visibility & Communication     all-hands, keynote, media interview
D  Interpersonal High-Stakes      performance review, difficult 1:1, hiring decision
E  Deep Work & Strategy           strategy planning, deep work block
F  Conferences & External Events  summit, off-site, networking event
G  Travel                         long-haul flight, time-zone shift
H  Daily Rhythm & Baseline        gym, commute, catch-up, wind-down
```

Examples come from each category's existing `triggers` array — not hardcoded.

### 3. Output-language contract (the part the user sees)

Added to the same block, stated as hard rules:

- Never write a category letter, "Cat A/H", or a bracketed label in the brief text — internal only
- When one event carries the day, name the event by its **title**, shortened to the recognisable part (roughly 3–5 words / ~25 chars, keep the distinguishing word: "the Acme board review", not "the meeting" and not "Board & Governance")
- When several events share a category, or the day is a stack, use category or load language instead of listing titles — "back-to-back governance calls", "a heavy interpersonal block", "context switching across four calls"
- Cat H never anchors the work directive, even when it is the only classified event
- Focus beat (c) on the highest-priority event

### 4. Deterministic path — one honesty fix in scope

`_shared/brief/deterministic-brief.ts:196 shortRefImpl()` currently *replaces* the title with a generic phrase: any title matching `/board|governance/` becomes `"the board call"`, so "Acme Q3 Board Review" loses the identifying word. That contradicts the rule above.

Fix: keep the generic phrase only when the title has nothing distinguishing left; otherwise preserve the title's leading distinguishing words, shortened the same way ("the Acme board review"). Existing `<=25 char` / `slice(0,22)` truncation and the travel/flight branch stay as they are.

This is the only file besides `index.ts` touched, and it is Brief-owned.

### 5. Explicit non-changes

`rankByStakes`, `getServerCalendarMetrics`, category derivation, JIT v2, Plan, MRS, Insights, validators, personas copy, frontend, migrations, `BRIEF_PROMPT_VERSION` — all untouched.

## Verification

- `deno test supabase/functions/_shared/brief` and `_shared/personas` — green
- New deterministic cases: distinguishing title preserved ("Acme Q3 Board Review" → "the acme board review"); bare "Board Meeting" still collapses cleanly; travel branch unchanged
- Golden-set fixtures: the `shortRefImpl` fix changes wording in fixtures whose titles carry distinguishing words — expected diffs will be reviewed line by line and re-baselined only where the new output is strictly better; any fixture that regresses blocks the change
- Prompt-side: code review of the rendering block plus a grep proving no letter label can reach the output contract
- Deploy `compute-outer-readiness` only; one live invocation; confirm the brief names the event title and contains no "Cat" string