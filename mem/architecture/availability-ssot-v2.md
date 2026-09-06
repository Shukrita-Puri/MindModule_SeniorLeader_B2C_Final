---
name: Availability SSOT v2 — inferred vacation
description: Persistent holiday/PTO/OOO awareness across a whole trip run; overlap-based day queries; classifier inference rung
type: feature
---

- `AVAILABILITY_SSOT_VERSION = 2` in `_shared/availability/availability-classifier.ts`.
- New rung after explicit PTO: a persisted trip window covering today + no real work (0 meetings, or 1 that is not high-stakes) + a supporting signal (stay/leisure title, or away distance) → `PTO`, `reason: "inferred_vacation:v2"`, `confidence: high|medium`. Offsite/conference titles suppress it.
- Day queries changed from "starts today" to "overlaps today" via `applyDayOverlapFilter` / `eventOverlapsDay` in `_shared/signal-engine/db-queries.ts`. This is why a 9–17 Aug all-day hotel block was previously invisible on 10–17 Aug.
- All-day rows stay out of the meeting count but ARE classification evidence. The readiness demand scorer is deliberately unchanged.
- Trip window is exposed as `tripWindow` on `deriveTravelDay()` and threaded into the classifier by brief (`brief-signal-coverage.ts`), plan, nudges and home cards.
- Replay test: `_shared/availability/holiday-run-awareness.test.ts` (9–17 Aug NY trip, 13 Aug low-stakes meeting, 18 Aug workday).
