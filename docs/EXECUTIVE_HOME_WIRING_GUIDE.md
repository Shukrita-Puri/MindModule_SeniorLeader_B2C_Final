# Executive Home - Wiring Guide

Companion to `docs/EXECUTIVE_HOME_SSOT.md`. Use this when wiring the Executive Home cards and downstream consumers that must read the cards' outputs.

---

## Feature 7: Smart Nudges Parity (Downstream Consumer)

Smart Nudges reads the cards' outputs; it does not recompute them. Wire these contracts so nudges stay in parity with Executive Home. Full nudge spec: `docs/SMART_NUDGES_NOTIFICATIONS_FINAL_WIRING_GUIDE.md` and the final redesign source `SMART_NUDGES_FINAL_WIRING_GUIDE.md` when present.

### Expose For Nudge Consumption

`mastery_plan_snapshots.horizon_modules[]`:

```ts
{
  slotIndex,
  mode,
  arcLabel,
  jitPhase,
  jitEventTitle,
  whyLine,
}
```

Nudges send one push per allocated slot (morning / afternoon / evening or full-arc phase). Keep this contract stable.

`daily_context_snapshot`:

- MRS baseline, State 1.
- `readiness_state` is `baseline | awaiting`.
- Readable pre-check-in.

`brief_snapshots`:

- Behaviour snapshot, State 1.
- Load through `loadBriefBehaviourSnapshot`.
- Convert through `snapshotToWiring(snap, "nudge")`.

### Shared Resolver

Build once, consume in four places:

```ts
resolveEffectiveTimezone(user)
  -> effectiveTimezone, circadianTimezone, isAway
```

Consumers:

- `compute-outer-readiness`
- `build-executive-home-cards`
- `smart-nudges`
- `travel-notifications`

### Shared CoS Persona

Build once, consume in three places:

```ts
CHIEF_OF_STAFF_PERSONA
FORBIDDEN_NOTIFICATION_WORDS
```

Consumers:

- Brief composer
- `_shared/plan/why-llm.ts`
- nudge copy builder

### Travel

`travel-notifications` consumes the Plan's fanned full-arc phases (`Pre` / `During` / `Post`), not its own travel re-derivation.

### Cleanup

`_shared/ceo-behaviour/back-to-back.ts` imports `isHighStakesTitle` from `_shared/events/event-classifier.ts`, not the legacy `executive-state-taxonomy.ts` shim.

### Rule

The day-shape decision lives in the Plan, the clock in the shared resolver, the voice in the shared persona, and freshness in the MRS contract. Each is built once and read by nudges. No card behaviour change is required beyond keeping these contracts stable and shared.
