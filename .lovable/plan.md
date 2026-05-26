
## Scope

Isolated change to the Plan feature's Today's 3 Priorities. Each of the 3 priority cards. No change to Brief, JIT selection, practice selection logic, or plan structure. Reads Brief outputs from DB; does not re-query wearables.

## Files touched

Edge function:
- `supabase/functions/generate-mastery-plan/index.ts` — replace title + why composition for the 3 priority slots.
- `supabase/functions/_shared/plan/title-prefixes.ts` (NEW) — PREVENT_PREFIXES / PREPARE_PREFIXES tables + helpers.
- `supabase/functions/_shared/plan/action-frame.ts` (NEW) — deterministic ≤6-word sub-line from `event-phase-map.ts` goal field.
- `supabase/functions/_shared/plan/why-llm.ts` (NEW) — single Lovable AI call builder + JSON tool-call schema; caller fan-outs via `Promise.all`.

Read-only references (single source of truth — do not duplicate):
- `_shared/events/event-categories.ts` (selfRegulationFocus)
- `_shared/events/event-phase-map.ts` (timing, combo, goal, preventsBuilds, severityHint)
- `_shared/events/event-classifier.ts` (already-stored classification)
- `_shared/events/state-engines.ts`
- `_shared/protocols/protocol-combos.ts`
- `_shared/jit/select-jit.ts`, `_shared/jit/tactical-signals.ts`
- `causality_findings.signal_summary` (event_to_hrv, event_to_rhr, confidence, n)

Frontend:
- `src/components/home/TodayThreePriorities.tsx` — drop `truncate` on the title classNames so 8-word titles wrap to 2 lines instead of clipping with `...`; render new `actionFrame` field as the italic sub-line (fallback to existing copy).

## 1. WHAT — Title (deterministic)

Replace today's `timeLabel` ("Prepare ahead of X" / fallback strings) with `buildPlanTitle(hm, evt, isToday)` in `applyV51Enrichment`:

```text
[PREVENT|PREPARE prefix] + [event name, ≤4 identifying words] (+ "tomorrow" if !isToday)
hard cap: 8 words total
```

- Role = PREVENT if `phaseWindow === 'post'` OR category preventsBuilds[0] starts with "Prevents…"; else PREPARE.
- Prefix lookup table in new `title-prefixes.ts` (verbatim from spec §9), keyed by the prevents/builds slug from `event-phase-map.ts`. Fallback prefix per role: Steady (PREVENT), Prime (PREPARE).
- Event name comes from `hm.jitEventTitle` (already from calendar). Tokenise on whitespace; if >4 words, keep first 3 + last 1 token (most identifying); strip parens/quotes.
- Today vs tomorrow: compare event start date to user's local today (use existing tz helper).
- For non-JIT slots (start_of_day / state-management / end_of_day with no event), keep title generation off this path — leave existing copy.

Frontend fix: in `TodayThreePriorities.tsx` line ~1412, change `truncate` → `line-clamp-2 break-words`, keep font/leading.

## 2. WHY — LLM per priority, unique, ≤25 words

Replace `composeWhyLine(...)` for JIT priorities with a single Lovable AI call per slot, fired in parallel via `Promise.all([...])` in `applyV51Enrichment` (after enrichment data is gathered, before persistence).

- Model: `google/gemini-3-flash-preview` (Lovable AI Gateway, server-side, LOVABLE_API_KEY already provisioned). Cheap + fast for 3 parallel ≤25-word generations. (Spec mentions Claude — we use Lovable AI per platform standard; same prompt.)
- Structured output via tool-call `write_why` returning `{ statement: string, role: "PREVENT" | "PREPARE" }`. Post-trim if >25 words; if LLM unavailable or trims to <12 words, fall back to existing `composeWhyLine` deterministic output (no regression).
- Inputs (read-only, already in DB — no wearable re-query):
  - From `req` / Brief outputs: hrvDeviation, sleepScore, rhrTrend, travelDebt, stressLoad, burnoutRisk, mindState, bodyState.
  - From event: name, category + label, selfRegulationFocus, phaseWindow, preventsBuilds, minutesUntilStart.
  - From `causality_findings.signal_summary` (already a `SELECT` earlier in pipeline if present; otherwise null) — patternSummary string.
  - Strategic: growth_intention (only when category maps to it).
- Prompt: spec §4 verbatim. Filter `null` signals before interpolation. No retry on 429/402 — fall back to deterministic Why.

Anti-duplication: each call independent + event-specific ⇒ duplicate "Why" bug (current screenshot) goes away by construction. Add a post-pass dedupe: if any two final Why strings are >0.85 Jaccard-similar, regenerate the loser deterministically.

## 3. HOW — Sub-line ≤6 words (deterministic)

New `buildActionFrame(category, phaseWindow)` reads `EVENT_PHASE_MAP[category][phase].goal`, compresses to ≤6 words via a static map (one entry per category×phase, hand-authored to match the goal). Attach as `hm.actionFrame: string`. Frontend renders italic sub-line; falls back to current "Regulate your state…" copy if absent.

Practice step layer otherwise unchanged.

## 4. UI rules wired

- Title: `line-clamp-2` (2 lines), no `truncate`, no `...`.
- "Why this matters" label: unchanged.
- Sub-line: new `actionFrame` field (italic, ≤6 words). Existing italic line replaced when present.
- Practice cards: unchanged.

## 5. Acceptance criteria (matches spec §11)

1. No title ever truncates on iOS — all titles ≤8 words; `line-clamp-2` lets long event names wrap.
2. Each of 3 Why statements is unique (Jaccard dedupe guard).
3. Each Why references ≥1 non-generic signal pulled from the inputs.
4. PREVENT vs PREPARE prefix verb matches the role derived from `phaseWindow` + preventsBuilds.
5. "tomorrow" appears in title when event is tomorrow.
6. Why ≤25 words; sub-line ≤6 words.
7. LLM Why calls run in `Promise.all`.
8. Plan path issues zero new wearable queries; all signals are read from Brief outputs already on `req` / cached snapshot.

## 6. Sequencing

1. Add `title-prefixes.ts`, `action-frame.ts`, `why-llm.ts` (+ unit tests for prefix selection and 8-word cap).
2. Wire into `applyV51Enrichment` for JIT slots only; keep deterministic path for non-JIT slots and as LLM fallback.
3. Frontend: drop `truncate`, render `actionFrame`.
4. Deploy `generate-mastery-plan`; smoke test 3 priorities render unique Why + non-truncated titles in preview.

## Open assumptions (will proceed unless flagged)

- Use Lovable AI Gateway (Gemini Flash) — not Anthropic — per platform default; same prompt text.
- Compressed-goal sub-line map is authored once in `action-frame.ts` (≈16 entries: 8 categories × ~2 phases). Coaching can edit later.
- Deterministic fallback for Why is the existing `composeWhyLine` to guarantee no empty card on LLM failure.
- No memory/index updates in this PR; will land alongside.
