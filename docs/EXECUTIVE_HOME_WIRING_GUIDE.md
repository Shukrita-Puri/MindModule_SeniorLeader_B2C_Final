# Executive Home - Wiring Guide

Companion to `docs/EXECUTIVE_HOME_SSOT.md`. This guide is the practical wiring
reference for the Executive Home screen now that all three cards follow a
snapshot-read-first model with cron as the default writer.

---

## 1. Executive Home model

Executive Home has three cards:

1. Mental Readiness Score
2. Performance Readiness Brief
3. Today's Performance Priorities

The intended runtime model is:

- `build-executive-home-cards` writes snapshots
- it runs on `morning`, `afternoon`, and `evening`
- UI reads snapshots
- manual refresh is the explicit on-demand writer

Do not let ordinary page load recompute these cards live by default.

---

## 2. Writers

### Primary writer

`supabase/functions/build-executive-home-cards/index.ts`

This orchestrator is responsible for building the current-window snapshot set
for the current user/date/window:

- MRS snapshot / mirrors
- Brief snapshot / mirrors
- Plan snapshot / mirrors

### Manual writer

Manual refresh may call the same underlying edge functions, but it must behave
like a shared snapshot refresh, not a card-only repaint.

If one Executive Home card refreshes successfully:

- persist the updated current-window snapshot set
- invalidate all three dependent readers
- let all three cards rehydrate from persisted state

Users should not have to refresh each card separately on the same page.

---

## 3. Readers

### Mental Readiness Score

Reader contract:

- read current-window MRS snapshot
- never recompute the score client-side
- if current-window snapshot is awaiting, show awaiting state

Primary persisted source:

- `daily_context_snapshot`

### Performance Readiness Brief

Reader contract:

- read current-window brief snapshot
- read MRS-owned readiness/band from persisted state
- never recompute MRS in the Brief layer

Primary persisted sources:

- `brief_snapshots`
- `daily_context_snapshot`

### Today's Performance Priorities

Reader contract:

- read a persisted plan snapshot
- hydrate from `mastery_plan_snapshots`
- do not treat plan payloads as MRS/outer-readiness payloads

Primary persisted source:

- `mastery_plan_snapshots`

Important:

- A plan snapshot must be validated with plan-shape checks only
- do not gate it using `innerReadinessScore`, `awaitingSignals`, or other
  outer-readiness-only fields unless those fields are explicitly part of the
  plan contract

---

## 4. Window policy

The product decision is that context can change across the day, so all three
cards are window-aware.

Canonical windows:

- `morning`
- `afternoon`
- `evening`

Expected behavior:

- morning snapshot can differ from afternoon snapshot
- afternoon snapshot can differ from evening snapshot
- Brief and Plan are both expected to evolve with changing calendar / wearable /
  check-in context

Examples:

- a new urgent meeting gets added
- a board meeting is cancelled
- travel appears
- demand collapses after a cancellation
- user state shifts from centered to overloaded

That is why MRS, Brief, and Plan all support 3 scheduled writes per day.

---

## 5. Plan read policy

This must be implemented explicitly and consistently.

Preferred policy:

1. read the current-window ready plan snapshot for the active `planDate`
2. if current-window snapshot is missing, optionally fall back to the latest
   ready row for that date
3. never let `pending` or `error` rows replace a valid ready row

Do not accidentally fall back by using:

- wrong snapshot key
- wrong render predicate
- raw `generated_at desc` without `status = 'ready'`

If you choose the fallback path, log clearly:

- requested window
- returned row window
- returned row `generated_at`
- why fallback happened

---

## 6. Manual refresh propagation

Manual refresh should be shared across the Executive Home surface.

If the user refreshes one card/workflow:

1. regenerate the current-window snapshot set
2. persist results
3. invalidate:
   - MRS reader
   - Brief reader
   - Plan reader
4. rehydrate all cards from snapshots

Expected product outcome:

- one refresh updates the whole Executive Home state
- the user does not need to manually refresh each card

---

## 7. Snapshot table responsibilities

### `daily_context_snapshot`

Shared mirror / substrate for:

- MRS
- Brief
- Plan metadata

Used for:

- readiness state
- band / band valence
- day kind
- demand / divergence / wearable freshness mirrors

### `brief_snapshots`

Canonical Brief storage.

Used for:

- phrase
- body
- lean on
- watch for
- brief source
- prompt version
- LLM attempts / fallback reason
- behaviour snapshot

### `mastery_plan_snapshots`

Canonical day-of plan storage.

Used for:

- `plan_json`
- `horizon_modules`
- `priorities`
- `recommended_practice_ids`
- `plan_ledger`
- `status`
- `generated_at`
- `plan_date`
- `mrs_window`

---

## 8. Snapshot validity checks

### Valid MRS snapshot

Use MRS fields:

- `readiness_state`
- `score`
- `scoreBaseline`
- `scoreRefined`
- `tierDisplayed`

### Valid Brief snapshot

Use Brief fields:

- `brief_source`
- score payload fields
- copy fields
- behaviour snapshot fields

### Valid Plan snapshot

Use Plan fields:

- `status === 'ready'`
- `plan_json` exists
- `plan_json.horizonModules` is an array
- `plan_json.horizonModules.length > 0`

Do not use MRS/Brief validators on Plan payloads.

---

## 9. Downstream consumer rule

Smart Nudges and any future downstream consumer must read Executive Home
outputs; they must not recompute them independently.

Keep these contracts stable:

- `mastery_plan_snapshots.horizon_modules[]`
- `daily_context_snapshot` readiness/day-kind/freshness mirrors
- `brief_snapshots` behaviour snapshot and copy state

---

## 10. Observability

Every writer/read path should log enough to explain snapshot decisions.

Recommended minimum logs:

### Cron / writer

- user id
- local date
- window
- day kind
- MRS write result
- Brief write result
- Plan write result

### Reader

- requested date
- requested window
- returned snapshot id
- returned snapshot window
- returned status
- fallback reason if current-window row was missing

### Manual refresh

- which card initiated refresh
- which snapshot set was regenerated
- which readers were invalidated

---

## 11. Wiring mistakes to avoid

1. Treating a plan payload like an outer-readiness payload
2. Letting live page load recompute cards instead of reading snapshots
3. Returning latest row regardless of `status`
4. Requiring separate manual refreshes for each card
5. Using different window policies for MRS, Brief, and Plan without documenting it
6. Letting a weaker awaiting/pending row overwrite a better ready row

---

## 12. One-line operating summary

Executive Home should behave like this:

**cron writes MRS + Brief + Plan three times a day, manual refresh rewrites the
current window on demand, and the UI reads those persisted snapshots
consistently across all three cards.**
