---
name: Signal Pill Secondary Fallbacks
description: RHR / HR-elevation / check-in-only fallbacks used by signal pills when HRV, sleep or wearable freshness are missing.
type: feature
---

HRV + sleep remain the PRIMARY pill signals. Fallbacks A and B require a fresh same-day wearable (`wearableFreshForGate === true`) — stale wearable data must never stamp a `fallbackUsed` flag. Fallbacks in `_shared/signal-pills/derive-pills.ts` (mirrored in `_shared/signal-pills-v4.ts`):

- **Fallback A — `rhr_proxy` (Decision Readiness):** fires only when `hrvValue`, `sleepDuration` and `sleepScoreVal` are all null and RHR exists. Deviation thresholds worst-first: `>25 red`, `>15 amber`, else green; without deviation `>90 red`, `>80 amber`, else green. Adds `rhrValue` to contributors only when it fires.
- **Fallback B — `hr_elevated_proxy` (Resilience Capacity):** uses ACTIVE heart-rate elevation, never RHR (RHR is the primary Physical Reserves signal and must not be double-counted). Fires only when `sleepEfficiency == null`, no wearable tier exists yet, and the wearable is fresh. It assigns a FULL tier so a normal HR reads green rather than leaving the pill Unread: with deviation `>20 red`, `>10 amber`, else green; without deviation `>90 red`, `>80 amber`, else green. Adds `hrValue` to contributors whenever it fires.
- **Fallback C — `freshness: 'checkin_only'`:** when the wearable is not fresh but a same-day check-in is, the check-in-derived tier is kept instead of forcing "Unread". Never score-bearing, `hiddenReason: null`. Physical Reserves has no check-in source and stays "Body Unread".

Frontend must mirror new contributor keys in `PillTooltip.tsx` ALLOWED_CONTRIBUTORS and `DecisionReadinessBrief.tsx` DISPLAYABLE_KEYS or the evidence stays invisible.
