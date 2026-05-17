
## What's missing

`events/event-categories.ts` today only carries `id`, `name`, a one-line `selfRegulationFocus`, and the Pre/During/Post `protocol` contract. The previous refactor dropped two pieces from §3 of the framework doc:

1. **Events / Triggers list** per pillar (the bullet list — "Board Meeting", "Investor / Fundraising Meeting", "QBR"…). These were moved out on the assumption that subtype keywords in `event-subtypes.ts` replace them. They don't — the doc's §3 trigger list is the human-readable canonical inventory consumed by Brief context, Insights cause-effect bucket descriptions, Nudges copy and Plan rationale. Subtype `keywords[]` are classifier tokens, not display labels.
2. **Full self-regulation focus copy** per pillar (e.g. A is the full "Emotional regulation + cognitive sharpness. Prevent decision leakage and emotional hijack before high-visibility moments. Every body copy must link physical/cognitive state to a Leadership Variable." — not the abbreviated single line currently stored).

Both are present verbatim in the attached `CEO_Self_Regulation_Framework_1-3.docx` §3 table (pages 1–3) and were in the original `executive-state-taxonomy.ts` mental model but never made it into the new file.

## Audit result

| File | Has §3 triggers? | Has full §3 focus copy? | Action |
|---|---|---|---|
| `events/event-categories.ts` | No | Truncated | **Enrich** |
| `events/event-subtypes.ts` | Indirectly (via `label` per row, all 30 rows tagged with `categoryId`) | n/a | Source of truth for the trigger labels |
| `events/event-phase-map.ts` | n/a (phase data only) | n/a | Already correct |
| `executive-state-taxonomy.ts` shim | re-exports the above | re-exports | No change |
| Consumers (Brief, Nudges, Plan, Insights cause-effect, Coach summary, JIT) | Read `EVENT_CATEGORIES[id].name` + `.selfRegulationFocus` + `.protocol` | — | Pick up the richer focus copy automatically; new `triggers` field is opt-in |

No other taxonomy file has drifted. The fix is local to `event-categories.ts` plus one cross-layer test.

## Plan

### 1. Extend the `EventCategory` shape

```ts
export interface EventCategory {
  id: EventCategoryId;
  name: string;                  // user-friendly, unchanged
  selfRegulationFocus: string;   // ← REPLACE with verbatim §3 full text
  /** §3 events/triggers list, verbatim from framework doc. */
  triggers: readonly string[];   // ← NEW
  protocol: CategoryProtocol;    // unchanged
}
```

### 2. Populate all eight pillars from §3 of the doc (verbatim)

- **A High-Stakes Governance** — 9 triggers (Board Meeting in-person & remote, Board Presentation, Investor / Fundraising Meeting, QBR, End-of-Year / Annual Review, Budget & Forecast Review, M&A Discussion, Due Diligence Session, IPO Preparation Meeting). Focus: full leadership-variable line.
- **B Influence & Persuasion** — 8 triggers (Sales Pitch, Investor Pitch, Negotiation, Presentation int/ext, Regional QBR, Next-Year Budget Planning, Client Presentation, Contract Signing / Close). Focus: focus activation + persuasion crash.
- **C Visibility & Communication** — 9 triggers (All-Hands / Town Hall, Keynote, Speaking Engagement, Panel Moderation, Media Interview, Industry/Panel Interview, Press/Analyst Briefing, Podcast/Video, Conference speaking). Focus: presence + arousal-vs-anxiety.
- **D People & Difficult Conversations** — 9 triggers (Perf Review giving, Difficult 1:1, Layoff/Restructure, Termination, PIP, 1:1 Boss/Chair/Board, 1:1 Peer politically charged, 1:1 Direct Report normal, Hiring Decision). Focus: emotional labour + context drives classification.
- **E Deep Work & Strategy** — 7 triggers (3-Year Strategy, 3-Year Vision, Annual Operating Plan, Competitive Intel, Product Launch Planning, Deep Work Block, Post-Meeting Follow-up Block). Focus: flow activation + clean exit.
- **F Conferences & External Events** — 6 triggers (Industry Conf attending, Conference speaking, Off-site/Retreat, Networking, Award/Recognition, Multi-day Customer Summit). Focus: sustained high-output + progressive daily recovery.
- **G Travel** — 8 triggers (Pre-flight, Short-haul, Long-haul wifi, Long-haul offline, Landing same-day <4h, Landing next-day, ≥3h TZ shift, Multi-city 3+). Focus: circadian + active prep window.
- **H Daily Rhythm & Baseline** — 7 triggers (Morning Check-in workday, Morning Check-in weekend/PTO/holiday, EOD Wind-down, Sunday Evening Reset, Back-to-back 4h+ block, Lunch/Recovery slot, Meeting-free Deep Work block). Focus: habit + recover-to-build + Sunday PM orientation.

Trigger strings live verbatim — they are the Insights/Brief/Nudges/Plan display tokens.

### 3. Cross-validation (catch drift at module load)

Extend `events/cross-layer.test.ts` with:
```ts
Deno.test("every EVENT_TYPES row's categoryId has its label representable in EVENT_CATEGORIES[id].triggers (substring match)", …);
```
This guarantees the §3 trigger list and the 30 subtype rows never diverge. Failure prints which subtype label has no matching trigger.

### 4. Update `event-categories.test.ts`

- Assert each category has ≥6 triggers.
- Assert `selfRegulationFocus` contains the key phrase from the doc (e.g. A includes "Leadership Variable", F includes "progressive daily recovery", G includes "circadian").

### 5. No consumer rewrites required

Brief, Nudges, Plan, Insights cause-effect and Coach summary currently read `name` + `selfRegulationFocus` + `protocol`. They keep working with the richer focus copy automatically. Any consumer that wants to render the inventory of triggers per pillar (Brief context bullets, Insights bucket descriptions) can now read `EVENT_CATEGORIES[id].triggers` — single source, no inline strings.

### 6. Update memo

`mem/architecture/ceo-behaviour-shared-module-ownership.md` — add a line under "Hard rules":
> `EVENT_CATEGORIES[id].triggers` is the canonical §3 inventory. Subtype `label` strings in `event-subtypes.ts` must each correspond (substring or 1:1) to a string in `triggers`; cross-layer test enforces.

## Out of scope (deliberately)

- Not touching `event-subtypes.ts`, `event-phase-map.ts`, `event-classifier.ts`, `state-engines.ts`, `protocol-combos.ts`, or any consumer.
- Not deleting the `executive-state-taxonomy.ts` shim (separate cleanup, already in plan §7).
- Not bumping Insights `causality_findings.signal_summary` bucket labels — the `name` field is unchanged.

## Risk

Low. Pure data enrichment in one file + two test additions. No behaviour change; consumers reading `selfRegulationFocus` see longer text (already free-form, no length caps in templates — quick grep confirms). Cross-layer test fails closed if §3 list and subtypes drift.
