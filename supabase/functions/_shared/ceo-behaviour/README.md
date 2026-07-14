# ceo-behaviour

Opinions over signals. Each file in this folder implements one or more
behaviour rules that examine already-classified inputs and return a
`ScopedRule` result for Brief / Plan / Smart Nudges.

## Hard rule — taxonomy and availability live OUTSIDE this folder

Behaviour rules never redefine event categories, never re-derive
availability, and never carry their own holiday / PTO regexes. If a rule
needs one of those primitives, import it — do not fork it.

## External primitives this cluster consumes

| Concern                         | File                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- |
| Availability SSOT (day-type)    | `../availability/availability-classifier.ts`                             |
| Event categories (A–H pillars)  | `../events/event-categories.ts`                                          |
| Event subtypes                  | `../events/event-subtypes.ts`                                            |
| Event phase map (Pre/During/Post) | `../events/event-phase-map.ts`                                         |
| Canonical classifier            | `../events/event-classifier.ts`                                          |
| Protocol combos                 | `../protocols/protocol-combos.ts`                                        |
| Canonical calendar merge        | `../rules/calendar-merge.ts`                                             |

## Availability contract

Anything that answers "is today off / light / working / holiday / PTO?"
goes through `classifyDay(input)` from
`../availability/availability-classifier.ts`. Rules receive availability
state on the rule context (`ctx.availability`) — they do NOT inspect raw
event rows to infer it. In particular, a rule MUST NOT:

- treat `events.length === 0` as a rest / holiday signal;
- treat `calendarLoad === 'low'` as an off-day signal;
- parse event titles for `OOO` / `PTO` / `Holiday` (use
  `isPtoOrHolidayTitle` from `./pto-holiday.ts`, whose regexes now live
  in the availability SSOT).

## Adding a new behaviour

1. Implement in the appropriate cluster file (or add a new one).
2. Re-export from `index.ts`.
3. Add to `ALL_RULES` in `index.ts` with correct `scopes: [...]`.
4. Add tests colocated with the cluster file.

## References

- Ownership map: `mem/architecture/ceo-behaviour-shared-module-ownership.md`
- Availability SSOT: `mem/architecture/availability-ssot.md`
- Rule surface map: `docs/CEO_BEHAVIOUR_RULE_MAP.md`