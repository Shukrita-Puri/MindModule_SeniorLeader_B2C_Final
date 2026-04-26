---
name: Smart Nudges CTA A/B experiment v1
description: Smart Nudges runs a 4-arm A/B test on the trailing CTA verb to find which lure drives the highest tap → app_open → target_action rate. Variants are user×family stable (same user always sees same arm per nudge family).
type: feature
---
**Experiment id**: `cta-action-verb-v1`
**Where**: `supabase/functions/smart-nudges/index.ts` (`assignCtaVariant`, `applyCtaVariant`).
**Arms** (~25% each, FNV-1a hash of `userId::nudgeFamily`):
- **A** control — "open your brief" / "open your plan"
- **B** outcome — "see your readiness" / "see your prep"
- **C** urgency — "recalibrate now" / "lock in your prep"
- **D** lure — "tap to prep"

Logged on `notification_log.payload`: `cta_variant` ('A'|'B'|'C'|'D'), `cta_experiment` ('cta-action-verb-v1'). `variant_id` is suffixed with `::A|B|C|D` so per-copy×variant slicing is possible.

**Read results**:
```sql
SELECT payload->>'cta_variant' AS arm,
       count(*) AS sent,
       count(*) FILTER (WHERE tapped) AS tapped,
       count(*) FILTER (WHERE app_opened) AS opened,
       count(*) FILTER (WHERE target_action_completed) AS completed,
       round(100.0 * count(*) FILTER (WHERE tapped) / NULLIF(count(*),0), 2) AS tap_rate_pct
FROM notification_log
WHERE payload->>'cta_experiment' = 'cta-action-verb-v1'
  AND sent_at > now() - interval '14 days'
GROUP BY 1 ORDER BY 1;
```
Engagement is written by `useNotificationEngagement` (already in client) — no schema changes were needed.
