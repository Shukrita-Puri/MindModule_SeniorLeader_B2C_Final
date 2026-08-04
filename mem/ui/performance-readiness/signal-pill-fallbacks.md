---
name: Signal Pill Secondary Fallbacks
description: RHR / HR-elevation / check-in-only fallbacks used by signal pills when HRV, sleep or wearable freshness are missing.
type: feature
---

HRV + sleep remain the PRIMARY pill signals. Fallbacks in `_shared/signal-pills/derive-pills.ts` (mirrored in `_shared/signal-pills-v4.ts`):

- **Fallback A — `rhr_proxy` (Decision Readiness):** fires only when `hrvValue`, `sleepDuration` and `sleepScoreVal` are all null and RHR exists. Deviation thresholds worst-first: `>25 red`, `>15 amber`, else green; without deviation `>90 red`, `>80 amber`, else green. Adds `rhrValue` to contributors only when it fires.
- **Fallback B — `hr_elevated_proxy` (Resilience Capacity):** fires only when `sleepEfficiency == null`; `rhrDeviation > 10` or `rhrValue > 80` → amber, otherwise no push.
- **Fallback C — `freshness: 'checkin_only'`:** when the wearable is not fresh but a same-day check-in is, the check-in-derived tier is kept instead of forcing "Unread". Never score-bearing, `hiddenReason: null`. Physical Reserves has no check-in source and stays "Body Unread".

Frontend must mirror new contributor keys in `PillTooltip.tsx` ALLOWED_CONTRIBUTORS and `DecisionReadinessBrief.tsx` DISPLAYABLE_KEYS or the evidence stays invisible.
